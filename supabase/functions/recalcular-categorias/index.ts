// Edge Function — recalcula equipo.categoria de cada miembro según config_tiers.
// Mismo patrón de env vars y CORS que supabase/functions/api/index.ts.
//
// DEPLOY — verify_jwt DEBE quedar en false. Lo fija `supabase/config.toml`
// (`[functions.recalcular-categorias] verify_jwt = false`), así que alcanza con
//   supabase functions deploy recalcular-categorias
// (verificado 2026-09-25: deploy sin flag -> verify_jwt:false). NO borrar esa
// sección: ninguno de los 3 callers manda un JWT de Supabase -- el cron
// `marcar-eventos-finalizados` (pg_net, solo header `x-cron-secret`), `api`
// en el modo `soloUsuario` de "De viaje" (también `x-cron-secret`) y
// "Recalcular ahora" de Mi Liga (js/admin.js, adminToken propio como Bearer).
// Con verify_jwt activo el gateway de Supabase los rechaza con 401 ANTES de
// llegar a este código, en silencio para el cron. `api` en cambio va con
// verify_jwt:true (default, sin sección en config.toml). Ver MANIFEST.md,
// "Fix meses_consecutivos_cumplidos".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Primer día del mes que fue hace `n` meses (relativo a hoy, UTC).
function primerDiaMesesAtras(n: number): Date {
  const hoy = new Date();
  const year = hoy.getUTCFullYear();
  const month = hoy.getUTCMonth() - n;
  const dia = Math.min(hoy.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, dia));
}

function fechaISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nombresDe(s: string | null | undefined): string[] {
  return String(s ?? '').split(',').map((n: string) => n.trim().toUpperCase()).filter(Boolean);
}

