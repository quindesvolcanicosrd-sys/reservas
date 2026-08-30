// Edge Function — recalcula equipo.categoria de cada miembro según config_tiers.
// Mismo patrón de env vars y CORS que supabase/functions/api/index.ts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

  const authHeader = req.headers.get('Authorization') ?? '';
  const adminToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  const adminEmail = await _validarAdminToken(adminToken);
  if (!adminEmail) return json({ ok: false, error: 'Sesión admin inválida.' }, 401);

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

    const { data: equipoData, error: equipoError } = await supabase.from('equipo').select('username, estado_miembro, tier_modo');
    if (equipoError) return json({ ok: false, error: equipoError.message }, 500);
    const miembros: { username: string; estadoMiembro: string | null; tierModo: string | null }[] = (equipoData ?? [])
      .filter((r: any) => r.username)
      .map((r: any) => ({ username: r.username, estadoMiembro: r.estado_miembro ?? null, tierModo: r.tier_modo ?? 'auto' }));

    const maxVentana = Math.max(0, ...tiers.map((t: any) => Number(t.ventana_meses) || 0));

    // Bug real (Cambio 62): este fetch no filtraba por `estado` en absoluto
    // -- eventos cancelados ('Evento Cancelado') o todavía no sucedidos
    // ('Evento Programado', con `fecha` ya dentro de la ventana) contaban
    // igual que uno real hacia `contarClases()`, pudiendo calificar a
    // alguien para un tier sin cumplir el requisito real de asistencia.
    // Mismo fix que `recalcularStatsEquipo()`/supabase/functions/api/index.ts:
    // solo 'Evento Finalizado' representa un evento real ya sucedido.
    const { data: asistData, error: asistError } = await supabase
      .from('asistencias')
      .select('fecha, a_horario, tarde')
      .eq('estado', 'Evento Finalizado')
      .gte('fecha', fechaISO(primerDiaMesesAtras(maxVentana)));
    if (asistError) return json({ ok: false, error: asistError.message }, 500);

    const anioDesde = primerDiaMesesAtras(maxVentana).getUTCFullYear();
    const { data: puntosData, error: puntosError } = await supabase
      .from('puntos_mensuales')
      .select('nombre_usuario, anio, mes, puntos_total')
      .gte('anio', anioDesde);
    if (puntosError) return json({ ok: false, error: puntosError.message }, 500);

    const hoy = new Date();
    const idxActual = hoy.getUTCFullYear() * 12 + hoy.getUTCMonth();

    function contarClases(username: string, ventanaMeses: number): number {
      const desde = fechaISO(primerDiaMesesAtras(ventanaMeses));
      const u = username.trim().toUpperCase();
      let n = 0;
      for (const fila of asistData ?? []) {
        if (!fila.fecha || fila.fecha < desde) continue;
        if (nombresDe(fila.a_horario).includes(u) || nombresDe(fila.tarde).includes(u)) n++;
      }
      return n;
    }

    function sumarPuntos(username: string, ventanaMeses: number): number {
      let total = 0;
      for (const fila of puntosData ?? []) {
        if (fila.nombre_usuario !== username) continue;
        const idxFila = Number(fila.anio) * 12 + (Number(fila.mes) - 1);
        const diff = idxActual - idxFila;
        if (diff < 0 || diff > ventanaMeses) continue;
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

    const resultados: { username: string; categoria: string }[] = [];

    for (const { username, estadoMiembro, tierModo } of miembros) {
      // Lesionadx: no se toca la categoría (queda como esté, no participa
      // del recálculo -- ver MANIFEST.md "estado_miembro").
      if (estadoMiembro === 'Lesionadx') continue;
      // tier_modo fijado a mano (Cambio 55, control Quindes/Auto/Mirlxs del
      // perfil de Equipo, ver adminSetTierModo()/supabase/functions/api/index.ts)
      // -- mismo criterio que Lesionadx: la categoría queda como esté,
      // "Recalcular ahora" no la pisa mientras no esté en 'auto'.
      if (tierModo && tierModo !== 'auto') continue;

      let categoriaAsignada: string;
      if (estadoMiembro === 'Técnico') {
        // Técnico: siempre Quindes, sin calcular clases/puntos.
        categoriaAsignada = 'Quindes';
      } else {
        categoriaAsignada = tierDefault.nombre;
        for (const tier of tiersNoDefault) {
          const ventanaMeses = Number(tier.ventana_meses) || 0;
          const clases = contarClases(username, ventanaMeses);
          const puntos = sumarPuntos(username, ventanaMeses);
          const cumpleClases = clases >= (Number(tier.min_clases) || 0);
          const cumplePuntos = puntos >= (Number(tier.min_puntos) || 0);
          const cumple = tier.logica === 'Y' ? (cumpleClases && cumplePuntos) : (cumpleClases || cumplePuntos);
          if (cumple) {
            categoriaAsignada = tier.nombre;
            break;
          }
        }
      }
      const termometroPct = calcularTermometroPct(username);
      await supabase.from('equipo').update({ categoria: categoriaAsignada, termometro_pct: termometroPct }).eq('username', username);
      resultados.push({ username, categoria: categoriaAsignada });
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
    try {
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