// Mismo criterio que _validarAdminToken() en supabase/functions/api/index.ts
// (tabla admin_sessions), reimplementado acá porque esta es una Edge Function
// standalone, sin acceso a los helpers de esa otra.
async function _validarAdminToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  const { data } = await supabase.from('admin_sessions').select('email, expires_at').eq('token', token).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) <= new Date()) return null;
  return data.email;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ ok: false, error: 'Método no soportado.' }, 405);
  }

  // Bug real corregido (pedido explícito de Victor): el cron
  // `marcar-eventos-finalizados` (migración
  // `20260912140000_cron_finalizados_recalcula_categorias.sql`) necesita
  // disparar este recálculo automáticamente después de marcar eventos como
  // finalizados -- pero no hay una sesión admin real detrás de un cron, así
  // que el gate normal (`adminToken` de `admin_sessions`) no aplica ahí.
  // Mismo mecanismo YA establecido en supabase/functions/api/index.ts para
  // `cronDiario`/`cronRecordatorioEvento`/etc. -- header `x-cron-secret`
  // comparado contra el secret `CRON_SECRET` (ya configurado en producción,
  // reusado tal cual, sin secret nuevo) -- preferido sobre pegar la
  // `SUPABASE_SERVICE_ROLE_KEY` literal en un archivo de migración
  // versionado en git (esa key bypasea RLS de TODA la base; `CRON_SECRET`
  // solo gatea estas acciones puntuales, mismo criterio ya documentado en
  // `20260907180000_push_cron_recordatorios.sql`). El camino real de admin
  // (botón "Recalcular ahora", `_mlRecalcular()`/js/admin.js) sigue
  // funcionando exactamente igual, sin tocar.
  const cronSecretHeader = req.headers.get('x-cron-secret');
  const esLlamadaCron = !!CRON_SECRET && cronSecretHeader === CRON_SECRET;
  const authHeader = req.headers.get('Authorization') ?? '';
  const adminToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  const adminEmail = esLlamadaCron ? 'cron' : await _validarAdminToken(adminToken);
  if (!adminEmail) return json({ ok: false, error: 'Sesión admin inválida.' }, 401);

  // Modo "una sola jugadora" (feat "De viaje", ver MANIFEST.md) -- lo usa
  // `adminActualizarEstadoViaje` (supabase/functions/api/index.ts) cuando se
  // registra un viaje que YA terminó: recalcula el tier SOLO de `soloUsuario`
  // (aunque siga en 'De viaje', que el modo normal saltea) y sin penalizar
  // las ausencias de [excluirDesde, excluirHasta]: la ventana de cada tier
  // (`ventana_meses`) se estira hacia atrás tantos días como el viaje le
  // "comió" a esa ventana, así la jugadora tiene el mismo tiempo real de
  // entrenamiento disponible que si no hubiera viajado. Sin body (cron,
  // "Recalcular ahora") = comportamiento de siempre, todo el equipo.
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch { body = {}; } }
  const soloUsuario: string | null = body && typeof body.soloUsuario === 'string' && body.soloUsuario.trim() ? body.soloUsuario.trim() : null;
  const esFechaIso = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const excluirDesde: string | null = soloUsuario && esFechaIso(body.excluirDesde) ? body.excluirDesde : null;
  const excluirHasta: string | null = soloUsuario && esFechaIso(body.excluirHasta) ? body.excluirHasta : null;
  const hayExclusion = !!(excluirDesde && excluirHasta && excluirHasta >= excluirDesde);
  const DIA_MS = 86400000;
  const diasExclusion = hayExclusion ? Math.round((Date.parse(excluirHasta!) - Date.parse(excluirDesde!)) / DIA_MS) + 1 : 0;

  try {
    const { data: tiersData, error: tiersError } = await supabase
      .from('config_tiers')
      .select('*')
      .order('orden', { ascending: true });
    if (tiersError) return json({ ok: false, error: tiersError.message }, 500);

    const tiers = tiersData ?? [];
    const tierDefault = tiers.find((t: any) => t.es_default === true);
    if (!tierDefault) {
      return json({ ok: false, error: 'No hay ningún tier marcado como es_default=true en config_tiers.' }, 500);
    }
    const tiersNoDefault = tiers
      .filter((t: any) => t.id !== tierDefault.id)
      .sort((a: any, b: any) => a.orden - b.orden);

    // `categoria`/`tier_riesgo_*`/`meses_consecutivos_cumplidos` (Fase 2
    // completa, ver MANIFEST.md) -- hacen falta para anclar la evaluación al
    // tier ACTUAL de cada persona (riesgo/gracia se evalúan contra el tier
    // en el que ya está, no contra "el mejor tier posible" desde cero, ver
    // el comentario grande más abajo).
    const { data: equipoData, error: equipoError } = await supabase.from('equipo')
      .select('username, estado_miembro, tier_modo, categoria, tier_riesgo_desde, tier_riesgo_hasta, tier_riesgo_objetivo, meses_consecutivos_cumplidos, meses_consecutivos_ultimo_mes');
    if (equipoError) return json({ ok: false, error: equipoError.message }, 500);
    const miembros: {
      username: string; estadoMiembro: string | null; tierModo: string | null; categoria: string | null;
      tierRiesgoDesde: string | null; tierRiesgoHasta: string | null; tierRiesgoObjetivo: string | null;
      mesesConsecutivosCumplidos: number; mesesUltimoMes: string | null;
    }[] = (equipoData ?? [])
      .filter((r: any) => r.username && (!soloUsuario || r.username === soloUsuario))
      .map((r: any) => ({
        username: r.username, estadoMiembro: r.estado_miembro ?? null, tierModo: r.tier_modo ?? 'auto',
        categoria: r.categoria ?? null,
        tierRiesgoDesde: r.tier_riesgo_desde ?? null, tierRiesgoHasta: r.tier_riesgo_hasta ?? null,
        tierRiesgoObjetivo: r.tier_riesgo_objetivo ?? null,
        mesesConsecutivosCumplidos: Number(r.meses_consecutivos_cumplidos) || 0,
        mesesUltimoMes: r.meses_consecutivos_ultimo_mes ?? null,
      }));

    const maxVentana = Math.max(0, ...tiers.map((t: any) => Number(t.ventana_meses) || 0));

    // Bug real (Cambio 62): este fetch no filtraba por `estado` en absoluto
    // -- eventos cancelados ('Evento Cancelado') o todavía no sucedidos
    // ('Evento Programado', con `fecha` ya dentro de la ventana) contaban
    // igual que uno real hacia `contarClases()`, pudiendo calificar a
    // alguien para un tier sin cumplir el requisito real de asistencia.
    // Fix original: solo 'Evento Finalizado'.
    //
    // Bug real #2 (Bug 13, ver comentario completo en recalcularStatsEquipo()/
    // supabase/functions/api/index.ts): 'Evento Finalizado' es un status
    // huérfano -- nada lo transiciona desde que la generación de eventos se
    // migró a pg_cron nativo de Postgres. Mismo fix: `fecha < hoy` (no
    // `Evento Finalizado`) + excluir por nombre los 2 estados reales que
    // significan "no cuenta".
    // Con exclusión de viaje, se trae historial extra (la ventana estirada,
    // ver `diasExtraVentana()` más abajo, puede ir hasta `diasExclusion`
    // días más atrás que la ventana normal más larga).
    const inicioFetch = new Date(primerDiaMesesAtras(maxVentana).getTime() - diasExclusion * DIA_MS);
    const { data: asistData, error: asistError } = await supabase
      .from('asistencias')
      .select('fecha, a_horario, tarde')
      .not('estado', 'in', '("Evento Cancelado","No se entrena")')
      .gte('fecha', fechaISO(inicioFetch))
      .lt('fecha', fechaISO(new Date()));
    if (asistError) return json({ ok: false, error: asistError.message }, 500);

    // Asistencias externas (`adminRegistrarAsistenciaExterna`, api) -- viven
    // SOLO en `log_asistencias` (`origen:'Externa'`, `id_evento` 'ext_<uuid>'
    // sin fila en `asistencias`, nunca en a_horario/tarde), así que el conteo
    // de arriba no las ve. Pedido explícito: cuentan como clase para el tier.
    // Una sola consulta para toda la corrida, misma ventana que asistData --
    // `contarClases()` se llama varias veces por persona (termómetro, tier
    // actual/superior, mejor tier), un query por llamada sería N consultas.
    const { data: externasData, error: externasError } = await supabase
      .from('log_asistencias')
      .select('nombre_usuario, fecha_entrenamiento')
      .eq('origen', 'Externa')
      .gte('fecha_entrenamiento', fechaISO(inicioFetch))
      .lt('fecha_entrenamiento', fechaISO(new Date()))
      .limit(100000);
    if (externasError) return json({ ok: false, error: externasError.message }, 500);

    const anioDesde = inicioFetch.getUTCFullYear();
    const { data: puntosData, error: puntosError } = await supabase
      .from('puntos_mensuales')
      .select('nombre_usuario, anio, mes, puntos_total')
      .gte('anio', anioDesde);
    if (puntosError) return json({ ok: false, error: puntosError.message }, 500);

    const hoy = new Date();
    const idxActual = hoy.getUTCFullYear() * 12 + hoy.getUTCMonth();

    // Días de viaje (exclusión, solo en modo `soloUsuario`) que caen dentro
    // de la ventana normal [inicio de la ventana, ayer] -- 0 para cualquier
    // otra persona o sin exclusión. Es lo que se le devuelve a la ventana.
    function diasExtraVentana(username: string, ventanaMeses: number): number {
      if (!hayExclusion || username !== soloUsuario) return 0;
      const inicioVentana = primerDiaMesesAtras(ventanaMeses).getTime();
      const ayer = Date.parse(fechaISO(new Date())) - DIA_MS;
      const desdeSolape = Math.max(Date.parse(excluirDesde!), inicioVentana);
      const hastaSolape = Math.min(Date.parse(excluirHasta!), ayer);
      return hastaSolape >= desdeSolape ? Math.round((hastaSolape - desdeSolape) / DIA_MS) + 1 : 0;
    }

    function contarClases(username: string, ventanaMeses: number): number {
      const desde = fechaISO(new Date(primerDiaMesesAtras(ventanaMeses).getTime() - diasExtraVentana(username, ventanaMeses) * DIA_MS));
      const u = username.trim().toUpperCase();
      let n = 0;
      for (const fila of asistData ?? []) {
        if (!fila.fecha || fila.fecha < desde) continue;
        if (nombresDe(fila.a_horario).includes(u) || nombresDe(fila.tarde).includes(u)) n++;
      }
      // + asistencias externas de la misma ventana (ver `externasData` arriba).
      for (const ext of externasData ?? []) {
        const fechaExt = String(ext.fecha_entrenamiento ?? '').slice(0, 10);
        if (!fechaExt || fechaExt < desde) continue;
        if (String(ext.nombre_usuario ?? '').trim().toUpperCase() === u) n++;
      }
      return n;
    }

    function sumarPuntos(username: string, ventanaMeses: number): number {
      // `puntos_mensuales` es por mes -- la compensación del viaje se
      // redondea hacia arriba a meses enteros (30 días = 1 mes extra).
      const mesesExtra = Math.ceil(diasExtraVentana(username, ventanaMeses) / 30);
      let total = 0;
      for (const fila of puntosData ?? []) {
        if (fila.nombre_usuario !== username) continue;
        const idxFila = Number(fila.anio) * 12 + (Number(fila.mes) - 1);
        const diff = idxActual - idxFila;
        if (diff < 0 || diff > ventanaMeses + mesesExtra) continue;
        total += Number(fila.puntos_total) || 0;
      }
      return total;
    }

    // Termómetro real (Cambio 59, 0-100, escala Mirlxs→Quindes -- ver
    // MANIFEST.md) -- "el tier techo" (pedido: "Quindes, o el tier de mayor
    // requisito") es el tier `'Quindes'` por nombre si existe; si no, el
    // primero de `tiersNoDefault` (ya ordenado por `orden` ascendente arriba,
    // el MISMO criterio que ya usa el loop de abajo: el primer tier que se
    // evalúa/el más exigente, orden=1 en la config real). `null` si no hay
    // ningún tier no-default configurado (config_tiers con un solo tier) --
    // caso borde sin techo posible, el termómetro queda en 0.
    const tierTecho = tiersNoDefault.find((t: any) => t.nombre === 'Quindes') ?? tiersNoDefault[0] ?? null;

    // Ratio de cada criterio activo del tier techo contra lo que la persona
    // ya tiene -- "activo" = `min_clases`/`min_puntos` > 0 (pedido: "si algún
    // min_* es 0 o null, ignorar ese criterio para no dividir por cero"). Con
    // AMBOS criterios activos, `logica` decide min (Y, el más restrictivo) o
    // max (O, el más laxo) -- con UNO solo activo, da lo mismo min/max (un
    // único valor), así que no hace falta bifurcar por `logica` en ese caso.
    function calcularTermometroPct(username: string): number {
      if (!tierTecho) return 0;
      const ventanaMeses = Number(tierTecho.ventana_meses) || 0;
      const clases = contarClases(username, ventanaMeses);
      const puntos = sumarPuntos(username, ventanaMeses);
      const minClases = Number(tierTecho.min_clases) || 0;
      const minPuntos = Number(tierTecho.min_puntos) || 0;
      const ratios: number[] = [];
      if (minClases > 0) ratios.push(clases / minClases);
      if (minPuntos > 0) ratios.push(puntos / minPuntos);
      if (!ratios.length) return 0;
      const combinado = tierTecho.logica === 'Y' ? Math.min(...ratios) : Math.max(...ratios);
      return Math.min(100, Math.max(0, combinado * 100));
    }

    // ─── Fase 2 completa del sistema de tiers (ver MANIFEST.md) ───────────
    // `evaluarCumpleTier()` -- ¿esta persona cumple HOY los criterios de UN
    // tier puntual? Extraído del bucle viejo (única lógica de "cumple" que
    // existía) para reusarlo tanto contra el tier ACTUAL de la persona
    // (riesgo de demotion) como contra el tier SUPERIOR (re-ascenso).
    function evaluarCumpleTier(username: string, tier: any): boolean {
      const ventanaMeses = Number(tier.ventana_meses) || 0;
      const clases = contarClases(username, ventanaMeses);
      const puntos = sumarPuntos(username, ventanaMeses);
      const cumpleClases = clases >= (Number(tier.min_clases) || 0);
      const cumplePuntos = puntos >= (Number(tier.min_puntos) || 0);
      return tier.logica === 'Y' ? (cumpleClases && cumplePuntos) : (cumpleClases || cumplePuntos);
    }
    // Comportamiento ORIGINAL (pre-Fase 2): el mejor tier que las clases/
    // puntos ACTUALES de la persona alcanzan, recorriendo `tiersNoDefault`
    // del más exigente al menos exigente y quedándose con el primero que
    // cumple; sin ninguno, cae al tier default. Sigue siendo la función real
    // que decide "a qué tier cae" -- tanto para una demotion inmediata
    // (`meses_gracia_demotion=0`, mismo comportamiento de siempre) como para
    // la demotion diferida al vencer la gracia, y para calcular
    // `tier_riesgo_objetivo` (qué mostrarle a la persona mientras está en
    // período de prueba).
    function mejorTierPara(username: string): string {
      for (const tier of tiersNoDefault) {
        if (evaluarCumpleTier(username, tier)) return tier.nombre;
      }
      return tierDefault.nombre;
    }

    // "aaaa-mm" del mes en curso (hora del server, UTC) -- clave de
    // `historial_tier` para esta corrida. Ver el comentario grande en la
    // migración sobre por qué se escribe SIEMPRE (cambie o no el tier).
    const mesActualStr = hoy.getUTCFullYear() + '-' + String(hoy.getUTCMonth() + 1).padStart(2, '0');

    // Bug real corregido (ver MANIFEST.md -- "meses_consecutivos_cumplidos
    // sumaba 1 por corrida"): este recálculo corre muchas veces por mes (cron
    // cada vez que termina un evento, "Recalcular ahora", modo soloUsuario de
    // "De viaje"), pero el contador de re-ascenso mide MESES. Solo suma si el
    // mes actual todavía no se contó (`meses_consecutivos_ultimo_mes`,
    // 'YYYY-MM'); cualquier otra corrida del mismo mes deja el valor igual. Un
    // mes que falla lo resetea a 0 y limpia el mes (así, si en el mismo mes
    // vuelve a cumplir, ese mes cuenta como 1).
    const contadorDelMes = (m: { mesesConsecutivosCumplidos: number; mesesUltimoMes: string | null }): number =>
      m.mesesUltimoMes === mesActualStr ? m.mesesConsecutivosCumplidos : m.mesesConsecutivosCumplidos + 1;

    const resultados: { username: string; categoria: string; enRiesgo: boolean }[] = [];

    for (const m of miembros) {
      const { username, estadoMiembro, tierModo } = m;
      // Lesionadx: no se toca la categoría (queda como esté, no participa
      // del recálculo -- ver MANIFEST.md "estado_miembro"). Tampoco
      // registra historial_tier este mes -- no hubo una evaluación real que
      // registrar.
      if (estadoMiembro === 'Lesionadx') continue;
      // De viaje (feat nueva, ver MANIFEST.md): mismo criterio que Lesionadx
      // -- tier congelado mientras dura el viaje. Excepción: el modo
      // `soloUsuario` (viaje ya terminado registrado a posteriori) SÍ la
      // evalúa, con la ventana compensada.
      if (estadoMiembro === 'De viaje' && username !== soloUsuario) continue;
      // tier_modo fijado a mano (Cambio 55, control Quindes/Auto/Mirlxs del
      // perfil de Equipo, ver adminSetTierModo()/supabase/functions/api/index.ts)
      // -- mismo criterio que Lesionadx: la categoría queda como esté,
      // "Recalcular ahora" no la pisa mientras no esté en 'auto'.
      if (tierModo && tierModo !== 'auto') continue;

      let categoriaAsignada: string;
      // Campos de riesgo/ascenso -- por default, "sin cambios" (se
      // sobreescriben más abajo según la rama que aplique). `undefined` deja
      // el UPDATE sin tocar esa columna cuando no corresponde recalcularla
      // (Técnico, ver abajo).
      let nuevoRiesgoDesde: string | null | undefined;
      let nuevoRiesgoHasta: string | null | undefined;
      let nuevoRiesgoObjetivo: string | null | undefined;
      let nuevosMesesConsecutivos: number | undefined;
      let nuevoUltimoMes: string | null | undefined; // `meses_consecutivos_ultimo_mes`, undefined = no tocar

      if (estadoMiembro === 'Técnico') {
        // Técnico: siempre Quindes, sin calcular clases/puntos ni tocar
        // riesgo/ascenso -- mismo criterio que antes de esta Fase 2 (caso
        // especial, no participa del sistema de mérito en absoluto).
        categoriaAsignada = 'Quindes';
      } else {
        const categoriaActual = m.categoria || tierDefault.nombre;
        const tierActualCfg = tiers.find((t: any) => t.nombre === categoriaActual) ?? tierDefault;
        const esTierDefault = tierActualCfg.id === tierDefault.id;
        const idxActualEnTiers = tiers.findIndex((t: any) => t.id === tierActualCfg.id);
        // "Tier superior" -- el que está justo antes en el orden (más
        // exigente) que el tier actual de la persona; `tiers` ya viene
        // ordenado ascendente por `orden` (más exigente = orden más chico).
        // `null` si la persona ya está en el tier más exigente que existe.
        const tierSuperior = idxActualEnTiers > 0 ? tiers[idxActualEnTiers - 1] : null;

        if (esTierDefault) {
          // En el tier piso (Mirlxs) -- acá NO se evalúa si "cumple su
          // propio tier" (un tier default con 0 requisitos siempre se
          // cumple, no tendría sentido) -- se evalúa contra el tier
          // SUPERIOR, para el re-ascenso automático (Parte E del pedido).
          if (!tierSuperior) {
            // Un solo tier configurado (sin nada por encima) -- no hay a
            // dónde ascender, nada que evaluar.
            categoriaAsignada = categoriaActual;
            nuevosMesesConsecutivos = m.mesesConsecutivosCumplidos;
          } else if (evaluarCumpleTier(username, tierSuperior)) {
            const nuevoContador = contadorDelMes(m);
            const umbralAscenso = Number(tierSuperior.meses_consecutivos_ascenso) || 3;
            if (nuevoContador >= umbralAscenso) {
              // 3 (o lo que diga el tier) meses consecutivos cumpliendo ->
              // ascenso automático. El contador vuelve a 0 en el tier nuevo
              // -- empieza de cero para un eventual ascenso siguiente si
              // hubiera más niveles.
              categoriaAsignada = tierSuperior.nombre;
              nuevosMesesConsecutivos = 0; nuevoUltimoMes = mesActualStr; // el mes del ascenso no cuenta para el tier nuevo
            } else {
              categoriaAsignada = categoriaActual;
              nuevosMesesConsecutivos = nuevoContador; nuevoUltimoMes = mesActualStr;
            }
          } else {
            // No cumplió este mes -- el contador vuelve a 0 (Parte E: "si
            // falla un mes, el contador vuelve a 0").
            categoriaAsignada = categoriaActual;
            nuevosMesesConsecutivos = 0; nuevoUltimoMes = null;
          }
          // El tier default nunca queda "en riesgo" -- no hay a dónde caer
          // más abajo.
          nuevoRiesgoDesde = null; nuevoRiesgoHasta = null; nuevoRiesgoObjetivo = null;
        } else {
          // En un tier no-default (ej. Quindes) -- se evalúa contra SU
          // PROPIO tier (¿lo sigue cumpliendo?), que es lo que decide si
          // entra/sale de riesgo de demotion.
          if (evaluarCumpleTier(username, tierActualCfg)) {
            categoriaAsignada = categoriaActual;
            nuevosMesesConsecutivos = contadorDelMes(m); nuevoUltimoMes = mesActualStr;
            nuevoRiesgoDesde = null; nuevoRiesgoHasta = null; nuevoRiesgoObjetivo = null;
            // Generalización para una futura cadena de más de 2 tiers: si
            // ya viene cumpliendo el tier actual el tiempo suficiente,
            // también puede ascender a uno todavía más exigente. Con los 2
            // tiers reales de hoy (Quindes es el más alto) esto nunca
            // dispara -- `tierSuperior` da `null` para quien ya está en el
            // tier de `orden` más chico.
            if (tierSuperior) {
              const umbralAscenso = Number(tierSuperior.meses_consecutivos_ascenso) || 3;
              if (nuevosMesesConsecutivos >= umbralAscenso && evaluarCumpleTier(username, tierSuperior)) {
                categoriaAsignada = tierSuperior.nombre;
                nuevosMesesConsecutivos = 0; nuevoUltimoMes = mesActualStr; // el mes del ascenso no cuenta para el tier nuevo
              }
            }
          } else {
            // No cumple más su tier actual -- el contador de re-ascenso
            // tampoco tendría sentido acumulando mientras está fallando.
            nuevosMesesConsecutivos = 0; nuevoUltimoMes = null;
            const mesesGracia = Number(tierActualCfg.meses_gracia_demotion) || 0;
            if (mesesGracia <= 0) {
              // Sin período de gracia configurado -- demotion inmediata,
              // comportamiento IDÉNTICO al que existía antes de esta Fase 2.
              categoriaAsignada = mejorTierPara(username);
              nuevoRiesgoDesde = null; nuevoRiesgoHasta = null; nuevoRiesgoObjetivo = null;
            } else if (!m.tierRiesgoDesde) {
              // Recién entra en riesgo -- NO se demota todavía. La fecha
              // límite se calcula y se congela ACÁ (ver comentario grande en
              // la migración sobre por qué no recalcularla al vuelo en cada
              // lectura).
              categoriaAsignada = categoriaActual;
              const desde = hoy;
              const hasta = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() + mesesGracia, desde.getUTCDate()));
              nuevoRiesgoDesde = desde.toISOString();
              nuevoRiesgoHasta = hasta.toISOString();
              nuevoRiesgoObjetivo = mejorTierPara(username);
            } else if (hoy > new Date(m.tierRiesgoHasta as string)) {
              // La gracia ya venció y sigue sin cumplir -- demotion
              // efectiva. Se recalcula el mejor tier FRESCO (no se confía en
              // el `tier_riesgo_objetivo` guardado como snapshot -- si algo
              // cambió durante la gracia, esto refleja el estado real ahora).
              categoriaAsignada = mejorTierPara(username);
              nuevoRiesgoDesde = null; nuevoRiesgoHasta = null; nuevoRiesgoObjetivo = null;
            } else {
              // Sigue en período de gracia -- sin cambios, se deja como está.
              categoriaAsignada = categoriaActual;
              nuevoRiesgoDesde = m.tierRiesgoDesde; nuevoRiesgoHasta = m.tierRiesgoHasta; nuevoRiesgoObjetivo = m.tierRiesgoObjetivo;
            }
          }
        }
      }

      const termometroPct = calcularTermometroPct(username);
      const update: Record<string, any> = { categoria: categoriaAsignada, termometro_pct: termometroPct };
      if (nuevoRiesgoDesde !== undefined) update.tier_riesgo_desde = nuevoRiesgoDesde;
      if (nuevoRiesgoHasta !== undefined) update.tier_riesgo_hasta = nuevoRiesgoHasta;
      if (nuevoRiesgoObjetivo !== undefined) update.tier_riesgo_objetivo = nuevoRiesgoObjetivo;
      if (nuevosMesesConsecutivos !== undefined) update.meses_consecutivos_cumplidos = nuevosMesesConsecutivos;
      if (nuevoUltimoMes !== undefined) update.meses_consecutivos_ultimo_mes = nuevoUltimoMes;
      await supabase.from('equipo').update(update).eq('username', username);

      // Historial de tier (Parte 3, ver MANIFEST.md) -- una fila por persona
      // por mes, SIEMPRE (cambie o no el tier resultante) -- fondos de viaje
      // (Parte 7) necesita confirmar continuidad mes a mes, no solo los
      // momentos de cambio.
      await supabase.from('historial_tier')
        .upsert({ username, mes: mesActualStr, tier_nombre: categoriaAsignada }, { onConflict: 'username,mes' });

      resultados.push({ username, categoria: categoriaAsignada, enRiesgo: !!nuevoRiesgoDesde });
    }

    // Cambio 58 -- recalcular horas_ano/asistencias_ano/total_eventos_ano
    // (equipo, ver migración 20260829_stats_equipo.sql) al final de cada
    // "Recalcular ahora", mismo trigger que categorías/puntos de arriba.
    // `recalcularStatsEquipo` vive en supabase/functions/api/index.ts (esta
    // función es standalone, sin acceso directo a esos handlers) -- se
    // invoca por HTTP con el MISMO `adminToken` (app-level, tabla
    // admin_sessions) que ya validó esta request, reusado tal cual, no uno
    // nuevo. `apikey`/`Authorization` acá son el JWT de plataforma que exige
    // el gateway de Supabase para llegar a la función (a diferencia de esta
    // función, `api` NO se despliega con --no-verify-jwt) -- se usa
    // SUPABASE_SERVICE_KEY (ya disponible acá server-side) en vez de la anon
    // key del frontend, que esta función no tiene motivo para conocer.
    // Best-effort: un fallo acá no debe tirar abajo la respuesta de
    // "Recalcular ahora" (categorías/puntos ya se guardaron igual) -- solo
    // se registra en logs.
    // Modo `soloUsuario`: no hace falta recalcular los stats de todo el equipo.
    if (!soloUsuario) try {
      await fetch(SUPABASE_URL + '/functions/v1/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify({ action: 'recalcularStatsEquipo', adminToken }),
      });
    } catch (statsErr) {
      console.warn('recalcularStatsEquipo falló tras recalcular-categorias:', statsErr);
    }

    return json({ ok: true, procesados: resultados.length, resultados });
  } catch (err) {
    return json({ ok: false, error: String((err as any)?.message ?? err) }, 500);
  }
});
