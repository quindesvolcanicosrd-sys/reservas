// Supabase Edge Function — backend único de Pivot (web y app Android).
// Contrato action-based (`action` + parámetros). Apps Script, Google Sheets y
// Railway son sistemas obsoletos: no queda ninguna conexión con ellos (2026-11-07).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AsyncLocalStorage } from 'node:async_hooks';
// Evento social (Naviquinde, 2026-11-19): acciones social* en su propio módulo.
import { procesarReglamento } from './reglamento.ts';
import { ACCIONES_SOCIAL, accionSocial, alcanceSocial, cronSocialPendientes, cronSocialRecordatorios, type DepsSocial, filtrarEventosSociales, socialPorAprobar } from './social.ts';
function _depsSocial(): DepsSocial {
    return { db: supabase, validarToken: _validarToken, validarAdminToken: _validarAdminToken, ligaEnCurso: _ligaEnCurso, push: sendPush, pivots: _administradorxs, appUrl: APP_URL, areasDe: _areasDe };
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = '632992894668-gnbb5cclsmfdcnve0g34kmue1c72h73q.apps.googleusercontent.com';
const ADMIN_PRINCIPAL  = 'victordbh@gmail.com';


// URL pública de la SPA -- destino de los `url`/`web_buttons` de las push
// notifications (sendPush(), más abajo). Configurable vía secret para no
// hardcodear si algún día cambia de dominio; el literal es el dominio real
// de producción.
const APP_URL = Deno.env.get('APP_URL') ?? 'https://pivot-d65f4.web.app';
// Header x-cron-secret que debe traer cualquier llamada a `action:'cronDiario'`
// (pg_cron -> net.http_post, ver supabase/migrations) -- sin este secret
// configurado, cronDiario queda inalcanzable (falla cerrado, no abierto).
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
// Firma los tokens de RSVP-desde-push (ver _firmarTokenAccion()/sendPush de
// pushEventoCreado() más abajo, y supabase/functions/record-attendance) --
// secret DEDICADO a esto, no el JWT_SECRET interno de Supabase Auth (esta
// app no usa Supabase Auth en absoluto, ver MANIFEST.md sección `activar/`
// -- reusar ese secret acoplaría un mecanismo interno de la plataforma a un
// feature de dominio sin relación). Mismo criterio que CRON_SECRET arriba:
// configurar vía `supabase secrets set PUSH_TOKEN_SECRET=...`, nunca
// hardcodeado.
const PUSH_TOKEN_SECRET = Deno.env.get('PUSH_TOKEN_SECRET') ?? '';

// ─── Varias ligas (Victor, 2026-11-17) ──────────────────────────────────────
// Cada pedido corre con un cliente que habla con la base como `liga_api` y un
// JWT con el `liga_id` de quien pide: las políticas de RLS solo dejan ver y
// escribir esa liga, y lo nuevo cae en ella. `supabase` (todo el código usa
// este nombre) apunta al cliente del pedido en curso. Sin PIVOT_JWT_SECRET
// configurado, todo sigue con la llave de servicio, como antes.
const supabaseServicio = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const PIVOT_JWT_SECRET = Deno.env.get('PIVOT_JWT_SECRET') ?? '';
const LIGA_QUINDES = '00000000-0000-4000-8000-00000000c0de';
const _alsLiga = new AsyncLocalStorage<{ cliente: any; ligaId: string }>();
const supabase: any = new Proxy({}, {
  get(_t, k) {
    // Archivos (storage) siempre con la llave de servicio: las rutas ya van por liga.
    const c = k === 'storage' ? supabaseServicio : (_alsLiga.getStore()?.cliente ?? supabaseServicio);
    const v = (c as any)[k];
    return typeof v === 'function' ? v.bind(c) : v;
  },
});
function _ligaEnCurso(): string { return _alsLiga.getStore()?.ligaId ?? LIGA_QUINDES; }

function _b64url(b: Uint8Array | string): string {
  const s = typeof b === 'string' ? btoa(unescape(encodeURIComponent(b))) : btoa(String.fromCharCode(...b));
  return s.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
async function _jwtLiga(ligaId: string): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = `${_b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${_b64url(JSON.stringify({ role: 'liga_api', liga_id: ligaId, iat: ahora, exp: ahora + 3600, iss: 'pivot' }))}`;
  const llave = await crypto.subtle.importKey('raw', new TextEncoder().encode(PIVOT_JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = new Uint8Array(await crypto.subtle.sign('HMAC', llave, new TextEncoder().encode(cuerpo)));
  return `${cuerpo}.${_b64url(firma)}`;
}
const _clientesLiga = new Map<string, { cliente: any; vence: number }>();
async function _clienteDeLiga(ligaId: string): Promise<any> {
  const ya = _clientesLiga.get(ligaId);
  if (ya && ya.vence > Date.now() + 120000) return ya.cliente;
  const jwt = await _jwtLiga(ligaId);
  const cliente = createClient(SUPABASE_URL, SUPABASE_ANON_KEY_LIGAS, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  _clientesLiga.set(ligaId, { cliente, vence: Date.now() + 3600000 });
  return cliente;
}
const SUPABASE_ANON_KEY_LIGAS = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

/// De qué liga es el pedido: por la sesión, por el usuario que inicia sesión
/// o por el enlace de la liga. Sin nada de eso, Quindes.
async function _ligaDelPedido(p: Record<string, any>): Promise<string> {
  const s = supabaseServicio;
  const fila = async (q: any) => ((await q.maybeSingle()).data?.liga_id as string | undefined);
  if (p.adminToken && p.adminToken !== _TOKEN_INTERNO) {
    const l = await fila(s.from('admin_sessions').select('liga_id').eq('token', String(p.adminToken)));
    if (l) return l;
  }
  if (p.token) {
    const l = await fila(s.from('sessions').select('liga_id').eq('token', String(p.token)));
    if (l) return l;
  }
    for (const k of ['username', 'nombre', 'usuario', 'nombreUsuario', 'identificador']) {
    if (typeof p[k] === 'string' && p[k].trim() && !p[k].includes('@')) {
      const l = await fila(s.from('equipo').select('liga_id').ilike('username', p[k].trim()));
      if (l) return l;
    }
  }
  // Correo: el que se escribe, o el de la cuenta de Google (solo para elegir
  // en qué liga buscar; la identidad la verifica cada acción).
  const correos: string[] = [];
  for (const k of ['email', 'identificador']) if (typeof p[k] === 'string' && p[k].includes('@')) correos.push(p[k].trim().toLowerCase());
  if (typeof p.idToken === 'string') {
    try {
      const b = p.idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const e = JSON.parse(atob(b + '==='.slice((b.length + 3) % 4)))?.email;
      if (e) correos.push(String(e).toLowerCase());
    } catch { /* token raro: se ignora */ }
  }
  for (const c of correos) {
    const l = (await s.from('equipo').select('liga_id').ilike('email', c).is('eliminado_en', null).limit(1)).data?.[0]?.liga_id
      ?? await fila(s.from('admins').select('liga_id').ilike('email', c));
    if (l) return l;
  }
    if (p.liga) {
    const l = (await s.from('ligas').select('id').eq('slug', String(p.liga)).maybeSingle()).data?.id;
    if (l) return l;
  }
  // Enlaces de inscripción: código del equipo o invitación.
  for (const k of ['equipo', 'codigo', 'codigoEquipo']) {
    if (typeof p[k] === 'string' && p[k].trim()) {
      const l = await fila(s.from('config_tiers').select('liga_id').eq('codigo_invitacion', p[k].trim()));
      if (l) return l;
    }
  }
  // Enlace de Personal de liga (Victor, 2026-11-27).
  if (typeof p.personal === 'string' && p.personal.trim()) {
    const l = await fila(s.from('config_app').select('liga_id').eq('key', 'codigo_personal_liga').eq('value', p.personal.trim()));
    if (l) return l;
  }
    for (const t of [p.inviteToken, p.token]) {
    if (typeof t === 'string' && t) {
      const l = await fila(s.from('invite_tokens').select('liga_id').eq('token', t));
      if (l) return l;
    }
  }
  // Evento social: invitadx +1 que entra sin cuenta con su enlace.
  if (typeof p.invitadoToken === 'string' && p.invitadoToken) {
    const l = await fila(s.from('social_invitados').select('liga_id').eq('token', p.invitadoToken));
    if (l) return l;
  }
  return LIGA_QUINDES;
}


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

// ─── Helpers: datos equipo ────────────────────────────────────────────────────

function getDatosCompletos(row: Record<string, any> | null): Record<string, any> | null {
  if (!row) return null;
  return {
    necesitaPatines:      row.necesita_patines      ?? '',
    talla:                row.talla                 ?? '',
        necesitaProtecciones: row.necesita_protecciones ?? '',
    equipoLiga:           row.equipo_liga ?? {},
    categoria:            row.categoria             ?? '',
    estado_miembro:       row.estado_miembro        ?? 'Activx',
    // snake_case a propósito, mismo criterio que estado_miembro arriba --
    // el frontend ya lee `E.datos.exenta_cuota` tal cual en varios lugares
    // (_evTieneCuotaAlDia()/js/eventos.js y otros, todos escritos ANTES de
    // que este mapeo existiera) — bug real corregido: esta función nunca
    // exponía la columna, así que `E.datos.exenta_cuota` era `undefined`
    // SIEMPRE (para cualquier cuenta, no solo admin) y ninguna de esas
    // verificaciones de cuota podía saltearse aunque `equipo.exenta_cuota`
    // estuviera en `true` en la base — la lógica de gating en sí ya estaba
    // bien, el dato nunca llegaba.
    exenta_cuota:         row.exenta_cuota          === true,
    personalLiga:         row.personal_liga         === true,
     solicitudLesionPendiente: row.solicitud_lesion_pendiente === true,
    // Cambio de equipo por ver y pedido de revisión (Victor, 2026-11-16).
    avisoCambioEquipo:    row.aviso_cambio_equipo ?? null,
    revisionCambio:       row.revision_cambio ?? null,
    nombreDerby:           row.nombre_derby          ?? '',
    numeroDerby:          row.numero_derby          ?? '',
    pronombres:           row.pronombres            ?? '',
    fechaIngreso:         row.fecha_ingreso          ?? null,
    email:                row.email                 ?? '',
    prefijo:              row.prefijo               ?? '',
    telefono:             row.telefono              ?? '',
    fechaPublica:         row.fecha_publica         ?? '',
    edadPublica:          row.edad_publica          ?? '',
    fechaNacimiento:      row.fecha_nacimiento      ?? '',
    tipoDocumento:        row.tipo_documento        ?? '',
    paisExpedicion:       row.pais_expedicion       ?? '',
    numeroDocumento:      row.numero_documento      ?? '',
    nombreLegal:          row.nombre_legal          ?? '',
    callePrincipal:       row.calle_principal       ?? '',
    calleSecundaria:      row.calle_secundaria      ?? '',
    numeracion:           row.numeracion            ?? '',
    sector:               row.sector                ?? '',
        canton:               row.canton                ?? '',
    direccionLat:         row.direccion_lat         ?? null,
    direccionLng:         row.direccion_lng         ?? null,
    emerg1Nombre:         row.emerg1_nombre         ?? '',
    emerg1Relacion:       row.emerg1_relacion       ?? '',
    emerg1Prefijo:        row.emerg1_prefijo        ?? '',
    emerg1Telefono:       row.emerg1_telefono       ?? '',
    emerg2Nombre:         row.emerg2_nombre         ?? '',
    emerg2Relacion:       row.emerg2_relacion       ?? '',
    emerg2Prefijo:        row.emerg2_prefijo        ?? '',
    emerg2Telefono:       row.emerg2_telefono       ?? '',
    enfermedad:           row.enfermedad            ?? '',
    alergias:             row.alergias              ?? '',
    dieta:                row.dieta                 ?? '',
        alergiasDesc:         row.alergias_desc         ?? '',
    comidaEventos:        row.comida_eventos        ?? '',
    antecedentes:         row.antecedentes          ?? '',
    medicamentos:         row.medicamentos          ?? '',
    medicamentosDesc:     row.medicamentos_desc     ?? '',
    atencionMedica:       row.atencion_medica       ?? '',
    seguro:               row.seguro                ?? '',
    seguroContacto:       row.seguro_contacto       ?? '',
    cuponDisponible:      row.cupon_disponible      === true,
    fotoPerfil:           row.foto_perfil           ?? '',
        permisosConfigurados: row.permisos_configurados === true,
        roles:                Array.isArray(row.roles) ? row.roles : [],
    // Cuenta y acceso (Ajustes de la app): solo si existen, nunca el hash.
    tienePassword:        !!row.password_hash,
    tienePin:             !!row.pin_hash,
    // Fase 2 completa del sistema de tiers (Parte 5, ver MANIFEST.md) --
    // `tierRiesgoDesde`/`tierRiesgoHasta` son columnas simples (sin `?? ''`,
    // a propósito -- `null` real, no cadena vacía, para que el frontend
    // pueda chequear `if (E.datos.tierRiesgoDesde)` directo, mismo criterio
    // que `fechaIngreso` un poco más arriba). `tierRiesgoHasta` ya viene
    // CONGELADA desde `recalcular-categorias/index.ts` (calculada una sola
    // vez al entrar en riesgo, ver el comentario grande en la migración) --
    // esta función NO recalcula nada, solo expone las 2 columnas tal cual,
    // sin ningún JOIN extra ni volverse async (se llama desde ~10 flujos de
    // login/restauración de sesión distintos, todos con este mismo shape
    // síncrono). `tierRiesgoObjetivo` -- a qué tier caería si la gracia
    // vence -- lo arma el banner del frontend (_evTierRiesgoBannerHtml()/
    // js/home.js) para el mensaje "...o pasarás a X.".
    tierRiesgoDesde:      row.tier_riesgo_desde     ?? null,
    tierRiesgoHasta:      row.tier_riesgo_hasta     ?? null,
    tierRiesgoObjetivo:   row.tier_riesgo_objetivo  ?? null,
  };
}

async function _getEquipoRow(username: string): Promise<Record<string, any> | null> {
  if (!username) return null;
  const { data } = await supabase.from('equipo').select('*').eq('username', username).maybeSingle();
  return data;
}

async function _getEquipoRowByEmail(email: string): Promise<Record<string, any> | null> {
  if (!email) return null;
  const { data } = await supabase.from('equipo').select('*').ilike('email', email).maybeSingle();
  return data;
}

// Cuenta archivada (`equipo.eliminado_en` != null, ver migración
// `20261027...archivar_usuarios_restrict_fk.sql`) -- helper centralito para
// no repetir `!!row?.eliminado_en` en cada call site. `_getEquipoRow()`/
// `_getEquipoRowByEmail()` arriba siguen devolviendo la fila archivada tal
// cual (nunca filtran solas) -- cada caller decide qué hacer: login/sesión
// la rechazan explícitamente (ver loginGoogle/adminLogin/validarPin/
// restaurarSesion, más abajo -- el caso de loginGoogle/adminLogin es
// especial: si la fila no existe en absoluto cae al camino de "admin puro
// sin fila", pero si existe Y está archivada se rechaza derecho, nunca cae
// a ese fallback), Mi Liga → historial la sigue mostrando (con la marca
// "Cuenta eliminada"), Mi Liga → Usuarios la sigue listando (con botón
// Restaurar si la archivó un admin).
function _estaArchivado(row: { eliminado_en?: string | null } | null | undefined): boolean {
  return !!row?.eliminado_en;
}

async function _validarToken(token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await supabase.from('sessions').select('username, expires_at').eq('token', token).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) <= new Date()) return null;
  return data.username;
}

// Token que solo existe en memoria de esta función: lo usa el servidor para
// aprobar por su cuenta (pedidos de Pivots con aprobación automática). Nunca
// sale en una respuesta.
const _TOKEN_INTERNO = 'interno-' + crypto.randomUUID();
const _EMAIL_SISTEMA = 'sistema@pivot';

async function _validarAdminToken(token: string): Promise<string | null> {
  if (!token) return null;
  if (token === _TOKEN_INTERNO) return _EMAIL_SISTEMA;
  const { data } = await supabase.from('admin_sessions').select('email, expires_at').eq('token', token).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) <= new Date()) return null;
  return data.email;
}

const ACCIONES_SOLO_PIVOTS = new Set([
  'adminGetVenues', 'adminCrearVenue', 'adminEditarVenue', 'adminEliminarVenue',
  'adminGetEquipamiento', 'adminGuardarEquipamiento', 'adminGetTareasActivas', 'adminBuscarPersonasParaEvento',
  'adminGetEstadoPagosMes', 'adminGetPagosAnual', 'adminGetBalanceFinanciero', 'adminGetUsuarios',
  'adminGetCandidatosAdmin', 'adminGetRosterEquipo', 'adminGetQueLlevar',
      'adminGetAdmins', 'adminGetReservas', 'adminGetSolicitudesPago', 'adminResolverSolicitudPago', 'adminGetTareasPendientesValidacion',
]);

// ─── Pivots y permisos por área (Victor, 2026-11-13) ────────────────────────
// admins.areas null = todas. El Pivot principal siempre tiene todas.
// 'sociales' (Victor, 2026-11-20): crear fiestas y eventos sociales. Un Pivot
// con solo esa área no usa ninguna otra herramienta de Pivot (`_soloSociales`).
const AREAS_PIVOT = ['finanzas', 'asistencia', 'equipo', 'salud', 'inventario', 'tareas', 'liga', 'sociales'];
const AREA_DE_ACCION: Record<string, string> = {};
for (const [area, acciones] of Object.entries({
  finanzas: ['adminGetEstadoPagosMes', 'adminGetPagosAnual', 'adminGetBalanceFinanciero', 'adminRegistrarEgreso', 'adminRegistrarIngreso', 'adminRegistrarPago',
    'adminResolverSolicitudPago', 'adminGetSolicitudesPago', 'adminClasesParaPago', 'adminMesesCuota', 'adminSetExentaCuota', 'adminCuponDescuento', 'adminPlanes', 'adminSetPreciosClases', 'adminSetFondosViajeConfig', 'adminToggleCupon',
    'adminGetExcepciones', 'adminGetExcepcionesVigentes', 'adminSetEstadoExcepcion', 'adminCancelarExcepcion', 'adminSetEstadoReserva', 'adminTesoreria', 'adminPagoCoaches'],
  asistencia: ['adminMarcarAsistencia', 'adminCambiarRespuesta', 'adminGetRectificaciones', 'adminSetEstadoRectificacion', 'adminSugeridosAsistencia',
    'adminRegistrarAsistenciaExterna', 'adminEliminarAsistenciaExterna', 'adminGetAsistenciasExternas', 'adminRecalcularPuntosAsistencia', 'adminBorrarEvento',
    'adminCancelarEvento', 'adminRegenerarVentanaAsistencias', 'adminCrearVenue', 'adminEditarVenue', 'adminEliminarVenue', 'adminCursos'],
  equipo: ['adminSetCategoria', 'adminSetTierModo', 'upsertTier', 'deleteTier', 'adminDatosCategorias', 'adminSetEstadoMiembro', 'adminActualizarEstadoViaje',
    'adminCancelarViaje', 'adminEliminarUsuario', 'adminRestaurarUsuario', 'adminBorrarDatosPersona', 'adminCoaches', 'adminRolesEquipo', 'adminGuardarTemporadaDescanso', 'adminEliminarTemporadaDescanso',
        'adminBackfillHistorialTier', 'adminRecalcularStats', 'adminReglasLiga', 'adminCambiosEquipo', 'adminResolverRevisionEquipo', 'adminRecompensas'],
  salud: ['adminFichaEmergencia', 'adminAprobarLesion', 'adminRechazarLesion', 'adminGetSolicitudesLesion'],
  inventario: ['adminInventarioLista', 'adminPrestamo', 'adminReglaPrestamo', 'adminGuardarEquipamiento'],
  tareas: ['adminCrearTarea', 'adminEditarTarea', 'adminEliminarTarea', 'adminArchivarTarea', 'adminEliminarTareaArchivada', 'adminValidarTarea', 'adminDesvalidarTarea',
    'adminEditarAsignacionesTarea', 'adminCrearTareaRecurrente', 'adminEditarTareaRecurrente', 'adminEstadoTareaRecurrente', 'adminAplicarTareaRecurrenteHistorico'],
        liga: ['adminSubirLogo', 'adminGuardarConfigLiga', 'adminGuardarComunidad', 'adminAgregarAdmin', 'adminQuitarAdmin', 'adminEnviarAviso', 'adminAvisosProgramados', 'adminGetEstadoPush'],
})) for (const a of acciones) AREA_DE_ACCION[a] = area;

/** Áreas de un Pivot por email (todas si es el principal, el sistema o no tiene límite). */
async function _areasDe(email: string): Promise<string[]> {
  const e = String(email ?? '').toLowerCase();
  if (!e) return [];
  if (e === ADMIN_PRINCIPAL.toLowerCase() || e === _EMAIL_SISTEMA) return AREAS_PIVOT;
  const { data } = await supabase.from('admins').select('areas').ilike('email', e).maybeSingle();
  if (!data) return [];
  return Array.isArray(data.areas) ? data.areas.filter((a: string) => AREAS_PIVOT.includes(a)) : AREAS_PIVOT;
}

/** Pivot que solo tiene el área de fiestas y eventos sociales. */
function _soloSociales(areas: string[]): boolean {
  return areas.length === 1 && areas[0] === 'sociales';
}

async function _esAdmin(email: string): Promise<boolean> {
  if (!email) return false;
  if (email.toLowerCase() === ADMIN_PRINCIPAL.toLowerCase()) return true;
  const { data } = await supabase.from('admins').select('email').ilike('email', email).maybeSingle();
  return !!data;
}

// Variante de _esAdmin() por `username` (nombre_usuario de asignaciones_tareas,
// NO un email) -- usada por enviarRevisionTarea() para decidir si quien
// completa una tarea es admin (aprobación automática, ver MANIFEST.md
// sección 3 -- pedido explícito: "si quien completa la tarea es admin,
// aprobación automática, aplica a TODOS los tipos de tarea").
async function _esAdminPorUsername(username: string): Promise<boolean> {
  if (!username) return false;
  const { data } = await supabase.from('equipo').select('email').ilike('username', username).maybeSingle();
  if (!data?.email) return false;
  return _esAdmin(data.email);
}

async function _crearToken(username: string): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  await supabase.from('sessions').insert({ token, username, expires_at: expiresAt });
  return token;
}

async function _crearAdminToken(email: string): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
  await supabase.from('admin_sessions').insert({ token, email, expires_at: expiresAt });
  return token;
}

async function _verificarGoogleToken(idToken: string): Promise<Record<string, any> | null> {
  if (!idToken) return null;
  const resp = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
  if (!resp.ok) return null;
  const data = await resp.json();
  const aud = Array.isArray(data.aud) ? data.aud : [data.aud];
  if (!aud.includes(GOOGLE_CLIENT_ID)) return null;
  if (data.email_verified !== 'true') return null;
  return data;
}

async function _adjuntarAdmin(result: Record<string, any>, row: Record<string, any>): Promise<Record<string, any>> {
  const esAdmin = await _esAdmin(row.email ?? '');
  if (esAdmin) {
    result.esAdmin = true;
    result.adminToken = await _crearAdminToken(row.email);
    const pagaCuota = (row.paga_cuota ?? '').toLowerCase();
    result.dashboardAdmin = !(pagaCuota === 'sí' || pagaCuota === 'si');
  }
  return result;
}

// ─── Helpers: mapas y logs ────────────────────────────────────────────────────

async function _mapaEquipoPorNombre(): Promise<Record<string, any>> {
  const { data } = await supabase.from('equipo').select('username, nombre_derby, foto_perfil');
  const mapa: Record<string, any> = {};
  (data ?? []).forEach((r: any) => {
    mapa[String(r.username).trim().toUpperCase()] = {
      nombreDerby: r.nombre_derby ?? '',
      fotoPerfil:  r.foto_perfil  ?? '',
    };
  });
  return mapa;
}

async function _mapaTipoIconoPorLugar(): Promise<Record<string, string>> {
  const { data } = await supabase.from('venues').select('lugar, tipo_icono');
  const mapa: Record<string, string> = {};
  (data ?? []).forEach((v: any) => { mapa[v.lugar] = v.tipo_icono ?? 'Entrenamiento'; });
  return mapa;
}

async function _mapaRequiereReservaPorLugar(): Promise<Record<string, boolean>> {
  const { data } = await supabase.from('venues').select('lugar, requiere_reserva');
  const mapa: Record<string, boolean> = {};
  (data ?? []).forEach((v: any) => { mapa[v.lugar] = v.requiere_reserva !== false; });
  return mapa;
}

async function _mapaVideoInstructivoPorLugar(): Promise<Record<string, string>> {
  const { data } = await supabase.from('venues').select('lugar, video_instructivo');
  const mapa: Record<string, string> = {};
  (data ?? []).forEach((v: any) => { if (v.video_instructivo) mapa[v.lugar] = v.video_instructivo; });
  return mapa;
}

async function _ultimaAsistenciaPorPersonaTodas(idsEvento: string[]): Promise<Record<string, any[]>> {
  if (idsEvento.length === 0) return {};
  // Auditoría de escalabilidad (2026-11-12): antes se traía `log_asistencias`
  // COMPLETA (.limit(100000)) y se filtraba en memoria -- al llegar al tope
  // vuelve el error de "Asistiré no se ve". Ahora la base devuelve solo la
  // fila vigente de cada (evento, persona) de estos eventos, en un único
  // JSON (sin límite de filas). La regla de prioridad está documentada en
  // la función SQL `fn_asistencia_vigente_por_evento` (migración
  // 20261112170000): 'Admin' (asistencia real) gana siempre a cualquier
  // RSVP -- bug real corregido el 2026-09, ver CHANGELOG --, 'Usuario' gana
  // a 'AsistenciaAnticipada' y, a igual prioridad, la marca más reciente.
  const porEvento: Record<string, any[]> = {};
  const unicos = [...new Set(idsEvento)];
  for (let k = 0; k < unicos.length; k += 500) {
    const { data, error } = await supabase.rpc('fn_asistencia_vigente_por_evento', { ids: unicos.slice(k, k + 500) });
    if (error) { console.error('[asist] error rpc:', JSON.stringify(error)); continue; }
    Object.assign(porEvento, data ?? {});
  }
  return porEvento;
}

// Última asistencia REAL por persona, para el gate de inactividad (30+ días
// sin marca real = inactivo, ver `_evEsInactivo()`/js/eventos.js y
// `_eqEsInactivo()`/js/equipo.js) -- bug real corregido (ver MANIFEST.md --
// "Victor/Tormento aparecen inactivos pese a asistir a eventos externos
// recientes"): `getEquipo()`, `adminGetRosterEquipo()` y
// `adminBuscarPersonasParaEvento()` traían cada una su propia copia de este
// cálculo (duplicación a propósito entre ellas, mismo criterio que el resto
// del archivo) -- pero las 3 copias filtraban `origen==='Admin'`
// ÚNICAMENTE, así que una persona cuya única marca reciente fuera
// `origen='Externa'` (asistencia real a un evento FUERA del calendario del
// equipo -- ver `adminRegistrarAsistenciaExterna()`, más abajo en este
// archivo, y `recalcularPuntosAsistencia()`, que SÍ ya contaba `'Externa'`
// para puntos) quedaba con una `ultimaAsistencia` vieja (la última marca
// 'Admin', mucho más atrás) y clasificada como inactiva pese a haber
// asistido hace poco. Extraído a un solo helper (en vez de arreglar las 3
// copias por separado) para que no puedan volver a desalinearse entre sí.
// Nunca `'Usuario'`/`'AsistenciaAnticipada'` (RSVP, no asistencia real) ni
// `estado='Ninguno'` (ausente). Sin `.in('nombre_usuario', ...)` a
// propósito -- ese filtro exacto del lado de la DB podía dejar afuera una
// fila si `nombre_usuario` no coincidía carácter a carácter con
// `equipo.username` (espacios/mayúsculas); la tabla filtrada a estos 2
// orígenes es chica, se trae completa y el match contra cada persona se
// hace acá mismo normalizando (trim + mayúsculas) los 2 lados. Respaldo de
// fecha (defensivo) si `fecha_entrenamiento` viniera nula: usa
// `asistencias.fecha` del mismo `id_evento`.
async function _ultimaAsistenciaRealPorUsuario(): Promise<Record<string, string>> {
  // Resuelto en la base (`fn_ultima_asistencia_real_por_usuario`, migración
  // 20261112170000; mismo criterio de siempre, ver comentario de arriba):
  // devuelve ya el mapa { USUARIO_NORMALIZADO: fecha } en vez de traer toda
  // la historia de asistencias reales.
  const { data, error } = await supabase.rpc('fn_ultima_asistencia_real_por_usuario');
  if (error) console.error('[asist] error rpc real:', JSON.stringify(error));
  const mapa = { ...((data ?? {}) as Record<string, string>) };
  // Vuelta de un viaje, lesión o ausencia con motivo (Victor, 2026-11-27):
  // cuenta como punto de partida para la inactividad, así volver de un viaje
  // largo no deja a la persona como Inactivx de inmediato.
  const { data: vueltas } = await supabase.from('equipo').select('username, vuelta_en').not('vuelta_en', 'is', null);
  for (const v of vueltas ?? []) {
    const k = String(v.username ?? '').trim().toUpperCase();
    const f = String(v.vuelta_en).slice(0, 10);
    if (!mapa[k] || String(mapa[k]).slice(0, 10) < f) mapa[k] = f;
  }
  return mapa;
}
// Lee el mapa de arriba para UNA persona puntual (`username` real, no
// normalizado) -- devuelve la fecha ISO completa (con hora) tal cual quedó
// en el mapa, o `null` sin marca real. Evita repetir el `.trim().toUpperCase()`
// en cada call site.
function _ultimaAsistenciaDe(mapa: Record<string, string>, username: string): string | null {
  return mapa[String(username ?? '').trim().toUpperCase()] ?? null;
}

// Recibe las filas de `asistencias` ya cargadas por quien llama (antes leía
// la tabla completa en cada llamada; auditoría 2026-11-12).
function _asistenciaEFPorEvento(data: any[]): Record<string, any[]> {

  const porEvento: Record<string, any[]> = {};
  (data ?? []).forEach((fila: any) => {
    const nombres = (s: string) => String(s ?? '').split(',').map((n: string) => n.trim()).filter(Boolean);
    const lista = [
      ...nombres(fila.a_horario).map((n: string) => ({ nombre: n, estado: 'A tiempo', origen: 'Admin' })),
      ...nombres(fila.tarde).map((n: string) => ({ nombre: n, estado: 'Tarde', origen: 'Admin' })),
    ];
    if (lista.length) porEvento[fila.id_evento] = lista;
  });
  return porEvento;
}

/** Suscripción a una clase confirmada → la persona queda en "Asistiré". */
async function _asistireAlConfirmar(idEvento: string, nombre: string): Promise<void> {
  // Una clase que ya pasó (pago registrado después) no cambia su respuesta.
  const { data: ev } = await supabase.from('asistencias').select('fecha').eq('id_evento', idEvento).maybeSingle();
  if (!ev || String(ev.fecha).slice(0, 10) < _hoyEcuadorISO()) return;
  await supabase.from('log_asistencias').delete()
    .eq('id_evento', idEvento).eq('nombre_usuario', nombre)
    .in('origen', ['Usuario', 'AsistenciaAnticipada']);
  await _agregarFilaLogAsistencia(idEvento, nombre, 'Usuario', 'Asistiré');
}
async function _agregarFilaLogAsistencia(idEvento: string, nombre: string, origen: string, estado: string): Promise<{ error: string | null }> {
  const { data: ev } = await supabase.from('asistencias').select('fecha').eq('id_evento', idEvento).maybeSingle();
  const { error } = await supabase.from('log_asistencias').insert({
    id_evento: idEvento,
    fecha_entrenamiento: ev?.fecha ? ev.fecha + 'T00:00:00Z' : null,
    nombre_usuario: nombre,
    origen,
    estado,
    marca_temporal: new Date().toISOString(),
  });
  return { error: error?.message ?? null };
}

async function _acreditarPuntosTarea(nombre: string, anio: number, mes: number, puntos: number): Promise<void> {
  const { data } = await supabase.from('puntos_mensuales').select('id, puntos_tareas')
    .eq('nombre_usuario', nombre).eq('anio', anio).eq('mes', mes).maybeSingle();
  if (data) {
    const nuevo = (Number(data.puntos_tareas) || 0) + puntos;
    await supabase.from('puntos_mensuales').update({ puntos_tareas: nuevo }).eq('id', data.id);
  } else {
    await supabase.from('puntos_mensuales').insert({ nombre_usuario: nombre, anio, mes, puntos_tareas: puntos });
  }
}

async function _restarPuntosTarea(nombre: string, anio: number, mes: number, puntos: number): Promise<void> {
  const { data } = await supabase.from('puntos_mensuales').select('id, puntos_tareas')
    .eq('nombre_usuario', nombre).eq('anio', anio).eq('mes', mes).maybeSingle();
  if (data) {
    const nuevo = Math.max(0, (Number(data.puntos_tareas) || 0) - puntos);
    await supabase.from('puntos_mensuales').update({ puntos_tareas: nuevo }).eq('id', data.id);
  }
}

// Mismo patrón que _acreditarPuntosTarea() (arriba) -- sumar `puntos` al
// `puntos_extra` YA existente de esa persona/mes, no reemplazarlo. Un
// `.upsert()` con `ON CONFLICT DO UPDATE SET puntos_extra = puntos_extra +
// N` no es posible vía supabase-js (el cliente no arma expresiones SQL en
// el conflicto, solo puede pisar valores) -- select-o-insert/update manual
// es la única forma de hacerlo aditivo. Usada por el bonus de racha de
// asistencia (`adminMarcarAsistencia()`/racha_actual, más abajo).
async function _acreditarPuntosExtra(nombre: string, anio: number, mes: number, puntos: number): Promise<void> {
  const { data } = await supabase.from('puntos_mensuales').select('id, puntos_extra')
    .eq('nombre_usuario', nombre).eq('anio', anio).eq('mes', mes).maybeSingle();
  if (data) {
    const nuevo = (Number(data.puntos_extra) || 0) + puntos;
    await supabase.from('puntos_mensuales').update({ puntos_extra: nuevo }).eq('id', data.id);
  } else {
    await supabase.from('puntos_mensuales').insert({ nombre_usuario: nombre, anio, mes, puntos_extra: puntos });
  }
}

async function _limiteTareasActivas(): Promise<number> {
  const { data } = await supabase.from('config_tareas').select('limite_tareas_activas').limit(1).maybeSingle();
  return data?.limite_tareas_activas ?? 3;
}

async function _contarIniciadasDe(nombre: string): Promise<number> {
  const { data } = await supabase.from('asignaciones_tareas').select('id').eq('nombre_usuario', nombre).eq('estado', 'iniciada');
  return (data ?? []).length;
}

function _estadoPagoPersonaMes(nombre: string, mes: number, anio: number, pagosDelMes: any[], solicitudesAprobadas: any[], hoy: Date): string {
  const esFuturo = (anio > hoy.getFullYear()) || (anio === hoy.getFullYear() && mes > (hoy.getMonth() + 1));
  if (esFuturo) return 'No aplica';
  const pago = pagosDelMes.find((p: any) => p.nombre_usuario === nombre);
  if (pago?.exoneradx) return 'Exoneradx';
  const solicitudes = solicitudesAprobadas.filter((s: any) => s.nombre_usuario === nombre);
  if (solicitudes.some((s: any) => s.tipo === 'exoneracion')) return 'Exoneradx';
  if (pago?.monto > 0) return 'Al día';
  if (solicitudes.some((s: any) => s.tipo === 'parcial')) return 'Parcial';
  return 'Debe';
}

// Consume UNA reserva en estado 'Reagendar' de esa persona → 'Crédito usado'
// Devuelve true si se encontró y consumió.
async function _consumirCreditoReal(nombre: string): Promise<boolean> {
  const { data } = await supabase.from('reservas').select('id').eq('nombre_usuario', nombre).eq('estado', 'Reagendar').limit(1).maybeSingle();
  if (!data) return false;
  await supabase.from('reservas').update({ estado: 'Crédito usado' }).eq('id', data.id);
  return true;
}

function _horaTextoADate(horaStr: string | null): Date | null {
  if (!horaStr) return null;
  const parts = horaStr.split(':');
  if (parts.length < 2) return null;
  const d = new Date();
  d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
  return d;
}

async function _proximosEntrenamientos(incluirCerradas = false): Promise<any[]> {
  const reglasRes = await _reglasLiga();
  const cierraMs = (Number(reglasRes.reservaCierraHoras) >= 0 ? Number(reglasRes.reservaCierraHoras) : 2) * 3600 * 1000;
  const ecuadorNow = new Date(new Date().getTime() - 5 * 60 * 60 * 1000);
  const hoyISO = ecuadorNow.toISOString().substring(0, 10);
  const { data } = await supabase.from('asistencias')
    .select('id_evento, fecha, donde, inicia, termina, info_adicional, google_maps, dura, estado')
    .not('estado', 'in', '("Evento Cancelado","Eliminado")').gte('fecha', hoyISO).order('fecha').order('inicia');
  const requiereReserva = await _mapaRequiereReservaPorLugar();
  const videoInstructivo = await _mapaVideoInstructivoPorLugar();
  const ahora = new Date();
  const lista = (data ?? []).filter((f: any) => {
    if (requiereReserva[f.donde] === false) return false;
    const [yr, mo, dy] = f.fecha.split('-').map(Number);
    const [h, m] = (f.inicia ?? '00:00').split(':').map(Number);
    const inicioUTC = new Date(Date.UTC(yr, mo - 1, dy, h + 5, m, 0, 0)); // Ecuador = UTC-5
                const limite = new Date(inicioUTC.getTime() - cierraMs);
    if (ahora < limite) return true;
    // Las de hoy que ya cerraron también se muestran, con el motivo (Victor, 2026-11-21:
    // alguien entró a reservar y no vio la clase de hoy ni por qué).
    if (incluirCerradas && f.fecha === hoyISO && ahora < inicioUTC) { f._cerrada = limite; return true; }
    return false;
  }).map((f: any) => ({
    cerradaDesde: f._cerrada ? new Date(f._cerrada.getTime() - 5 * 3600 * 1000).toISOString().slice(11, 16) : null,
    idEvento: f.id_evento, fecha: f.fecha, donde: f.donde,
    horaInicio: f.inicia ? f.inicia.substring(0, 5) : '',
    horaFin:    f.termina ? f.termina.substring(0, 5) : '',
    descripcion: f.info_adicional ?? '', mapsUrl: f.google_maps ?? '', duracion: f.dura ?? '', videoInstructivo: videoInstructivo[f.donde] ?? '',
  }));
    return lista.slice(0, Math.max(1, Number(reglasRes.reservaClasesVisibles) || 6));
}

// ─── Acciones: auth ───────────────────────────────────────────────────────────

async function loginGoogle(params: Record<string, any>): Promise<Record<string, any>> {
  const info = await _verificarGoogleToken(params.idToken);
  if (!info) return { valido: false, error: 'Token de Google inválido.' };
  const email = (info.email ?? '').toLowerCase();
  const foto = info.picture ?? '';
  const esAdmin = await _esAdmin(email);
  if (esAdmin) {
    // Bug real corregido (pedido explícito, ver MANIFEST.md sección
    // "Archivado de usuarios"): la fila se busca ANTES de emitir ningún
    // token -- si existe y está archivada, se rechaza derecho. Antes
    // (cuando "archivada" significaba simplemente "borrada") esto no
    // existía porque la fila ya no estaba; ahora la fila sigue estando, así
    // que sin este chequeo una cuenta admin archivada caía al mismo
    // `return` de "admin puro sin fila" de abajo y entraba igual.
    const rowPrevia = await _getEquipoRowByEmail(email);
    if (_estaArchivado(rowPrevia)) return { valido: false, error: 'Esta cuenta fue eliminada.' };
    const adminToken = await _crearAdminToken(email);
    if (rowPrevia) {
      const token = await _crearToken(rowPrevia.username);
      const pagaCuota = (rowPrevia.paga_cuota ?? '').toLowerCase();
      return { valido: true, token, nombre: rowPrevia.username, datos: getDatosCompletos(rowPrevia), foto, esAdmin: true, adminToken, dashboardAdmin: !(pagaCuota === 'sí' || pagaCuota === 'si') };
    }
    return { valido: true, esAdmin: true, email, adminToken, dashboardAdmin: true };
  }
  const row = await _getEquipoRowByEmail(email);
  if (!row) return { valido: false, noRegistrado: true };
  if (_estaArchivado(row)) return { valido: false, error: 'Esta cuenta fue eliminada.' };
  const token = await _crearToken(row.username);
  return { valido: true, token, nombre: row.username, datos: getDatosCompletos(row), foto };
}

// ─── Inicio y cuenta con correo (preparado, Victor 2026-11-13) ─────────────
// Código de 6 dígitos por correo (Supabase Auth OTP). Apagado hasta que Victor
// lo active: config_app `login_correo` = 'true' y el proveedor de correo
// habilitado en Supabase Auth.
async function _loginCorreoActivo(): Promise<boolean> {
  const { data } = await supabase.from('config_app').select('value').eq('key', 'login_correo').maybeSingle();
  return data?.value === 'true';
}

async function _firmaRegistro(email: string, exp: number): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(SUPABASE_SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const f = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`registro|${email}|${exp}`));
  return Array.from(new Uint8Array(f)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Token corto (1 hora) que prueba que el correo se verificó, para crear la cuenta. */
async function _tokenRegistro(email: string): Promise<string> {
  const exp = Date.now() + 3600 * 1000;
  return `${exp}.${await _firmaRegistro(email, exp)}`;
}

async function _registroValido(email: string, token: string): Promise<boolean> {
  const [e, firma] = String(token ?? '').split('.');
  const exp = Number(e);
  if (!exp || exp < Date.now() || !firma) return false;
  return (await _firmaRegistro(email, exp)) === firma;
}

async function getOpcionesLogin(): Promise<Record<string, any>> {
  return { exito: true, correo: await _loginCorreoActivo() };
}

async function enviarCodigoCorreo(params: Record<string, any>): Promise<Record<string, any>> {
  if (!(await _loginCorreoActivo())) return { exito: false, desactivado: true, error: 'Entrar con correo todavía no está disponible.' };
  const email = String(params.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { exito: false, error: 'Correo inválido.' };
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) return { exito: false, error: 'No se pudo enviar el código. Inténtalo en un minuto.' };
  return { exito: true };
}

async function verificarCodigoCorreo(params: Record<string, any>): Promise<Record<string, any>> {
  if (!(await _loginCorreoActivo())) return { valido: false, desactivado: true, error: 'Entrar con correo todavía no está disponible.' };
  const email = String(params.email ?? '').trim().toLowerCase();
  const codigo = String(params.codigo ?? '').replace(/\D/g, '');
  if (!email || codigo.length < 6) return { valido: false, error: 'Escribe el código que te llegó.' };
  const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email' });
  if (error) return { valido: false, error: 'Código incorrecto o vencido.' };
  const esAdmin = await _esAdmin(email);
  const row = await _getEquipoRowByEmail(email);
  if (_estaArchivado(row)) return { valido: false, error: 'Esta cuenta fue eliminada.' };
  if (!row) {
    if (esAdmin) return { valido: true, esAdmin: true, email, adminToken: await _crearAdminToken(email) };
    return { valido: false, noRegistrado: true, email, registroToken: await _tokenRegistro(email) };
  }
  const token = await _crearToken(row.username);
  const out: Record<string, any> = { valido: true, token, nombre: row.username, datos: getDatosCompletos(row) };
  if (esAdmin) { out.esAdmin = true; out.adminToken = await _crearAdminToken(email); }
  return out;
}

async function adminLogin(params: Record<string, any>): Promise<Record<string, any>> {
  const info = await _verificarGoogleToken(params.idToken);
  if (!info) return { ok: false, error: 'Token de Google inválido.' };
  const email = (info.email ?? '').toLowerCase();
  const esAdmin = await _esAdmin(email);
  if (!esAdmin) return { ok: false, error: 'Este email no tiene permisos de administradorx.' };
  // Mismo fix que loginGoogle() -- ver ese comentario: buscar la fila ANTES
  // de emitir el adminToken, para poder rechazar una cuenta archivada sin
  // que caiga al fallback de "admin puro sin fila".
  const row = await _getEquipoRowByEmail(email);
  if (_estaArchivado(row)) return { ok: false, error: 'Esta cuenta fue eliminada.' };
  const adminToken = await _crearAdminToken(email);
  if (row) {
    const token = await _crearToken(row.username);
    const pagaCuota = (row.paga_cuota ?? '').toLowerCase();
    return { valido: true, token, nombre: row.username, datos: getDatosCompletos(row), foto: info.picture ?? '', esAdmin: true, adminToken, dashboardAdmin: !(pagaCuota === 'sí' || pagaCuota === 'si') };
  }
  return { valido: true, esAdmin: true, email, adminToken, dashboardAdmin: true };
}

async function validarPin(params: Record<string, any>): Promise<Record<string, any>> {
  const nombre = params.nombre;
  const pinHash = params.pinHash;
  const now = new Date();
  const { data: attempt } = await supabase.from('pin_attempts').select('*').eq('username', nombre).maybeSingle();
  let attemptCount = attempt?.count ?? 0;
  if (attempt?.count >= 5 && attempt?.blocked_until && new Date(attempt.blocked_until) > now) return { valido: false, bloqueado: true };
  if (attempt?.blocked_until && new Date(attempt.blocked_until) <= now) {
    attemptCount = 0;
    await supabase.from('pin_attempts').update({ count: 0, blocked_until: null }).eq('username', nombre);
  }
    const row = await _getEquipoRow(nombre);
  if (!row || _estaArchivado(row)) return { valido: false };
  // Contraseña (app Android, 2026-11-08): mismo límite de intentos que el PIN.
  const password = String(params.password ?? '');
  if (password && row.password_hash) {
    if (!(await _verificarPassword(password, row.password_hash))) {
      const bloqueado = await _registrarIntentoFallido(nombre, attemptCount);
      return bloqueado ? { valido: false, bloqueado: true } : { valido: false };
    }
    await supabase.from('pin_attempts').delete().eq('username', nombre);
    const tokenPw = await _crearToken(nombre);
    return _adjuntarAdmin({ valido: true, token: tokenPw, datos: getDatosCompletos(row) }, row);
  }
  if (row.pin_needs_reset) return { valido: false, pinNeedsReset: true };
  if (!row.pin_hash) { await _registrarIntentoFallido(nombre, attemptCount); return { valido: false }; }
  if (row.pin_hash !== pinHash) {
    const bloqueado = await _registrarIntentoFallido(nombre, attemptCount);
    return bloqueado ? { valido: false, bloqueado: true } : { valido: false };
  }
  await supabase.from('pin_attempts').delete().eq('username', nombre);
  const token = await _crearToken(nombre);
  const result: Record<string, any> = { valido: true, token, datos: getDatosCompletos(row) };
  return _adjuntarAdmin(result, row);
}

async function _registrarIntentoFallido(nombre: string, currentCount: number): Promise<boolean> {
  const nuevoCount = currentCount + 1;
  const update: Record<string, any> = { username: nombre, count: nuevoCount };
  if (nuevoCount >= 5) update.blocked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await supabase.from('pin_attempts').upsert(update, { onConflict: 'username' });
  return nuevoCount >= 5;
}

async function restaurarSesion(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { valido: false };
  const row = await _getEquipoRow(username);
  if (!row || _estaArchivado(row)) return { valido: false };
  const result: Record<string, any> = { valido: true, nombre: username, datos: getDatosCompletos(row) };
  return _adjuntarAdmin(result, row);
}

async function cerrarSesion(params: Record<string, any>): Promise<Record<string, any>> {
  if (params.token) await supabase.from('sessions').delete().eq('token', params.token);
  return { exito: true };
}

async function resolverNombre(params: Record<string, any>): Promise<Record<string, any>> {
  const id = (params.identificador ?? '').trim();
  if (!id) return { encontrado: false };
  let { data } = await supabase.from('equipo').select('username').ilike('username', id).maybeSingle();
  if (!data) { const r = await supabase.from('equipo').select('username').ilike('email', id).maybeSingle(); data = r.data; }
  if (!data) return { encontrado: false };
  return { encontrado: true, nombre: data.username };
}

// ─── Acciones: perfil ─────────────────────────────────────────────────────────

async function getDatosCompletosAction(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username || username !== params.nombre) return { error: 'Sesión inválida.' };
  const datos = getDatosCompletos(await _getEquipoRow(params.nombre));
  if (!datos) return {};
  // `calificaFondosViaje` (Parte 7, ver MANIFEST.md) -- a diferencia de
  // `tierRiesgoDesde`/`tierRiesgoHasta` (columnas simples, expuestas desde
  // `getDatosCompletos()` en sí para que los ~10 flujos de login/
  // restauración de sesión la reciban gratis), este dato es GENUINAMENTE
  // calculado en el momento de la lectura (depende de qué mes es "hoy" —
  // el resultado puede cambiar con el simple paso del tiempo, sin que nada
  // en la DB haya cambiado) -- no tiene sentido guardarlo como columna. Se
  // agrega acá, en el ÚNICO call site async de `getDatosCompletos()` con un
  // solo caller (a diferencia de la función de mapeo en sí, reusada por
  // ~10 flujos de login síncronos que no vale la pena volver async solo
  // por este campo -- ver ese comentario). `_calificaFondosViajePorUsuarios()`
  // (cerca de getFondosViajeConfig(), más abajo en este archivo) acepta un
  // array para poder reusarse tal cual desde getEquipo() con el roster
  // completo en una sola consulta -- acá se llama con un array de 1 elemento.
  const mapa = await _calificaFondosViajePorUsuarios([params.nombre]);
  datos.calificaFondosViaje = mapa[params.nombre] === true;
  return datos;
}

async function getDatosPersona(params: Record<string, any>): Promise<Record<string, any>> {
  const { data } = await supabase.from('equipo').select('username, necesita_patines, talla, necesita_protecciones, email, categoria').eq('username', params.nombre).maybeSingle();
  if (!data) return {};
  return { nombre: data.username, necesitaPatines: data.necesita_patines, talla: data.talla, necesitaProtecciones: data.necesita_protecciones, email: data.email, categoria: data.categoria ?? '' };
}

async function actualizarDatosPersona(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username || username !== params.nombre) return { exito: false, error: 'Sesión inválida.' };
  let datos = params.datos;
  if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch { return { exito: false, error: 'datos inválido.' }; } }
  // Whitelist de lo que la PROPIA persona puede escribir. `categoria` y
  // `estado_miembro` NO están a propósito (endurecido 2026-09-30): la
  // categoría solo la cambian `recalcular-categorias`, los admins
  // (adminSetCategoria/adminSetTierModo) y la regla de equipamiento de
  // `actualizarEquipamientoPersona()`; el estado, los endpoints específicos
  // (autodeclararEstado, terminarMiViaje, recuperarseLesion,
  // adminSetEstadoMiembro, `_reactivarPorAsistencia()` y la reactivación
  // por RSVP de marcarAsistenciaUsuario()). Cualquier otra clave se ignora
  // en silencio (clientes con JS viejo en caché no reciben error).
  const CAMPO_MAP: Record<string, string> = {
    nombreDerby: 'nombre_derby', numeroDerby: 'numero_derby', pronombres: 'pronombres',
    fechaIngreso: 'fecha_ingreso',
    dieta: 'dieta', prefijo: 'prefijo', telefono: 'telefono', email: 'email',
    fechaPublica: 'fecha_publica', edadPublica: 'edad_publica', fechaNacimiento: 'fecha_nacimiento',
    tipoDocumento: 'tipo_documento', paisExpedicion: 'pais_expedicion', numeroDocumento: 'numero_documento',
    nombreLegal: 'nombre_legal', callePrincipal: 'calle_principal', calleSecundaria: 'calle_secundaria',
        numeracion: 'numeracion', sector: 'sector', canton: 'canton',
    direccionLat: 'direccion_lat', direccionLng: 'direccion_lng',
    emerg1Nombre: 'emerg1_nombre', emerg1Relacion: 'emerg1_relacion', emerg1Prefijo: 'emerg1_prefijo', emerg1Telefono: 'emerg1_telefono',
    emerg2Nombre: 'emerg2_nombre', emerg2Relacion: 'emerg2_relacion', emerg2Prefijo: 'emerg2_prefijo', emerg2Telefono: 'emerg2_telefono',
    enfermedad: 'enfermedad', alergias: 'alergias', alergiasDesc: 'alergias_desc',
    antecedentes: 'antecedentes', medicamentos: 'medicamentos', medicamentosDesc: 'medicamentos_desc',
                atencionMedica: 'atencion_medica', seguro: 'seguro', seguroContacto: 'seguro_contacto',
    roles: 'roles', comidaEventos: 'comida_eventos',
  };
  const update: Record<string, any> = {};
  for (const camel of Object.keys(datos ?? {})) { if (CAMPO_MAP[camel]) update[CAMPO_MAP[camel]] = datos[camel]; }
  // `fecha_nacimiento` es `date`: '' o un formato raro romperían el UPDATE entero.
        if ('fecha_nacimiento' in update) update.fecha_nacimiento = _normalizarFechaNac(update.fecha_nacimiento);
  // Pin del mapa (2026-11-12): número o null.
  for (const c of ['direccion_lat', 'direccion_lng']) {
    if (c in update) { const n = Number(update[c]); update[c] = update[c] === '' || update[c] == null || !Number.isFinite(n) ? null : n; }
  }
    // Roles: solo los del catálogo de la liga (`_rolesEquipo`, editable por
  // Pivots desde 2026-11-12).
  if ('roles' in update) {
    const validos = await _rolesEquipo();
    const lista = Array.isArray(update.roles) ? update.roles : String(update.roles ?? '').split(',');
        update.roles = lista.map((x: any) => String(x).trim()).filter((x: string) => validos.includes(x));
    // Coach pasa por revisión (Victor, 2026-11-17): hasta que un Pivot lo
    // aprueba no queda en la ficha; el pedido llega a Notificaciones.
    if (update.roles.includes(ROL_COACH)) {
      const { data: c } = await supabase.from('coaches').select('estado').eq('username', username).maybeSingle();
      if (c?.estado !== 'aprobado') {
        update.roles = update.roles.filter((r: string) => r !== ROL_COACH);
        if (c?.estado !== 'pendiente') await pedirCoach({ token: params.token, mensaje: 'Eligió Coach en sus roles.' });
        (params as any)._coachPendiente = true;
      }
    } else {
      // Quitar Coach de tus roles deja de ser coach.
      const { data: c } = await supabase.from('coaches').select('estado').eq('username', username).maybeSingle();
      if (c?.estado === 'aprobado') update.roles = [...update.roles, ROL_COACH];
      // Bench también es equipo técnico (Victor, 2026-11-27): elegirlo pide sumarse.
      else if (update.roles.some((r: string) => ROLES_TECNICOS.includes(r)) && c?.estado !== 'pendiente') {
        await pedirCoach({ token: params.token, mensaje: 'Eligió Bench en sus roles.' });
        (params as any)._coachPendiente = true;
      }
    }
  }
  if (!Object.keys(update).length) return { exito: true };
  await supabase.from('equipo').update(update).eq('username', params.nombre);
  return { exito: true, ...((params as any)._coachPendiente ? { aviso: 'Pediste sumarte al equipo técnico: un Pivot lo revisa y te avisamos.' } : {}) };
}

// Equipamiento del club (patines/protecciones). `necesita_protecciones` puede
// ser texto libre ("Muñequeras, Coderas") -- cualquier valor que no sea vacío
// ni 'No' cuenta como necesitar; mismo criterio que canPayMonthly()
// (js/reservas.js) y recalcular-categorias.
function _necesitaEquipoClub(patines: unknown, protecciones: unknown): boolean {
  const usa = (v: unknown) => { const t = String(v ?? '').trim().toLowerCase(); return t !== '' && t !== 'no'; };
  return usa(patines) || usa(protecciones);
}

// ─── Equipamiento armado por cada liga (Victor, 2026-11-17) ───────────────
// Listas del inventario marcadas "para entrenar" (`para_entrenar`). Lo que
// cada persona usa de la liga: `equipo.equipo_liga` {listaId: talla, piezas
// ("Casco, Coderas") o ''}. Cada equipo pide equipamiento propio con
// `requisitos.propio` [listaId]. Las listas del sistema (patines,
// protecciones) siguen escribiendo las columnas viejas que usan las reservas.
type ListaEntrenar = { id: string; nombre: string; tipo: string; icono: string | null; piezas: any[]; sistema: string | null };

async function _listasEntrenar(): Promise<ListaEntrenar[]> {
  const { data } = await supabase.from('inventario_listas').select('id, nombre, tipo, icono, piezas, sistema').eq('para_entrenar', true).eq('activa', true).order('orden');
  return (data ?? []).map((l: any) => ({ ...l, piezas: Array.isArray(l.piezas) ? l.piezas : [] }));
}

/// Columnas viejas a partir de `equipo_liga`.
function _legadoDesdeEquipoLiga(eq: Record<string, string>, listas: ListaEntrenar[]): Record<string, string> {
  const pat = listas.find((l) => l.sistema === 'patines'), pro = listas.find((l) => l.sistema === 'protecciones');
  const out: Record<string, string> = {};
  if (pat) { const v = eq[pat.id]; out.necesita_patines = v != null ? 'Sí' : 'No'; out.talla = v ?? ''; }
  if (pro) { const v = eq[pro.id]; out.necesita_protecciones = v == null ? 'No' : (v.trim() ? v : 'Sí'); }
  return out;
}

/// `equipo_liga` a partir de las columnas viejas (registro, web vieja).
async function _equipoLigaDesdeLegado(patines: unknown, talla: unknown, protecciones: unknown, previo: Record<string, string> = {}): Promise<Record<string, string>> {
  const listas = await _listasEntrenar();
  const usa = (v: unknown) => { const t = String(v ?? '').trim().toLowerCase(); return t !== '' && t !== 'no'; };
  const eq: Record<string, string> = { ...previo };
  const pat = listas.find((l) => l.sistema === 'patines'), pro = listas.find((l) => l.sistema === 'protecciones');
  if (pat && patines !== undefined) { if (usa(patines)) eq[pat.id] = String(talla ?? ''); else delete eq[pat.id]; }
  if (pro && protecciones !== undefined) { if (usa(protecciones)) eq[pro.id] = String(protecciones) === 'Sí' ? '' : String(protecciones); else delete eq[pro.id]; }
  return eq;
}

/// Listas de `requisitos.propio` (o las banderas viejas) de un equipo.
function _propioDe(req: any, listas: ListaEntrenar[]): string[] {
  if (Array.isArray(req?.propio)) return req.propio.map(String);
  return listas.filter((l) => (l.sistema === 'patines' && req?.patinesPropios) || (l.sistema === 'protecciones' && req?.proteccionesPropias)).map((l) => l.id);
}

/// Si usa de la liga algo que su equipo pide propio, el equipo más alto (de
/// los de abajo) que no lo pide. null = puede quedarse.
async function _equipoSegunEquipamiento(categoria: string, eq: Record<string, string>): Promise<string | null> {
  const listas = await _listasEntrenar();
  const { data: tiers } = await supabase.from('config_tiers').select('nombre, orden, requisitos, es_default').order('orden');
  const l = tiers ?? [];
  const i = l.findIndex((t: any) => t.nombre === categoria);
  if (i < 0) return null;
  const usa = new Set(Object.keys(eq));
  const choca = (t: any) => _propioDe(t.requisitos, listas).some((id) => usa.has(id));
  if (!choca(l[i])) return null;
    // `orden` más bajo = equipo de más arriba (Quindes 1, Mirlxs 2): se busca
  // hacia abajo, del más cercano al equipo inicial.
  const abajo = l.filter((t: any) => Number(t.orden) > Number(l[i].orden)).sort((a: any, b: any) => Number(a.orden) - Number(b.orden));
  return (abajo.find((t: any) => !choca(t)) ?? l.find((t: any) => t.es_default))?.nombre ?? null;
}

/// Tu equipamiento: las listas para entrenar (con sus tallas o piezas), lo que
/// usas de la liga y qué pide tu equipo propio.
async function getMiEquipoLiga(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const listas = await _listasEntrenar();
  const [{ data: fila }, { data: stock }, { data: tiers }] = await Promise.all([
    supabase.from('equipo').select('categoria, equipo_liga, tier_modo').eq('username', yo).maybeSingle(),
    supabase.from('inventario_stock').select('lista_id, variante, cantidad').in('lista_id', listas.map((l) => l.id).length ? listas.map((l) => l.id) : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('config_tiers').select('nombre, requisitos'),
  ]);
  const t = (tiers ?? []).find((x: any) => x.nombre === fila?.categoria);
  return {
    exito: true,
    listas: listas.map((l) => ({
            id: l.id, nombre: l.nombre, tipo: l.tipo, icono: l.icono, sistema: l.sistema ?? null, piezas: l.piezas.map((p: any) => String(p.nombre)),
      tallas: l.tipo === 'tallas' ? [...new Set((stock ?? []).filter((s: any) => s.lista_id === l.id && Number(s.cantidad) > 0).map((s: any) => String(s.variante)))] : [],
    })),
    mio: (fila?.equipo_liga as Record<string, string>) ?? {},
    equipo: fila?.categoria ?? '',
    propio: t ? _propioDe(t.requisitos, listas) : [],
  };
}

async function guardarMiEquipoLiga(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const listas = await _listasEntrenar();
  let pedido: Record<string, any> = {};
  try { pedido = typeof params.equipo === 'object' ? params.equipo : JSON.parse(String(params.equipo ?? '{}')); } catch { pedido = {}; }
  const ids = new Set(listas.map((l) => l.id));
  const eq: Record<string, string> = {};
  for (const [k, v] of Object.entries(pedido ?? {})) if (ids.has(k)) eq[k] = String(v ?? '').trim().slice(0, 120);
  const { data: fila } = await supabase.from('equipo').select('categoria, tier_modo, categoria_pre_lesion').eq('username', yo).maybeSingle();
  if (!fila) return { exito: false, error: 'Usuarix no encontradx.' };
  const update: Record<string, any> = { equipo_liga: eq, ..._legadoDesdeEquipoLiga(eq, listas) };
  let categoriaCambiada = false;
  if (!fila.tier_modo || fila.tier_modo === 'auto') {
    const nuevo = await _equipoSegunEquipamiento(fila.categoria ?? '', eq);
    if (nuevo && nuevo !== fila.categoria) { update.categoria = nuevo; categoriaCambiada = true; }
    if (fila.categoria_pre_lesion) {
      const pre = await _equipoSegunEquipamiento(fila.categoria_pre_lesion, eq);
      if (pre) update.categoria_pre_lesion = pre;
    }
  }
  const { error } = await supabase.from('equipo').update(update).eq('username', yo);
  if (error) return { exito: false, error: error.message };
  const row = await _getEquipoRow(yo);
  return { exito: true, categoriaCambiada, categoria: update.categoria ?? fila.categoria ?? null, datos: getDatosCompletos(row) };
}


// Regla de negocio (2026-09-30): quien necesita patines O protecciones del
// club no puede ser Quindes. Si tras guardar la persona necesita equipamiento
// y es Quindes, pasa a Mirlxs en la MISMA operación (antes lo hacía el front
// con una 2ª llamada a actualizarDatosPersona). Excepción: `tier_modo='quinde'`
// fijado a mano por un admin se respeta (mismo criterio que
// recalcular-categorias; si no, `categoria` y `tier_modo` quedarían
// desincronizados). Lesionadx: `categoria_pre_lesion` 'Quindes' también baja,
// para que la salida de la lesión no la restaure a Quindes. El camino inverso
// (dejar de necesitar) NO sube a nadie: lo decide el recálculo por puntos.
async function actualizarEquipamientoPersona(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username || username !== params.nombre) return { exito: false, error: 'Sesión inválida.' };
    const { data: fila } = await supabase.from('equipo').select('categoria, tier_modo, categoria_pre_lesion, equipo_liga').eq('username', username).maybeSingle();
  if (!fila) return { exito: false, error: 'Usuarix no encontradx.' };
    const update: Record<string, any> = { necesita_patines: params.necesitaPatines, talla: params.talla, necesita_protecciones: params.necesitaProtecciones };
  update.equipo_liga = await _equipoLigaDesdeLegado(params.necesitaPatines, params.talla, params.necesitaProtecciones, (fila.equipo_liga as any) ?? {});
  let categoriaCambiada = false;
  // Equipo según lo que pide cada uno (Victor, 2026-11-17: antes Quindes/Mirlxs fijos).
  if (!fila.tier_modo || fila.tier_modo === 'auto' || fila.tier_modo === 'mirlxs') {
    const nuevo = await _equipoSegunEquipamiento(fila.categoria ?? '', update.equipo_liga);
    if (nuevo && nuevo !== fila.categoria) { update.categoria = nuevo; categoriaCambiada = true; }
    if (fila.categoria_pre_lesion) {
      const pre = await _equipoSegunEquipamiento(fila.categoria_pre_lesion, update.equipo_liga);
      if (pre) update.categoria_pre_lesion = pre;
    }
  }
  const { error } = await supabase.from('equipo').update(update).eq('username', username);
  if (error) return { exito: false, error: error.message };
  return { exito: true, categoriaCambiada, categoria: update.categoria ?? fila.categoria ?? null };
}

// ─── Contraseña ─────────────────────────────────────────────────────────────
// PBKDF2-SHA256 con sal aleatoria (WebCrypto). Se guarda como
// pbkdf2$<iter>$<sal>$<hash> en equipo.password_hash.
const _PW_ITER = 150000;

function _b64(bytes: Uint8Array): string { let s = ''; bytes.forEach((b) => (s += String.fromCharCode(b))); return btoa(s); }
function _desdeB64(s: string): Uint8Array { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }

async function _pbkdf2(password: string, sal: Uint8Array, iter: number): Promise<Uint8Array> {
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iter }, clave, 256);
  return new Uint8Array(bits);
}

async function _hashPassword(password: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${_PW_ITER}$${_b64(sal)}$${_b64(await _pbkdf2(password, sal, _PW_ITER))}`;
}

async function _verificarPassword(password: string, guardado: string): Promise<boolean> {
  const [tipo, iter, sal, hash] = String(guardado).split('$');
  if (tipo !== 'pbkdf2' || !iter || !sal || !hash) return false;
  const calc = _b64(await _pbkdf2(password, _desdeB64(sal), Number(iter)));
  // Comparación de tiempo constante.
  if (calc.length !== hash.length) return false;
  let dif = 0;
  for (let i = 0; i < calc.length; i++) dif |= calc.charCodeAt(i) ^ hash.charCodeAt(i);
  return dif === 0;
}

function _passwordValida(p: string): string | null {
  if (p.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(p) || !/[0-9]/.test(p)) return 'Usa letras y números.';
  if (p.length > 128) return 'La contraseña es demasiado larga.';
  return null;
}

// Crear o cambiar la contraseña propia. Si ya hay una, pide la actual.
async function cambiarPassword(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const row = await _getEquipoRow(username);
  if (!row || _estaArchivado(row)) return { exito: false, error: 'Sesión inválida.' };
  const nueva = String(params.nueva ?? '');
  const err = _passwordValida(nueva);
  if (err) return { exito: false, error: err };
  if (row.password_hash && !(await _verificarPassword(String(params.actual ?? ''), row.password_hash))) {
    return { exito: false, error: 'La contraseña actual no es correcta.' };
  }
  await supabase.from('equipo').update({ password_hash: await _hashPassword(nueva) }).eq('username', username);
  return { exito: true };
}

// Cambiar el nombre de usuario (Ajustes → Cuenta y acceso). Todas las tablas
// lo siguen por ON UPDATE CASCADE + fn_renombrar_usuario (migración
// 20261108030000). La sesión sigue valiendo: sessions también se actualiza.
async function cambiarUsuario(params: Record<string, any>): Promise<Record<string, any>> {
  const actual = await _validarToken(params.token);
  if (!actual) return { exito: false, error: 'Sesión inválida.' };
  const nuevo = String(params.nuevo ?? '').trim().replace(/\s+/g, ' ');
  if (nuevo.length < 2 || nuevo.length > 30) return { exito: false, error: 'Usa entre 2 y 30 caracteres.' };
  if (!/^[\p{L}\p{N} ._-]+$/u.test(nuevo)) return { exito: false, error: 'Solo letras, números, espacios, punto, guion y guion bajo.' };
  if (nuevo === actual) return { exito: true, username: actual };
  const { error } = await supabase.rpc('fn_renombrar_usuario', { viejo: actual, nuevo });
  if (error) {
    if (String(error.message).includes('usuario_en_uso')) return { exito: false, error: 'Ese nombre de usuario ya está en uso.' };
    return { exito: false, error: 'No se pudo cambiar el usuario.' };
  }
  return { exito: true, username: nuevo };
}

// ─── Ajustes de la liga (Victor, 2026-11-13) ─────────────────────────────
// Pedidos de Pivots: 'otro' (por defecto, lo aprueba otro Pivot) o 'auto'
// (se aprueba solo). Si hay un solo Pivot, siempre se aprueba solo.
// Canal de comunicación: con qué app se escribe a las personas del equipo.
const CANALES_LIGA = ['whatsapp', 'telegram', 'signal', 'telefono'];
const CLAVES_LIGA: Record<string, string> = {
    solicitudesPivots: 'solicitudes_pivots', canal: 'canal_comunicacion', pais: 'pais_equipo', zonaHoraria: 'zona_horaria', moneda: 'moneda', monedaCodigo: 'moneda_codigo',
};

/** Símbolo de la moneda de la liga (Mi Liga → Datos), para los textos de avisos. Se refresca al leer las reglas. */
let _monedaLiga = '$';

async function _configLiga(): Promise<Record<string, string>> {
  const { data } = await supabase.from('config_app').select('key, value').in('key', Object.values(CLAVES_LIGA));
  const m: Record<string, string> = {};
  (data ?? []).forEach((r: any) => { m[r.key] = r.value; });
  return {
    solicitudesPivots: m.solicitudes_pivots === 'auto' ? 'auto' : 'otro',
    canal: CANALES_LIGA.includes(m.canal_comunicacion) ? m.canal_comunicacion : 'whatsapp',
    pais: m.pais_equipo || 'EC',
        zonaHoraria: m.zona_horaria || 'America/Guayaquil',
        moneda: (_monedaLiga = m.moneda || '$'),
    monedaCodigo: /^[A-Z]{3}$/.test(m.moneda_codigo ?? '') ? m.moneda_codigo : '',
  };
}

/** ¿El pedido de esta persona se aprueba solo? (solo si es Pivot). */
async function _pedidoDePivot(username: string): Promise<{ auto: boolean; email: string | null }> {
  const pivots = await _administradorxs();
  const yo = pivots.find((a) => a.username === username);
  if (!yo) return { auto: false, email: null };
  if (pivots.length <= 1) return { auto: true, email: yo.email };
  return { auto: (await _configLiga()).solicitudesPivots === 'auto', email: yo.email };
}

// ─── Reglas de la liga (Mi Liga, Victor 2026-11-13) ─────────────────────────
// Todo lo que antes estaba fijo en el código y un Pivot puede cambiar.
// config_app: `reglas_liga` (JSON), `equipos_corte` (JSON), `valores_puntos`
// (versiones con fecha de inicio: regla de oro, nunca tocan puntos ya ganados).
const REGLAS_LIGA_BASE: Record<string, any> = {
  tiposCuentan: null,        // null = todo suma; si no, tipos de evento que cuentan como clase ('Externa' incluido)
    tardeCuentaClase: true,    // llegar tarde cuenta como clase
  // Qué cuenta como clase por equipo (Victor, 2026-11-16): { equipo: {
  // tiposCuentan, tardeCuentaClase } }. Sin entrada, el equipo usa lo de arriba.
  queCuentaEquipos: {},
  toleranciaMin: 15,         // minutos: al tomar lista después de esto se sugiere "Tarde" (nunca se fuerza)
  rectificacionDias: 7,      // días para pedir una rectificación de asistencia
  eventosMinPersonas: 5,     // con menos confirmadas, el aviso de 1 hora antes sugiere cancelar (0 = nunca)
    inactividadDias: 30,       // días sin venir para verse como inactivx
  // Cuota (Victor 2026-11-13): día en que vence (0 = no vence), días de
  // gracia y recargo fijo si se paga después. Solo cuenta la fecha en que la
  // persona envía la solicitud; nunca cambia pagos ya hechos.
  cuotaVenceDia: 0,
  cuotaGraciaDias: 0,
        cuotaRecargo: 0,
  // Recargo (Victor, 2026-11-16): 'fijo' (monto) o 'porcentaje' de la
  // mensualidad; 'unico' o 'mensual' (se suma otra vez por cada mes de
  // atraso, como una tarjeta de crédito). Sin tipo guardado = fijo y único,
  // como antes.
  cuotaRecargoTipo: 'fijo',
  cuotaRecargoModo: 'unico',
  // Recompensas por pagar a tiempo (Victor, 2026-11-15): qué recibe quien
  // envía el pago de su cuota hasta la fecha límite. Se puede combinar.
  // Un cambio rige para los pagos que se aprueben desde ahora.
    recompensaPago: { activa: true, puntos: 1, claseGratis: false, saldo: 0 },
  // Cobro por equipo (Victor, 2026-11-15): cómo paga cada equipo y precio
  // propio opcional. Sin entrada, ver `_cobroEquipo`.
  //   modo: 'mes' | 'clase' | 'elige' | 'segun_equipamiento' | 'sin_cobro'
    cobroEquipos: {},
  // Reparto por defecto de los fondos de viaje (con lo que empieza cada viaje).
    repartoViaje: [{ min: 90, pct: 50 }, { min: 35, pct: 50 }],
  // Estados (Victor, 2026-11-15): si congelan el equipo y si eximen de la
  // cuota. Lesionadx siempre exime; Ausente nunca congela.
  estados: {
        // aprobacion (Victor, 2026-11-16): el pedido llega a un Pivot y el estado
    // cambia recién cuando lo aprueba.
    'Lesionadx': { congela: true, exentaCuota: true, aprobacion: true },
    'De viaje': { congela: true, exentaCuota: false, aprobacion: false },
    'Ausente': { congela: false, exentaCuota: false, aprobacion: false },
    'Enfermedad': { activo: true, congela: true, exentaCuota: true, aprobacion: true },
    'Situación personal': { activo: true, congela: true, exentaCuota: true, aprobacion: true },
    'Otro': { activo: true, congela: false, exentaCuota: false, aprobacion: true },
  },
  // Reservas (antes fijas en el código).
  reservaClasesVisibles: 6,   // próximas clases que se pueden reservar
  reservaCierraHoras: 2,      // se deja de reservar N horas antes de empezar
    cuponCancelarMin: 60,       // el cupón vuelve si cancela con esta anticipación
  // Clase gratis de bienvenida (Victor, 2026-11-16): si se da a quien se
  // inscribe y si vuelve al cancelar. Apagar no quita las ya dadas.
  cuponBienvenida: true,
  cuponVuelve: true,
  sinAprobarHoras: 2,         // reserva sin aprobar: se cierra N horas después de la clase
    // Privacidad: si las demás personas (no Pivots) ven los puntos de otras.
  rankingVisible: true,
  // Si alguien debe (Victor, 2026-11-26): 'asistire' | 'bloqueo' | 'no'.
  deudaModo: 'asistire',
  // Clases de gracia por equipo (Victor, 2026-11-14): cuántas clases puede
  // venir sin haber pagado el mes. Equipo ausente = no aplica (sigue su
  // propia regla); 0 = paga antes de marcar Asistiré.
    graciaClases: { 'Quindes': 1 },
  // Salud (Victor, 2026-11-14): las opciones de "Dónde te atiendes" y los
  // seguros privados dependen del país; cada liga los edita en Mi Liga.
  atencionMedica: ['MSP (Ministerio de Salud Pública)', 'IESS', 'Seguro Privado'],
  segurosPrivados: ['Saludsa', 'Ecuasanitas', 'Humana', 'BMI del Ecuador', 'Confiamed', 'BUPA Ecuador', 'Pan American Life', 'CruzBlanca'],
};
/** Cómo paga un equipo. Sin configurar: Quindes (o un equipo con clases de
 *  gracia) paga por mes; el resto, según su equipamiento (como siempre). */
function _cobroEquipo(reglas: Record<string, any>, equipo: string | null | undefined): { modo: string; precioMensual: number | null; precioClase: number | null } {
  const e = String(equipo ?? '');
  const c = (reglas.cobroEquipos ?? {})[e];
  if (c?.modo) return { modo: c.modo, precioMensual: c.precioMensual ?? null, precioClase: c.precioClase ?? null };
  const mes = e === 'Quindes' || (reglas.graciaClases ?? {})[e] !== undefined;
  return { modo: mes ? 'mes' : 'segun_equipamiento', precioMensual: null, precioClase: null };
}

/// Reglas que valen para un equipo: las de la liga con lo que ese equipo
/// cambió encima (`porEquipo`, Victor 2026-11-17). Rige desde que se guarda;
/// nunca cambia pagos ni puntos ya dados.
const _CLAVES_POR_EQUIPO = ['cuotaVenceDia', 'cuotaGraciaDias', 'cuotaRecargo', 'cuotaRecargoTipo', 'cuotaRecargoModo', 'recompensaPago'];
async function _reglasDeEquipo(equipo?: string | null): Promise<Record<string, any>> {
  const r = await _reglasLiga();
  const o = equipo ? (r.porEquipo ?? {})[equipo] : null;
  if (!o || typeof o !== 'object') return r;
  const extra: Record<string, any> = {};
  for (const k of _CLAVES_POR_EQUIPO) if (o[k] !== undefined) extra[k] = o[k];
  return { ...r, ...extra };
}

async function _reglasLiga(): Promise<Record<string, any>> {
  const { data: filas } = await supabase.from('config_app').select('key, value').in('key', ['reglas_liga', 'moneda']);
  const data = (filas ?? []).find((x: any) => x.key === 'reglas_liga');
  _monedaLiga = (filas ?? []).find((x: any) => x.key === 'moneda')?.value || '$';
  let r: Record<string, any> = {};
  try { r = JSON.parse(String(data?.value ?? '{}')) ?? {}; } catch { r = {}; }
  return { ...REGLAS_LIGA_BASE, ...r };
}

/** Próximo corte de equipos (estrictamente después de hoy) y cuándo llega la lista. */
async function _corteEquipos(): Promise<{ modo: string; dia: number; avisoDias: number; fecha: string; mes: string; llega: string; autoAprobar: boolean }> {
  const { data } = await supabase.from('config_app').select('value').eq('key', 'equipos_corte').maybeSingle();
  let c: Record<string, any> = {};
  try { c = JSON.parse(String(data?.value ?? '{}')) ?? {}; } catch { c = {}; }
  const modo = c.modo === 'auto' ? 'auto' : 'revisar';
  const dia = Math.min(28, Math.max(1, Number(c.dia) || 1));
    const avisoDias = Math.min(20, Math.max(1, Number(c.avisoDias) || 7));
  // Si nadie revisa la lista, se aplica sola el día de corte (Victor,
  // 2026-11-16: editable; apagado = espera a que un Pivot decida).
  const autoAprobar = c.autoAprobar !== false;
  const hoy = _hoyEcuadorISO();
  const y = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7)) - 1, d = Number(hoy.slice(8, 10));
  const f = d < dia ? new Date(Date.UTC(y, m, dia)) : new Date(Date.UTC(y, m + 1, dia));
  const fecha = f.toISOString().slice(0, 10);
    return { modo, dia, avisoDias, fecha, mes: fecha.slice(0, 7), llega: new Date(f.getTime() - avisoDias * 86400000).toISOString().slice(0, 10), autoAprobar };
}

async function _registrarAjuste(clave: string, antes: unknown, despues: unknown, email: string): Promise<void> {
  await supabase.from('historial_ajustes_liga').insert({ clave, antes: antes ?? null, despues: despues ?? null, por: email });
}

async function getReglasLiga(params: Record<string, any>): Promise<Record<string, any>> {
  if (!(await _validarAdminToken(String(params.adminToken ?? '')))) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const hoy = _hoyEcuadorISO();
    const [reglas, corte, versiones, { data: hist }, pivots, { data: tiersNom }] = await Promise.all([
    _reglasLiga(), _corteEquipos(), _versionesPuntos(),
    supabase.from('historial_ajustes_liga').select('clave, antes, despues, por, created_at')
            .gte('created_at', new Date(Date.now() - 183 * 86400000).toISOString()).order('created_at', { ascending: false }).limit(200),
    _administradorxs(),
    supabase.from('config_tiers').select('nombre'),
  ]);
  const nombre: Record<string, string> = {};
  // Puntos por asistencia de cada equipo (Victor, 2026-11-16).
  const puntosEquipos: Record<string, any> = {};
  for (const t of tiersNom ?? []) {
    const eq = String(t.nombre);
    puntosEquipos[eq] = {
      actual: _versionEn(hoy, versiones, eq),
      proxima: versiones.find((v) => v.desde > hoy && v.equipo === eq) ?? versiones.find((v) => v.desde > hoy && !v.equipo) ?? null,
    };
  }
  pivots.forEach((p) => { nombre[p.email] = p.nombre; });
  return {
    exito: true, reglas, corte,
        puntos: { actual: _versionEn(hoy, versiones), proxima: versiones.find((v) => v.desde > hoy && !v.equipo) ?? null },
    puntosEquipos,
    historial: (hist ?? []).map((h: any) => ({ clave: h.clave, antes: h.antes, despues: h.despues, por: nombre[String(h.por ?? '').toLowerCase()] ?? (h.por === _EMAIL_SISTEMA ? 'Automático' : 'Un Pivot'), fecha: h.created_at })),
  };
}

async function adminReglasLiga(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const leer = (v: unknown) => { if (v == null || v === '') return null; if (typeof v === 'object') return v as Record<string, any>; try { return JSON.parse(String(v)); } catch { return null; } };
  const hoy = _hoyEcuadorISO();
  const reglasNuevas = leer(params.reglas);
  if (reglasNuevas) {
    const antes = await _reglasLiga();
    const r: Record<string, any> = { ...antes };
    const entero = (k: string, min: number, max: number) => {
      if (reglasNuevas[k] === undefined) return;
      const n = Math.round(Number(reglasNuevas[k]));
      if (Number.isFinite(n)) r[k] = Math.min(max, Math.max(min, n));
    };
    // Herramientas de la liga (Victor, 2026-11-19): activar o desactivar Finanzas y Coach.
    for (const k of ['finanzasActiva', 'coachActivo']) if (reglasNuevas[k] !== undefined) r[k] = reglasNuevas[k] !== false && reglasNuevas[k] !== 'false';
    // Meses y periodos sin cobro (Victor, 2026-11-20): la lista completa.
    if (reglasNuevas.periodosSinCobro !== undefined) {
      const v = _validarPeriodosSinCobro(reglasNuevas.periodosSinCobro, antes.periodosSinCobro, hoy);
      if (typeof v === 'string') return { exito: false, error: v };
      r.periodosSinCobro = v;
    }
                if (reglasNuevas.estados && typeof reglasNuevas.estados === 'object') {
      const e: Record<string, any> = { ...(antes.estados ?? {}) };
      for (const [k, v] of Object.entries(reglasNuevas.estados as Record<string, any>)) {
        if (!['Lesionadx', 'De viaje', ...ESTADOS_NUEVOS].includes(k) || !v || typeof v !== 'object') continue;
        const si = (x: unknown) => x === true || x === 'true';
        e[k] = {
          ...(e[k] ?? {}),
          ...(v.congela !== undefined ? { congela: si(v.congela) } : {}),
          ...(ESTADOS_NUEVOS.includes(k) && v.exentaCuota !== undefined ? { exentaCuota: si(v.exentaCuota) } : {}),
                    ...(ESTADOS_NUEVOS.includes(k) && v.activo !== undefined ? { activo: si(v.activo) } : {}),
          ...(k !== 'De viaje' && v.aprobacion !== undefined ? { aprobacion: si(v.aprobacion) } : {}),
        };
      }
      r.estados = e;
    }
        if (Array.isArray(reglasNuevas.tiposEventoExtra)) {
      r.tiposEventoExtra = [...new Set(reglasNuevas.tiposEventoExtra.map((x: unknown) => String(x ?? '').trim().slice(0, 30)).filter(Boolean))].slice(0, 20);
    }
    if (Array.isArray(reglasNuevas.repartoViaje)) {
      const t = reglasNuevas.repartoViaje.slice(0, 6).map((x: any) => ({ min: Math.max(0, Math.min(100, Math.round(Number(x?.min) || 0))), pct: Math.max(0, Math.min(100, Math.round(Number(x?.pct) || 0))) }))
        .sort((a: any, b: any) => b.min - a.min);
      if (t.length && t.reduce((s: number, x: any) => s + x.pct, 0) <= 100) r.repartoViaje = t;
    }
    entero('reservaClasesVisibles', 1, 20); entero('reservaCierraHoras', 0, 48); entero('cuponCancelarMin', 0, 1440); entero('sinAprobarHoras', 1, 72);
    for (const k of ['cuponBienvenida', 'cuponVuelve']) if (reglasNuevas[k] !== undefined) r[k] = reglasNuevas[k] !== false;
        // Reglas propias de un equipo (Victor, 2026-11-17): { equipo: {...} | null };
    // null vuelve a lo de la liga.
    if (reglasNuevas.porEquipo && typeof reglasNuevas.porEquipo === 'object') {
      const pe: Record<string, any> = { ...(antes.porEquipo ?? {}) };
      for (const [k, v] of Object.entries(reglasNuevas.porEquipo as Record<string, any>)) {
        const eq = String(k).trim().slice(0, 60);
        if (!eq) continue;
        if (v == null) { delete pe[eq]; continue; }
        const o: Record<string, any> = { ...(pe[eq] ?? {}) };
        const n = (x: unknown, mn: number, mx: number) => Math.min(mx, Math.max(mn, Math.round(Number(x) * 100) / 100));
        for (const [c, val] of Object.entries(v as Record<string, any>)) {
          if (val === null) { delete o[c]; continue; }
          if (c === 'cuotaVenceDia') o[c] = n(val, 0, 28);
          else if (c === 'cuotaGraciaDias') o[c] = n(val, 0, 27);
          else if (c === 'cuotaRecargo') o[c] = n(val, 0, 10000);
          else if (c === 'cuotaRecargoTipo') o[c] = val === 'porcentaje' ? 'porcentaje' : 'fijo';
          else if (c === 'cuotaRecargoModo') o[c] = val === 'mensual' ? 'mensual' : 'unico';
          else if (c === 'recompensaPago' && typeof val === 'object') {
            const x = val as any;
            o[c] = { activa: x.activa === true || x.activa === 'true', puntos: n(x.puntos ?? 0, 0, 20), claseGratis: x.claseGratis === true, saldo: n(x.saldo ?? 0, 0, 1000) };
          }
        }
        if (Object.keys(o).length) pe[eq] = o; else delete pe[eq];
      }
      r.porEquipo = pe;
    }
    if (reglasNuevas.cobroEquipos && typeof reglasNuevas.cobroEquipos === 'object') {
      const modos = ['mes', 'clase', 'elige', 'segun_equipamiento', 'sin_cobro'];
      const precio = (v: unknown) => { if (v == null || v === '') return null; const n = Math.round(Number(v) * 100) / 100; return Number.isFinite(n) && n >= 0 ? Math.min(100000, n) : null; };
      const c: Record<string, any> = { ...(antes.cobroEquipos ?? {}) };
      for (const [k, v] of Object.entries(reglasNuevas.cobroEquipos as Record<string, any>)) {
        const eq = String(k).trim().slice(0, 60);
        if (!eq) continue;
        if (v == null) { delete c[eq]; continue; }
        c[eq] = { modo: modos.includes(String(v.modo)) ? String(v.modo) : 'segun_equipamiento', precioMensual: precio(v.precioMensual), precioClase: precio(v.precioClase) };
      }
      r.cobroEquipos = c;
    }
    entero('toleranciaMin', 0, 120); entero('rectificacionDias', 1, 60); entero('eventosMinPersonas', 0, 200); entero('inactividadDias', 7, 365);
        entero('cuotaVenceDia', 0, 28); entero('cuotaGraciaDias', 0, 27);
    if (reglasNuevas.cuotaRecargo !== undefined) {
      const n = Math.round(Number(reglasNuevas.cuotaRecargo) * 100) / 100;
            if (Number.isFinite(n)) r.cuotaRecargo = Math.min(10000, Math.max(0, n));
    }
    if (reglasNuevas.cuotaRecargoTipo !== undefined) r.cuotaRecargoTipo = reglasNuevas.cuotaRecargoTipo === 'porcentaje' ? 'porcentaje' : 'fijo';
    if (reglasNuevas.cuotaRecargoModo !== undefined) r.cuotaRecargoModo = reglasNuevas.cuotaRecargoModo === 'mensual' ? 'mensual' : 'unico';
    if (r.cuotaRecargoTipo === 'porcentaje' && Number(r.cuotaRecargo) > 100) r.cuotaRecargo = 100;
            const lista = (v: unknown) => Array.isArray(v)
      ? [...new Set(v.map((x) => String(x ?? '').trim().slice(0, 60)).filter(Boolean))].slice(0, 25)
      : null;
    const atencion = lista(reglasNuevas.atencionMedica);
    if (atencion) r.atencionMedica = atencion.includes('Seguro Privado') ? atencion : [...atencion, 'Seguro Privado'];
        const seguros = lista(reglasNuevas.segurosPrivados);
    if (seguros) r.segurosPrivados = seguros;
    // Teléfono de emergencias opcional por opción de atención o seguro.
    if (reglasNuevas.telefonosSalud && typeof reglasNuevas.telefonosSalud === 'object') {
      const t: Record<string, string> = {};
      for (const [k, v] of Object.entries(reglasNuevas.telefonosSalud)) {
        const tel = String(v ?? '').replace(/[^0-9+ -]/g, '').trim().slice(0, 20);
        if (String(k).trim() && tel) t[String(k).trim().slice(0, 60)] = tel;
      }
      r.telefonosSalud = t;
    }
    if (reglasNuevas.graciaClases && typeof reglasNuevas.graciaClases === 'object') {
      const g: Record<string, number> = {};
      for (const [k, v] of Object.entries(reglasNuevas.graciaClases)) {
        const n = Math.round(Number(v));
        if (String(k).trim() && Number.isFinite(n)) g[String(k).trim().slice(0, 60)] = Math.min(10, Math.max(0, n));
      }
      r.graciaClases = g;
    }
        if (reglasNuevas.recompensaPago && typeof reglasNuevas.recompensaPago === 'object') {
      const x = reglasNuevas.recompensaPago, si = (v: unknown) => v === true || v === 'true';
      const pts = Math.round(Number(x.puntos)), sal = Math.round(Number(x.saldo) * 100) / 100;
      r.recompensaPago = {
        activa: si(x.activa),
        puntos: Number.isFinite(pts) ? Math.min(10, Math.max(0, pts)) : 0,
        claseGratis: si(x.claseGratis),
        saldo: Number.isFinite(sal) ? Math.min(1000, Math.max(0, sal)) : 0,
      };
    }
    if (reglasNuevas.rankingVisible !== undefined) r.rankingVisible = reglasNuevas.rankingVisible !== false && reglasNuevas.rankingVisible !== 'false';
    // Qué pasa si alguien debe (Victor, 2026-11-26): 'asistire' (aviso al marcar Asistiré), 'bloqueo' (pantalla de pago al abrir la app) o 'no'.
    if (reglasNuevas.deudaModo !== undefined) r.deudaModo = ['asistire', 'bloqueo', 'no'].includes(String(reglasNuevas.deudaModo)) ? String(reglasNuevas.deudaModo) : 'asistire';
    if (reglasNuevas.tardeCuentaClase !== undefined) r.tardeCuentaClase = reglasNuevas.tardeCuentaClase !== false && reglasNuevas.tardeCuentaClase !== 'false';
        if (reglasNuevas.tiposCuentan !== undefined) {
      r.tiposCuentan = Array.isArray(reglasNuevas.tiposCuentan) && reglasNuevas.tiposCuentan.length ? reglasNuevas.tiposCuentan.map(String).slice(0, 20) : null;
    }
    const qe = reglasNuevas.queCuentaEquipo;
    if (qe && typeof qe === 'object' && String(qe.equipo ?? '').trim()) {
      const eq = String(qe.equipo).trim().slice(0, 60);
      r.queCuentaEquipos = {
        ...(antes.queCuentaEquipos ?? {}),
        [eq]: {
          tiposCuentan: Array.isArray(qe.tiposCuentan) && qe.tiposCuentan.length ? qe.tiposCuentan.map(String).slice(0, 20) : null,
          tardeCuentaClase: qe.tardeCuentaClase !== false && qe.tardeCuentaClase !== 'false',
        },
      };
    }
    await supabase.from('config_app').upsert({ key: 'reglas_liga', value: JSON.stringify(r) }, { onConflict: 'liga_id,key' });
    for (const k of Object.keys(r)) if (JSON.stringify(antes[k]) !== JSON.stringify(r[k])) await _registrarAjuste(k, antes[k], r[k], email);
  }
  const corteNuevo = leer(params.corte);
  if (corteNuevo) {
    const a = await _corteEquipos();
    const c = {
      modo: corteNuevo.modo === 'auto' ? 'auto' : 'revisar',
      dia: Math.min(28, Math.max(1, Number(corteNuevo.dia ?? a.dia) || 1)),
            avisoDias: Math.min(20, Math.max(1, Number(corteNuevo.avisoDias ?? a.avisoDias) || 7)),
      autoAprobar: corteNuevo.autoAprobar === undefined ? a.autoAprobar : corteNuevo.autoAprobar !== false && corteNuevo.autoAprobar !== 'false',
    };
    await supabase.from('config_app').upsert({ key: 'equipos_corte', value: JSON.stringify(c) }, { onConflict: 'liga_id,key' });
        await _registrarAjuste('corte', { modo: a.modo, dia: a.dia, avisoDias: a.avisoDias, autoAprobar: a.autoAprobar }, c, email);
  }
  const puntosNuevos = leer(params.puntos);
  if (puntosNuevos) {
    // Regla de oro: empieza siempre después de hoy.
    const desde = String(puntosNuevos.desde ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || desde <= hoy) return { exito: false, error: 'El cambio de puntos empieza desde mañana o después: nunca cambia puntos ya ganados.' };
    const num = (v: unknown, def: number) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : def; };
        const equipo = String(puntosNuevos.equipo ?? '').trim().slice(0, 60) || null;
    const v: VersionPuntos = { desde, aTiempo: num(puntosNuevos.aTiempo, 1), tarde: num(puntosNuevos.tarde, 0.5), tardeCuenta: puntosNuevos.tardeCuenta !== false, ...(equipo ? { equipo } : {}) };
    const { data } = await supabase.from('config_app').select('value').eq('key', 'valores_puntos').maybeSingle();
    let l: VersionPuntos[] = [];
    try { l = JSON.parse(String(data?.value ?? '[]')); } catch { l = []; }
        // Las versiones futuras del mismo equipo se reemplazan; las que ya
    // empezaron nunca se tocan.
    l = (Array.isArray(l) ? l : []).filter((x) => x && (String(x.desde) <= hoy || (x.equipo ?? null) !== equipo));
    l.push(v);
    await supabase.from('config_app').upsert({ key: 'valores_puntos', value: JSON.stringify(l) }, { onConflict: 'liga_id,key' });
    await _registrarAjuste('puntos', _versionEn(hoy, await _versionesPuntos(), equipo), v, email);
  }
  return getReglasLiga(params);
}

/** Historial completo de ajustes con quién lo hizo (nombre y foto) y filtros por fecha. */
async function adminHistorialAjustes(params: Record<string, any>): Promise<Record<string, any>> {
  if (!(await _validarAdminToken(String(params.adminToken ?? '')))) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const ok = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null;
  let q = supabase.from('historial_ajustes_liga').select('clave, antes, despues, por, created_at').order('created_at', { ascending: false }).limit(500);
  if (ok(params.desde)) q = q.gte('created_at', params.desde + 'T00:00:00-05:00');
  if (ok(params.hasta)) q = q.lte('created_at', params.hasta + 'T23:59:59-05:00');
  const [{ data }, pivots, { data: primero }] = await Promise.all([
    q, _administradorxs(),
    supabase.from('historial_ajustes_liga').select('created_at').order('created_at', { ascending: true }).limit(1).maybeSingle(),
  ]);
    const pe: Record<string, any> = {};
  pivots.forEach((p) => { pe[p.email] = p; });
  // Quien ya no es Pivot sigue apareciendo con su nombre.
  const faltan = [...new Set((data ?? []).map((h: any) => String(h.por ?? '').toLowerCase()).filter((e: string) => e && !pe[e] && e !== _EMAIL_SISTEMA))];
  if (faltan.length) {
    const { data: ex } = await supabase.from('equipo').select('nombre_derby, username, foto_perfil, email').in('email', faltan);
    (ex ?? []).forEach((r: any) => { pe[String(r.email).toLowerCase()] = { nombre: r.nombre_derby || r.username, foto: r.foto_perfil || '' }; });
  }
  return {
    exito: true,
    desdeAnio: primero ? Number(String(primero.created_at).slice(0, 4)) : Number(_hoyEcuadorISO().slice(0, 4)),
    historial: (data ?? []).map((h: any) => {
      const em = String(h.por ?? '').toLowerCase();
      return {
        clave: h.clave, antes: h.antes, despues: h.despues, fecha: h.created_at,
        por: pe[em]?.nombre ?? (em === _EMAIL_SISTEMA ? 'Automático' : 'Un Pivot'), foto: pe[em]?.foto ?? '', automatico: em === _EMAIL_SISTEMA,
      };
    }),
  };
}

/** Aplica un cambio de equipo guardado (aprobado por un Pivot o automático). */
async function _aplicarCambioEquipo(fila: any, estado: 'aprobado' | 'auto', por: string): Promise<void> {
  const act = { ...(fila.actualizacion ?? {}), categoria: fila.a };
  await supabase.from('equipo').update(act).eq('username', fila.username);
  const mes = _hoyEcuadorISO().slice(0, 7);
  await supabase.from('historial_tier').upsert({ username: fila.username, mes, tier_nombre: fila.a }, { onConflict: 'username,mes' });
    await supabase.from('cambios_equipo').update({ estado, resuelto_por: por, resuelto_en: new Date().toISOString() }).eq('id', fila.id);
  await _avisarCambioEquipo(fila.username, fila.de, fila.a);
}

/** La persona verá una ventana con el cambio al abrir la app. */
async function _avisarCambioEquipo(username: string, de: string | null, a: string): Promise<void> {
  if (!de || de === a) return;
  const { data: t } = await supabase.from('config_tiers').select('nombre, orden').in('nombre', [de, a]);
  const orden: Record<string, number> = {};
  (t ?? []).forEach((x: any) => { orden[x.nombre] = Number(x.orden) || 0; });
  const sube = (orden[a] ?? 99) < (orden[de] ?? 99);
  await supabase.from('equipo').update({ aviso_cambio_equipo: { de, a, sube, fecha: _hoyEcuadorISO() }, revision_cambio: null }).eq('username', username);
}

/** La persona responde la ventana: "Entiendo" o "Pedir revisión" (con mensaje). */
async function responderCambioEquipo(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const { data: f } = await supabase.from('equipo').select('aviso_cambio_equipo, nombre_derby').eq('username', yo).maybeSingle();
  const aviso = f?.aviso_cambio_equipo;
  if (!aviso) return { exito: true };
  if (params.accion === 'revision' && !aviso.sube) {
    const mensaje = String(params.mensaje ?? '').trim().slice(0, 500);
    await supabase.from('equipo').update({ aviso_cambio_equipo: null, revision_cambio: { ...aviso, mensaje, pedida: new Date().toISOString() } }).eq('username', yo);
    await sendPush({
      tipo: 'avisos_admin', include_external_user_ids: await _adminDestinatariosPush(undefined, 'equipo', 'cambios'),
      headings: { es: 'Pedido de revisión' },
      contents: { es: `${f?.nombre_derby || yo} pide revisar su cambio de ${aviso.de} a ${aviso.a}. Revísalo en Notificaciones.` }, url: APP_URL + '/',
    }).catch(() => {});
    return { exito: true, revision: true };
  }
  await supabase.from('equipo').update({ aviso_cambio_equipo: null }).eq('username', yo);
  return { exito: true };
}

/** Un Pivot resuelve el pedido: mantener el cambio o devolver al equipo anterior. */
async function adminResolverRevisionEquipo(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const nombre = String(params.nombre ?? '');
  const { data: f } = await supabase.from('equipo').select('revision_cambio, categoria').eq('username', nombre).maybeSingle();
  const r = f?.revision_cambio;
  if (!r) return { exito: false, error: 'Ya no está pendiente.' };
  const devolver = params.decision === 'devolver';
  const u: Record<string, any> = { revision_cambio: null };
  let texto = `Un Pivot revisó tu pedido: sigues en ${r.a}.`;
  if (devolver) {
    // Vuelve y queda fijo hasta el próximo corte, así el recálculo no lo mueve enseguida.
    const corte = await _corteEquipos();
    u.categoria = r.de;
    u.equipo_fijo_hasta = corte.fecha;
    texto = `Un Pivot revisó tu pedido: vuelves a ${r.de}.`;
    await supabase.from('historial_tier').upsert({ username: nombre, mes: _hoyEcuadorISO().slice(0, 7), tier_nombre: r.de }, { onConflict: 'username,mes' });
  }
  const { error } = await supabase.from('equipo').update(u).eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  await _registrarAjuste('revisionEquipo', r, { decision: devolver ? 'devolver' : 'mantener' }, email);
  await sendPush({ tipo: 'solicitud_resuelta', include_external_user_ids: [nombre], headings: { es: 'Revisión de tu equipo' }, contents: { es: texto }, url: APP_URL + '/', pantalla: 'equipo' }).catch(() => {});
  return { exito: true };
}

/** Cambios de equipo en revisión: listar, aprobar o dejar como está (rechazar). */
async function adminCambiosEquipo(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const corte = await _corteEquipos();
  const accion = String(params.accion ?? 'listar');
  if (accion === 'listar') {
    const { data } = await supabase.from('cambios_equipo').select('id, username, de, a, estado, mes').eq('mes', corte.mes).order('created_at');
    return { exito: true, corte, cambios: data ?? [] };
  }
  let ids: string[] = [];
  try { ids = Array.isArray(params.ids) ? params.ids : JSON.parse(String(params.ids ?? '[]')); } catch { ids = []; }
  if (params.id) ids.push(String(params.id));
  if (!ids.length) return { exito: false, error: 'Falta el cambio.' };
  const { data: filas } = await supabase.from('cambios_equipo').select('*').in('id', ids).eq('estado', 'pendiente');
  for (const f of filas ?? []) {
    if (accion === 'aprobar') {
      await _aplicarCambioEquipo(f, 'aprobado', email);
      await sendPush({
        tipo: 'solicitud_resuelta', include_external_user_ids: [f.username],
        headings: { es: `Ahora estás en ${f.a}` }, contents: { es: `Pasaste de ${f.de ?? 'tu equipo'} a ${f.a}. Mira tus estadísticas para saber por qué.` }, url: APP_URL,
      }).catch(() => {});
    } else if (accion === 'rechazar') {
      await supabase.from('cambios_equipo').update({ estado: 'rechazado', resuelto_por: email, resuelto_en: new Date().toISOString() }).eq('id', f.id);
    }
  }
  return { exito: true, procesados: (filas ?? []).length };
}

/** Cron diario: aviso cuando llega la lista, recordatorio el día antes y
 * aplicación automática de lo no revisado el día de corte. */
async function _cronCorteEquipos(): Promise<void> {
  const corte = await _corteEquipos();
  if (corte.modo !== 'revisar') return;
  const hoy = _hoyEcuadorISO();
  const aviso = async (titulo: string, texto: string) => sendPush({
    tipo: 'avisos_admin', include_external_user_ids: await _adminDestinatariosPush(undefined, 'equipo', 'cambios'),
    headings: { es: titulo }, contents: { es: texto }, url: APP_URL,
  }).catch(() => {});
    if (Number(hoy.slice(8, 10)) === corte.dia) {
    if (!corte.autoAprobar) return; // manual: esperan a que un Pivot decida
    const { data: pend } = await supabase.from('cambios_equipo').select('*').eq('mes', hoy.slice(0, 7)).eq('estado', 'pendiente');
    for (const f of pend ?? []) await _aplicarCambioEquipo(f, 'auto', _EMAIL_SISTEMA);
    const n = (pend ?? []).length;
    if (n) await aviso('Cambios de equipo aplicados', `Se aplicaron ${n} ${n === 1 ? 'cambio' : 'cambios'} de equipo que no se revisaron.`);
    return;
  }
  const { count } = await supabase.from('cambios_equipo').select('id', { count: 'exact', head: true }).eq('mes', corte.mes).eq('estado', 'pendiente');
  const n = count ?? 0;
  if (!n) return;
  const manana = new Date(Date.parse(corte.fecha) - 86400000).toISOString().slice(0, 10);
    if (hoy === manana) {
    await aviso(
      corte.autoAprobar ? 'Mañana se aplican los cambios de equipo' : 'Cambios de equipo sin revisar',
      corte.autoAprobar ? `Quedan ${n} sin revisar en Notificaciones. Lo que no revises se aplicará automáticamente.` : `Quedan ${n} sin revisar en Notificaciones. No se aplican hasta que un Pivot decida.`,
    );
  }
  else if (hoy === corte.llega) await aviso('Lista de cambios de equipo', `${n} ${n === 1 ? 'persona cambia' : 'personas cambian'} de equipo. Revísalo en Notificaciones antes del corte.`);
}

// ─── Medios de pago (Cobros, Victor 2026-11-13) ───────────────────────────
// Genéricos (sin marcas locales): billetera virtual, cuenta bancaria,
// efectivo, enlace de pago u otro. Cada reserva guarda el nombre del medio,
// así quitar o renombrar uno nunca cambia pagos pasados.
const TIPOS_MEDIO = ['billetera', 'banco', 'efectivo', 'enlace', 'otro'];
const COLORES_MEDIO = ['rojo', 'naranja', 'amarillo', 'verde', 'azul', 'morado', 'gris'];
function _limpiarFormasPago(f: any): Record<string, any> {
  const texto = (x: unknown, n = 120) => String(x ?? '').trim().slice(0, n);
  const url = (x: unknown) => { const u = texto(x, 400); return /^https:\/\//.test(u) ? u : ''; };
  const medios = (Array.isArray(f.medios) ? f.medios : []).slice(0, 12).map((m: any, i: number) => ({
    id: /^[a-z0-9_-]{1,40}$/.test(String(m?.id ?? '')) ? String(m.id) : `medio${Date.now().toString(36)}${i}`,
    nombre: texto(m?.nombre, 40) || 'Medio de pago',
    tipo: TIPOS_MEDIO.includes(String(m?.tipo)) ? String(m.tipo) : 'otro',
    color: COLORES_MEDIO.includes(String(m?.color)) ? String(m.color) : 'gris',
    logo: url(m?.logo), enlace: url(m?.enlace),
    datos: (Array.isArray(m?.datos) ? m.datos : []).slice(0, 8).map((d: any) => [texto(d?.[0], 30), texto(d?.[1], 60)]).filter((d: string[]) => d[0] && d[1]),
    indicaciones: texto(m?.indicaciones, 200),
    cuentaId: /^[0-9a-f-]{36}$/.test(String(m?.cuentaId ?? '')) ? String(m.cuentaId) : null,
    activo: m?.activo !== false,
  }));
  return { version: 2, medios, whatsapp: texto(f.whatsapp, 20).replace(/[^0-9]/g, '') };
}

/** Formas de pago guardadas; convierte el formato anterior (deuna/transferencia/efectivo). */
async function _formasPago(): Promise<Record<string, any> | null> {
  const { data } = await supabase.from('config_app').select('value').eq('key', 'formas_pago').maybeSingle();
  let f: any = null;
  try { f = data?.value ? JSON.parse(data.value) : null; } catch { f = null; }
  if (!f) return null;
  if (Array.isArray(f.medios)) return f;
  const medios: any[] = [];
  if (f.deuna) medios.push({ id: 'deuna', nombre: 'Billetera virtual', tipo: 'billetera', color: 'verde', logo: '', enlace: f.deuna.enlace ?? '', datos: [], indicaciones: '', cuentaId: null, activo: f.deuna.activa !== false });
  if (f.transferencia) medios.push({ id: 'transferencia', nombre: f.transferencia.banco || 'Cuenta bancaria', tipo: 'banco', color: 'azul', logo: '', enlace: '', datos: f.transferencia.datos ?? [], indicaciones: '', cuentaId: null, activo: f.transferencia.activa !== false });
  if (f.efectivo) medios.push({ id: 'efectivo', nombre: 'Efectivo', tipo: 'efectivo', color: 'gris', logo: '', enlace: '', datos: [], indicaciones: f.efectivo.texto ?? '', cuentaId: null, activo: f.efectivo.activa === true });
  return { version: 2, medios, whatsapp: f.whatsapp ?? '' };
}

async function getConfigLiga(params: Record<string, any>): Promise<Record<string, any>> {
  if (!(await _validarToken(params.token)) && !(params.adminToken && await _validarAdminToken(String(params.adminToken)))) {
    return { exito: false, error: 'Sesión inválida.' };
  }
        const { data: extra } = await supabase.from('config_app').select('key, value').in('key', ['logo_liga']);
  const v = (k: string) => (extra ?? []).find((r: any) => r.key === k)?.value ?? '';
  const formasPago = await _formasPago();
    // Deporte de la liga: la app usa palabras de ese deporte (Victor, 2026-11-17).
  const deporte = (await supabaseServicio.from('ligas').select('deporte').eq('id', _ligaEnCurso()).maybeSingle()).data?.deporte ?? 'roller_derby';
  return { exito: true, ...(await _configLiga()), ...(await getPreciosClases()), reglas: await _reglasLiga(), logo: v('logo_liga'), formasPago, deporte };
}

async function adminGuardarConfigLiga(params: Record<string, any>): Promise<Record<string, any>> {
  if (!(await _validarAdminToken(String(params.adminToken ?? '')))) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const filas: { key: string; value: string }[] = [];
  if (params.solicitudesPivots != null) filas.push({ key: 'solicitudes_pivots', value: params.solicitudesPivots === 'auto' ? 'auto' : 'otro' });
  if (params.canal != null) {
    if (!CANALES_LIGA.includes(String(params.canal))) return { exito: false, error: 'Canal inválido.' };
    filas.push({ key: 'canal_comunicacion', value: String(params.canal) });
  }
  if (params.pais != null) {
    if (!/^[A-Z]{2}$/.test(String(params.pais))) return { exito: false, error: 'País inválido.' };
    filas.push({ key: 'pais_equipo', value: String(params.pais) });
  }
    if (params.moneda != null) {
    const mon = String(params.moneda).trim().slice(0, 5);
    if (!mon) return { exito: false, error: 'Moneda inválida.' };
        filas.push({ key: 'moneda', value: mon });
  }
  // Código ISO 4217 de la lista completa (Victor, 2026-11-16); '' = símbolo escrito a mano.
  if (params.monedaCodigo != null) {
    const cod = String(params.monedaCodigo).trim().toUpperCase();
    if (cod && !/^[A-Z]{3}$/.test(cod)) return { exito: false, error: 'Moneda inválida.' };
    filas.push({ key: 'moneda_codigo', value: cod });
  }
  if (params.zonaHoraria != null) {
    try { new Intl.DateTimeFormat('es', { timeZone: String(params.zonaHoraria) }); } catch { return { exito: false, error: 'Zona horaria inválida.' }; }
    filas.push({ key: 'zona_horaria', value: String(params.zonaHoraria) });
  }
  for (const [k, clave] of [['precioPorClase', 'precio_por_clase'], ['precioMensual', 'precio_mensual']]) {
    if (params[k] == null) continue;
    const n = Number(params[k]);
    if (!Number.isFinite(n) || n < 0 || n > 10000) return { exito: false, error: 'Precio inválido.' };
    filas.push({ key: clave, value: String(n) });
  }
  // Formas de pago (Cobros, 2026-11-13): lista editable de medios genéricos.
  if (params.formasPago != null) {
    let f: any = null;
    try { f = typeof params.formasPago === 'object' ? params.formasPago : JSON.parse(String(params.formasPago)); } catch { f = null; }
    if (!f || typeof f !== 'object' || !Array.isArray(f.medios)) return { exito: false, error: 'Formas de pago inválidas.' };
        const limpio = _limpiarFormasPago(f);
    // Cada forma de pago es una cuenta de Tesorería (Victor, 2026-11-14): si
    // un medio no tiene cuenta, se crea (o se usa una activa con su nombre).
    const { data: cuentas } = await supabase.from('tesoreria_cuentas').select('id, nombre, activa, archivada');
    const activas = (cuentas ?? []).filter((c: any) => c.activa && !c.archivada);
    for (const m of limpio.medios ?? []) {
      if (m.cuentaId && activas.some((c: any) => c.id === m.cuentaId)) continue;
      const igual = activas.find((c: any) => String(c.nombre).trim().toLowerCase() === String(m.nombre).trim().toLowerCase());
      if (igual) { m.cuentaId = igual.id; continue; }
      const tipo = m.tipo === 'banco' ? 'banco' : m.tipo === 'efectivo' ? 'efectivo' : m.tipo === 'billetera' || m.tipo === 'enlace' ? 'deuna' : 'otro';
      const { data: nueva } = await supabase.from('tesoreria_cuentas').insert({ nombre: m.nombre, tipo, saldo_inicial: 0, orden: activas.length + 1 }).select('id, nombre, activa, archivada').single();
      if (nueva) { m.cuentaId = nueva.id; activas.push(nueva); }
    }
    filas.push({ key: 'formas_pago', value: JSON.stringify(limpio) });
  }
  if (params.logo != null) {
    const u = String(params.logo).trim();
    if (u && !/^https:\/\//.test(u)) return { exito: false, error: 'Logo inválido.' };
    filas.push({ key: 'logo_liga', value: u });
  }
  if (filas.length) await supabase.from('config_app').upsert(filas, { onConflict: 'liga_id,key' });
  return getConfigLiga({ adminToken: params.adminToken });
}

// País del equipo (prefijo y documento por defecto en Ajustes).
async function getConfigEquipo(params: Record<string, any>): Promise<Record<string, any>> {
    const yo = await _validarToken(params.token);
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const [{ data: pais }, { data: p }, reglas] = await Promise.all([
    supabase.from('config_app').select('value').eq('key', 'pais_equipo').maybeSingle(),
    supabase.from('equipo').select('categoria').eq('username', yo).maybeSingle(),
    _reglasLiga(),
  ]);
    return { exito: true, paisEquipo: pais?.value ?? 'EC', modoCobro: _cobroEquipo(reglas, p?.categoria).modo, moneda: _monedaLiga };
}

async function actualizarPin(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username || username !== params.nombre) return { exito: false, error: 'Sesión inválida.' };
  await supabase.from('equipo').update({ pin_hash: params.pinHash, pin_needs_reset: false }).eq('username', params.nombre);
  return { exito: true };
}

async function getCuponDisponible(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username || username !== params.nombre) return { cuponDisponible: false };
  const { data } = await supabase.from('equipo').select('cupon_disponible').eq('username', params.nombre).maybeSingle();
  return { cuponDisponible: !!(data?.cupon_disponible) };
}

async function marcarCuponUsado(params: Record<string, any>): Promise<Record<string, any>> {
  await supabase.from('equipo').update({ cupon_disponible: false }).eq('username', params.nombre);
  return { exito: true };
}

async function getNombres(): Promise<string[]> {
  const { data } = await supabase.from('equipo').select('username').is('eliminado_en', null).order('username');
  return (data ?? []).map((r: any) => r.username);
}

async function verificarEmailDisponible(params: Record<string, any>): Promise<Record<string, any>> {
  const { data } = await supabase.from('equipo').select('username').ilike('email', params.email).maybeSingle();
  if (data) return { disponible: false, nombre: data.username };
  return { disponible: true };
}

async function verificarNombreDisponible(params: Record<string, any>): Promise<Record<string, any>> {
  const { data } = await supabase.from('equipo').select('username').ilike('username', params.nombre).maybeSingle();
  return { disponible: !data };
}

async function verificarGoogle(params: Record<string, any>): Promise<Record<string, any>> {
  const info = await _verificarGoogleToken(params.idToken);
  if (!info) return { error: 'Token de Google inválido o expirado.' };
  const email = (info.email ?? '').toLowerCase();
  const esAdmin = await _esAdmin(email);
  if (esAdmin) return { error: 'Esta cuenta es de administradorx — iniciá sesión desde el panel admin.' };
  const row = await _getEquipoRowByEmail(email);
  return { yaRegistrado: !!row, email, foto: info.picture ?? '', nombre: info.given_name ?? info.name ?? '' };
}

// ─── Acciones: activación de cuenta pre-creada (activar/) ─────────────────────
// Un admin da de alta a alguien en `equipo` sin pasar por inscribirPersona()
// (ej. ya está en el roster real pero nunca se registró solx) y genera un
// link de un solo uso (generarInviteToken) — esa persona lo usa para
// vincular su Google y completar los datos que falten. Reusa
// `_verificarGoogleToken()`/`_crearToken()` tal cual (mismo mecanismo de
// sesión que loginGoogle()/inscribirPersona()) -- NO es Supabase Auth (esta
// app nunca lo usó, no hay ningún provider de Google configurado ahí; el
// GIS crudo + verificación server-side del idToken YA es el mecanismo real
// de auth de toda la app, ver MANIFEST.md).

async function validarInviteToken(params: Record<string, any>): Promise<Record<string, any>> {
  const token = (params.token ?? '').toString().trim();
  if (!token) return { valido: false };
  const { data: invite } = await supabase.from('invite_tokens').select('*').eq('token', token).maybeSingle();
  if (!invite) return { valido: false };
  if (invite.usado) return { valido: false, usado: true };
  if (new Date(invite.expires_at) <= new Date()) return { valido: false, expirado: true };
  return { valido: true, miembro: invite.datos_prefill ?? {} };
}

async function activarCuenta(params: Record<string, any>): Promise<Record<string, any>> {
  const token = (params.token ?? '').toString().trim();
  const info = await _verificarGoogleToken(params.idToken);
  if (!info) return { exito: false, error: 'Token de Google inválido o expirado.' };
  const email = (info.email ?? '').toLowerCase();

  const { data: invite } = await supabase.from('invite_tokens').select('*').eq('token', token).maybeSingle();
  if (!invite) return { exito: false, error: 'Este link no es válido.' };
  if (invite.usado) return { exito: false, error: 'Este link ya fue usado.' };
  if (new Date(invite.expires_at) <= new Date()) return { exito: false, error: 'Este link expiró.' };

  const row = await _getEquipoRow(invite.username);
  if (!row) return { exito: false, error: 'La cuenta asociada a este link ya no existe.' };
  if (row.email) return { exito: false, error: 'Esta cuenta ya está activada. Iniciá sesión desde la app.' };

  // Evita que el mismo email de Google quede vinculado a 2 filas de equipo
  // a la vez (misma cuenta de Google activando 2 invitaciones distintas).
  const emailExiste = await _getEquipoRowByEmail(email);
  if (emailExiste) return { exito: false, error: 'Este correo ya está registrado en otra cuenta.' };

  const { error } = await supabase.from('equipo').update({ email }).eq('username', invite.username);
  if (error) return { exito: false, error: error.message };
  await supabase.from('invite_tokens').update({ usado: true }).eq('token', token);

  const sessionToken = await _crearToken(invite.username);
  const newRow = await _getEquipoRow(invite.username);
  return { exito: true, token: sessionToken, nombre: invite.username, email, foto: info.picture ?? '', datos: getDatosCompletos(newRow) };
}

async function completarActivacion(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const update: Record<string, any> = { permisos_configurados: true };
  if (params.pronombres !== undefined) update.pronombres = params.pronombres;
  if (params.prefijo !== undefined) update.prefijo = params.prefijo;
  if (params.telefono !== undefined) update.telefono = params.telefono;
  // Quindes: se asume equipo propio, nunca patines/protecciones del club
  // (ver MANIFEST.md — mismo criterio ya aplicado al perfil real de Cami/
  // Femme Fatale) — hardcodeado server-side leyendo `categoria` de la fila
  // real, NO del `params` que manda el form (activar/activar.js ya oculta
  // esos 2 pasos para Quindes, pero esto es la fuente de verdad autoritativa,
  // independiente de lo que llegue en el body).
  const row = await _getEquipoRow(username);
  const esQuindes = row?.categoria === 'Quindes';
  if (esQuindes) {
    update.necesita_patines = 'No';
    update.talla = '';
    update.necesita_protecciones = 'No';
  } else {
    if (params.necesitaPatines !== undefined) update.necesita_patines = params.necesitaPatines;
    if (params.talla !== undefined) update.talla = params.talla;
    if (params.necesitaProtecciones !== undefined) update.necesita_protecciones = params.necesitaProtecciones;
  }
  const { error } = await supabase.from('equipo').update(update).eq('username', username);
  if (error) return { exito: false, error: error.message };
  const newRow = await _getEquipoRow(username);
  return { exito: true, datos: getDatosCompletos(newRow) };
}

// Admin, desde Mi Liga/Equipo — genera el link de activación de una fila de
// `equipo` que todavía no tiene email vinculado.
async function generarInviteToken(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const username = (params.username ?? '').toString().trim();
  if (!username) return { exito: false, error: 'Falta el nombre de usuario.' };
  const row = await _getEquipoRow(username);
  if (!row) return { exito: false, error: 'No se encontró esa cuenta.' };
  if (row.email) return { exito: false, error: 'Esta cuenta ya tiene un email vinculado — no necesita link de activación.' };
  const datosPrefill = { username: row.username, nombreDerby: row.nombre_derby ?? '', fotoPerfil: row.foto_perfil ?? '' };
  const { data, error } = await supabase.from('invite_tokens').insert({ username, datos_prefill: datosPrefill }).select('token').maybeSingle();
  if (error) return { exito: false, error: error.message };
  return { exito: true, token: data?.token ?? '' };
}

async function inscribirPersona(params: Record<string, any>): Promise<Record<string, any>> {
  const nombre   = (params.nombre   ?? '').toString().trim();
  const email    = (params.email    ?? '').toString().trim().toLowerCase();
  const pronombres = params.pronombres ?? '';
  const prefijo  = params.prefijo ?? '';
  const telefono = (params.telefono ?? '').toString().trim();
  const necesitaPatines       = params.necesitaPatines ?? '';
  const talla                 = params.talla ?? '';
  const necesitaProtecciones  = params.necesitaProtecciones ?? '';
  const foto       = params.foto ?? '';
  const fechaNac   = params.fechaNac ?? '';
  const guardarFecha = params.guardarFecha ?? '';
  const fechaPublica = params.fechaPublica ?? '';
  const edadPublica  = params.edadPublica ?? '';
  const pinHash      = params.pinHash ?? '';
  const idToken      = params.idToken ?? '';

    if (!nombre) return { exito: false, error: 'El nombre es obligatorio.' };
  // Pivot es solo para mayores de 18 (Victor, 2026-11-16).
  if (_esMenorDeEdad(fechaNac)) return { exito: false, error: 'Pivot es solo para mayores de 18 años.' };
  if (!email || !email.includes('@')) return { exito: false, error: 'Email inválido.' };
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/.test(nombre)) return { exito: false, error: 'El nombre solo puede contener letras y espacios.' };

    // Correo verificado con código (inicio con correo, 2026-11-13).
  if (params.registroToken && !(await _registroValido(email, String(params.registroToken)))) {
    return { exito: false, error: 'La verificación del correo venció. Pide un código nuevo.' };
  }
  // Verificar Google token si viene
  if (idToken) {
    const info = await _verificarGoogleToken(idToken);
    if (!info) return { exito: false, error: 'Token de Google inválido. Vuelve a iniciar sesión.' };
    if ((info.email ?? '').toLowerCase() !== email) return { exito: false, error: 'El email no coincide con el token de Google.' };
  }

  // Verificar duplicados
  const { data: emailExiste } = await supabase.from('equipo').select('username').ilike('email', email).maybeSingle();
  if (emailExiste) return { exito: false, error: 'Este correo ya está registrado.' };
  const { data: nombreExiste } = await supabase.from('equipo').select('username').ilike('username', nombre).maybeSingle();
  if (nombreExiste) return { exito: false, error: 'Este nombre de usuario ya está en uso.' };

  const row: Record<string, any> = {
    username: nombre, email, pronombres, prefijo, telefono,
    necesita_patines: necesitaPatines, talla, necesita_protecciones: necesitaProtecciones,
    equipo_liga: await _equipoLigaDesdeLegado(necesitaPatines, talla, necesitaProtecciones),
    // Clase gratis de bienvenida, si la liga la usa (Victor, 2026-11-16).
    cupon_disponible: (await _reglasLiga()).cuponBienvenida !== false, permisos_configurados: true,
    fecha_registro: new Date().toISOString(),
  };
    if (pinHash && pinHash.length === 64) row.pin_hash = pinHash;
  if (foto && foto.startsWith('http')) row.foto_perfil = foto;
  // Enlace de invitación de un equipo (Mi Liga, 2026-11-13): entra directo a
  // ese equipo si cumple sus requisitos; si no, al equipo inicial.
    const codigoEquipo = String(params.equipo ?? '').trim();
  let avisoEquipo = '';
  if (codigoEquipo) {
    const { data: t } = await supabase.from('config_tiers').select('nombre, requisitos').eq('codigo_invitacion', codigoEquipo).maybeSingle();
    if (t) {
      // Lo que pide propio, con las listas de la liga (Victor, 2026-11-17).
      const listasE = await _listasEntrenar();
      const usaIds = new Set(Object.keys(row.equipo_liga ?? {}));
      const faltan = listasE.filter((l) => _propioDe(t.requisitos ?? {}, listasE).includes(l.id) && usaIds.has(l.id));
      // Curso requerido (Victor, 2026-11-26): quien recién entra no lo tiene aprobado.
      let cursoOk = !t.requisitos?.cursoId;
      if (!cursoOk && row.username) {
        const { data: ap } = await supabase.from('curso_inscripciones').select('id').eq('username', row.username).eq('curso_id', String(t.requisitos.cursoId)).eq('resultado', 'aprobado').limit(1);
        cursoOk = !!ap?.length;
      }
      const cumple = !faltan.length && cursoOk;
            if (cumple) row.categoria = t.nombre;
      // Si no cumple, entra al equipo inicial y se le dice por qué (Victor, 2026-11-15).
      else {
        const { data: ini } = await supabase.from('config_tiers').select('nombre').eq('es_default', true).maybeSingle();
        if (!cursoOk) {
          const cNom = t.requisitos.cursoNombre || 'el curso requerido';
          avisoEquipo = `Entraste a ${ini?.nombre ?? 'tu equipo inicial'}: ${t.nombre} pide tener aprobado ${cNom}. Puedes inscribirte al curso desde la app para calificar a ${t.nombre}.`;
        } else {
          const nombres = faltan.map((l) => l.nombre.toLowerCase());
          const falta = nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}` : nombres[0];
          avisoEquipo = `Entraste a ${ini?.nombre ?? 'tu equipo inicial'}: ${t.nombre} pide tener propio: ${falta}. Cuando tengas tu equipamiento, cámbialo en tu perfil y tu equipo se revisará en el próximo corte.`;
        }
      }
    }
  }
  if (guardarFecha === 'si' && _normalizarFechaNac(fechaNac)) {
    row.fecha_nacimiento = _normalizarFechaNac(fechaNac);
    row.fecha_publica    = fechaPublica === 'Sí' ? 'Sí' : 'No';
    row.edad_publica     = edadPublica  === 'Sí' ? 'Sí' : 'No';
  }
  // Personal de liga (Victor, 2026-11-27): entra sin cuota ni puntos, con su función.
  let funcionTecnica = false;
  const codigoPersonal = String(params.personal ?? '').trim();
  if (codigoPersonal) {
    const { data: c } = await supabase.from('config_app').select('value').eq('key', 'codigo_personal_liga').maybeSingle();
    if (c?.value && c.value === codigoPersonal) {
      Object.assign(row, _camposPersonalLiga(true), { cupon_disponible: false });
      const f = FUNCIONES_PERSONAL.find((x) => x === String(params.funcion ?? ''));
      if (f) {
        // Coach se suma a sus roles cuando un Pivot lo aprueba; Bench, NSO y SO quedan.
        row.roles = f === ROL_COACH ? [] : [f];
        funcionTecnica = ROLES_TECNICOS.includes(f);
      }
    }
  }

  const { error } = await supabase.from('equipo').insert(row);
  if (error) return { exito: false, error: error.message };

  const token = await _crearToken(nombre);
  // Bench o Coach: pide sumarse al equipo técnico (lo aprueba un Pivot).
  if (funcionTecnica) await pedirCoach({ token, mensaje: `Entró como Personal de liga (${String(params.funcion)}).` }).catch(() => {});
  const newRow = await _getEquipoRow(nombre);
  await sendPush({
    tipo: 'integrante_nuevo',
    broadcastEquipo: true,
    excluirUsernames: [nombre],
    headings: { es: '¡Nuevo integrante en el equipo!' },
    contents: { es: `${nombre} se unió hoy. ¡Bienvenidx!` },
    url: APP_URL + '/?tab=equipo',
  });
  return { exito: true, token, nombre, datos: getDatosCompletos(newRow), ...(avisoEquipo ? { avisoEquipo } : {}) };
}

// ─── Registro Express (registro-express/) ──────────────────────────────────
// Variante de inscribirPersona() de arriba, SIN Google Sign-In -- no hay
// idToken ni email real disponibles en ese flujo (ver MANIFEST.md). Se sacó
// por completo la validación/duplicado de email (`email: ''` para toda
// cuenta creada así -- el duplicado por `.maybeSingle()` sobre email vacío
// habría reventado con más de una fila ya existente con email='') y se hizo
// el PIN OBLIGATORIO en vez de opcional: sin email/Google, el PIN es la
// ÚNICA vía de acceso futuro a esta cuenta -- sin esta guardia, una cuenta
// creada sin PIN quedaría inaccesible para siempre apenas se cierre la sesión.
async function inscribirPersonaExpress(params: Record<string, any>): Promise<Record<string, any>> {
  const nombre = (params.nombre ?? '').toString().trim();
  const pronombres = params.pronombres ?? '';
  const necesitaPatines = params.necesitaPatines ?? '';
  const talla = params.talla ?? '';
  const necesitaProtecciones = params.necesitaProtecciones ?? '';
    const pinHash = (params.pinHash ?? '').toString();
  // Inscripción rápida con WhatsApp (Victor, 2026-11-16): la clase gratis
  // de bienvenida es una por teléfono, aunque se cree otra cuenta.
  const telCrudo = String(params.telefono ?? '').replace(/[^0-9+]/g, '').slice(0, 20);
  const telDigitos = telCrudo.replace(/\D/g, '');

  if (!nombre) return { exito: false, error: 'El nombre es obligatorio.' };
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/.test(nombre)) return { exito: false, error: 'El nombre solo puede contener letras y espacios.' };
  if (pinHash.length !== 64) return { exito: false, error: 'PIN inválido.' };
  let telefonoYaUso = false;
  if (telDigitos.length >= 8) {
    const fin = telDigitos.slice(-9);
    const { data: mismos } = await supabase.from('equipo').select('username').ilike('telefono', `%${fin}`).limit(1);
    telefonoYaUso = !!mismos?.length;
  }

  const { data: nombreExiste } = await supabase.from('equipo').select('username').ilike('username', nombre).maybeSingle();
  if (nombreExiste) return { exito: false, error: 'Este nombre de usuario ya está en uso.' };

  const row: Record<string, any> = {
        username: nombre, email: '', pronombres, prefijo: telCrudo.startsWith('+') ? '+' : '', telefono: telCrudo.replace('+', ''),
    necesita_patines: necesitaPatines, talla, necesita_protecciones: necesitaProtecciones,
    equipo_liga: await _equipoLigaDesdeLegado(necesitaPatines, talla, necesitaProtecciones),
    // Clase gratis de bienvenida, si la liga la usa (Victor, 2026-11-16), una por teléfono.
    cupon_disponible: (await _reglasLiga()).cuponBienvenida !== false && !telefonoYaUso, permisos_configurados: true,
    fecha_registro: new Date().toISOString(), pin_hash: pinHash,
  };

  const { error } = await supabase.from('equipo').insert(row);
  if (error) return { exito: false, error: error.message };

  const token = await _crearToken(nombre);
  const newRow = await _getEquipoRow(nombre);
  await sendPush({
    tipo: 'integrante_nuevo',
    broadcastEquipo: true,
    excluirUsernames: [nombre],
    headings: { es: '¡Nuevo integrante en el equipo!' },
    contents: { es: `${nombre} se unió hoy. ¡Bienvenidx!` },
    url: APP_URL + '/?tab=equipo',
  });
  return { exito: true, token, nombre, datos: getDatosCompletos(newRow) };
}

// Bug real corregido (pedido explícito de Victor, ver MANIFEST.md -- "vik"
// seguía apareciendo como 'Asistiré' en eventos semanas después de haber
// usado 'Eliminar cuenta"): esta función (auto-borrado, ver mecConfirmar()/
// js/perfil.js) es un camino SEPARADO de `adminEliminarUsuario()` -- nunca
// recibió el mismo fix (ver ese comentario, sección Equipo) pese a borrar
// exactamente el mismo tipo de cuenta. Tenía 2 bugs reales, confirmados
// contra producción (`supabase db query --linked`): (1) solo borraba
// `equipo`/`sessions`, dejando huérfanos en las otras 12 tablas -- aunque
// hoy esas 12 tienen `ON DELETE CASCADE` real hacia `equipo(username)`
// (migración `20260912120000_cascade_delete_usuario.sql`), así que ya no
// hace falta borrarlas a mano (a diferencia de `adminEliminarUsuario()`,
// que sigue con los deletes explícitos por si corre en un entorno sin esa
// migración aplicada) -- se agregan de todos modos, mismo criterio de
// doble seguro. (2) **el bug real que causó el caso de "vik"**: el
// `.delete()` de `equipo` nunca chequeaba `error` NI cuántas filas afectó
// -- si el `WHERE username = usr` no matcheaba ninguna fila (token
// desincronizado, condición de carrera, o cualquier otra causa), Supabase
// no lo reporta como error (0 filas borradas es "éxito" para el cliente),
// así que la función devolvía `{exito:true}` de todos modos -- el
// frontend cerraba sesión y mostraba éxito, pero la cuenta real seguía
// 100% intacta en la DB, indefinidamente, sin que nadie se enterara.
// Fix: se agrega `.select('username')` al delete de `equipo` para poder
// verificar cuántas filas se borraron de verdad -- si `error` o 0 filas,
// se devuelve `{exito:false}` en vez de una falsa confirmación.
// Archivado (soft delete) -- pedido explícito, ver MANIFEST.md sección
// "Archivado de usuarios": "ya perdimos el historial de 10 cuentas, el
// historial de pagos, montos y asistencias debe conservarse siempre". Ya
// NO borra ninguna de las 13 tablas con historial real (`log_asistencias`/
// `reservas`/`puntos_mensuales`/`asignaciones_tareas`/
// `rectificaciones_asistencia`/`solicitudes_excepcion`/`solicitudes_pago`/
// `pagos`/`historial_tier`/`cuota_excepcion`/`nivel_actual`/
// `reglas_asistencia`) -- esas FK pasaron a `ON DELETE RESTRICT`
// (`20261028022932_archivar_usuarios_restrict_fk.sql`), un DELETE directo
// sobre `equipo` fallaría de todos modos. Marca `eliminado_en`+
// `eliminado_por:'usuario'` en la misma fila (nunca se borra) -- distinto
// de `adminEliminarUsuario()` (abajo, `eliminado_por:'admin'`), esta
// versión ADEMÁS vacía los datos personales/médicos/de contacto (pedido
// explícito: "conserva username y nombre_derby para que los registros
// sigan identificables", todo lo demás que sea dato personal se borra) --
// incluido `pin_hash` (al revés que el archivado por admin, que lo
// conserva a propósito para que una restauración deje todo funcionando).
// Solo se siguen borrando `sessions`/`pin_attempts` (no son historial) y se
// anulan las invitaciones pendientes (`invite_tokens.usado=true` -- no
// tiene sentido un link de activación vivo para una cuenta archivada).
/// Al archivar o borrar a alguien (Victor, 2026-11-26): sus tareas en curso
/// vuelven a quedar libres para otra persona y sale de las personas fijas de
/// las recurrentes. Lo ya enviado a revisión o aprobado no se toca.
async function _liberarTareasDe(nombre: string): Promise<void> {
  try {
    const { data: asigs } = await supabase.from('asignaciones_tareas').select('id, tarea_id').eq('nombre_usuario', nombre).eq('estado', 'iniciada');
    for (const a of asigs ?? []) {
      await supabase.from('asignaciones_tareas').delete().eq('id', a.id);
      const { data: quedan } = await supabase.from('asignaciones_tareas').select('id').eq('tarea_id', a.tarea_id).in('estado', ['iniciada', 'pendiente_revision']);
      if (!quedan?.length) await supabase.from('tareas').update({ estado: 'no_iniciada' }).eq('id', a.tarea_id).eq('estado', 'en_progreso');
    }
    const { data: recs } = await supabase.from('tareas_recurrentes').select('id, personas_fijas').contains('personas_fijas', [nombre]);
    for (const r of recs ?? []) await supabase.from('tareas_recurrentes').update({ personas_fijas: ((r.personas_fijas as string[]) ?? []).filter((u) => u !== nombre) }).eq('id', r.id);
  } catch (e) { console.error('[tareas] liberar', nombre, e); }
}

async function eliminarCuenta(params: Record<string, any>): Promise<Record<string, any>> {
  const tok = params.token as string;
  const usr = await _validarToken(tok);
  if (!usr) return { exito: false, error: 'Sesión inválida.' };
  const limpieza: Record<string, any> = {
    eliminado_en: new Date().toISOString(), eliminado_por: 'usuario',
    email: '', prefijo: '', telefono: '',
    fecha_nacimiento: null, fecha_publica: null, edad_publica: null,
    tipo_documento: '', pais_expedicion: '', numero_documento: '', nombre_legal: '',
    calle_principal: '', calle_secundaria: '', numeracion: '', sector: '', canton: '',
    emerg1_nombre: '', emerg1_relacion: '', emerg1_prefijo: '', emerg1_telefono: '',
    emerg2_nombre: '', emerg2_relacion: '', emerg2_prefijo: '', emerg2_telefono: '',
    enfermedad: '', alergias: '', alergias_desc: '', dieta: '', antecedentes: '',
    medicamentos: '', medicamentos_desc: '', atencion_medica: '', seguro: '', seguro_contacto: '',
    foto_perfil: '', pin_hash: null,
  };
  const { data, error } = await supabase.from('equipo').update(limpieza).eq('username', usr).select('username');
  if (error) return { exito: false, error: error.message };
  if (!data || data.length === 0) return { exito: false, error: 'No se encontró la cuenta a eliminar.' };
  await supabase.from('sessions').delete().eq('username', usr);
  await supabase.from('pin_attempts').delete().eq('username', usr);
  await supabase.from('invite_tokens').update({ usado: true }).eq('username', usr).eq('usado', false);
  await supabase.storage.from('fotos-perfil').remove(['avatars/' + usr + '.jpg']);
  await _liberarTareasDe(usr);
  return { exito: true };
}

async function actualizarPerfilGoogle(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const update: Record<string, any> = { permisos_configurados: true };
  if (params.foto && params.foto.toString().startsWith('http')) update.foto_perfil = params.foto;
    if (_esMenorDeEdad(params.fechaNac)) return { exito: false, error: 'Pivot es solo para mayores de 18 años.' };
  if (_normalizarFechaNac(params.fechaNac) && params.guardarFecha === 'si') {
    update.fecha_nacimiento = _normalizarFechaNac(params.fechaNac);
    update.fecha_publica    = params.fechaPublica === 'Sí' ? 'Sí' : 'No';
    update.edad_publica     = params.edadPublica  === 'Sí' ? 'Sí' : 'No';
  }
  await supabase.from('equipo').update(update).eq('username', username);
  return { exito: true };
}

async function _base64ToBuffer(base64Data: string): Promise<{ buffer: Uint8Array; mimeType: string } | null> {
  const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return null;
  try {
    const buffer = Uint8Array.from(atob(matches[2]), c => c.charCodeAt(0));
    return { buffer, mimeType: matches[1] };
  } catch { return null; }
}

async function subirFotoPerfil(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const base64Data = (params.base64Data ?? '').toString().trim();
  // Quitar foto
  if (!base64Data) {
    await supabase.from('equipo').update({ foto_perfil: '' }).eq('username', username);
    return { exito: true, url: '' };
  }
  const parsed = await _base64ToBuffer(base64Data);
  if (!parsed) return { exito: false, error: 'Formato de imagen inválido.' };
  const path = `avatars/${username}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('fotos-perfil')
    .upload(path, parsed.buffer, { contentType: parsed.mimeType, upsert: true });
  if (uploadError) return { exito: false, error: 'Error al subir imagen: ' + uploadError.message };
  const { data: urlData } = supabase.storage.from('fotos-perfil').getPublicUrl(path);
    // Misma ruta siempre: el ?v= hace que todos vean la foto nueva y no la de caché.
  const url = `${urlData.publicUrl}?v=${Date.now()}`;
  await supabase.from('equipo').update({ foto_perfil: url }).eq('username', username);
  return { exito: true, url };
}

/** Logo de la liga o de un equipo (Mi Liga, 2026-11-13). destino: 'liga' o el id del equipo. */
async function adminSubirLogo(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const destino = String(params.destino ?? 'liga');
  const base64Data = String(params.base64Data ?? '').trim();
  let url = '';
  if (base64Data) {
    const parsed = await _base64ToBuffer(base64Data);
    if (!parsed) return { exito: false, error: 'Formato de imagen inválido.' };
    // Foto de un artículo: 'invf-<listaId>:<variante>' (Victor, 2026-11-26).
    const archivo = destino.startsWith('invf-')
      ? 'invf-' + destino.slice(5, 41).replace(/[^a-z0-9-]/gi, '') + '-' + Array.from(new TextEncoder().encode(destino.slice(42))).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 80)
      : destino === 'liga' ? 'liga' : destino.startsWith('medio-') || destino.startsWith('inv-') ? destino.replace(/[^a-z0-9_-]/gi, '') : 'equipo-' + destino.replace(/[^a-z0-9-]/gi, '');
                const path = `logos/${archivo}.png`;
    const { error } = await supabase.storage.from('fotos-perfil').upload(path, parsed.buffer, { contentType: parsed.mimeType, upsert: true });
    if (error) return { exito: false, error: 'Error al subir imagen: ' + error.message };
    url = `${supabase.storage.from('fotos-perfil').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  }
        if (destino.startsWith('medio-')) {
    // Logo de un medio de pago: se guarda con el medio en Formas de pago.
  } else if (destino.startsWith('invf-')) {
    const listaId = destino.slice(5, 41), variante = destino.slice(42);
    const { error } = await supabase.from('inventario_stock').update({ foto: url || null }).eq('lista_id', listaId).eq('variante', variante);
    if (error) return { exito: false, error: error.message };
  } else if (destino.startsWith('inv-')) {
    // Foto de una lista del inventario (Victor, 2026-11-16).
    const { error } = await supabase.from('inventario_listas').update({ foto: url || null }).eq('id', destino.slice(4));
    if (error) return { exito: false, error: error.message };
  } else if (destino === 'liga') {
    await supabase.from('config_app').upsert({ key: 'logo_liga', value: url }, { onConflict: 'liga_id,key' });
  } else {
    const { error } = await supabase.from('config_tiers').update({ logo: url || null }).eq('id', destino);
    if (error) return { exito: false, error: error.message };
  }
  await _registrarAjuste('logo', null, { destino, url }, email);
  return { exito: true, url };
}

async function subirFotoInscripcion(params: Record<string, any>): Promise<Record<string, any>> {
  const idToken = (params.idToken ?? '').toString();
  const email = (params.email ?? '').toString().trim().toLowerCase();
  const base64Data = (params.base64Data ?? '').toString().trim();
  const info = await _verificarGoogleToken(idToken);
  if (!info) return { exito: false, error: 'Token de Google inválido.' };
  if ((info.email ?? '').toLowerCase() !== email) return { exito: false, error: 'El email no coincide con el token.' };
  if (!base64Data) return { exito: true, url: '' };
  const parsed = await _base64ToBuffer(base64Data);
  if (!parsed) return { exito: false, error: 'Formato de imagen inválido.' };
  const safeEmail = email.replace(/[^a-z0-9]/g, '_');
  const path = `inscripcion/${safeEmail}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('fotos-perfil')
    .upload(path, parsed.buffer, { contentType: parsed.mimeType, upsert: true });
  if (uploadError) return { exito: false, error: 'Error al subir imagen: ' + uploadError.message };
  const { data: urlData } = supabase.storage.from('fotos-perfil').getPublicUrl(path);
  return { exito: true, url: urlData.publicUrl };
}

// ─── Acciones: config ─────────────────────────────────────────────────────────

// Cancelar un evento (antes iba a Apps Script, obsoleto, 2026-11-07).
// `es_excepcion=true` lo protege de la regeneración automática, igual que
// `adminBorrarEvento()`. `getEventosRango()` lo muestra como cancelado.
async function adminCancelarEvento(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(params.adminToken);
  if (!email) return { exito: false, error: 'Sesión admin inválida.' };
  if (!params.idEvento) return { exito: false, error: 'Falta el evento.' };
  const { error } = await supabase.from('asistencias')
        .update({ es_excepcion: true, estado: 'Evento Cancelado', a_horario: '', tarde: '' })
    .eq('id_evento', params.idEvento);
  if (error) return { exito: false, error: error.message };
  // Limpieza que antes hacía la web directo contra la base (ya no se
  // permite con la clave pública, 2026-11-12): un evento cancelado no deja
  // marcas de "A tiempo"/"Tarde".
  await supabase.from('log_asistencias').delete().eq('id_evento', params.idEvento).in('estado', ['A tiempo', 'Tarde']);
  return { exito: true };
}

// Reactivar (descancelar) un evento: revierte es_excepcion y estado en
// las asistencias para que la gente pueda volver a responder.
// No restaura marcas de log_asistencias borradas al cancelar (se pierden).
async function adminReactivarEvento(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(params.adminToken);
  if (!email) return { exito: false, error: 'Sesión admin inválida.' };
  if (!params.idEvento) return { exito: false, error: 'Falta el evento.' };
  const { error } = await supabase.from('asistencias')
    .update({ es_excepcion: false, estado: null })
    .eq('id_evento', params.idEvento);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

// Cambiar las protecciones del club de una reserva de clase (antes iba a
// Apps Script, obsoleto, 2026-11-07). Solo la propia persona.
async function actualizarProtecReserva(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre, fecha, protecNueva } = params;
  if ((await _validarToken(params.token)) !== nombre) return { exito: false, error: 'Sesión inválida.' };
  const { data } = await supabase.from('reservas').select('id').eq('nombre_usuario', nombre).eq('id_evento', fecha).neq('estado', 'Cancelada').limit(1);
  if (!data?.[0]) return { exito: false, error: 'Reserva no encontrada.' };
  const { error } = await supabase.from('reservas').update({ protecciones: protecNueva || 'No' }).eq('id', data[0].id);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

async function adminBorrarEvento(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(params.adminToken);
  if (!email) return { exito: false, error: 'Sesión admin inválida.' };
  // Soft-delete, no DELETE real: `regenerar_ventana_asistencias()` (cron) volvía
  // a insertar la fila borrada en la próxima corrida. `es_excepcion=true` la
  // protege de la regeneración (ver 20260828) y `estado='Eliminado'` la
  // esconde de `getEventosRango()`.
  const { error } = await supabase.from('asistencias')
    .update({ es_excepcion: true, estado: 'Eliminado' })
    .eq('id_evento', params.idEvento);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

/** Recargo de la cuota del mes 'aaaa-mm' si se paga el día `hoy` (aaaa-mm-dd);
 *  `base` = mensualidad (para el recargo en porcentaje). */
function _recargoCuota(mes: string, hoy: string, reglas: Record<string, any>, base = 0): number {
  const dia = Number(reglas.cuotaVenceDia) || 0, valor = Number(reglas.cuotaRecargo) || 0;
  if (dia <= 0 || valor <= 0) return 0;
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const diaLimite = Math.min(ultimo, dia + (Number(reglas.cuotaGraciaDias) || 0));
  const limite = `${mes}-${String(diaLimite).padStart(2, '0')}`;
  if (hoy <= limite) return 0;
  // Meses de atraso: 1 al pasar el límite y uno más cada vez que se pasa ese
  // mismo día en los meses siguientes.
  const [hy, hm, hd] = hoy.split('-').map(Number);
  const veces = reglas.cuotaRecargoModo === 'mensual' ? 1 + Math.max(0, (hy * 12 + hm) - (y * 12 + m) - (hd <= diaLimite ? 1 : 0)) : 1;
  const uno = reglas.cuotaRecargoTipo === 'porcentaje' ? (base * valor) / 100 : valor;
  return Math.round(uno * veces * 100) / 100;
}

async function getPreciosClases(params: Record<string, any> = {}, equipo?: string | null): Promise<Record<string, any>> {
  const { data } = await supabase.from('config_app').select('key, value').in('key', ['precio_por_clase', 'precio_mensual']);
  const map: Record<string, any> = {};
  (data ?? []).forEach((r: any) => { map[r.key] = r.value; });
    const r = await _reglasLiga();
  // Precio propio del equipo (de quien pregunta, o el que se pase).
    let eq = equipo;
  let descuentoPct = 0;
  if (eq === undefined && params?.token) {
    const yo = await _validarToken(params.token);
    if (yo) {
      const f = (await supabase.from('equipo').select('categoria, cupon_descuento').eq('username', yo).maybeSingle()).data;
      eq = f?.categoria ?? null;
      descuentoPct = Number(f?.cupon_descuento) || 0;
    }
  }
  const cobro = _cobroEquipo(r, eq);
  return {
    precioPorClase: cobro.precioClase ?? map['precio_por_clase'] ?? null, precioMensual: cobro.precioMensual ?? map['precio_mensual'] ?? null,
        modoCobro: cobro.modo,
    descuentoPct,
    // Meses y periodos sin cobro que le tocan (Victor, 2026-11-20): la app avisa y calcula.
    equipoCobro: eq ?? null,
    periodosSinCobro: _periodosSinCobro(r, eq),
    cuota: { venceDia: Number(r.cuotaVenceDia) || 0, graciaDias: Number(r.cuotaGraciaDias) || 0, recargo: Number(r.cuotaRecargo) || 0, recargoTipo: r.cuotaRecargoTipo === 'porcentaje' ? 'porcentaje' : 'fijo', recargoModo: r.cuotaRecargoModo === 'mensual' ? 'mensual' : 'unico' },
  };
}

async function adminSetPreciosClases(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(params.adminToken);
  if (!email) return { exito: false, error: 'Sesión admin inválida.' };
  await supabase.from('config_app').upsert([
    { key: 'precio_por_clase', value: String(params.precioPorClase) },
    { key: 'precio_mensual',   value: String(params.precioMensual) },
  ], { onConflict: 'liga_id,key' });
  return { exito: true };
}

// Config global de fondos de viaje (Fase 2 completa del sistema de tiers,
// ver MANIFEST.md, Parte 2 del pedido) -- reusa `config_app` (mismo criterio
// que precio_por_clase/precio_mensual arriba, ver esos comentarios) en vez
// de crear una `config_liga` nueva, tabla clave-valor genérica que ya existe
// para exactamente este propósito. Sin gate de admin en el getter -- lo
// consumen `getEquipo()`/`_calificaFondosViajePorUsuarios()` (más abajo)
// para CUALQUIER cuenta logueada, mismo criterio "directorio de solo
// lectura sin sesión" que el resto de este archivo.
async function getFondosViajeMeses(): Promise<number> {
  const { data } = await supabase.from('config_app').select('value').eq('key', 'fondos_viaje_meses').maybeSingle();
  return Number(data?.value) || 6;
}
async function getFondosViajeConfig(): Promise<Record<string, any>> {
  return { fondosViajeMeses: await getFondosViajeMeses() };
}
async function adminSetFondosViajeConfig(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(params.adminToken);
  if (!email) return { exito: false, error: 'Sesión admin inválida.' };
  const meses = Number(params.fondosViajeMeses);
  if (!Number.isFinite(meses) || meses < 0) return { exito: false, error: 'Cantidad de meses inválida.' };
  await supabase.from('config_app').upsert({ key: 'fondos_viaje_meses', value: String(Math.round(meses)) }, { onConflict: 'liga_id,key' });
  return { exito: true };
}

// Mapa username -> ¿califica para fondos de viaje? (Parte 7 del pedido) --
// calificar significa: perteneció a un tier con `califica_fondos_viaje=true`
// durante los últimos `fondosViajeMeses` meses COMPLETOS (sin incluir el mes
// actual, todavía en curso) SIN NINGUNA interrupción -- un solo mes en un
// tier no-calificante, o directamente sin fila en `historial_tier` para ese
// mes (nunca se corrió "Recalcular ahora" ese mes, dato desconocido), ya
// cuenta como interrupción -- no se asume calificación sobre un hueco de
// datos. Recibe TODOS los usernames de una sola vez (usada por `getEquipo()`
// para el roster completo) para hacer 1 sola consulta a `historial_tier` en
// vez de N -- `getDatosCompletosAction()` (una sola persona) la llama igual,
// con un array de 1 elemento.
async function _calificaFondosViajePorUsuarios(usernames: string[]): Promise<Record<string, boolean>> {
  const resultado: Record<string, boolean> = {};
  if (!usernames.length) return resultado;
  const meses = await getFondosViajeMeses();
  if (meses <= 0) { usernames.forEach((u) => { resultado[u] = false; }); return resultado; }
  const { data: tiersData } = await supabase.from('config_tiers').select('nombre, califica_fondos_viaje');
  const calificaPorTier: Record<string, boolean> = {};
  (tiersData ?? []).forEach((t: any) => { calificaPorTier[t.nombre] = t.califica_fondos_viaje === true; });
  const hoy = new Date();
  // Últimos `meses` meses COMPLETOS -- arranca en `i=1` (el mes pasado), NUNCA
  // incluye el mes actual (todavía en curso, sin cerrar).
  const mesesRequeridos: string[] = [];
  for (let i = 1; i <= meses; i++) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    mesesRequeridos.push(d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'));
  }
  const { data: historial } = await supabase.from('historial_tier')
    .select('username, mes, tier_nombre')
    .in('username', usernames)
    .in('mes', mesesRequeridos);
  const tierPorUsuarioYMes: Record<string, Record<string, string>> = {};
  (historial ?? []).forEach((h: any) => {
    if (!tierPorUsuarioYMes[h.username]) tierPorUsuarioYMes[h.username] = {};
    tierPorUsuarioYMes[h.username][h.mes] = h.tier_nombre;
  });
  usernames.forEach((u) => {
    const porMes = tierPorUsuarioYMes[u] ?? {};
    resultado[u] = mesesRequeridos.every((mes) => !!porMes[mes] && calificaPorTier[porMes[mes]] === true);
  });
  return resultado;
}

// Backfill de `historial_tier` con datos históricos reales (bug real
// investigado -- "todos aparecen como 'no califica' para fondos de viaje",
// ver MANIFEST.md): `historial_tier` arrancó vacía el día del deploy y solo
// se llena hacia ADELANTE, una fila por mes, en cada "Recalcular ahora" real
// -- confirmado contra la DB real (`select count(*), min(mes), max(mes)
// from historial_tier` -- 47 filas, TODAS `mes='2026-09'`, ninguna anterior).
// `_calificaFondosViajePorUsuarios()` (arriba) no falla ni silenciosa ni
// ruidosamente -- hace exactamente lo que dice: exige una fila con tier
// calificante para CADA uno de los últimos `fondosViajeMeses` meses
// completos, y con la tabla recién nacida esos meses simplemente no existen
// todavía -- `!!porMes[mes]` da `false` para todos, `.every()` corta en el
// primero, `resultado[u]=false` para TODO el mundo. Es el comportamiento
// correcto del código para una tabla vacía, no un bug de cálculo -- el bug
// real es que nunca hubo un backfill al introducir la feature.
//
// Esta función reconstruye, para cada mes PASADO con datos reales
// disponibles y cada miembro actual, el tier que le habría correspondido
// aplicando los CRITERIOS ACTUALES de `config_tiers` contra sus clases/
// puntos reales de ESE mes hacia atrás -- mismas fórmulas/ventanas que
// `recalcular-categorias/index.ts` (`contarClases`/`sumarPuntos`/
// `mejorTierPara`), con "hoy" reemplazado por "fin de ese mes". No existe
// ningún snapshot histórico real de qué tier tenía cada persona en el
// pasado (`equipo.categoria` es un valor mutable, se pisa en cada
// recálculo) -- esto es una INFERENCIA retroactiva a partir de mérito, no
// un historial exacto de decisiones pasadas (tampoco intenta simular
// riesgo/gracia retroactivo -- ese sistema es inherentemente prospectivo,
// no tiene sentido "qué hubiera pasado" para un período de prueba que nunca
// corrió). Nunca pisa una fila que YA exista (`yaExiste`, chequeado ANTES de
// armar cada fila) -- en particular, nunca toca el mes actual, que ya tiene
// la evaluación REAL de `recalcular-categorias`, ni un backfill anterior si
// esto se corre 2 veces.
async function adminBackfillHistorialTier(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };

  const { data: tiersData, error: tiersError } = await supabase.from('config_tiers').select('*').order('orden', { ascending: true });
  if (tiersError) return { exito: false, error: tiersError.message };
  const tiers = tiersData ?? [];
  const tierDefault = tiers.find((t: any) => t.es_default === true);
  if (!tierDefault) return { exito: false, error: 'No hay ningún tier marcado como es_default=true en config_tiers.' };
  const tiersNoDefault = tiers.filter((t: any) => t.id !== tierDefault.id).sort((a: any, b: any) => a.orden - b.orden);

  const { data: equipoData, error: equipoError } = await supabase.from('equipo').select('username').is('eliminado_en', null);
  if (equipoError) return { exito: false, error: equipoError.message };
  const usernames: string[] = (equipoData ?? []).map((r: any) => r.username).filter(Boolean);
  if (!usernames.length) return { exito: true, filasEscritas: 0 };

  // Tope de meses hacia atrás -- `params.meses` opcional (default 8, cubre
  // sobrado los 6 meses que pide fondos de viaje hoy más margen si ese
  // config sube); no tiene sentido pedir más de lo que hay datos reales
  // desde que existe `puntos_mensuales`/`log_asistencias` en este backend.
  const mesesHaciaAtras = Math.min(36, Math.max(1, Number(params.meses) || 8));

  const { data: asistData, error: asistError } = await supabase.from('asistencias')
    .select('fecha, a_horario, tarde')
    .not('estado', 'in', '("Evento Cancelado","No se entrena","Eliminado")');
  if (asistError) return { exito: false, error: asistError.message };
  const { data: puntosData, error: puntosError } = await supabase.from('puntos_mensuales')
    .select('nombre_usuario, anio, mes, puntos_total');
  if (puntosError) return { exito: false, error: puntosError.message };
  const { data: existentesData, error: existentesError } = await supabase.from('historial_tier').select('username, mes');
  if (existentesError) return { exito: false, error: existentesError.message };
  const yaExiste = new Set((existentesData ?? []).map((r: any) => r.username + '|' + r.mes));

  function nombresDe(s: string | null | undefined): string[] {
    return String(s ?? '').split(',').map((n: string) => n.trim().toUpperCase()).filter(Boolean);
  }
  function fechaISO(d: Date): string { return d.toISOString().slice(0, 10); }
  // Mismo cálculo que primerDiaMesesAtras()/recalcular-categorias/index.ts,
  // parametrizado por `refFin` (ahí siempre era "hoy") para poder anclar la
  // ventana al fin de un mes PASADO en vez de al momento actual.
  function primerDiaMesesAntesDe(refFin: Date, n: number): Date {
    const year = refFin.getUTCFullYear();
    const month = refFin.getUTCMonth() - n;
    const dia = Math.min(refFin.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
    return new Date(Date.UTC(year, month, dia));
  }
  // Clases reales en `ventanaMeses` meses terminando en `refFin` (exclusivo,
  // mismo criterio de rango [desde, hasta) que el resto de esta app).
  function contarClasesAsOf(username: string, refFin: Date, ventanaMeses: number): number {
    const desde = fechaISO(primerDiaMesesAntesDe(refFin, ventanaMeses));
    const hasta = fechaISO(refFin);
    const u = username.trim().toUpperCase();
    let n = 0;
    for (const fila of asistData ?? []) {
      if (!fila.fecha || fila.fecha < desde || fila.fecha >= hasta) continue;
      if (nombresDe(fila.a_horario).includes(u) || nombresDe(fila.tarde).includes(u)) n++;
    }
    return n;
  }
  // Puntos reales del mes `idxMes` (índice año*12+mes-1) más los
  // `ventanaMeses` meses anteriores -- mismo criterio `diff` que
  // sumarPuntos()/recalcular-categorias/index.ts, con "idxActual" ahí
  // reemplazado por el índice del mes que se está reconstruyendo.
  function sumarPuntosAsOf(username: string, idxMes: number, ventanaMeses: number): number {
    let total = 0;
    for (const fila of puntosData ?? []) {
      if (fila.nombre_usuario !== username) continue;
      const idxFila = Number(fila.anio) * 12 + (Number(fila.mes) - 1);
      const diff = idxMes - idxFila;
      if (diff < 0 || diff > ventanaMeses) continue;
      total += Number(fila.puntos_total) || 0;
    }
    return total;
  }
  function mejorTierParaAsOf(username: string, refFin: Date, idxMes: number): string {
    for (const tier of tiersNoDefault) {
      const ventanaMeses = Number(tier.ventana_meses) || 0;
      const clases = contarClasesAsOf(username, refFin, ventanaMeses);
      const puntos = sumarPuntosAsOf(username, idxMes, ventanaMeses);
      const cumpleClases = clases >= (Number(tier.min_clases) || 0);
      const cumplePuntos = puntos >= (Number(tier.min_puntos) || 0);
      const cumple = tier.logica === 'Y' ? (cumpleClases && cumplePuntos) : (cumpleClases || cumplePuntos);
      if (cumple) return tier.nombre;
    }
    return tierDefault.nombre;
  }

  const hoy = new Date();
  const idxMesActual = hoy.getUTCFullYear() * 12 + hoy.getUTCMonth();
  const filas: { username: string; mes: string; tier_nombre: string }[] = [];
  for (let i = 1; i <= mesesHaciaAtras; i++) {
    const idxMes = idxMesActual - i;
    const anio = Math.floor(idxMes / 12);
    const mesNum1 = (idxMes % 12) + 1; // 1-12
    const mesStr = anio + '-' + String(mesNum1).padStart(2, '0');
    // Fin del mes que se reconstruye = primer día del mes SIGUIENTE (límite
    // exclusivo) -- mismo rol que "hoy" en el algoritmo real.
    const refFin = new Date(Date.UTC(anio, mesNum1, 1));
    for (const username of usernames) {
      if (yaExiste.has(username + '|' + mesStr)) continue;
      filas.push({ username, mes: mesStr, tier_nombre: mejorTierParaAsOf(username, refFin, idxMes) });
    }
  }
  if (!filas.length) return { exito: true, filasEscritas: 0 };
  // Lotes de 500 (límite razonable de PostgREST por request) -- upsert, no
  // insert: aunque `yaExiste` ya filtra arriba, 2 llamadas concurrentes a
  // este mismo endpoint podrían pisarse -- el índice único de la migración
  // (`username, mes`) es la garantía real contra duplicados, esto es cinturón
  // y tirantes.
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabase.from('historial_tier').upsert(filas.slice(i, i + 500), { onConflict: 'username,mes' });
    if (error) return { exito: false, error: error.message, filasEscritas: i };
  }
  return { exito: true, filasEscritas: filas.length };
}

// ─── Acciones: venues ─────────────────────────────────────────────────────────

async function adminGetVenues(): Promise<any[]> {
  const { data } = await supabase.from('venues').select('*').order('lugar');
  return data ?? [];
}

async function adminCrearVenue(params: Record<string, any>): Promise<Record<string, any>> {
  let datos = params.datosJson ?? params.datos ?? params;
  if (typeof datos === 'string') datos = JSON.parse(datos);
  if (params.datosJson || params.datos) { /* already parsed */ } else { datos = params; delete datos.action; delete datos.adminToken; }
  if (datos.lugar && String(datos.lugar).length > 20) return { exito: false, error: 'El nombre del lugar no puede superar 20 caracteres.' };
  const { data, error } = await supabase.from('venues').insert(datos).select().single();
  if (error) return { exito: false, error: error.message };
  return data;
}

async function adminEditarVenue(params: Record<string, any>): Promise<Record<string, any>> {
  let datos = params.datosJson ?? params.datos;
  if (typeof datos === 'string') datos = JSON.parse(datos);
  if (datos.lugar && String(datos.lugar).length > 20) return { exito: false, error: 'El nombre del lugar no puede superar 20 caracteres.' };
  const { data, error } = await supabase.from('venues').update(datos).eq('id', params.id).select().single();
  if (error) return { exito: false, error: error.message };
  return data;
}

async function adminEliminarVenue(params: Record<string, any>): Promise<boolean> {
  await supabase.from('venues').delete().eq('id', params.id);
  return true;
}

// ─── Acciones: equipamiento ───────────────────────────────────────────────────

async function getTallasDisponibles(): Promise<string[]> {
  const { data } = await supabase.from('equipamiento_tallas').select('talla');
  return [...new Set((data ?? []).map((r: any) => r.talla))];
}

async function adminGetEquipamiento(): Promise<Record<string, any>> {
  const { data: tallas } = await supabase.from('equipamiento_tallas').select('talla, cantidad');
  const { data: config } = await supabase.from('config_equipamiento').select('total_protecciones').limit(1).maybeSingle();
  return { tallas: tallas ?? [], protecciones: config?.total_protecciones ?? 0 };
}

async function adminGuardarEquipamiento(params: Record<string, any>): Promise<Record<string, any>> {
  let tallas = params.tallasJson ?? params.tallas;
  if (typeof tallas === 'string') tallas = JSON.parse(tallas);
  const protecciones = parseInt(params.protecciones, 10) || 0;

  // Guardia server-side (ver MANIFEST, "Cambios recientes" -- tallas
  // duplicadas en equipamiento_tallas): este action reemplaza el set entero
  // (delete all + re-insert) en vez de insertar una talla nueva sola, así
  // que la única forma de que entre un duplicado a la tabla es que el array
  // recibido ya traiga la misma talla 2 veces. Se corta ANTES de tocar la
  // tabla si eso pasa, en vez de dejar que el insert masivo lo cree.
  const tallasValidas = (tallas ?? []).filter((t: any) => t.talla).map((t: any) => ({ talla: t.talla, cantidad: parseInt(t.cantidad, 10) || 0 }));
  const nombresVistos = new Set<string>();
  for (const t of tallasValidas) {
    if (nombresVistos.has(t.talla)) return { exito: false, error: 'Esa talla ya está cargada. Usa + para aumentar la cantidad.' };
    nombresVistos.add(t.talla);
  }

  // Delete all + re-insert
  const { data: existentes } = await supabase.from('equipamiento_tallas').select('id');
  for (const f of (existentes ?? [])) await supabase.from('equipamiento_tallas').delete().eq('id', f.id);
  if (tallasValidas.length) await supabase.from('equipamiento_tallas').insert(tallasValidas);

    const { data: cfg } = await supabase.from('config_equipamiento').select('id').limit(1).maybeSingle();
  if (cfg) await supabase.from('config_equipamiento').update({ total_protecciones: protecciones }).eq('id', cfg.id);
  else await supabase.from('config_equipamiento').insert({ total_protecciones: protecciones });

  // Mismo stock en las listas del Inventario de la app (2026-11-13).
  const { data: sis } = await supabase.from('inventario_listas').select('id, sistema, piezas').in('sistema', ['patines', 'protecciones']);
  for (const l of sis ?? []) {
    await supabase.from('inventario_stock').delete().eq('lista_id', l.id);
    const filas = l.sistema === 'patines'
      ? tallasValidas.map((t: any) => ({ lista_id: l.id, variante: String(t.talla), cantidad: t.cantidad }))
      : (Array.isArray(l.piezas) ? l.piezas : []).map((p: any) => ({ lista_id: l.id, variante: String(p.nombre), cantidad: protecciones * (Number(p.cantidad) || 1) }));
    if (filas.length) await supabase.from('inventario_stock').insert(filas);
  }

  return { exito: true };
}

// ─── Acciones: tareas ─────────────────────────────────────────────────────────

// Bug de seguridad real encontrado de paso y corregido en esta misma tanda
// (mismo patrón ya fijado antes para adminEliminarUsuario/adminRegistrarPago
// y compañía, ver MANIFEST.md sección 5): NINGUNA de las acciones admin-only
// de esta sección (adminCrearTarea, adminEditarTarea,
// adminEditarAsignacionesTarea, adminArchivarTarea, adminEliminarTarea,
// adminEliminarTareaArchivada, adminValidarTarea, adminDesvalidarTarea)
// validaba `params.adminToken` -- cualquiera con un token de sesión de
// USUARIO normal (o directamente sin token) podía crear/editar/borrar
// tareas o aprobar/rechazar asignaciones ajenas (créditos de puntos
// incluidos) con solo conocer el `action` correcto. El frontend siempre
// mandó `adminToken` en las 8 (todas via `adminApi()`, js/tareas.js), así
// que agregar el gate acá no cambia ningún llamado legítimo. Quedan
// pendientes, MISMA falla, MENOR severidad (exponen datos de solo lectura,
// no mutan nada): `adminGetTareasActivas`/`getTareasPendientesValidacion` --
// requerirían cambiar su firma (hoy no reciben `params`) para poder
// validar, fuera del alcance de esta tanda.
async function getConfigTareas(): Promise<Record<string, any>> {
  const { data } = await supabase.from('config_tareas').select('limite_tareas_activas').limit(1).maybeSingle();
  return { limiteTareasActivas: data?.limite_tareas_activas ?? 3 };
}

async function getTareasDisponibles(): Promise<Record<string, any>> {
  const { data: tareas } = await supabase.from('tareas').select('*').in('estado', ['no_iniciada', 'en_progreso', 'expirada']);
  if (!tareas?.length) return { disponibles: [], baul: [] };
  const ids = tareas.map((t: any) => t.id);
  const { data: asigs } = await supabase.from('asignaciones_tareas').select('tarea_id, nombre_usuario').in('estado', ['iniciada', 'pendiente_revision']).in('tarea_id', ids);
  const equipoPorNombre = await _mapaEquipoPorNombre();
  const activasPorTarea: Record<string, any[]> = {};
  (asigs ?? []).forEach((a: any) => {
    if (!activasPorTarea[a.tarea_id]) activasPorTarea[a.tarea_id] = [];
    const eq = equipoPorNombre[String(a.nombre_usuario).trim().toUpperCase()] ?? {};
    activasPorTarea[a.tarea_id].push({ nombre: a.nombre_usuario, nombreDerby: eq.nombreDerby ?? '', fotoPerfil: eq.fotoPerfil ?? '' });
  });
  const armar = (t: any) => {
    const activas = activasPorTarea[t.id] ?? [];
    return { idTarea: t.id, titulo: t.titulo, notas: t.notas, area: t.area, puntos: t.puntos, fechaVencimiento: t.fecha_vencimiento, cuposTotales: t.max_asignados, cuposTomados: activas.length, cuposLibres: t.max_asignados - activas.length, asignados: activas };
  };
  const disponibles = tareas.filter((t: any) => t.estado === 'no_iniciada' || t.estado === 'en_progreso').map(armar).filter((x: any) => x.cuposLibres > 0);
  const baul = tareas.filter((t: any) => t.estado === 'expirada').map(armar).filter((x: any) => x.cuposLibres > 0);
  return { disponibles, baul };
}

async function getMisTareas(params: Record<string, any>): Promise<any[]> {
  const nombre = params.nombre;
  const { data: asigs } = await supabase.from('asignaciones_tareas').select('*').eq('nombre_usuario', nombre).in('estado', ['iniciada', 'pendiente_revision']);
  if (!asigs?.length) return [];
  const ids = asigs.map((a: any) => a.tarea_id);
  const { data: tareas } = await supabase.from('tareas').select('*').in('id', ids);
  const tareasPorId: Record<string, any> = {};
  (tareas ?? []).forEach((t: any) => { tareasPorId[t.id] = t; });
  return asigs.map((a: any) => ({
    idAsignacion: a.id, estado: a.estado, esRescate: a.es_rescate, fechaVencimientoPersonal: a.fecha_vencimiento_personal,
    tarea: tareasPorId[a.tarea_id] ? { idTarea: a.tarea_id, titulo: tareasPorId[a.tarea_id].titulo, notas: tareasPorId[a.tarea_id].notas, area: tareasPorId[a.tarea_id].area, puntos: tareasPorId[a.tarea_id].puntos } : null,
  }));
}

// Bug real corregido (pedido explícito de Victor, investigado a fondo con
// Playwright contra la app real -- ver MANIFEST.md sección 3): el frontend
// SIEMPRE manda el id de la tarea bajo la key `idTarea` (`_tarTomar()`/
// `_tarSoltar()`/`_tarRescatar()`, js/tareas.js: `api({..., idTarea:
// idTarea})`) -- confirmado con una captura real del request que dispara
// el botón "Tomar tarea" en producción (`idTarea=<uuid real>` en la URL).
// Pero esta función (y `soltarTarea()`/`rescatarTarea()`, mismo bug)
// destructuraba `params.tareaId` -- una key que el cliente NUNCA manda, así
// que siempre daba `undefined`. `.eq('id', undefined)` en supabase-js NO
// se omite ni tira una excepción visible acá -- serializa literal
// `id=eq.undefined` en la request a PostgREST (confirmado corriendo el
// mismo builder de consultas localmente), que falla por tipo inválido
// (`id` es `uuid`) y devuelve `data: null` sin que el código chequee
// `error` -- indistinguible de "la tarea no existe". Resultado real: EL
// SELF-SERVICE DE TOMAR/SOLTAR/RESCATAR TAREAS ESTUVO ROTO PARA TODA TAREA,
// no solo las recurrentes, desde que se escribió esta función (commit
// f207182, 2026-08-13) -- nunca se notó porque hasta ahora los admins
// asignaban tareas directo (`asignarA` al crear, o `adminEditarAsignacionesTarea`)
// en vez de dejarlas para que alguien las tome; las tareas recurrentes son
// las primeras que DEPENDEN de este flujo (se crean siempre sin asignar).
async function tomarTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre, idTarea: tareaId } = params;
  const { data: t } = await supabase.from('tareas').select('*').eq('id', tareaId).maybeSingle();
  if (!t) return { exito: false, error: 'Tarea no encontrada.' };
  if (t.estado !== 'no_iniciada' && t.estado !== 'en_progreso') return { exito: false, error: 'La tarea no está disponible.' };
  const { data: activas } = await supabase.from('asignaciones_tareas').select('nombre_usuario').eq('tarea_id', tareaId).in('estado', ['iniciada', 'pendiente_revision']);
  if ((t.max_asignados - (activas?.length ?? 0)) <= 0) return { exito: false, error: 'No quedan cupos disponibles.' };
  if ((activas ?? []).some((a: any) => a.nombre_usuario === nombre)) return { exito: false, error: 'Ya tienes esta tarea asignada.' };
  const limite = await _limiteTareasActivas();
  if (limite != null && await _contarIniciadasDe(nombre) >= limite) return { exito: false, error: 'Límite de tareas activas alcanzado.' };
  await supabase.from('asignaciones_tareas').insert({ tarea_id: tareaId, nombre_usuario: nombre, estado: 'iniciada', es_rescate: false, fecha_vencimiento_personal: t.fecha_vencimiento ?? null });
  if (t.estado === 'no_iniciada') await supabase.from('tareas').update({ estado: 'en_progreso' }).eq('id', tareaId);
  return { exito: true };
}

// Mismo bug real que tomarTarea() (ver ese comentario) -- `soltarTarea()`
// tampoco recibe nunca `tareaId`, solo `idTarea`.
async function soltarTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre, idTarea: tareaId } = params;
  const { data: asigs } = await supabase.from('asignaciones_tareas').select('id').eq('tarea_id', tareaId).eq('nombre_usuario', nombre).eq('estado', 'iniciada');
  for (const a of (asigs ?? [])) await supabase.from('asignaciones_tareas').delete().eq('id', a.id);
  const { data: quedan } = await supabase.from('asignaciones_tareas').select('id').eq('tarea_id', tareaId).in('estado', ['iniciada', 'pendiente_revision']);
  if (!(quedan?.length)) {
    const { data: t } = await supabase.from('tareas').select('estado').eq('id', tareaId).maybeSingle();
    if (t?.estado === 'en_progreso') await supabase.from('tareas').update({ estado: 'no_iniciada' }).eq('id', tareaId);
  }
  return { exito: true };
}

// Mismo bug real que tomarTarea() (ver ese comentario) -- `rescatarTarea()`
// tampoco recibe nunca `tareaId`, solo `idTarea`.
async function rescatarTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre, idTarea: tareaId } = params;
  const { data: t } = await supabase.from('tareas').select('*').eq('id', tareaId).maybeSingle();
  if (!t) return { exito: false, error: 'Tarea no encontrada.' };
  if (t.estado !== 'expirada') return { exito: false, error: 'La tarea no está en el baúl.' };
  const { data: activas } = await supabase.from('asignaciones_tareas').select('nombre_usuario').eq('tarea_id', tareaId).in('estado', ['iniciada', 'pendiente_revision']);
  if ((t.max_asignados - (activas?.length ?? 0)) <= 0) return { exito: false, error: 'No quedan cupos disponibles.' };
  if ((activas ?? []).some((a: any) => a.nombre_usuario === nombre)) return { exito: false, error: 'Ya tienes esta tarea asignada.' };
  const limite = await _limiteTareasActivas();
  if (limite != null && await _contarIniciadasDe(nombre) >= limite) return { exito: false, error: 'Límite de tareas activas alcanzado.' };

  let fechaVencimientoPersonal = null;
  if (t.fecha_vencimiento && t.created_at) {
    const venc = new Date(t.fecha_vencimiento + 'T00:00:00Z').getTime();
    const creado = new Date(t.created_at).getTime();
    const diasOriginales = Math.ceil((venc - creado) / 86400000);
    const f = new Date();
    f.setDate(f.getDate() + diasOriginales);
    fechaVencimientoPersonal = f.toISOString().substring(0, 10);
  }
  await supabase.from('asignaciones_tareas').insert({ tarea_id: tareaId, nombre_usuario: nombre, estado: 'iniciada', es_rescate: true, fecha_vencimiento_personal: fechaVencimientoPersonal });
  await supabase.from('tareas').update({ estado: 'en_progreso' }).eq('id', tareaId);
  return { exito: true };
}

// Si quien completa la tarea es admin, se salta 'pendiente_revision' y se
// aprueba de una -- ver `_aprobarAsignacionTarea()` más abajo (misma acción
// que corre `adminValidarTarea('aprobar')`, reusada tal cual). Pedido
// explícito de Victor: el botón correspondiente en el frontend
// (`_tarAccionMisHtml()`/`_tarDetalleAccionesHtml()`, js/tareas.js) dice
// "Finalizar tarea" en vez de "Enviar a revisión" cuando quien lo ve es
// admin -- decisión tomada acá en el backend, el frontend solo refleja
// `_adminToken` (mismo criterio ya usado en el resto de esta pantalla).
async function enviarRevisionTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const { idAsignacion, nombre } = params;
  const { data: a } = await supabase.from('asignaciones_tareas').select('nombre_usuario, estado').eq('id', idAsignacion).maybeSingle();
  if (!a) return { exito: false, error: 'Asignación no encontrada.' };
  if (a.nombre_usuario !== nombre) return { exito: false, error: 'No autorizado.' };
  if (a.estado !== 'iniciada') return { exito: false, error: 'La asignación no está iniciada.' };
    // Pivots: según "Pedidos de Pivots" en Ajustes de la liga (2026-11-13).
  if ((await _pedidoDePivot(nombre)).auto) return await _aprobarAsignacionTarea(idAsignacion);
  await supabase.from('asignaciones_tareas').update({ estado: 'pendiente_revision', fecha_envio: new Date().toISOString() }).eq('id', idAsignacion);
  return { exito: true };
}

// Puntos reales acreditados por una tarea aprobada -- descuento lineal por
// día de atraso, nunca menos de la mitad de los puntos originales (pedido
// explícito, feat "modificador de tardanza", ver MANIFEST.md/CHANGELOG.md).
// "Fecha límite" real es `fechaVencimientoPersonal` (`asignaciones_tareas`,
// NO `tareas.fecha_vencimiento` -- una tarea rescatada del baúl,
// `rescatarTarea()`, recalcula su propio vencimiento personal, distinto
// del de la tarea original). "Fecha de entrega" real es `fechaEnvio`
// (seteada por `enviarRevisionTarea()`). Ajuste de -5h antes de extraer el
// día (Ecuador=UTC-5, mismo offset que `_horasEntreHorarios()`/comentario
// "Ecuador = UTC-5" más abajo en este archivo): `fechaEnvio` es un
// instante UTC real, `fechaVencimientoPersonal` es una fecha de calendario
// Ecuador sin componente de hora -- comparar los milisegundos crudos sin
// este ajuste corría el riesgo de contar como "un día tarde" una entrega
// hecha de noche (hora Ecuador) del mismo día límite, que en UTC ya cae
// del otro lado de la medianoche. Extraída de `adminValidarTarea()`
// (antes inline ahí) para poder reusarla también en `getDesglosePuntos()`
// -- el desglose de "Puntos por tareas" necesita reconstruir el valor
// EXACTO que se acreditó por cada asignación aprobada, que nunca queda
// persistido por separado (solo el agregado mensual en
// `puntos_mensuales.puntos_tareas`) -- misma fórmula, un solo lugar.
function _puntosTareaCreditados(puntosOriginales: number, fechaVencimientoPersonal: string | null, fechaEnvio: string | null): number {
  let diasTarde = 0;
  if (fechaVencimientoPersonal && fechaEnvio) {
    const entregaLocalMs = new Date(fechaEnvio).getTime() - 5 * 3600000;
    const fechaEntregaLocal = new Date(entregaLocalMs).toISOString().substring(0, 10);
    const limiteMs = new Date(fechaVencimientoPersonal + 'T00:00:00Z').getTime();
    const entregaMs = new Date(fechaEntregaLocal + 'T00:00:00Z').getTime();
    diasTarde = Math.max(0, Math.round((entregaMs - limiteMs) / 86400000));
  }
  // Nunca menos de la mitad de los puntos originales -- si `diasTarde === 0`
  // esta misma fórmula ya da `puntosOriginales` (Math.max(x - 0, x/2) === x
  // para cualquier x >= 0), sin necesitar un caso aparte para "a tiempo".
  return Math.max(puntosOriginales - diasTarde, puntosOriginales / 2);
}

// Extraída de adminValidarTarea('aprobar') (antes inline ahí) para poder
// reusarla también desde enviarRevisionTarea() cuando quien completa la
// tarea es admin (aprobación automática, ver ese comentario más arriba) --
// mismo camino exacto en los 2 casos, una sola vez.
async function _aprobarAsignacionTarea(idAsignacion: string): Promise<Record<string, any>> {
  const { data: a } = await supabase.from('asignaciones_tareas').select('*').eq('id', idAsignacion).maybeSingle();
  if (!a) return { exito: false, error: 'Asignación no encontrada.' };
  // Bug real corregido (ver MANIFEST.md/CHANGELOG.md -- "puntos por
  // tareas inflados, 8 en vez de 2"): sin este guard, aprobar una
  // asignación que YA está `estado==='aprobada'` volvía a correr TODO el
  // camino de abajo -- `_acreditarPuntosTarea()` es aditivo
  // (select-then-update, suma sobre lo que ya había, mismo patrón que
  // `_acreditarPuntosExtra()`), así que cada re-aprobación sumaba los
  // puntos de la tarea de nuevo, sin ningún tope. Vector real
  // confirmado contra producción: `_tarGestionarToggle()`/js/tareas.js
  // (el toggle de "Gestión de tareas activas") es optimista y NO
  // deshabilita el control mientras la request está en vuelo -- a
  // diferencia de `_tarValidarEnviar()`/"Tareas por validar", que sí
  // bloquea los botones -- un doble-tap ahí puede disparar esta acción
  // más de una vez para la misma asignación. Mismo criterio que ya usa
  // `adminMarcarAsistencia()` (`esCorreccion`) para no inflar la racha
  // en re-marcados -- acá más simple: aprobar algo que YA está aprobado
  // no tiene ningún efecto nuevo que aplicar, se ignora sin error (la
  // UI ya muestra el estado que pidió, no hace falta fallar).
  if (a.estado === 'aprobada') return { exito: true };
  // `fechaEnvio` -- si la aprobación viene de enviarRevisionTarea() para un
  // admin (nunca pasó por 'pendiente_revision', `a.fecha_envio` sigue
  // `null`), se toma el instante actual como fecha de entrega real para el
  // cálculo de tardanza (`_puntosTareaCreditados()`) -- mismo criterio que
  // el flujo normal (fecha_envio = "cuándo se dio por completada").
  const fechaEnvio = a.fecha_envio ?? new Date().toISOString();
  await supabase.from('asignaciones_tareas').update({ estado: 'aprobada', fecha_envio: fechaEnvio, fecha_revision: new Date().toISOString() }).eq('id', idAsignacion);
  const { data: t } = await supabase.from('tareas').select('puntos').eq('id', a.tarea_id).maybeSingle();
  const puntosOriginales = Number(t?.puntos) || 0;
  const puntos = _puntosTareaCreditados(puntosOriginales, a.fecha_vencimiento_personal, fechaEnvio);
  const hoy = new Date();
  await _acreditarPuntosTarea(a.nombre_usuario, hoy.getFullYear(), hoy.getMonth() + 1, puntos);
  const { data: quedan } = await supabase.from('asignaciones_tareas').select('id').eq('tarea_id', a.tarea_id).in('estado', ['iniciada', 'pendiente_revision']);
  if (!quedan?.length) await supabase.from('tareas').update({ estado: 'archivada', fecha_archivado: hoy.toISOString() }).eq('id', a.tarea_id);
  return { exito: true };
}

async function adminValidarTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { idAsignacion, accion, notaRechazo } = params;
    if (accion === 'aprobar') {
    const r = await _aprobarAsignacionTarea(idAsignacion);
    if (r.exito) await _avisarRevisionTarea(idAsignacion, true);
    return r;
  }

  const { data: a } = await supabase.from('asignaciones_tareas').select('id').eq('id', idAsignacion).maybeSingle();
  if (!a) return { exito: false, error: 'Asignación no encontrada.' };
    await supabase.from('asignaciones_tareas').update({ estado: 'iniciada', nota_rechazo: notaRechazo ?? null, fecha_revision: new Date().toISOString() }).eq('id', idAsignacion);
  await _avisarRevisionTarea(idAsignacion, false, notaRechazo);
  return { exito: true };
}

async function adminDesvalidarTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { idAsignacion } = params;
  const { data: a } = await supabase.from('asignaciones_tareas').select('*').eq('id', idAsignacion).maybeSingle();
  if (!a) return { exito: false, error: 'Asignación no encontrada.' };
  if (a.estado === 'aprobada') {
    const { data: t } = await supabase.from('tareas').select('puntos, estado').eq('id', a.tarea_id).maybeSingle();
    const puntos = Number(t?.puntos) || 0;
    if (a.fecha_revision) {
      const fecha = new Date(a.fecha_revision);
      await _restarPuntosTarea(a.nombre_usuario, fecha.getFullYear(), fecha.getMonth() + 1, puntos);
    }
    if (t?.estado === 'archivada') await supabase.from('tareas').update({ estado: 'en_progreso' }).eq('id', a.tarea_id);
  }
  await supabase.from('asignaciones_tareas').update({ estado: 'pendiente_revision', nota_rechazo: null, fecha_revision: null }).eq('id', idAsignacion);
  return { exito: true };
}

async function adminGetTareasActivas(): Promise<any[]> {
  const { data: tareas } = await supabase.from('tareas').select('*').in('estado', ['no_iniciada', 'en_progreso', 'expirada']);
  if (!tareas?.length) return [];
  const ids = tareas.map((t: any) => t.id);
  const { data: asigs } = await supabase.from('asignaciones_tareas').select('*').in('tarea_id', ids).in('estado', ['iniciada', 'pendiente_revision', 'aprobada', 'rechazada']);
  const equipoPorNombre = await _mapaEquipoPorNombre();
  const asigPorTarea: Record<string, any[]> = {};
  (asigs ?? []).forEach((a: any) => {
    if (!asigPorTarea[a.tarea_id]) asigPorTarea[a.tarea_id] = [];
    const eq = equipoPorNombre[String(a.nombre_usuario).trim().toUpperCase()] ?? {};
    asigPorTarea[a.tarea_id].push({ idAsignacion: a.id, nombre: a.nombre_usuario, nombreDerby: eq.nombreDerby ?? '', fotoPerfil: eq.fotoPerfil ?? '', estado: a.estado });
  });
  return tareas.map((t: any) => ({ idTarea: t.id, titulo: t.titulo, area: t.area, puntos: t.puntos, fechaVencimiento: t.fecha_vencimiento, estado: t.estado, cuposTotales: t.max_asignados, asignaciones: asigPorTarea[t.id] ?? [] }));
}

async function getTareasArchivadas(): Promise<any[]> {
  const { data: tareas } = await supabase.from('tareas').select('*').eq('estado', 'archivada').order('fecha_archivado', { ascending: false });
  if (!tareas?.length) return [];
  const ids = tareas.map((t: any) => t.id);
  const { data: asigs } = await supabase.from('asignaciones_tareas').select('*').in('tarea_id', ids);
  const equipoPorNombre = await _mapaEquipoPorNombre();
  const asigPorTarea: Record<string, any[]> = {};
  (asigs ?? []).forEach((a: any) => {
    if (!asigPorTarea[a.tarea_id]) asigPorTarea[a.tarea_id] = [];
    const eq = equipoPorNombre[String(a.nombre_usuario).trim().toUpperCase()] ?? {};
    asigPorTarea[a.tarea_id].push({ nombre: a.nombre_usuario, nombreDerby: eq.nombreDerby ?? '', fotoPerfil: eq.fotoPerfil ?? '', estado: a.estado, fechaRevision: a.fecha_revision });
  });
  return tareas.map((t: any) => ({ idTarea: t.id, titulo: t.titulo, notas: t.notas, area: t.area, puntos: t.puntos, fechaVencimiento: t.fecha_vencimiento, fechaArchivado: t.fecha_archivado, personas: asigPorTarea[t.id] ?? [] }));
}

async function adminEliminarTareaArchivada(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { idTarea } = params;
  const { data: t } = await supabase.from('tareas').select('*').eq('id', idTarea).maybeSingle();
  if (!t) return { exito: false, error: 'Tarea no encontrada.' };
  if (t.estado !== 'archivada') return { exito: false, error: 'Solo se pueden eliminar tareas archivadas.' };
  const { data: aprobadas } = await supabase.from('asignaciones_tareas').select('*').eq('tarea_id', idTarea).eq('estado', 'aprobada');
  for (const a of (aprobadas ?? [])) {
    if (!a.fecha_revision) continue;
    const fecha = new Date(a.fecha_revision);
    await _restarPuntosTarea(a.nombre_usuario, fecha.getFullYear(), fecha.getMonth() + 1, Number(t.puntos) || 0);
  }
  await supabase.from('asignaciones_tareas').delete().eq('tarea_id', idTarea);
  await supabase.from('tareas').delete().eq('id', idTarea);
  return { exito: true, puntosRevertidos: (aprobadas ?? []).length };
}

async function adminArchivarTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { idTarea } = params;
  const { data: pendientes } = await supabase.from('asignaciones_tareas').select('id').eq('tarea_id', idTarea).eq('estado', 'pendiente_revision');
  if (pendientes?.length) return { exito: false, error: 'Hay revisiones pendientes. Valídalas antes de archivar.' };
  await supabase.from('asignaciones_tareas').delete().eq('tarea_id', idTarea).eq('estado', 'iniciada');
  await supabase.from('tareas').update({ estado: 'archivada', fecha_archivado: new Date().toISOString() }).eq('id', idTarea);
  return { exito: true };
}

// Tarea propia (2026-11-08): la persona propone y se asigna una tarea, con
// fecha límite -- por ejemplo, como compromiso de una subvención de cuota.
// Sin puntos al crearla (los decide admin al validarla, si corresponde).
async function crearTareaPropia(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const titulo = String(params.titulo ?? '').trim();
  const notas = String(params.notas ?? '').trim();
  const area = String(params.area ?? '').trim() || 'Otro';
  const fecha = String(params.fechaVencimiento ?? '').trim();
  if (titulo.length < 3 || titulo.length > 120) return { exito: false, error: 'Escribe un título de 3 a 120 caracteres.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { exito: false, error: 'Elige una fecha límite.' };
  const { data: creada, error } = await supabase.from('tareas').insert({
    titulo, notas: notas || null, area, puntos: 0, max_asignados: 1,
    fecha_vencimiento: fecha, estado: 'en_progreso', creado_por: username,
  }).select('id').maybeSingle();
  if (error || !creada) return { exito: false, error: 'No se pudo crear la tarea.' };
  await supabase.from('asignaciones_tareas').insert({ tarea_id: creada.id, nombre_usuario: username, estado: 'iniciada', es_rescate: false, fecha_vencimiento_personal: fecha });
  return { exito: true, idTarea: creada.id };
}


// ─── Tareas en la app Android (2026-11-08) ────────────────────────────────────
// Una sola llamada con todo lo que necesita la pestaña Tareas: mis tareas
// (con fecha y motivo de rechazo), el tablero activo (con o sin cupos), el
// baúl, el límite de tareas activas y los puntos del mes contra la meta del
// tier más alto que pide puntos (para "Sugeridas para ti").
async function getTareasApp(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const { anio, mes } = _mesEcuadorActual();
  const [{ data: tareas }, { data: mias }, limite, { data: pm }, { data: tiers }, equipoPorNombre] = await Promise.all([
    supabase.from('tareas').select('*').in('estado', ['no_iniciada', 'en_progreso', 'expirada']),
    supabase.from('asignaciones_tareas').select('*').eq('nombre_usuario', username).in('estado', ['iniciada', 'pendiente_revision']),
    _limiteTareasActivas(),
    supabase.from('puntos_mensuales').select('*').eq('nombre_usuario', username).eq('anio', anio).eq('mes', mes).maybeSingle(),
    supabase.from('config_tiers').select('nombre, min_puntos, min_clases, orden').order('orden'),
    _mapaEquipoPorNombre(),
  ]);
  const lista = tareas ?? [];
  const ids = lista.map((t: any) => t.id).concat((mias ?? []).map((a: any) => a.tarea_id));
  const { data: asigs } = ids.length
    ? await supabase.from('asignaciones_tareas').select('id, tarea_id, nombre_usuario, estado').in('estado', ['iniciada', 'pendiente_revision']).in('tarea_id', ids)
    : { data: [] as any[] };
  const porTarea: Record<string, any[]> = {};
  (asigs ?? []).forEach((a: any) => {
    const eq = equipoPorNombre[String(a.nombre_usuario).trim().toUpperCase()] ?? {};
    (porTarea[a.tarea_id] ??= []).push({ nombre: a.nombre_usuario, nombreDerby: eq.nombreDerby ?? '', fotoPerfil: eq.fotoPerfil ?? '', estado: a.estado, idAsignacion: a.id });
  });
  const armar = (t: any) => {
    const activas = porTarea[t.id] ?? [];
    return {
      idTarea: t.id, titulo: t.titulo, notas: t.notas ?? '', area: t.area ?? '', puntos: t.puntos, estado: t.estado,
      fechaVencimiento: t.fecha_vencimiento, cuposTotales: t.max_asignados, cuposLibres: Math.max(0, t.max_asignados - activas.length),
      asignados: activas, idPlantilla: t.tarea_recurrente_id ?? null, creadoPor: t.creado_por ?? '',
    };
  };
  const faltantes = (mias ?? []).filter((a: any) => !lista.some((t: any) => t.id === a.tarea_id)).map((a: any) => a.tarea_id);
  const { data: extra } = faltantes.length ? await supabase.from('tareas').select('*').in('id', faltantes) : { data: [] as any[] };
  const todas: Record<string, any> = {};
  [...lista, ...(extra ?? [])].forEach((t: any) => { todas[t.id] = t; });
  const misTareas = (mias ?? []).filter((a: any) => todas[a.tarea_id]).map((a: any) => ({
    idAsignacion: a.id, estado: a.estado, esRescate: a.es_rescate, fechaVencimiento: a.fecha_vencimiento_personal ?? todas[a.tarea_id].fecha_vencimiento,
    notaRechazo: a.estado === 'iniciada' ? (a.nota_rechazo ?? '') : '', tarea: armar(todas[a.tarea_id]),
  }));
  const puntosMes = pm ? Number(pm.puntos_total ?? 0) || (Number(pm.puntos_asistencia ?? 0) + Number(pm.puntos_tareas ?? 0) + Number(pm.puntos_bonificacion ?? 0) + Number(pm.puntos_extra ?? 0)) : 0;
    const meta = (tiers ?? []).find((t: any) => Number(t.min_puntos) > 0);
  // Tareas propias terminadas (aprobadas) del último año, para verlas en el
  // timeline el día en que se aprobaron (Victor, 2026-11-16).
  const { data: aprob } = await supabase.from('asignaciones_tareas').select('id, tarea_id, fecha_revision')
    .eq('nombre_usuario', username).eq('estado', 'aprobada').not('fecha_revision', 'is', null)
    .gte('fecha_revision', new Date(Date.now() - 366 * 86400000).toISOString());
  const idsAprob = [...new Set((aprob ?? []).map((a: any) => a.tarea_id))].filter((id) => !todas[id]);
  const { data: tareasAprob } = idsAprob.length ? await supabase.from('tareas').select('*').in('id', idsAprob) : { data: [] as any[] };
  (tareasAprob ?? []).forEach((t: any) => { todas[t.id] = t; });
  const terminadas = (aprob ?? []).filter((a: any) => todas[a.tarea_id]).map((a: any) => ({
    idAsignacion: a.id, estado: 'aprobada', fechaVencimiento: new Date(new Date(a.fecha_revision).getTime() - 5 * 3600000).toISOString().slice(0, 10), tarea: armar(todas[a.tarea_id]),
  }));
  return {
    exito: true,
    misTareas,
    terminadas,
    tablero: lista.filter((t: any) => t.estado !== 'expirada').map(armar),
    baul: lista.filter((t: any) => t.estado === 'expirada').map(armar).filter((x: any) => x.cuposLibres > 0),
    limite, iniciadas: (mias ?? []).filter((a: any) => a.estado === 'iniciada').length,
    puntosMes, meta: meta ? { nombre: meta.nombre, minPuntos: Number(meta.min_puntos), minClases: Number(meta.min_clases ?? 0) } : null,
  };
}

async function adminGetTareasRecurrentes(params: Record<string, any>): Promise<Record<string, any>> {
  if (!await _validarAdminToken(params.adminToken)) return { exito: false, error: 'Sesión admin inválida.' };
  const { data } = await supabase.from('tareas_recurrentes').select('*').neq('estado', 'terminada').order('created_at');
  return { exito: true, plantillas: (data ?? []).map((p: any) => ({
    idPlantilla: p.id, titulo: p.titulo, notas: p.notas ?? '', area: p.area ?? '', puntos: p.puntos, cuposTotales: p.max_asignados, estado: p.estado,
    unidad: p.unidad ?? 'mes', cadaN: p.cada_n ?? 1, inicio: p.inicio, venceEnDias: p.vence_en_dias, proxima: p.proxima,
    frecuencia: _textoRecurrencia(p.unidad ?? 'mes', Number(p.cada_n) || 1),
    personasFijas: p.personas_fijas ?? [],
  })) };
}

// Editar una recurrente "esta y las siguientes": cambia la plantilla y las
// instancias que todavía no se archivaron. "Solo esta" usa adminEditarTarea.
async function adminEditarTareaRecurrente(params: Record<string, any>): Promise<Record<string, any>> {
  if (!await _validarAdminToken(params.adminToken)) return { exito: false, error: 'Sesión admin inválida.' };
  let datos = params.datosJson ?? params.datos;
  if (typeof datos === 'string') datos = JSON.parse(datos);
  const cambios: Record<string, any> = {};
  if (datos.titulo != null) cambios.titulo = String(datos.titulo).trim();
  if (datos.notas != null) cambios.notas = String(datos.notas).trim() || null;
  if (datos.area != null) cambios.area = datos.area;
  if (datos.puntos != null) cambios.puntos = Number(datos.puntos) || 0;
  if (datos.maxAsignados != null) cambios.max_asignados = Math.max(1, Number(datos.maxAsignados) || 1);
  // Personas fijas (Victor, 2026-11-26): se asignan solas en cada repetición.
  const fijas = Array.isArray(datos.personasFijas) ? [...new Set(datos.personasFijas.map(String))].slice(0, 50) as string[] : null;
  if (!Object.keys(cambios).length && !fijas) return { exito: true };
  const { error } = await supabase.from('tareas_recurrentes').update({ ...cambios, ...(fijas ? { personas_fijas: fijas } : {}) }).eq('id', params.idPlantilla);
  if (error) return { exito: false, error: 'No se pudo guardar.' };
  if (Object.keys(cambios).length) await supabase.from('tareas').update(cambios).eq('tarea_recurrente_id', params.idPlantilla).in('estado', ['no_iniciada', 'en_progreso', 'expirada']);
  return { exito: true };
}

// ─── Bandeja de Pivots (etapa 3, Victor 2026-11-12) ───────────────────
// Todo lo que espera una decisión de un Pivot, en una sola llamada: pagos
// y reservas pendientes, rectificaciones de asistencia, excepciones de
// cuota (solo las dirigidas a este Pivot), lesiones y tareas por validar.
// Cada parte filtra en la base (nunca la tabla completa).
async function adminBandeja(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { data: prestPend } = await supabase.from('inventario_prestamos').select('id, username, articulo, detalle, created_at, tipo, motivo, permanente').eq('estado', 'pendiente').order('created_at');
  try { await _descartarSinComprobante(); } catch (e) { console.error('[bandeja] descartar:', e); }
  const [res, rect, exc, les, asig] = await Promise.all([
        supabase.from('reservas').select('id, nombre_usuario, id_evento, tipo, mes_texto, talla, protecciones, monto, fecha_pago, uso_cupon, created_at, medio_pago, medio_nombre, saldo_aplicado, comprobante_path, comprobante_subido_en, comprobante_avisos, comprobante_limite').eq('estado', 'Pendiente').order('created_at', { ascending: true }),
        supabase.from('rectificaciones_asistencia').select('id, nombre, id_evento, fecha_evento, estado_solicitado, created_at').eq('decision', 'Pendiente')
      .gte('created_at', new Date(Date.now() - (await _diasRectificacion()) * 86400000).toISOString()).order('created_at', { ascending: true }),
    supabase.from('solicitudes_excepcion').select('id, nombre, tipo, datos, mes_aplicacion, created_at, admins_destino').eq('estado', 'pendiente').order('created_at', { ascending: true }),
        supabase.from('equipo').select('username, solicitud_estado, solicitud_estado_en').or('solicitud_lesion_pendiente.eq.true,solicitud_estado.not.is.null').is('eliminado_en', null),
    supabase.from('asignaciones_tareas').select('id, tarea_id, nombre_usuario, fecha_envio').eq('estado', 'pendiente_revision').order('fecha_envio', { ascending: true }),
  ]);
    const excVisibles: any[] = [];
  for (const r of exc.data ?? []) if (await _puedeVerExcepcion(adminEmail, r.admins_destino)) excVisibles.push(r);
  // Lo que pidió este mismo Pivot lo resuelve otro (Victor, 2026-11-13),
  // salvo que sea el único Pivot de la liga.
  const pivots = await _administradorxs();
  const yoPivot = pivots.find((a) => a.email === String(adminEmail).toLowerCase())?.username ?? null;
  const ajeno = (u: unknown) => !yoPivot || pivots.length <= 1 || String(u) !== yoPivot;
  if (res.data) res.data = res.data.filter((r: any) => ajeno(r.nombre_usuario));
  if (rect.data) rect.data = rect.data.filter((r: any) => ajeno(r.nombre));
  if (les.data) les.data = les.data.filter((r: any) => ajeno(r.username));
  if (asig.data) asig.data = asig.data.filter((r: any) => ajeno(r.nombre_usuario));
  for (let i = excVisibles.length - 1; i >= 0; i--) if (!ajeno(excVisibles[i].nombre)) excVisibles.splice(i, 1);
  const prestPendAjenos = (prestPend ?? []).filter((p: any) => ajeno(p.username));


  // Datos de apoyo: eventos, tareas y personas mencionadas.
  const idsEv = [...new Set([...(res.data ?? []).map((r: any) => r.id_evento), ...(rect.data ?? []).map((r: any) => r.id_evento)].filter(Boolean))];
  const idsTarea = [...new Set((asig.data ?? []).map((a: any) => a.tarea_id))];
  const nombres = [...new Set([
    ...(res.data ?? []).map((r: any) => r.nombre_usuario), ...(rect.data ?? []).map((r: any) => r.nombre),
    ...excVisibles.map((r: any) => r.nombre), ...(les.data ?? []).map((r: any) => r.username), ...(asig.data ?? []).map((a: any) => a.nombre_usuario),
        ...prestPendAjenos.map((p: any) => p.username),
  ].filter(Boolean))];
  const [evs, tareas, personas] = await Promise.all([
    idsEv.length ? supabase.from('asistencias').select('id_evento, fecha, donde, inicia, tipo_evento').in('id_evento', idsEv) : Promise.resolve({ data: [] as any[] }),
    idsTarea.length ? supabase.from('tareas').select('id, titulo, puntos, area').in('id', idsTarea) : Promise.resolve({ data: [] as any[] }),
    nombres.length ? supabase.from('equipo').select('username, nombre_derby, foto_perfil, categoria').in('username', nombres) : Promise.resolve({ data: [] as any[] }),
  ]);
  const ev: Record<string, any> = {}; (evs.data ?? []).forEach((e: any) => { ev[e.id_evento] = e; });
  const ta: Record<string, any> = {}; (tareas.data ?? []).forEach((t: any) => { ta[t.id] = t; });
  const pe: Record<string, any> = {}; (personas.data ?? []).forEach((p: any) => { pe[p.username] = p; });
  const persona = (u: string) => ({ nombre: u, nombreMostrar: pe[u]?.nombre_derby || u, foto: pe[u]?.foto_perfil || '', categoria: pe[u]?.categoria || '' });
  const evento = (id: string) => ev[id] ? { idEvento: id, fecha: ev[id].fecha, lugar: ev[id].donde ?? '', hora: String(ev[id].inicia ?? '').substring(0, 5), tipo: ev[id].tipo_evento ?? '' } : null;

    // Comprobantes: enlace firmado que vence en 30 minutos (nunca público).
  const firmas: Record<string, string> = {};
  const conComp = (res.data ?? []).filter((r: any) => r.comprobante_path);
  if (conComp.length) {
    const { data: f } = await supabase.storage.from('comprobantes').createSignedUrls(conComp.map((r: any) => r.comprobante_path), 1800);
    (f ?? []).forEach((x: any, i: number) => { if (x?.signedUrl) firmas[conComp[i].id] = x.signedUrl; });
  }
  const items = {
    reservas: (res.data ?? []).map((r: any) => ({
      comprobante: firmas[r.id] ?? '', sinComprobante: Number(r.monto) > 0 && !r.comprobante_subido_en, comprobanteAvisos: Number(r.comprobante_avisos) || 0,
      comprobanteLimite: !r.comprobante_subido_en ? r.comprobante_limite ?? null : null,
      id: r.id, ...persona(r.nombre_usuario), tipo: r.tipo, mesTexto: r.mes_texto ?? '', talla: r.talla ?? '', protecciones: r.protecciones ?? '',
      monto: Number(r.monto) || 0, usoCupon: !!r.uso_cupon, creada: r.created_at, evento: evento(r.id_evento), medio: r.medio_pago ?? '', medioNombre: r.medio_nombre ?? '', fechaPago: r.fecha_pago ?? null, saldoAplicado: Number(r.saldo_aplicado) || 0,
    })),
    rectificaciones: (rect.data ?? []).map((r: any) => ({ id: r.id, ...persona(r.nombre), estadoSolicitado: r.estado_solicitado, fechaEvento: r.fecha_evento, creada: r.created_at, evento: evento(r.id_evento) })),
    excepciones: excVisibles.map((r: any) => ({ id: r.id, ...persona(r.nombre), tipo: r.tipo, datos: r.datos, mesAplicacion: r.mes_aplicacion, creada: r.created_at })),
        lesiones: (les.data ?? []).map((r: any) => ({ ...persona(r.username), estado: r.solicitud_estado ?? 'Lesionadx', creada: r.solicitud_estado_en ?? null })),
        prestamos: prestPendAjenos.map((p: any) => ({ id: p.id, ...persona(p.username), articulo: p.articulo, detalle: p.detalle ?? '', creada: p.created_at, tipo: p.tipo ?? 'salida', motivo: p.motivo ?? '', permanente: !!p.permanente })),
    tareas: (asig.data ?? []).map((a: any) => ({
      idAsignacion: a.id, ...persona(a.nombre_usuario), enviada: a.fecha_envio,
      tarea: ta[a.tarea_id] ? { idTarea: a.tarea_id, titulo: ta[a.tarea_id].titulo, puntos: Number(ta[a.tarea_id].puntos) || 0, area: ta[a.tarea_id].area ?? '' } : null,
    })),
  };
      // Cambios de equipo por revisar (modo "Revisar antes"): desde que llega la lista hasta el corte.
  const corte = await _corteEquipos();
  let cambiosEquipo: any[] = [];
    if (corte.modo === 'revisar') {
    // También los pendientes de cortes anteriores (si no se aprueban solos).
    const { data: ce } = await supabase.from('cambios_equipo').select('id, username, de, a, mes').lte('mes', corte.mes).eq('estado', 'pendiente').order('created_at');
    if (_hoyEcuadorISO() < corte.llega) (ce ?? []).splice(0, (ce ?? []).length, ...(ce ?? []).filter((c: any) => c.mes < corte.mes));
    const faltan = (ce ?? []).map((c: any) => c.username).filter((u: string) => !pe[u]);
    if (faltan.length) {
      const { data: mas } = await supabase.from('equipo').select('username, nombre_derby, foto_perfil, categoria').in('username', faltan);
      (mas ?? []).forEach((p: any) => { pe[p.username] = p; });
    }
        const { data: tiersOrden } = await supabase.from('config_tiers').select('nombre, orden');
    const orden: Record<string, number> = {};
    (tiersOrden ?? []).forEach((t: any) => { orden[t.nombre] = Number(t.orden) || 0; });
    cambiosEquipo = (ce ?? []).map((c: any) => ({ id: c.id, ...persona(c.username), de: c.de ?? '', a: c.a, corte: corte.fecha, sube: (orden[c.a] ?? 99) < (orden[c.de] ?? 99) }));
  }
    (items as Record<string, any[]>).cambiosEquipo = cambiosEquipo;
  // Pedidos de revisión de un cambio de equipo (Victor, 2026-11-16).
  const { data: rev } = await supabase.from('equipo').select('username, nombre_derby, foto_perfil, revision_cambio').not('revision_cambio', 'is', null).is('eliminado_en', null);
  (items as Record<string, any[]>).revisionesEquipo = (rev ?? []).filter((r: any) => ajeno(r.username)).map((r: any) => ({
    id: r.username, nombre: r.username, nombreMostrar: r.nombre_derby || r.username, foto: r.foto_perfil ?? '',
    de: r.revision_cambio?.de ?? '', a: r.revision_cambio?.a ?? '', mensaje: r.revision_cambio?.mensaje ?? '', creada: r.revision_cambio?.pedida ?? null,
  }));
    // Pedidos para ser coach (Victor, 2026-11-16).
  const { data: pc } = await supabase.from('coaches').select('username, mensaje, pedido_en').eq('estado', 'pendiente');
  const quienC = (pc ?? []).length ? await _mapaEquipoPorNombre() : {};
  (items as Record<string, any[]>).coaches = (pc ?? []).filter((r: any) => ajeno(r.username)).map((r: any) => {
    const q = quienC[String(r.username).trim().toUpperCase()] ?? {};
    return { id: r.username, nombre: r.username, nombreMostrar: q.nombreDerby || r.username, foto: q.fotoPerfil ?? '', mensaje: r.mensaje ?? '', creada: r.pedido_en };
  });
  // Cada Pivot ve solo lo de sus áreas (2026-11-13).
  const areas = await _areasDe(adminEmail);
  const areaDe: Record<string, string> = { reservas: 'finanzas', excepciones: 'finanzas', rectificaciones: 'asistencia', lesiones: 'salud', prestamos: 'inventario', tareas: 'tareas', cambiosEquipo: 'equipo', revisionesEquipo: 'equipo', coaches: 'equipo' };
  for (const k of Object.keys(items)) if (!areas.includes(areaDe[k])) (items as Record<string, any[]>)[k] = [];
  // Social o fiesta por aprobar (Victor, 2026-11-20): para todo Pivot que
  // pueda aprobarlo (nunca homenajeadxs ni quienes no deben enterarse).
  try { (items as Record<string, any[]>).sociales = await socialPorAprobar(adminEmail, _depsSocial()); } catch (e) { console.error('[bandeja] sociales:', e); }
  const total = Object.values(items).reduce((n, l) => n + l.length, 0);
  // Pagos sin terminar (Victor, 2026-11-27): quien salió a pagar o dejó la
  // suscripción a medias hace más de 15 min. Solo informativo, no suma al total.
  let sinTerminar: any[] = [];
  if (areas.includes('finanzas')) {
    const { data: enc } = await supabase.from('reservas_en_curso').select('nombre, detalle, creado_en, pago_en, medio_nombre')
      .lt('creado_en', new Date(Date.now() - 15 * 60000).toISOString()).order('creado_en', { ascending: false }).limit(50);
    const us = [...new Set((enc ?? []).map((f: any) => f.nombre))];
    const { data: pe } = us.length ? await supabase.from('equipo').select('username, nombre_derby, foto_perfil').in('username', us) : { data: [] as any[] };
    const q: Record<string, any> = {}; (pe ?? []).forEach((x: any) => { q[x.username] = x; });
    sinTerminar = (enc ?? []).map((f: any) => ({
      nombre: f.nombre, nombreMostrar: q[f.nombre]?.nombre_derby || f.nombre, foto: q[f.nombre]?.foto_perfil ?? '',
      detalle: f.detalle ?? '', desde: f.creado_en, pagoEn: f.pago_en, medio: f.medio_nombre ?? '',
    }));
  }
  return { exito: true, total, ...items, areas, sinTerminar };
}

// ─── Escrituras que la web y la app hacían directo a la base ───────────
// (seguridad, 2026-11-13). La clave pública ya no puede escribir: estas
// escrituras pasan por aquí con el mismo formato de PostgREST
// (`tabla?col=eq.valor&col2=gte.valor`) y se valida quién escribe:
// - reglas_asistencia: la persona, solo las suyas.
// - asistencias, venues, log_asistencias: solo Pivots.
const ESCRITURA_TABLAS_PIVOT = ['asistencias', 'venues', 'log_asistencias'];

function _filtrosPostgrest(q: any, qs: URLSearchParams): { q: any; n: number } {
  let n = 0;
  for (const [col, expr] of qs.entries()) {
    if (['select', 'order', 'limit'].includes(col)) continue;
    if (!/^[a-z_]+$/.test(col)) throw new Error('Columna inválida');
    const p = expr.indexOf('.');
    const op = expr.slice(0, p), val = expr.slice(p + 1);
    if (op === 'eq') q = q.eq(col, val);
    else if (op === 'neq') q = q.neq(col, val);
    else if (op === 'gte') q = q.gte(col, val);
    else if (op === 'lte') q = q.lte(col, val);
    else if (op === 'gt') q = q.gt(col, val);
    else if (op === 'lt') q = q.lt(col, val);
    else if (op === 'in') {
      const lista = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
      q = q.in(col, lista);
    } else throw new Error('Filtro inválido');
    n++;
  }
  return { q, n };
}

async function escrituraDirecta(params: Record<string, any>): Promise<Record<string, any>> {
  const ruta = String(params.ruta ?? '');
  const metodo = String(params.metodo ?? '').toUpperCase();
  const [tabla, consulta = ''] = ruta.split('?');
  const qs = new URLSearchParams(consulta);
  let cuerpo: any = null;
  if (params.cuerpo) { try { cuerpo = JSON.parse(String(params.cuerpo)); } catch { return { exito: false, error: 'Datos inválidos.' }; } }
  if (!['POST', 'PATCH', 'DELETE'].includes(metodo)) return { exito: false, error: 'Operación inválida.' };

  if (tabla === 'reglas_asistencia') {
    const yo = await _validarToken(String(params.token ?? ''));
    if (!yo) return { exito: false, error: 'Inicia sesión de nuevo.' };
    if (metodo === 'POST') {
      const filas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map((f: any) => ({ ...f, nombre: yo }));
      const { data, error } = await supabase.from('reglas_asistencia').insert(filas).select();
      return error ? { exito: false, error: 'No se pudo guardar.' } : { exito: true, filas: data ?? [] };
    }
    // Editar o borrar: solo reglas propias.
    let q: any = metodo === 'DELETE' ? supabase.from('reglas_asistencia').delete() : supabase.from('reglas_asistencia').update({ ...(cuerpo ?? {}), nombre: yo });
    try { const r = _filtrosPostgrest(q, qs); if (!r.n) return { exito: false, error: 'Falta el filtro.' }; q = r.q; } catch { return { exito: false, error: 'Filtro inválido.' }; }
    const { data, error } = await q.eq('nombre', yo).select();
    return error ? { exito: false, error: 'No se pudo guardar.' } : { exito: true, filas: data ?? [] };
  }

  if (ESCRITURA_TABLAS_PIVOT.includes(tabla)) {
    if (!(await _validarAdminToken(String(params.adminToken ?? '')))) return { exito: false, error: 'Sesión admin inválida.' };
    if (tabla === 'log_asistencias' && metodo !== 'DELETE') return { exito: false, error: 'Operación inválida.' };
    if (metodo === 'POST') {
      const { data, error } = await supabase.from(tabla).insert(cuerpo).select();
      return error ? { exito: false, error: error.message } : { exito: true, filas: data ?? [] };
    }
    let q: any = metodo === 'DELETE' ? supabase.from(tabla).delete() : supabase.from(tabla).update(cuerpo ?? {});
    try { const r = _filtrosPostgrest(q, qs); if (!r.n) return { exito: false, error: 'Falta el filtro.' }; q = r.q; } catch { return { exito: false, error: 'Filtro inválido.' }; }
    const { data, error } = await q.select();
    return error ? { exito: false, error: error.message } : { exito: true, filas: data ?? [] };
  }
  return { exito: false, error: 'Tabla no permitida.' };
}

// ─── Inventario para todo el equipo (Victor, 2026-11-12) ───────────────
// Todas las personas ven cuánto hay por talla y cuánto queda libre en la
// próxima clase, y quién tiene cosas del equipo. Solo Pivots ven quién
// reservó y editan cantidades. Préstamos (`inventario_prestamos`): la
// persona avisa que se llevó algo (un Pivot lo aprueba) o un Pivot lo
// registra; a los 7 días se pregunta a los Pivots si aún lo tiene.
const ARTICULOS_INVENTARIO = ['patines', 'protecciones', 'otro'];

// ─── Inventario personalizable (Victor, 2026-11-13) ──────────────────────
// Listas que crea cada liga: con tallas (patines), sets de piezas
// (protecciones), unidades (conos) o insumos (cinta). "Patines" y
// "Protecciones" son del sistema: su stock se copia a equipamiento_tallas y
// config_equipamiento, que usan las reservas de clases.
// Préstamos (`inventario_prestamos`):
// - tipo 'salida': alguien se llevó algo. Temporal (recordatorio cada 7 días
//   a Pivots y a la persona, que responde "Ya lo devolví" o "Aún no") o
//   permanente (lo tiene siempre, ej. trae los conos a cada entrenamiento).
// - tipo 'uso': alguien de una Categoría/Equipo que no usa equipamiento lo
//   pide por un tiempo (se le rompió, lo está lavando). Un Pivot decide
//   cuánto dura y si se lo lleva a casa o un Pivot lo trae; mientras dure no
//   baja de Categoría/Equipo por usarlo (recalcular-categorias).
type ListaInv = { id: string; nombre: string; tipo: string; icono: string | null; piezas: { nombre: string; cantidad: number }[]; unidad: string | null; sistema: string | null; orden: number; seccion: string; activa: boolean };

async function _listasInventario(): Promise<{ listas: ListaInv[]; stock: any[] }> {
  const [{ data: listas }, { data: stock }] = await Promise.all([
    supabase.from('inventario_listas').select('*').order('orden').order('created_at'),
        supabase.from('inventario_stock').select('lista_id, variante, cantidad, vence, minimo, etiqueta, foto'),
  ]);
  return {
    listas: (listas ?? []).map((l: any) => ({ ...l, piezas: Array.isArray(l.piezas) ? l.piezas.map((p: any) => ({ nombre: String(p.nombre), cantidad: Number(p.cantidad) || 1 })) : [] })),
    stock: stock ?? [],
  };
}

function _textoPrestamo(p: any, l: ListaInv | undefined): string {
  if (!l) return _textoArticulo(p.articulo, p.detalle ?? '');
  const nombre = l.nombre.toLowerCase();
  const n = Number(p.cantidad) || 1;
  const lista = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
  if (l.tipo === 'tallas') return `${n > 1 ? n + ' ' : ''}${nombre} talla ${p.variante ?? ''}`.trim();
  if (l.tipo === 'set') {
    const piezas = Array.isArray(p.piezas) ? p.piezas : [];
    const completo = piezas.length === l.piezas.length && l.piezas.every((x) => piezas.some((y: any) => y.nombre === x.nombre && Number(y.cantidad) === x.cantidad * n));
    if (completo || !piezas.length) return n > 1 ? `${n} sets de ${nombre}` : `un set de ${nombre}`;
    return `${nombre} (${lista(piezas.map((y: any) => `${y.cantidad} ${String(y.nombre).toLowerCase()}`))})`;
  }
    if (l.tipo === 'insumo') return p.variante ? `${n} ${String(p.variante).toLowerCase()}` : `${n} ${l.unidad ? l.unidad + ' de ' : ''}${nombre}`;
  return `${n} ${nombre}`;
}

/** Copia el stock de las listas del sistema a las tablas que usan las reservas. */
async function _sincronizarSistema(listaId: string): Promise<void> {
  const { data: l } = await supabase.from('inventario_listas').select('sistema, piezas').eq('id', listaId).maybeSingle();
  if (!l?.sistema) return;
  const { data: st } = await supabase.from('inventario_stock').select('variante, cantidad').eq('lista_id', listaId);
  if (l.sistema === 'patines') {
    const { data: viejas } = await supabase.from('equipamiento_tallas').select('id');
    for (const f of viejas ?? []) await supabase.from('equipamiento_tallas').delete().eq('id', f.id);
    const filas = (st ?? []).filter((x: any) => Number(x.cantidad) > 0).map((x: any) => ({ talla: x.variante, cantidad: Number(x.cantidad) }));
    if (filas.length) await supabase.from('equipamiento_tallas').insert(filas);
  } else if (l.sistema === 'protecciones') {
    const piezas = Array.isArray(l.piezas) ? l.piezas : [];
    const sets = piezas.length ? Math.min(...piezas.map((p: any) => Math.floor((Number((st ?? []).find((x: any) => x.variante === p.nombre)?.cantidad) || 0) / (Number(p.cantidad) || 1)))) : 0;
    const { data: cfg } = await supabase.from('config_equipamiento').select('id').limit(1).maybeSingle();
    if (cfg) await supabase.from('config_equipamiento').update({ total_protecciones: sets }).eq('id', cfg.id);
    else await supabase.from('config_equipamiento').insert({ total_protecciones: sets });
  }
}

async function getInventario(params: Record<string, any>): Promise<Record<string, any>> {
  const esPivot = !!(await _validarAdminToken(String(params.adminToken ?? '')));
  const yo = esPivot ? await _validarToken(String(params.token ?? '')) : await _validarToken(String(params.token ?? ''));
  if (!esPivot && !yo) return { exito: false, error: 'Inicia sesión.' };
  const [{ listas, stock }, proximos, { data: prest }] = await Promise.all([
    _listasInventario(),
    _proximosEntrenamientos(),
    supabase.from('inventario_prestamos').select('*').in('estado', ['activo', 'pendiente']).order('desde'),
  ]);
    // Listas ocultas (interruptor de Pivots): el resto del equipo no las ve.
  const visiblesListas = esPivot ? listas : listas.filter((l) => l.activa !== false);
  const regla = yo ? await _reglaPrestamoPara(yo) : null;
  const enUso: Record<string, number> = {}; // `${lista}|${variante}`
  const sumar = (lista: string, variante: string, n: number) => { const k = lista + '|' + variante; enUso[k] = (enUso[k] ?? 0) + n; };
  const porId: Record<string, ListaInv> = {}; listas.forEach((l) => { porId[l.id] = l; });
  // Reservas de la próxima clase (solo listas del sistema).
  const proxima = proximos[0] ?? null;
  if (proxima) {
        const { data } = await supabase.from('reservas').select('talla, protecciones, equipo').eq('id_evento', proxima.idEvento).neq('estado', 'Cancelada');
    const pat = listas.find((l) => l.sistema === 'patines'), pro = listas.find((l) => l.sistema === 'protecciones');
    for (const r of data ?? []) {
      if (pat && r.talla && r.talla !== 'No') sumar(pat.id, String(r.talla), 1);
      if (pro && r.protecciones && r.protecciones !== 'No') for (const p of pro.piezas) sumar(pro.id, p.nombre, p.cantidad);
      // Listas propias de la liga (Victor, 2026-11-17).
      for (const [id, v] of Object.entries((r.equipo as Record<string, string>) ?? {})) {
        const l = porId[id];
        if (!l) continue;
        if (l.tipo === 'tallas') sumar(id, String(v), 1);
        else if (l.tipo === 'set') for (const p of l.piezas) sumar(id, p.nombre, p.cantidad);
        else sumar(id, '', 1);
      }
    }
  }
  const activos = (prest ?? []).filter((p: any) => p.estado === 'activo');
  for (const p of activos) {
    const l = p.lista_id ? porId[p.lista_id] : undefined;
    if (!l) continue;
    if (l.tipo === 'set') for (const x of (Array.isArray(p.piezas) ? p.piezas : [])) sumar(l.id, String(x.nombre), Number(x.cantidad) || 0);
    else sumar(l.id, l.tipo === 'tallas' ? String(p.variante ?? '') : '', Number(p.cantidad) || 1);
  }
  const visibles = (prest ?? []).filter((p: any) => p.estado === 'activo' || esPivot || p.username === yo);
  const usuarios = [...new Set(visibles.map((p: any) => p.username))];
  const { data: per } = usuarios.length ? await supabase.from('equipo').select('username, nombre_derby, foto_perfil').in('username', usuarios) : { data: [] as any[] };
  const pe: Record<string, any> = {}; (per ?? []).forEach((p: any) => { pe[p.username] = p; });
  const ahora = Date.now();
  return {
    exito: true,
    esPivot,
    proxima: proxima ? { idEvento: proxima.idEvento, fecha: proxima.fecha, lugar: proxima.donde, hora: proxima.horaInicio } : null,
        reglaPrestamo: regla,
    listas: visiblesListas.map((l) => {
      const st = stock.filter((x: any) => x.lista_id === l.id);
      const variantes = l.tipo === 'set' ? l.piezas.map((p) => p.nombre) : l.tipo === 'tallas' ? st.map((x: any) => x.variante) : [''];
      const filas = variantes.map((v: string) => {
        const total = Number(st.find((x: any) => x.variante === v)?.cantidad) || 0;
        const uso = enUso[l.id + '|' + v] ?? 0;
                const f = st.find((x: any) => x.variante === v);
                return { variante: v, cantidad: total, enUso: uso, libres: Math.max(0, total - uso), vence: f?.vence ?? null, minimo: f?.minimo == null ? null : Number(f.minimo), etiqueta: f?.etiqueta ?? null, foto: f?.foto ?? null };
      });
            if (l.seccion === 'botiquin' || l.tipo === 'insumo') {
        // El botiquín y los insumos tienen un renglón por cosa (variante = nombre).
        filas.length = 0;
        for (const x of st) {
          const uso = enUso[l.id + '|' + x.variante] ?? 0;
                    filas.push({ variante: x.variante, cantidad: Number(x.cantidad) || 0, enUso: uso, libres: Math.max(0, (Number(x.cantidad) || 0) - uso), vence: x.vence ?? null, minimo: x.minimo == null ? null : Number(x.minimo), etiqueta: x.etiqueta ?? null, foto: x.foto ?? null });
        }
        filas.sort((a: any, b: any) => String(a.variante).localeCompare(String(b.variante)));
      }
      if (l.tipo === 'tallas') filas.sort((a: any, b: any) => (parseFloat(a.variante) || 0) - (parseFloat(b.variante) || 0) || String(a.variante).localeCompare(String(b.variante)));
      const sets = l.tipo === 'set' && l.piezas.length
        ? {
          completos: Math.min(...l.piezas.map((p) => Math.floor((filas.find((f: any) => f.variante === p.nombre)?.cantidad ?? 0) / p.cantidad))),
          libres: Math.min(...l.piezas.map((p) => Math.floor((filas.find((f: any) => f.variante === p.nombre)?.libres ?? 0) / p.cantidad))),
        }
        : null;
                        return { id: l.id, nombre: l.nombre, tipo: l.tipo, icono: l.icono, unidad: l.unidad, sistema: l.sistema, piezas: l.piezas, stock: filas, sets, seccion: l.seccion ?? 'equipamiento', activa: l.activa !== false, foto: (l as any).foto ?? null, paraEntrenar: (l as any).para_entrenar === true };
    }),
    prestamos: visibles.map((p: any) => {
      const l = p.lista_id ? porId[p.lista_id] : undefined;
            const temporal = !p.permanente && p.plazo !== 'dia' && (p.tipo !== 'uso' || p.entrega === 'casa');
      return {
        id: p.id, nombre: p.username, nombreMostrar: pe[p.username]?.nombre_derby || p.username, foto: pe[p.username]?.foto_perfil || '',
        listaId: p.lista_id, lista: l?.nombre ?? '', icono: l?.icono ?? null, texto: _textoPrestamo(p, l),
        variante: p.variante ?? '', cantidad: Number(p.cantidad) || 1, piezas: p.piezas ?? [],
        estado: p.estado, desde: p.desde, dias: Math.floor((ahora - new Date(p.desde).getTime()) / 86400000),
                permanente: !!p.permanente, tipo: p.tipo ?? 'salida', hasta: p.hasta, entrega: p.entrega, motivo: p.motivo ?? '',
        plazo: p.plazo ?? (p.permanente ? null : p.hasta ? 'fecha' : 'indefinido'), recordarCada: p.recordar_cada_dias ?? 7,
                preguntar: esPivot && p.estado === 'activo' && temporal && _tocaPreguntar(p, p.aviso_7d_en),
        preguntarme: p.username === yo && p.estado === 'activo' && temporal && _tocaPreguntar(p, p.aviso_persona_en),
        mio: p.username === yo,
      };
    }),
  };
}

/** ¿Toca preguntar si aún lo tiene? Con fecha: desde que vence. Si no, cada N días. */
function _tocaPreguntar(p: any, ultimoAviso: string | null): boolean {
  const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  if (p.plazo === 'fecha') return !!p.hasta && p.hasta <= hoy;
  const cada = Math.max(1, Number(p.recordar_cada_dias) || 7) * 86400000;
  return Date.now() - new Date(ultimoAviso ?? p.desde).getTime() >= cada;
}

function _textoArticulo(articulo: string, detalle: string): string {
  if (articulo === 'patines') return detalle ? `patines talla ${detalle}` : 'patines';
  if (articulo === 'protecciones') return detalle ? `protecciones (${detalle})` : 'protecciones';
  return detalle || 'equipamiento del equipo';
}

/** Fila nueva de préstamo validada contra la lista. */
async function _filaPrestamo(params: Record<string, any>): Promise<{ fila?: Record<string, any>; lista?: ListaInv; error?: string }> {
  const { listas } = await _listasInventario();
  const l = listas.find((x) => x.id === String(params.listaId ?? ''));
  if (!l) return { error: 'Elige qué equipamiento.' };
  const cantidad = Math.max(1, Math.min(999, Number(params.cantidad) || 1));
  let piezas: any = params.piezas;
  if (typeof piezas === 'string') { try { piezas = JSON.parse(piezas); } catch { piezas = null; } }
  const fila: Record<string, any> = {
    lista_id: l.id, cantidad, articulo: l.sistema ?? 'otro', permanente: params.permanente === true || params.permanente === 'true',
    motivo: String(params.motivo ?? '').trim().slice(0, 120) || null,
  };
    if (l.tipo === 'tallas' || l.tipo === 'insumo') {
    fila.variante = String(params.variante ?? '').trim();
    if (!fila.variante) return { error: l.tipo === 'tallas' ? 'Elige la talla.' : 'Elige qué.' };
  } else if (l.tipo === 'set') {
    const lista = (Array.isArray(piezas) ? piezas : []).map((x: any) => ({ nombre: String(x.nombre), cantidad: Math.max(0, Number(x.cantidad) || 0) }))
      .filter((x: any) => x.cantidad > 0 && l.piezas.some((p) => p.nombre === x.nombre));
    fila.piezas = lista.length ? lista : l.piezas.map((p) => ({ nombre: p.nombre, cantidad: p.cantidad * cantidad }));
    if (!lista.length) fila.cantidad = cantidad; else fila.cantidad = 1;
  }
  fila.detalle = _textoPrestamo(fila, l);
  return { fila, lista: l };
}

// La persona avisa que se llevó algo (tipo 'salida') o pide usar
// equipamiento del equipo (tipo 'uso'); queda pendiente para un Pivot.
async function pedirPrestamo(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const r = await _filaPrestamo(params);
  if (r.error) return { exito: false, error: r.error };
    const tipo = params.tipo === 'uso' ? 'uso' : 'salida';
  // Reglas de préstamo del equipo de la persona.
  const regla = tipo === 'uso' ? await _reglaPrestamoPara(yo, r.lista!.id) : { presta: 'excepcional', id: null };
  if (regla.presta === 'no') return { exito: false, error: 'Por ahora tu equipo no presta este equipamiento. Si lo necesitas, habla con un Pivot.' };
  const { data: nuevo, error } = await supabase.from('inventario_prestamos')
    .insert({ ...r.fila, username: yo, estado: 'pendiente', pedido_por: 'persona', tipo, permanente: tipo === 'uso' ? false : r.fila!.permanente }).select('id').maybeSingle();
  if (error) return { exito: false, error: 'No se pudo enviar.' };
    const pivot = await _pedidoDePivot(yo);
  // 'si' = se presta: se aprueba solo para el día (un Pivot puede editarlo).
  if ((pivot.auto || (tipo === 'uso' && regla.presta === 'si')) && nuevo?.id) {
    await adminPrestamo({ adminToken: _TOKEN_INTERNO, accion: 'aprobar', id: nuevo.id, plazo: 'dia', entrega: 'pivot' });
    return { exito: true, aprobada: true };
  }
  const { data: f } = await supabase.from('equipo').select('nombre_derby').eq('username', yo).maybeSingle();
  const quien = f?.nombre_derby || yo;
  await sendPush({
    tipo: 'avisos_admin', include_external_user_ids: await _adminDestinatariosPush(pivot.email ?? undefined, 'inventario', 'pedidos'),
    headings: { es: 'Equipamiento del equipo' },
    contents: { es: tipo === 'uso' ? `${quien} pide usar ${r.fila!.detalle}. Decide en Notificaciones.` : `${quien} avisa que se llevó ${r.fila!.detalle}. Apruébalo en Notificaciones.` },
    url: APP_URL + '/',
  });
  return { exito: true };
}

// Pivots: registrar, aprobar (con duración y entrega si es un pedido de uso),
// rechazar, devolver, "aún lo tiene" o cambiar a permanente/temporal.
async function adminPrestamo(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión admin inválida.' };
  const accion = String(params.accion ?? '');
  const ahora = new Date().toISOString();
  if (accion === 'registrar') {
    const username = String(params.nombre ?? '').trim();
    if (!username) return { exito: false, error: 'Elige a la persona.' };
    const r = await _filaPrestamo(params);
    if (r.error) return { exito: false, error: r.error };
    const { error } = await supabase.from('inventario_prestamos').insert({ ...r.fila, username, estado: 'activo', pedido_por: 'pivot', aprobado_por: email, tipo: 'salida' });
    return error ? { exito: false, error: 'No se pudo guardar.' } : { exito: true };
  }
  const { data: p } = await supabase.from('inventario_prestamos').select('id, estado, tipo, username, detalle').eq('id', params.id).maybeSingle();
  if (!p) return { exito: false, error: 'No existe.' };
  let cambios: Record<string, any> = {};
  if (accion === 'aprobar' && p.estado === 'pendiente') {
    cambios = { estado: 'activo', aprobado_por: email, desde: ahora };
        Object.assign(cambios, _plazoPrestamo(params, p.tipo === 'uso'));
  } else if (accion === 'editar' && p.estado === 'activo') {
    // Un Pivot cambia el plazo o la entrega de un préstamo ya aprobado y se
    // le avisa a la persona (Victor, 2026-11-13).
    cambios = _plazoPrestamo(params, p.tipo === 'uso');
    cambios.aviso_7d_en = null; cambios.aviso_persona_en = null;
  } else if (accion === 'rechazar' && p.estado === 'pendiente') cambios = { estado: 'rechazado', aprobado_por: email };
  else if (accion === 'devolver' && p.estado === 'activo') cambios = { estado: 'devuelto', devuelto_en: ahora };
  else if (accion === 'sigue' && p.estado === 'activo') cambios = { aviso_7d_en: ahora };
  else if (accion === 'permanente' && p.estado === 'activo') cambios = { permanente: params.valor === true || params.valor === 'true' };
  if (!Object.keys(cambios).length) return { exito: false, error: 'Acción inválida.' };
  const { error } = await supabase.from('inventario_prestamos').update(cambios).eq('id', p.id);
  if (error) return { exito: false, error: 'No se pudo guardar.' };
    if ((accion === 'aprobar' || accion === 'rechazar' || accion === 'editar') && email !== _EMAIL_SISTEMA) {
    const que = p.detalle ?? 'el equipamiento';
    const texto = accion === 'rechazar'
      ? `Tu pedido de ${que} no se aprobó. Si tienes dudas, habla con un Pivot.`
      : `${accion === 'editar' ? 'Un Pivot cambió tu préstamo: ' : ''}${_textoPlazo(cambios, que)}`;
    await sendPush({ tipo: 'avisos_admin', include_external_user_ids: [p.username], headings: { es: 'Equipamiento del equipo' }, contents: { es: texto }, url: APP_URL + '/', pantalla: 'inventario' });
  }
  return { exito: true };
}

/** Plazo de un préstamo (Victor, 2026-11-13): 'dia' (mismo día, sin avisos:
 * el Pivot lo lleva y se lo vuelve a llevar), 'fecha' (hasta una fecha; ese
 * día se avisa a la persona y a los Pivots) o 'indefinido' (aviso cada N días). */
function _plazoPrestamo(params: Record<string, any>, esUso: boolean): Record<string, any> {
  const plazo = ['dia', 'fecha', 'indefinido'].includes(String(params.plazo)) ? String(params.plazo) : (esUso ? 'dia' : 'indefinido');
  const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  const hasta = plazo === 'dia' ? hoy : plazo === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(String(params.hasta ?? '')) ? String(params.hasta) : null;
  return {
    plazo,
    hasta: plazo === 'fecha' && !hasta ? hoy : hasta,
    recordar_cada_dias: plazo === 'indefinido' ? Math.max(1, Math.min(90, Number(params.recordarCada) || 7)) : null,
    entrega: params.entrega === 'pivot' ? 'pivot' : (params.entrega === 'casa' || esUso ? 'casa' : null),
    permanente: false,
  };
}

function _textoPlazo(c: Record<string, any>, que: string): string {
  const casa = c.entrega === 'pivot' ? ' Un Pivot lo lleva a cada entrenamiento.' : '';
  if (c.plazo === 'dia') return `Puedes usar ${que} hoy.${casa}`;
  if (c.plazo === 'fecha') return `Puedes usar ${que} hasta el ${c.hasta}.${casa} Ese día te lo recordamos.`;
  return `Puedes usar ${que} sin fecha de fin; te preguntaremos cada ${c.recordar_cada_dias} días si aún lo tienes.${casa}`;
}

// ─── Reglas de préstamo por equipo (Victor, 2026-11-13) ──────────────────
// Como la asistencia anticipada: por fechas o indefinidas, y la más
// específica gana (un equipo puntual > todos; con fechas > indefinida; más
// nueva > más vieja). 'si' = se presta (el pedido se aprueba solo, para el
// día), 'excepcional' = solo en casos excepcionales (lo aprueba un Pivot),
// 'no' = no se presta. Sin reglas: 'excepcional'.
async function _reglaPrestamoPara(username: string, listaId?: string | null): Promise<{ presta: string; id: string | null }> {
  const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  const [{ data: reglas }, { data: fila }] = await Promise.all([
    supabase.from('inventario_reglas').select('*').eq('activa', true),
    supabase.from('equipo').select('categoria').eq('username', username).maybeSingle(),
  ]);
  const equipo = fila?.categoria ?? null;
  const vale = (r: any) => (!r.equipo || r.equipo === equipo) && (!r.lista_id || !listaId || r.lista_id === listaId)
    && (!r.desde || r.desde <= hoy) && (!r.hasta || r.hasta >= hoy);
  const peso = (r: any) => (r.equipo ? 4 : 0) + (r.lista_id ? 2 : 0) + (r.desde || r.hasta ? 1 : 0);
  const l = (reglas ?? []).filter(vale).sort((a: any, b: any) => peso(b) - peso(a) || String(b.created_at).localeCompare(String(a.created_at)));
  return l.length ? { presta: l[0].presta, id: l[0].id } : { presta: 'excepcional', id: null };
}

async function getReglasPrestamo(params: Record<string, any>): Promise<Record<string, any>> {
  if (!(await _validarAdminToken(String(params.adminToken ?? '')))) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const { data } = await supabase.from('inventario_reglas').select('*').order('created_at', { ascending: false });
  return { exito: true, reglas: data ?? [] };
}

async function adminReglaPrestamo(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const accion = String(params.accion ?? '');
  const fecha = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null;
  if (accion === 'borrar') {
    await supabase.from('inventario_reglas').delete().eq('id', params.id);
    return { exito: true };
  }
  const fila: Record<string, any> = {
    equipo: String(params.equipo ?? '').trim() || null,
    presta: ['si', 'excepcional', 'no'].includes(String(params.presta)) ? String(params.presta) : 'excepcional',
    lista_id: String(params.listaId ?? '').trim() || null,
    desde: fecha(params.desde), hasta: fecha(params.hasta),
    activa: params.activa === false || params.activa === 'false' ? false : true,
    nota: String(params.nota ?? '').trim().slice(0, 200) || null,
  };
  if (fila.desde && fila.hasta && fila.hasta < fila.desde) return { exito: false, error: 'La fecha final es antes que la inicial.' };
  if (accion === 'crear') {
    const { error } = await supabase.from('inventario_reglas').insert({ ...fila, creada_por: email });
    return error ? { exito: false, error: 'No se pudo guardar.' } : { exito: true };
  }
  if (accion === 'editar') {
    const { error } = await supabase.from('inventario_reglas').update(fila).eq('id', params.id);
    return error ? { exito: false, error: 'No se pudo guardar.' } : { exito: true };
  }
  return { exito: false, error: 'Acción inválida.' };
}

// Registrar lo que se usó del botiquín o de los insumos: descuenta y, si
// queda por debajo del mínimo, avisa a los Pivots para reponer.
async function registrarUsoInventario(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  const pivot = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!yo && !pivot) return { exito: false, error: 'Inicia sesión.' };
  const listaId = String(params.listaId ?? ''), variante = String(params.variante ?? '');
  const cantidad = Math.max(1, Math.min(999, Number(params.cantidad) || 1));
  const { data: f } = await supabase.from('inventario_stock').select('id, cantidad, minimo').eq('lista_id', listaId).eq('variante', variante).maybeSingle();
  if (!f) return { exito: false, error: 'No encontramos eso en el inventario.' };
  const queda = Math.max(0, (Number(f.cantidad) || 0) - cantidad);
  await supabase.from('inventario_stock').update({ cantidad: queda }).eq('id', f.id);
  await supabase.from('inventario_usos').insert({ lista_id: listaId, variante, cantidad, username: yo ?? null, nota: String(params.nota ?? '').slice(0, 200) || null });
  const { data: l } = await supabase.from('inventario_listas').select('nombre').eq('id', listaId).maybeSingle();
  if (f.minimo != null && queda <= Number(f.minimo)) {
    await sendPush({
      tipo: 'avisos_admin', include_external_user_ids: await _adminDestinatariosPush(undefined, 'inventario', 'botiquin'), headings: { es: `Reponer: ${variante}` },
      contents: { es: `En ${l?.nombre ?? 'el inventario'} quedan ${queda} de ${variante} (mínimo ${f.minimo}).` }, url: APP_URL + '/', pantalla: 'inventario',
    });
  }
  await _sincronizarSistema(listaId);
  return { exito: true, queda };
}

// La persona responde al recordatorio: "Ya lo devolví" o "Aún no" (7 días más).
async function responderPrestamo(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const { data: p } = await supabase.from('inventario_prestamos').select('id, username, estado, detalle').eq('id', params.id).maybeSingle();
  if (!p || p.username !== yo || p.estado !== 'activo') return { exito: false, error: 'No encontramos ese préstamo.' };
  const ahora = new Date().toISOString();
  if (params.devuelto === true || params.devuelto === 'true') {
    await supabase.from('inventario_prestamos').update({ estado: 'devuelto', devuelto_en: ahora }).eq('id', p.id);
    const { data: f } = await supabase.from('equipo').select('nombre_derby, email').eq('username', yo).maybeSingle();
    await sendPush({
      tipo: 'avisos_admin', include_external_user_ids: await _adminDestinatariosPush(f?.email ?? undefined, 'inventario', 'pedidos'), headings: { es: 'Equipamiento del equipo' },
      contents: { es: `${f?.nombre_derby || yo} avisa que devolvió ${p.detalle ?? 'el equipamiento'}.` }, url: APP_URL + '/', pantalla: 'inventario',
    });
  } else {
    await supabase.from('inventario_prestamos').update({ aviso_persona_en: ahora }).eq('id', p.id);
  }
  return { exito: true };
}

// Pivots: crear, editar o borrar listas y su stock.
async function adminInventarioLista(params: Record<string, any>): Promise<Record<string, any>> {
  if (!(await _validarAdminToken(String(params.adminToken ?? '')))) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const accion = String(params.accion ?? '');
  let stock: any = params.stock;
  if (typeof stock === 'string') { try { stock = JSON.parse(stock); } catch { stock = null; } }
  let piezas: any = params.piezas;
  if (typeof piezas === 'string') { try { piezas = JSON.parse(piezas); } catch { piezas = null; } }
  const limpiarPiezas = (x: any) => (Array.isArray(x) ? x : []).map((p: any) => ({ nombre: String(p.nombre ?? '').trim().slice(0, 40), cantidad: Math.max(1, Math.min(20, Number(p.cantidad) || 1)) }))
    .filter((p: any) => p.nombre).slice(0, 12);
  const guardarStock = async (listaId: string) => {
    if (!Array.isArray(stock)) return;
                const fecha = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null;
    // Sin 'etiqueta' en el pedido, se conserva la que tenía.
    const { data: previas } = await supabase.from('inventario_stock').select('variante, etiqueta, foto').eq('lista_id', listaId);
    const etiq: Record<string, string | null> = {}, fotos: Record<string, string | null> = {};
    (previas ?? []).forEach((r: any) => { etiq[r.variante] = r.etiqueta ?? null; fotos[r.variante] = r.foto ?? null; });
    const filas = stock.map((x: any) => ({
      lista_id: listaId, variante: String(x.variante ?? '').trim().slice(0, 60), cantidad: Math.max(0, Math.min(100000, Number(x.cantidad) || 0)),
            vence: fecha(x.vence), minimo: x.minimo == null || x.minimo === '' ? null : Math.max(0, Number(x.minimo) || 0),
      // Etiqueta física (Victor, 2026-11-16): número, caja o marca para encontrarlo.
            etiqueta: 'etiqueta' in x ? (String(x.etiqueta ?? '').trim().slice(0, 60) || null) : (etiq[String(x.variante ?? '').trim().slice(0, 60)] ?? null),
      // La foto de cada artículo se conserva (Victor, 2026-11-26).
      foto: fotos[String(x.variante ?? '').trim().slice(0, 60)] ?? null,
    }));
    const vistas = new Set<string>();
    for (const f of filas) { if (vistas.has(f.variante)) return; vistas.add(f.variante); }
    await supabase.from('inventario_stock').delete().eq('lista_id', listaId);
    if (filas.length) await supabase.from('inventario_stock').insert(filas);
    await _sincronizarSistema(listaId);
  };
  if (accion === 'crear') {
    const tipo = String(params.tipo ?? '');
    if (!['tallas', 'set', 'unidades', 'insumo'].includes(tipo)) return { exito: false, error: 'Tipo inválido.' };
    const nombre = String(params.nombre ?? '').trim().slice(0, 40);
    if (!nombre) return { exito: false, error: 'Ponle un nombre.' };
    const pz = limpiarPiezas(piezas);
    if (tipo === 'set' && !pz.length) return { exito: false, error: 'Agrega al menos una pieza.' };
    const { data: max } = await supabase.from('inventario_listas').select('orden').order('orden', { ascending: false }).limit(1).maybeSingle();
        const seccion = ['equipamiento', 'entrenamiento', 'botiquin', 'miscelaneo'].includes(String(params.seccion)) ? String(params.seccion) : 'equipamiento';
        const { data, error } = await supabase.from('inventario_listas').insert({
      nombre, tipo, icono: String(params.icono ?? '').slice(0, 30) || null, piezas: pz, unidad: String(params.unidad ?? '').trim().slice(0, 20) || null, orden: (Number(max?.orden) || 0) + 1, seccion,
      para_entrenar: seccion === 'equipamiento' && (params.paraEntrenar === true || params.paraEntrenar === 'true'),
    }).select('id').single();
    if (error) return { exito: false, error: 'No se pudo crear.' };
    await guardarStock(data.id);
    return { exito: true, id: data.id };
  }
  const id = String(params.id ?? '');
  const { data: l } = await supabase.from('inventario_listas').select('id, sistema, tipo').eq('id', id).maybeSingle();
  if (!l) return { exito: false, error: 'No existe esa lista.' };
  if (accion === 'editar') {
    const cambios: Record<string, any> = {};
    if (params.nombre != null) { const n = String(params.nombre).trim().slice(0, 40); if (!n) return { exito: false, error: 'Ponle un nombre.' }; cambios.nombre = n; }
    if (params.icono != null) cambios.icono = String(params.icono).slice(0, 30) || null;
        if (params.unidad != null) cambios.unidad = String(params.unidad).trim().slice(0, 20) || null;
    // Interruptor de la tarjeta: ocultar o mostrar la lista (no borra nada).
        if (params.activa != null) cambios.activa = !(params.activa === false || params.activa === 'false');
    // Para entrenar: la persona la puede usar de la liga (Victor, 2026-11-17).
    if (params.paraEntrenar != null) cambios.para_entrenar = params.paraEntrenar === true || params.paraEntrenar === 'true';
    if (piezas != null && l.tipo === 'set') { const pz = limpiarPiezas(piezas); if (!pz.length) return { exito: false, error: 'Agrega al menos una pieza.' }; cambios.piezas = pz; }
    if (Object.keys(cambios).length) await supabase.from('inventario_listas').update(cambios).eq('id', id);
    await guardarStock(id);
    if (!Array.isArray(stock)) await _sincronizarSistema(id);
    return { exito: true };
  }
  if (accion === 'borrar') {
    if (l.sistema) return { exito: false, error: 'Esta lista la usan las reservas de clases; puedes dejarla en 0, pero no borrarla.' };
    const { data: activos } = await supabase.from('inventario_prestamos').select('id').eq('lista_id', id).eq('estado', 'activo').limit(1);
    if (activos?.length) return { exito: false, error: 'Alguien tiene algo de esta lista. Márcalo como devuelto antes de borrarla.' };
    await supabase.from('inventario_listas').delete().eq('id', id);
    return { exito: true };
  }
  return { exito: false, error: 'Acción inválida.' };
}

// Cron diario de préstamos (Victor, 2026-11-13: cuando se cumple un plazo se
// avisa SIEMPRE a la persona y a los Pivots):
// - plazo 'dia': al día siguiente se cierra solo (el Pivot lo llevó y se lo
//   volvió a llevar), sin avisos.
// - plazo 'fecha': el día que vence se avisa a ambos (una vez).
// - 'indefinido' o sin plazo (temporal viejo): aviso a ambos cada N días.
// - permanente: nunca.
// Y el botiquín: vencidos o por vencer (30, 7 y 0 días) a los Pivots.
async function _avisarPrestamosLargos(): Promise<void> {
  const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  const ahora = new Date().toISOString();
  const { data: activos } = await supabase.from('inventario_prestamos')
    .select('id, username, detalle, desde, aviso_7d_en, aviso_persona_en, tipo, entrega, plazo, hasta, permanente, recordar_cada_dias')
    .eq('estado', 'activo').eq('permanente', false);
  const usuarios = [...new Set((activos ?? []).map((p: any) => p.username))];
  const { data: per } = usuarios.length ? await supabase.from('equipo').select('username, nombre_derby').in('username', usuarios) : { data: [] as any[] };
  const nom: Record<string, string> = {}; (per ?? []).forEach((p: any) => { nom[p.username] = p.nombre_derby || p.username; });
  const pivots = await _adminDestinatariosPush(undefined, 'inventario', 'plazos');
  const pivotsBotiquin = await _adminDestinatariosPush(undefined, 'inventario', 'botiquin');
  const avisar = async (p: any, persona: string, aPivots: string) => {
    await sendPush({ tipo: 'avisos_admin', include_external_user_ids: [p.username], headings: { es: 'Equipamiento del equipo' }, contents: { es: persona }, url: APP_URL + '/', pantalla: 'inventario' });
    await sendPush({ tipo: 'avisos_admin', include_external_user_ids: pivots, headings: { es: 'Equipamiento del equipo' }, contents: { es: aPivots }, url: APP_URL + '/', pantalla: 'inventario' });
  };
  for (const p of activos ?? []) {
    const quien = nom[p.username] ?? p.username, que = p.detalle ?? 'el equipamiento del equipo';
    const plazo = p.plazo ?? (p.tipo === 'uso' && p.hasta ? 'fecha' : 'indefinido');
    if (plazo === 'dia') {
      if (p.hasta && p.hasta < hoy) await supabase.from('inventario_prestamos').update({ estado: 'devuelto', devuelto_en: ahora }).eq('id', p.id);
      continue;
    }
    if (plazo === 'fecha') {
      if (p.hasta && p.hasta <= hoy && (!p.aviso_7d_en || String(p.aviso_7d_en).slice(0, 10) < p.hasta)) {
        await avisar(p, `Hoy vence el plazo de ${que}. Devuélvelo a un Pivot o pídele más tiempo.`, `Hoy vence el plazo de ${quien} para ${que}.`);
        await supabase.from('inventario_prestamos').update({ aviso_7d_en: ahora, aviso_persona_en: ahora }).eq('id', p.id);
      }
      continue;
    }
    const cada = Math.max(1, Number(p.recordar_cada_dias) || 7) * 86400000;
    const ultimo = new Date(p.aviso_7d_en ?? p.desde).getTime();
    if (Date.now() - ultimo >= cada) {
      await avisar(p, `¿Aún tienes ${que}? Respóndelo en Liga → Inventario.`, `¿${quien} aún tiene ${que}? Revísalo en Liga → Inventario.`);
      await supabase.from('inventario_prestamos').update({ aviso_7d_en: ahora, aviso_persona_en: ahora }).eq('id', p.id);
    }
  }
  // Botiquín: vence en 30 o 7 días, o vence hoy.
  const fechas = [0, 7, 30].map((d) => new Date(Date.parse(hoy) + d * 86400000).toISOString().slice(0, 10));
  const { data: venc } = await supabase.from('inventario_stock').select('variante, vence, lista_id').in('vence', fechas);
  if (venc?.length) {
    const txt = venc.map((v: any) => `${v.variante} (${v.vence === hoy ? 'vence hoy' : 'vence el ' + v.vence})`).join(', ');
    await sendPush({ tipo: 'avisos_admin', include_external_user_ids: pivotsBotiquin, headings: { es: 'Botiquín: vencimientos' }, contents: { es: txt }, url: APP_URL + '/', pantalla: 'inventario' });
  }
}

// ─── Comunidad (Victor, 2026-11-08 / etapa 3): redes y grupos de la liga ──
// Lista en `config_app.comunidad` (JSON): {red, nombre, url}. Toda persona
// con sesión la ve en Equipo; Pivots la editan en Mi perfil → Ajustes de la liga.
const REDES_COMUNIDAD = ['whatsapp', 'instagram', 'facebook', 'messenger', 'telegram', 'signal', 'discord', 'tiktok', 'youtube', 'web', 'correo', 'otro'];

async function getComunidad(params: Record<string, any>): Promise<Record<string, any>> {
  const esPivot = !!(await _validarAdminToken(String(params.adminToken ?? '')));
  if (!esPivot && !(await _validarToken(String(params.token ?? '')))) return { exito: false, error: 'Inicia sesión.' };
  const { data } = await supabase.from('config_app').select('value').eq('key', 'comunidad').maybeSingle();
  let enlaces: any[] = [];
  try { const l = JSON.parse(String(data?.value ?? '[]')); if (Array.isArray(l)) enlaces = l; } catch (_) { /* vacío */ }
  return { exito: true, enlaces };
}

async function adminGuardarComunidad(params: Record<string, any>): Promise<Record<string, any>> {
  if (!await _validarAdminToken(params.adminToken)) return { exito: false, error: 'Sesión admin inválida.' };
  let lista: any = params.enlaces;
  if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (_) { lista = null; } }
  if (!Array.isArray(lista) || lista.length > 20) return { exito: false, error: 'Lista inválida.' };
  const limpia = [];
  for (const e of lista) {
    const red = REDES_COMUNIDAD.includes(String(e?.red)) ? String(e.red) : 'otro';
    const nombre = String(e?.nombre ?? '').trim().slice(0, 60);
    let url = String(e?.url ?? '').trim();
    // Texto compartido ("Abre este enlace…: https://…"): solo el enlace.
    const enlaces = url.match(/https?:\/\/\S+/gi);
    if (enlaces?.length) url = enlaces[enlaces.length - 1];
    url = url.slice(0, 500);
    if (red === 'correo' && url && !url.startsWith('mailto:')) url = 'mailto:' + url;
    if (red !== 'correo' && url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (!nombre || !url) return { exito: false, error: 'Cada enlace necesita nombre y dirección.' };
    limpia.push({ red, nombre, url });
  }
  const { error } = await supabase.from('config_app').upsert({ key: 'comunidad', value: JSON.stringify(limpia) }, { onConflict: 'liga_id,key' });
  if (error) return { exito: false, error: 'No se pudo guardar.' };
  return { exito: true, enlaces: limpia };
}

// ─── Catálogo de roles de la liga (Victor, 2026-11-12) ──────────────────
// Lista ordenada en `config_app.roles_equipo` (JSON). Sin guardar: los de
// roller derby. Pivots renombran (cambia en todas las fichas), crean y
// borran (se quita de las fichas, con confirmación en la app).
const ROLES_DEPORTE = ['Jammer', 'Pivot', 'Blocker', 'Bench', 'Coach', 'SO', 'NSO'];
// Coach es fijo (Victor, 2026-11-17): no se borra ni se renombra, y pasa por revisión.
const ROL_COACH = 'Coach';
/// Roles que son parte del equipo técnico (Victor, 2026-11-27): quien los
/// elige en su ficha pide sumarse al equipo técnico, como con Coach.
const ROLES_TECNICOS = [ROL_COACH, 'Bench'];

async function _rolesEquipo(): Promise<string[]> {
  const { data } = await supabase.from('config_app').select('value').eq('key', 'roles_equipo').maybeSingle();
  try {
    const l = JSON.parse(String(data?.value ?? ''));
        if (Array.isArray(l)) {
      const r = l.map((x: any) => String(x).trim()).filter(Boolean);
      return r.includes(ROL_COACH) ? r : [...r, ROL_COACH];
    }
  } catch (_) { /* sin guardar */ }
  return [...ROLES_DEPORTE];
}

async function _guardarRolesEquipo(roles: string[]): Promise<boolean> {
  const { error } = await supabase.from('config_app').upsert({ key: 'roles_equipo', value: JSON.stringify(roles) }, { onConflict: 'liga_id,key' });
  return !error;
}

async function getRolesEquipo(): Promise<Record<string, any>> {
  const roles = await _rolesEquipo();
  const { data } = await supabase.from('equipo').select('roles').is('eliminado_en', null).not('roles', 'is', null);
  const enUso: Record<string, number> = {};
  for (const f of data ?? []) for (const r of (Array.isArray(f.roles) ? f.roles : [])) enUso[r] = (enUso[r] ?? 0) + 1;
  return { exito: true, roles, enUso };
}

// accion: crear (nombre), renombrar (nombre → nuevo), borrar (nombre), ordenar (roles).
async function adminRolesEquipo(params: Record<string, any>): Promise<Record<string, any>> {
  if (!await _validarAdminToken(params.adminToken)) return { exito: false, error: 'Sesión admin inválida.' };
  const accion = String(params.accion ?? '');
  const nombre = String(params.nombre ?? '').trim().replace(/\s+/g, ' ');
  const nuevo = String(params.nuevo ?? '').trim().replace(/\s+/g, ' ');
  const roles = await _rolesEquipo();
  const existe = (n: string) => roles.some((r) => r.toLowerCase() === n.toLowerCase());
  if (accion === 'crear') {
    if (!nombre || nombre.length > 30) return { exito: false, error: 'Escribe un nombre de hasta 30 letras.' };
    if (existe(nombre)) return { exito: false, error: 'Ese rol ya existe.' };
    roles.push(nombre);
    } else if ((accion === 'renombrar' || accion === 'borrar') && nombre === ROL_COACH) {
    return { exito: false, error: 'Equipo técnico no se puede cambiar ni borrar: es el rol de quienes entrenan y pasa por revisión.' };
  } else if (accion === 'renombrar') {
    const i = roles.indexOf(nombre);
    if (i < 0) return { exito: false, error: 'Ese rol ya no existe.' };
    if (!nuevo || nuevo.length > 30) return { exito: false, error: 'Escribe un nombre de hasta 30 letras.' };
    if (nuevo !== nombre && existe(nuevo) && nuevo.toLowerCase() !== nombre.toLowerCase()) return { exito: false, error: 'Ese rol ya existe.' };
    roles[i] = nuevo;
  } else if (accion === 'borrar') {
    if (!roles.includes(nombre)) return { exito: false, error: 'Ese rol ya no existe.' };
    roles.splice(roles.indexOf(nombre), 1);
  } else if (accion === 'ordenar') {
    const lista = Array.isArray(params.roles) ? params.roles.map((x: any) => String(x)) : [];
    if (lista.length !== roles.length || !lista.every((r: string) => roles.includes(r))) return { exito: false, error: 'La lista cambió. Vuelve a abrirla.' };
    roles.splice(0, roles.length, ...lista);
  } else {
    return { exito: false, error: 'Acción inválida.' };
  }
  if (!await _guardarRolesEquipo(roles)) return { exito: false, error: 'No se pudo guardar.' };
  // Fichas que tienen el rol: se cambia o se quita.
  let cambiadas = 0;
  if (accion === 'renombrar' || accion === 'borrar') {
    const { data: filas } = await supabase.from('equipo').select('username, roles').contains('roles', [nombre]);
    for (const f of filas ?? []) {
      const actual: string[] = Array.isArray(f.roles) ? f.roles : [];
      const nueva = accion === 'borrar'
        ? actual.filter((r) => r !== nombre)
        : [...new Set(actual.map((r) => (r === nombre ? nuevo : r)))];
      const { error } = await supabase.from('equipo').update({ roles: nueva }).eq('username', f.username);
      if (!error) cambiadas++;
    }
  }
  return { exito: true, roles, cambiadas };
}

// Pausar (deja de generarse cada mes), reanudar o terminar una recurrente.
// El historial queda; al terminar, la instancia de este período se borra
// solo si nadie la tomó.
async function adminEstadoTareaRecurrente(params: Record<string, any>): Promise<Record<string, any>> {
  if (!await _validarAdminToken(params.adminToken)) return { exito: false, error: 'Sesión admin inválida.' };
  const estado = String(params.estado ?? '');
  if (!['activa', 'pausada', 'terminada'].includes(estado)) return { exito: false, error: 'Estado inválido.' };
  const { error } = await supabase.from('tareas_recurrentes').update({ estado, activa: estado === 'activa' }).eq('id', params.idPlantilla);
  if (error) return { exito: false, error: 'No se pudo guardar.' };
  if (estado === 'activa') {
    const { data: p } = await supabase.from('tareas_recurrentes').select('*').eq('id', params.idPlantilla).maybeSingle();
    const { anio, mes } = _mesEcuadorActual();
    if (p) await _generarInstanciaTareaRecurrente(p);
  }
  if (estado === 'terminada') {
    const { data: abiertas } = await supabase.from('tareas').select('id').eq('tarea_recurrente_id', params.idPlantilla).eq('estado', 'no_iniciada');
    for (const t of (abiertas ?? [])) {
      const { data: alguna } = await supabase.from('asignaciones_tareas').select('id').eq('tarea_id', t.id).limit(1);
      if (!alguna?.length) await supabase.from('tareas').delete().eq('id', t.id);
    }
  }
  return { exito: true };
}

// Push a quien hizo la tarea cuando admins la aprueban o la devuelven.
async function _avisarRevisionTarea(idAsignacion: string, aprobada: boolean, nota?: string): Promise<void> {
  try {
    const { data: a } = await supabase.from('asignaciones_tareas').select('nombre_usuario, tarea_id').eq('id', idAsignacion).maybeSingle();
    if (!a) return;
    const { data: t } = await supabase.from('tareas').select('titulo').eq('id', a.tarea_id).maybeSingle();
    await sendPush({
      tipo: 'tarea_revisada',
      include_external_user_ids: [a.nombre_usuario],
      headings: { es: aprobada ? 'Tarea aprobada' : 'Tu tarea necesita cambios' },
      contents: { es: `${t?.titulo ?? 'Tu tarea'}: ` + (aprobada ? 'se aprobó y sumó tus puntos.' : 'volvió a tus tareas.' + (nota ? ` Nota: ${nota}` : '')) },
      url: APP_URL + '/',
    });
  } catch (_) { /* best-effort */ }
}

// Cron diario (9:00 Ecuador): recordatorio a quien tiene una tarea tomada
// que vence mañana.
async function cronRecordatorioTareas(): Promise<Record<string, any>> {
  const manana = new Date(Date.now() - 5 * 3600000 + 24 * 3600000).toISOString().substring(0, 10);
  const { data: asigs } = await supabase.from('asignaciones_tareas').select('nombre_usuario, tarea_id').eq('estado', 'iniciada').eq('fecha_vencimiento_personal', manana);
  if (!asigs?.length) return { exito: true, enviados: 0 };
  const { data: tareas } = await supabase.from('tareas').select('id, titulo').in('id', asigs.map((a: any) => a.tarea_id));
  const titulo: Record<string, string> = {};
  (tareas ?? []).forEach((t: any) => { titulo[t.id] = t.titulo; });
  const porPersona: Record<string, string[]> = {};
  asigs.forEach((a: any) => { (porPersona[a.nombre_usuario] ??= []).push(titulo[a.tarea_id] ?? 'Una tarea'); });
  let enviados = 0;
  for (const [u, ts] of Object.entries(porPersona)) {
    await sendPush({
      tipo: 'tarea_vence', include_external_user_ids: [u],
      headings: { es: ts.length === 1 ? 'Tu tarea vence mañana' : `${ts.length} tareas vencen mañana` },
      contents: { es: ts.length === 1 ? `${ts[0]}. Si ya la terminaste, envíala a revisión.` : ts.join(' · ') },
      url: APP_URL + '/',
    });
    enviados++;
  }
  return { exito: true, enviados };
}

async function adminCrearTarea(params: Record<string, any>): Promise<any> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  let datos = params.datosJson ?? params.datos;
  if (typeof datos === 'string') datos = JSON.parse(datos);
  const { data: creada, error } = await supabase.from('tareas').insert({
    titulo: datos.titulo, notas: datos.notas ?? null, area: datos.area ?? null,
    puntos: datos.puntos ?? 1, max_asignados: datos.maxAsignados ?? 1,
    fecha_vencimiento: datos.fechaVencimiento ?? null, estado: 'no_iniciada', creado_por: datos.creadoPor ?? null,
  }).select();
  if (error) return { exito: false, error: error.message };
  const tarea = creada[0];
  const asignarA: string[] = Array.isArray(datos.asignarA) ? datos.asignarA : [];
  // "Tarea ya realizada" (feat nueva, ver MANIFEST.md/CHANGELOG.md -- "paso
  // nuevo en el wizard de creación: tarea por realizar / ya realizada") --
  // en vez del camino normal (asignaciones en 'iniciada', tarea pasa a
  // 'en_progreso'), crea las asignaciones YA `estado:'aprobada'` con
  // `fecha_revision`=la fecha elegida y acredita los puntos de una sola vez
  // -- mismo mecanismo que `adminValidarTarea('aprobar')`, sin pasar por el
  // flujo de revisión (no aplica descuento por atraso, `_puntosTareaCreditados()`,
  // porque no hay "envío" real que comparar contra un vencimiento: la tarea
  // se está registrando retroactivamente como ya hecha). Puntos acreditados
  // al MES/AÑO de la fecha elegida (no el de hoy), mismo criterio que el
  // resto de esta app usa para créditos retroactivos (ej. racha, "mes del
  // evento" no "mes del click"). Solo aplica si además se eligió gente
  // (`asignarA`) -- sin nadie a quien acreditarle, no hay nada que aprobar.
  if (asignarA.length && datos.yaRealizada) {
    const fecha: string | null = datos.fechaVencimiento ?? null;
    const fechaObj = fecha ? new Date(fecha + 'T00:00:00Z') : new Date();
    const puntosOriginales = Number(datos.puntos) || 0;
    await supabase.from('asignaciones_tareas').insert(asignarA.map((n: string) => ({
      tarea_id: tarea.id, nombre_usuario: n, estado: 'aprobada', es_rescate: false,
      fecha_vencimiento_personal: fecha, fecha_revision: fecha ? fecha + 'T00:00:00.000Z' : new Date().toISOString(),
    })));
    for (const n of asignarA) {
      await _acreditarPuntosTarea(n, fechaObj.getUTCFullYear(), fechaObj.getUTCMonth() + 1, puntosOriginales);
    }
    await supabase.from('tareas').update({ estado: 'archivada', fecha_archivado: new Date().toISOString() }).eq('id', tarea.id);
  } else if (asignarA.length) {
    await supabase.from('asignaciones_tareas').insert(asignarA.map((n: string) => ({ tarea_id: tarea.id, nombre_usuario: n, estado: 'iniciada', es_rescate: false, fecha_vencimiento_personal: tarea.fecha_vencimiento ?? null })));
        await supabase.from('tareas').update({ estado: 'en_progreso' }).eq('id', tarea.id);
  }
    // Aviso de tarea nueva (Victor, 2026-11-08): solo si quedó algún cupo libre.
  if (!datos.yaRealizada && asignarA.length < (Number(datos.maxAsignados) || 1)) {
    await _avisarTareasNuevas([{ titulo: tarea.titulo, puntos: tarea.puntos }], datos.creadoPor ?? null);
  }
  // Objeto (no el array crudo): la app Android solo acepta respuestas JSON con forma de objeto.
  return { exito: true, idTarea: tarea.id };
}

// Push "tarea nueva" al equipo activo (sin lesionadxs, ausentes ni de
// viaje; EQUIPO_ACTIVO_FILTRO), menos a quien la creó. Varias a la vez
// (cron mensual de recurrentes) = un solo aviso agrupado.
async function _avisarTareasNuevas(tareas: { titulo: string; puntos: number }[], creadoPor: string | null): Promise<void> {
  try {
    if (!tareas.length) return;
    const { data: equipoRows } = await supabase.from('equipo').select('username, estado_miembro').is('eliminado_en', null);
    const destinatarios = (equipoRows ?? [])
      .filter((r: any) => r.username && r.username !== creadoPor && EQUIPO_ACTIVO_FILTRO(r))
      .map((r: any) => r.username);
    if (!destinatarios.length) return;
    const una = tareas.length === 1;
    const pts = (n: number) => (n === 1 ? '1 punto' : `${n} puntos`);
    await sendPush({
      tipo: 'tarea_nueva',
      include_external_user_ids: destinatarios,
      headings: { es: una ? 'Nueva tarea disponible' : `${tareas.length} tareas nuevas este mes` },
      contents: { es: una ? `${tareas[0].titulo}${tareas[0].puntos > 0 ? ' · ' + pts(tareas[0].puntos) : ''}` : tareas.map((t) => t.titulo).join(' · ') },
      url: APP_URL + '/',
    });
  } catch (_) { /* best-effort */ }
}

async function adminEditarTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  let datos = params.datosJson ?? params.datos;
  if (typeof datos === 'string') datos = JSON.parse(datos);
  const cambios: Record<string, any> = {};
  if (datos.titulo != null) cambios.titulo = datos.titulo;
  if (datos.notas != null) cambios.notas = datos.notas;
  if (datos.area != null) cambios.area = datos.area;
  if (datos.puntos != null) cambios.puntos = datos.puntos;
  if (datos.maxAsignados != null) cambios.max_asignados = datos.maxAsignados;
  if (datos.fechaVencimiento != null) cambios.fecha_vencimiento = datos.fechaVencimiento;
  await supabase.from('tareas').update(cambios).eq('id', params.idTarea);
  return { exito: true };
}

async function adminEditarAsignacionesTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  let nombresDeseados: string[] = params.nombresJson ?? params.nombres;
  if (typeof nombresDeseados === 'string') nombresDeseados = JSON.parse(nombresDeseados);
  const idTarea = params.idTarea;
  const { data: actuales } = await supabase.from('asignaciones_tareas').select('*').eq('tarea_id', idTarea);
  const aprobados = (actuales ?? []).filter((a: any) => a.estado === 'aprobada').map((a: any) => a.nombre_usuario);
  const activosActuales = (actuales ?? []).filter((a: any) => a.estado === 'iniciada' || a.estado === 'pendiente_revision');
  const deseadosFiltrados = nombresDeseados.filter((n: string) => !aprobados.includes(n));

  for (const a of activosActuales) {
    if (!deseadosFiltrados.includes(a.nombre_usuario)) await supabase.from('asignaciones_tareas').delete().eq('id', a.id);
  }

  const nombresActivosActuales = activosActuales.map((a: any) => a.nombre_usuario);
  const nuevos = deseadosFiltrados.filter((n: string) => !nombresActivosActuales.includes(n));
  if (nuevos.length) {
    const { data: t } = await supabase.from('tareas').select('fecha_vencimiento').eq('id', idTarea).maybeSingle();
    await supabase.from('asignaciones_tareas').insert(nuevos.map((n: string) => ({ tarea_id: idTarea, nombre_usuario: n, estado: 'iniciada', es_rescate: false, fecha_vencimiento_personal: t?.fecha_vencimiento ?? null })));
  }

  const { data: quedanActivos } = await supabase.from('asignaciones_tareas').select('id').eq('tarea_id', idTarea).in('estado', ['iniciada', 'pendiente_revision']);
  await supabase.from('tareas').update({ estado: quedanActivos?.length ? 'en_progreso' : 'no_iniciada' }).eq('id', idTarea);
  return { exito: true, bloqueados: aprobados };
}

async function adminEliminarTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { idTarea } = params;
  const { data: t } = await supabase.from('tareas').select('*').eq('id', idTarea).maybeSingle();
  if (!t) return { exito: false, error: 'Tarea no encontrada.' };
  const { data: aprobadas } = await supabase.from('asignaciones_tareas').select('*').eq('tarea_id', idTarea).eq('estado', 'aprobada');
  for (const a of (aprobadas ?? [])) {
    if (!a.fecha_revision) continue;
    const fecha = new Date(a.fecha_revision);
    await _restarPuntosTarea(a.nombre_usuario, fecha.getFullYear(), fecha.getMonth() + 1, Number(t.puntos) || 0);
  }
  await supabase.from('asignaciones_tareas').delete().eq('tarea_id', idTarea);
  await supabase.from('tareas').delete().eq('id', idTarea);
  return { exito: true, puntosRevertidos: (aprobadas ?? []).length };
}

async function getTareasPendientesValidacion(): Promise<any[]> {
  const { data: asigs } = await supabase.from('asignaciones_tareas').select('*').eq('estado', 'pendiente_revision');
  if (!asigs?.length) return [];
  const tareaIds = asigs.map((a: any) => a.tarea_id);
  const { data: tareas } = await supabase.from('tareas').select('*').in('id', tareaIds);
  const tareasPorId: Record<string, any> = {};
  (tareas ?? []).forEach((t: any) => { tareasPorId[t.id] = t; });
  return asigs.map((a: any) => ({
    idAsignacion: a.id, nombreUsuario: a.nombre_usuario, fechaEnvio: a.fecha_envio,
    tarea: tareasPorId[a.tarea_id] ? { idTarea: a.tarea_id, titulo: tareasPorId[a.tarea_id].titulo, puntos: tareasPorId[a.tarea_id].puntos } : null,
  }));
}

// ─── Tareas recurrentes (plantillas, ver MANIFEST.md sección 3) ───────────────

// "Ahora" en hora de pared Ecuador (UTC-5 fijo, sin DST) -- mismo criterio
// que el resto de los crons de este archivo (ej. "Ecuador = UTC-5" en
// `_puntosTareaCreditados()`). Un solo lugar para no repetir el ajuste de
// -5h en cada función que necesita "el mes en curso" para tareas
// recurrentes.
function _mesEcuadorActual(): { anio: number; mes: number } {
  const ahoraEcuador = new Date(Date.now() - 5 * 3600000);
  return { anio: ahoraEcuador.getUTCFullYear(), mes: ahoraEcuador.getUTCMonth() + 1 };
}

// Extraída de lo que antes era el cuerpo inline de `cronGenerarTareasRecurrentes()`
// (más abajo) para poder reusarla también desde `adminCrearTareaRecurrente()`
// -- bug real corregido (reportado por Victor: "la instancia del mes actual
// aparece archivada/finalizada en vez de activa"): antes, crear una
// plantilla a mitad de mes no generaba NINGUNA instancia hasta el día 1 del
// mes siguiente (el cron mensual es la única vía que existía) -- la ÚNICA
// forma de conseguir algo antes de esa fecha era `adminAplicarTareaRecurrenteHistorico()`
// ("aplicar a meses anteriores"), pensada para meses YA completados
// (archiva + aprueba + acredita puntos de una), no para "esta activa
// ahora mismo" -- de ahí el síntoma real: una instancia terminó
// archivada/aprobada con el mes equivocado en vez de disponible para tomar.
// Fix: generar de una la instancia del MES DE CREACIÓN, activa y sin
// asignar, igual que hace el cron para los meses siguientes -- mismo
// criterio de idempotencia (nunca duplica si ya existe una instancia de
// esta plantilla con ese `fecha_vencimiento` exacto).
// Recurrencia flexible (Victor, 2026-11-12, migración 20261113070000):
// cada `cada_n` días, semanas o meses desde `inicio` (en meses, el mismo día
// del mes, ajustado a meses cortos). Vence `vence_en_dias` después de
// aparecer o, si no, el día antes de la siguiente.
function _isoUTC(t: number): string { return new Date(t).toISOString().slice(0, 10); }
function _sumarDiasISO(f: string, n: number): string {
  const [y, m, d] = f.split('-').map(Number);
  return _isoUTC(Date.UTC(y, m - 1, d + n));
}
function _siguienteRecurrencia(f: string, unidad: string, n: number, diaBase: number): string {
  const [y, m, d] = f.split('-').map(Number);
  if (unidad === 'dia') return _isoUTC(Date.UTC(y, m - 1, d + n));
  if (unidad === 'semana') return _isoUTC(Date.UTC(y, m - 1, d + 7 * n));
  const ultimo = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return _isoUTC(Date.UTC(y, m - 1 + n, Math.min(diaBase, ultimo)));
}

// Crea la instancia que toca hoy (como mucho una por corrida; si la
// plantilla estuvo pausada, salta las que ya pasaron) y avanza `proxima`.
async function _generarInstanciaTareaRecurrente(p: Record<string, any>): Promise<boolean> {
  const hoy = _hoyEcuadorISO();
  const unidad = ['dia', 'semana', 'mes'].includes(p.unidad) ? p.unidad : 'mes';
  const n = Math.max(1, Number(p.cada_n) || 1);
  const inicio = String(p.inicio ?? p.proxima ?? hoy).slice(0, 10);
  const diaBase = Number(inicio.slice(8, 10)) || 1;
  let prox = String(p.proxima ?? inicio).slice(0, 10);
  if (prox > hoy) return false;
  for (let i = 0; i < 1000; i++) {
    const sig = _siguienteRecurrencia(prox, unidad, n, diaBase);
    if (sig > hoy) break;
    prox = sig;
  }
  const siguiente = _siguienteRecurrencia(prox, unidad, n, diaBase);
  const vence = p.vence_en_dias != null ? _sumarDiasISO(prox, Number(p.vence_en_dias)) : _sumarDiasISO(siguiente, -1);
  await supabase.from('tareas_recurrentes').update({ proxima: siguiente }).eq('id', p.id);
  const { data: existe } = await supabase.from('tareas').select('id').eq('tarea_recurrente_id', p.id).eq('fecha_vencimiento', vence).maybeSingle();
  if (existe) return false;
  const fijas = ((p.personas_fijas as string[]) ?? []).slice(0, Math.max(1, Number(p.max_asignados) || 1));
  // Solo personas que siguen en la liga (Victor, 2026-11-26).
  const { data: vivas } = fijas.length ? await supabase.from('equipo').select('username').in('username', fijas).is('eliminado_en', null) : { data: [] as any[] };
  const asignar = (vivas ?? []).map((x: any) => String(x.username));
  const { data: nueva } = await supabase.from('tareas').insert({
    titulo: p.titulo, notas: p.notas, area: p.area, puntos: p.puntos, max_asignados: p.max_asignados,
    fecha_vencimiento: vence, estado: asignar.length ? 'en_progreso' : 'no_iniciada', creado_por: p.creado_por, tarea_recurrente_id: p.id,
  }).select('id').maybeSingle();
  if (nueva && asignar.length) {
    await supabase.from('asignaciones_tareas').insert(asignar.map((u) => ({ tarea_id: nueva.id, nombre_usuario: u, estado: 'iniciada', es_rescate: false, fecha_vencimiento_personal: vence })));
  }
  return true;
}

// "Cada 3 meses", "Cada 15 días"...
function _textoRecurrencia(unidad: string, n: number): string {
  if (unidad === 'dia') return n === 1 ? 'Cada día' : `Cada ${n} días`;
  if (unidad === 'semana') return n === 1 ? 'Cada semana' : `Cada ${n} semanas`;
  return n === 1 ? 'Cada mes' : n === 12 ? 'Cada año' : `Cada ${n} meses`;
}

// Paso nuevo del wizard "Nueva tarea" ("Tipo de tarea": única/recurrente,
// ver `_TAR_CREAR_STEPS`/js/tareas.js) -- "recurrente" guarda una plantilla
// acá. Genera DE UNA la instancia del mes en curso (ver
// `_generarInstanciaTareaRecurrente()` arriba, bug real corregido) -- los
// meses siguientes los sigue generando `cronGenerarTareasRecurrentes()` más
// abajo (disparada por el cron `generar-tareas-recurrentes`).
async function adminCrearTareaRecurrente(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  let datos = params.datosJson ?? params.datos;
  if (typeof datos === 'string') datos = JSON.parse(datos);
  const unidad = ['dia', 'semana', 'mes'].includes(datos.unidad) ? datos.unidad : 'mes';
  const cadaN = Math.min(365, Math.max(1, Number(datos.cadaN) || 1));
  const hoy = _hoyEcuadorISO();
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(String(datos.inicio ?? '')) ? String(datos.inicio) : hoy;
  const venceEnDias = datos.venceEnDias == null || datos.venceEnDias === '' ? null : Math.min(365, Math.max(0, Number(datos.venceEnDias) || 0));
  const { data: creada, error } = await supabase.from('tareas_recurrentes').insert({
    titulo: datos.titulo, notas: datos.notas ?? null, area: datos.area ?? null,
    puntos: datos.puntos ?? 1, max_asignados: datos.maxAsignados ?? 1,
    activa: true, creado_por: datos.creadoPor ?? null,
    unidad, cada_n: cadaN, inicio, vence_en_dias: venceEnDias, proxima: inicio,
    personas_fijas: Array.isArray(datos.personasFijas) ? [...new Set(datos.personasFijas.map(String))].slice(0, 50) : [],
  }).select();
  if (error) return { exito: false, error: error.message };
    const plantilla = creada[0];
  if (await _generarInstanciaTareaRecurrente(plantilla)) {
    await _avisarTareasNuevas([{ titulo: plantilla.titulo, puntos: plantilla.puntos }], datos.creadoPor ?? null);
  }
  return { exito: true, idPlantilla: plantilla.id };
}

// "¿Querés aplicar esta tarea a meses anteriores?" (paso posterior al
// wizard, ver `_tarRecurAplicarAnterioresPreguntar()`/js/tareas.js) -- crea,
// por cada {mes, anio, persona} elegido, una instancia YA `estado:'archivada'`
// con su única asignación YA `estado:'aprobada'` y los puntos acreditados al
// mes/año elegido (no al de hoy) -- mismo mecanismo que la rama
// `yaRealizada` de `adminCrearTarea()` (tarea única marcada "ya realizada"
// al crearla), reusado acá para el caso recurrente/histórico. Vencimiento
// de cada instancia histórica = último día del mes/año elegido, mismo
// criterio que usa el cron mensual para las instancias en curso.
//
// Bug real corregido (reportado por Victor -- una entrada con el mes/año
// del día de HOY terminó archivada/aprobada en vez de disponible, ver el
// bug de arriba): "meses anteriores" nunca debió aceptar el mes en curso ni
// uno futuro -- ese mes ya tiene su propia instancia activa, generada por
// `adminCrearTareaRecurrente()`/el cron mensual; aceptar el mismo mes acá
// producía una 2da instancia duplicada y ya archivada, que es exactamente
// el síntoma reportado. Ahora se saltan (`omitidas`, devuelto en la
// respuesta -- js/tareas.js avisa si `omitidas > 0`) en vez de crearse.
async function adminAplicarTareaRecurrenteHistorico(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { idPlantilla } = params;
  let entradas = params.entradasJson ?? params.entradas;
  if (typeof entradas === 'string') entradas = JSON.parse(entradas);
  if (!Array.isArray(entradas) || !entradas.length) return { exito: false, error: 'No hay meses para aplicar.' };
  const { data: plantilla } = await supabase.from('tareas_recurrentes').select('*').eq('id', idPlantilla).maybeSingle();
  if (!plantilla) return { exito: false, error: 'Plantilla no encontrada.' };
  const actual = _mesEcuadorActual();
  let creadas = 0, omitidas = 0;
  for (const e of entradas) {
    const anio = Number(e.anio), mes = Number(e.mes);
    if (!anio || !mes || !e.persona) continue;
    if (anio > actual.anio || (anio === actual.anio && mes >= actual.mes)) { omitidas++; continue; }
    const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    const fecha = anio + '-' + String(mes).padStart(2, '0') + '-' + String(ultimoDia).padStart(2, '0');
    const { data: creada } = await supabase.from('tareas').insert({
      titulo: plantilla.titulo, notas: plantilla.notas, area: plantilla.area,
      puntos: plantilla.puntos, max_asignados: plantilla.max_asignados,
      fecha_vencimiento: fecha, estado: 'archivada', fecha_archivado: new Date().toISOString(),
      creado_por: plantilla.creado_por, tarea_recurrente_id: idPlantilla,
    }).select();
    if (!creada?.length) continue;
    await supabase.from('asignaciones_tareas').insert({
      tarea_id: creada[0].id, nombre_usuario: e.persona, estado: 'aprobada', es_rescate: false,
      fecha_vencimiento_personal: fecha, fecha_envio: fecha + 'T00:00:00.000Z', fecha_revision: fecha + 'T00:00:00.000Z',
    });
    await _acreditarPuntosTarea(e.persona, anio, mes, Number(plantilla.puntos) || 0);
    creadas++;
  }
  return { exito: true, creadas, omitidas };
}

// Disparada por el cron `generar-tareas-recurrentes` (día 1 de cada mes, ver
// esa migración) vía el mismo gate `x-cron-secret` que cronDiario/etc. --
// genera una instancia nueva en `tareas` (sin asignar, `no_iniciada`) por
// cada plantilla activa, con vencimiento = último día del mes en curso
// (hora Ecuador) -- ver `_generarInstanciaTareaRecurrente()` arriba
// (extraída de acá, reusada también por `adminCrearTareaRecurrente()`).
async function cronGenerarTareasRecurrentes(): Promise<Record<string, any>> {
  const { data: plantillas } = await supabase.from('tareas_recurrentes').select('*').eq('activa', true);
  if (!plantillas?.length) return { generadas: 0 };
  const nuevas: { titulo: string; puntos: number }[] = [];
  for (const p of plantillas) {
    if (await _generarInstanciaTareaRecurrente(p)) nuevas.push({ titulo: p.titulo, puntos: p.puntos });
  }
  await _avisarTareasNuevas(nuevas, null);
  return { generadas: nuevas.length };
}

// ─── Acciones: eventos / asistencias ─────────────────────────────────────────

async function getEventosRango(params: Record<string, any>): Promise<Record<string, any>> {
  const desde = params.fechaInicio ?? params.desde,
        hasta  = params.fechaFin   ?? params.hasta;
  const d0 = desde.substring(0, 10), d1 = hasta.substring(0, 10);
  const { data } = await supabase.from('asistencias').select('id_evento, fecha, donde, inicia, termina, estado, google_maps, info_adicional, tipo_evento, a_horario, tarde').neq('estado', 'Eliminado').gte('fecha', d0).lte('fecha', d1);
  const idsEvento = (data ?? []).map((f: any) => f.id_evento);
  const [tipoIcono, requiereReserva, asistLog, asistEF, equipoPorNombre, videoInstructivo] = await Promise.all([
    _mapaTipoIconoPorLugar(), _mapaRequiereReservaPorLugar(), _ultimaAsistenciaPorPersonaTodas(idsEvento), _asistenciaEFPorEvento(data ?? []), _mapaEquipoPorNombre(), _mapaVideoInstructivoPorLugar()
  ]);
  const eventos = (data ?? []).map((fila: any) => {
    const idEvento = fila.id_evento;
    const logDeEvento = asistLog[idEvento] ?? [];
    // `log_asistencias` mezcla 2 conceptos bajo la misma tabla (ver
    // MANIFEST.md): RSVPs pre-evento (origen 'Usuario'/'AsistenciaAnticipada',
    // estado 'Asistiré'/'No asistiré'/'No jugador') y asistencia REAL
    // post-evento tomada por un admin (origen 'Admin', estado 'A tiempo'/
    // 'Tarde'/'Ninguno'). `logDeEvento.length` solo no alcanza para decidir
    // si "ya hay asistencia real" -- un evento con SOLO RSVPs (nunca pasado
    // por rollcall) tiene filas igual, pero ninguna es una marca real de
    // admin. `logAdminReal` filtra específicamente eso (bug real reportado
    // por Victor, confirmado contra datos de Supabase).
    const logAdminReal = logDeEvento.filter((a: any) => a.origen === 'Admin' && (a.estado === 'A tiempo' || a.estado === 'Tarde'));
    // Fallback a las columnas legacy `a_horario`/`tarde` (`_asistenciaEFPorEvento()`)
    // -- eventos históricos anteriores a la migración a `log_asistencias`
    // (ver MANIFEST.md), o eventos donde el rollcall se marcó por el sistema
    // legacy en paralelo, tienen la asistencia REAL únicamente en esas
    // columnas. Se SUMA a `logDeEvento` (no lo reemplaza) cuando no hay
    // marca real de admin en `log_asistencias` -- de lo contrario, un evento
    // con RSVPs en `log_asistencias` pero asistencia real solo en las
    // columnas legacy perdía esa asistencia real (bug real, fix del
    // 2026-08-23); y si en cambio el fallback reemplazaba a `logDeEvento`
    // entero, un evento con SOLO RSVPs (el caso normal antes de que pase el
    // evento, sin marca real en ningún lado) perdía los RSVPs porque el
    // fallback legacy está vacío (bug real reintroducido sin querer el
    // 2026-09-05 al arreglar el primero -- ver CHANGELOG.md). Cuando SÍ hay
    // marca real en `log_asistencias`, se sigue mandando `logDeEvento`
    // completo (no `logAdminReal`) sin sumar el fallback -- el frontend
    // (`_evMapEventoBackend()`, js/eventos.js) ya separa por estado en
    // `asistentes`/`rsvps`, y `rsvps` sigue haciendo falta ahí (resumen de
    // RSVP de cuentas no-admin/no-quindes, rol combinado en el label de
    // puntualidad) -- filtrar acá de más le borraría esa data sin necesidad.
    const fuenteAsistencia = logAdminReal.length ? logDeEvento : [...logDeEvento, ...(asistEF[idEvento] ?? [])];
    // Bug real corregido (ver MANIFEST.md -- "usuario con '?' y sin nombre en
    // asistentes de eventos"): un RSVP/marca real en `log_asistencias` cuyo
    // `nombre_usuario` ya NO tiene fila en `equipo` (cuenta eliminada,
    // `adminEliminarUsuario`, sin cascada sobre `log_asistencias` -- el RSVP
    // queda huérfano) daba `eq = {}` acá, así que `nombreDerby`/`fotoPerfil`
    // quedaban en `''` pero `a.nombre` (el username crudo) se seguía
    // mandando tal cual -- el frontend lo mostraba como texto/avatar de
    // respaldo (ver `(p.nombreDerby || p.nombre)`, js/eventos.js), no un "?"
    // real, pero sí un fantasma con el nombre de una cuenta que ya no
    // existe. `existeEnEquipo` (nuevo) es la señal explícita y confiable
    // ("¿esta persona sigue siendo un miembro real?") que el frontend
    // necesita para filtrar estos huérfanos ANTES de renderizar
    // (`_evMapEventoBackend()`) -- más confiable que inferirlo de
    // `nombreDerby`/`fotoPerfil` vacíos, que también pueden estar vacíos
    // para un miembro REAL que simplemente no cargó esos datos.
    const asistencias = fuenteAsistencia.map((a: any) => {
      const eq = equipoPorNombre[String(a.nombre).trim().toUpperCase()];
      return { nombre: a.nombre, estado: a.estado, origen: a.origen, nombreDerby: eq?.nombreDerby ?? '', fotoPerfil: eq?.fotoPerfil ?? '', existeEnEquipo: !!eq };
    });
    // `sinRollcall`: pasaron >24h desde el fin del evento y no hay ninguna
    // marca en las columnas legacy `a_horario`/`tarde`. El frontend lo usa
    // para avisar a admins (badge en la card + banner en el detalle) -- NO
    // cambia `estado`.
    const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
    const finEvento = new Date((fila.fecha + 'T' + (fila.termina || '23:59')));
    const sinRollcall = !fila.a_horario?.trim() && !fila.tarde?.trim();
    const pasaron24h = (ahora.getTime() - finEvento.getTime()) > 24 * 60 * 60 * 1000;
    return {
      idEvento, fecha: fila.fecha, lugar: fila.donde, horaInicio: fila.inicia?.substring(0, 5) ?? '', horaFin: fila.termina?.substring(0, 5) ?? '', estado: fila.estado, sinRollcall: pasaron24h && sinRollcall, tipoIcono: fila.tipo_evento ?? tipoIcono[fila.donde] ?? 'Entrenamiento', requiereReserva: requiereReserva[fila.donde] !== false, asistencias,
      mapsUrl: fila.google_maps ?? fila.mapsUrl ?? '',
      descripcion: fila.info_adicional ?? fila.descripcion ?? fila.infoAdicional ?? '',
      videoInstructivo: videoInstructivo[fila.donde] ?? '',
    };
  });
  eventos.sort((a: any, b: any) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
  // Evento social sin aprobar: solo lo ven Pivots y encargadxs (social.ts).
  return { eventos: await filtrarEventosSociales(eventos, params, _depsSocial()) };
}

// ── Cumpleaños ──────────────────────────────────────────────────────────
// `equipo.fecha_nacimiento` es `date` (migración 20261106193340) -- PostgREST
// la devuelve como 'YYYY-MM-DD'. `_normalizarFechaNac()` es el ÚNICO punto
// de entrada para escribirla: acepta 'YYYY-MM-DD' (lo que manda el date
// picker), devuelve null para vacío/inválido/futuro/antes de 1920.
function _normalizarFechaNac(v: unknown): string | null {
  const s = String(v ?? '').trim().substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1920 || s > _hoyEcuadorISO()) return null;
  return s;
}
/** Fecha válida de alguien que todavía no cumple 18. */
function _esMenorDeEdad(v: unknown): boolean {
  const s = _normalizarFechaNac(v);
  if (!s) return false;
  const h = _hoyEcuadorISO();
  return `${Number(s.slice(0, 4)) + 18}${s.slice(4)}` > h;
}
function _esPublico(v: unknown): boolean { return v === 'Sí' || v === 'Si'; }
// 'MM-DD' del cumpleaños en un año dado -- un 29 de febrero cae el 28 en
// años no bisiestos (para que nadie se quede sin cumpleaños 3 de cada 4 años).
function _mesDiaCumple(fechaNac: string, anio: number): string {
  const md = fechaNac.substring(5, 10);
  const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
  return (md === '02-29' && !bisiesto) ? '02-28' : md;
}
function _nombreMostrar(p: { nombre_derby?: string | null; username: string }): string {
  return (p.nombre_derby ?? '').toString().trim() || p.username;
}

// Todas las ocurrencias de cada cumpleaños dentro de [desde, hasta] -- el
// timeline carga 25 meses de una (js/eventos.js `_evRangoCargaCompleto()`),
// así que cada persona aparece en CADA año del rango (antes solo 1 vez).
// Solo fechas públicas (`fecha_publica='Sí'` -- antes `.not(null)` dejaba
// pasar también 'No'); edad solo si `edad_publica='Sí'`.
async function getCumpleañosRango(params: Record<string, any>): Promise<Record<string, any>> {
  const desde = String(params.desde ?? '').substring(0, 10);
  const hasta = String(params.hasta ?? '').substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) return { cumpleanos: [] };
  const { data } = await supabase.from('equipo')
    .select('username, nombre_derby, fecha_nacimiento, edad_publica, foto_perfil')
    .not('fecha_nacimiento', 'is', null)
    .in('fecha_publica', ['Sí', 'Si'])
    .is('eliminado_en', null);
  const y0 = Number(desde.substring(0, 4)), y1 = Number(hasta.substring(0, 4));
  const resultado: any[] = [];
  for (const r of (data ?? [])) {
    const fnac = String(r.fecha_nacimiento ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fnac)) continue;
    const anioNac = Number(fnac.substring(0, 4));
    for (let y = Math.max(y0, anioNac + 1); y <= y1; y++) {
      const iso = `${y}-${_mesDiaCumple(fnac, y)}`;
      if (iso < desde || iso > hasta) continue;
      const entrada: Record<string, any> = { nombre: _nombreMostrar(r), username: r.username, fecha: iso, fotoPerfil: r.foto_perfil ?? '' };
      if (_esPublico(r.edad_publica)) entrada.edad = y - anioNac;
      resultado.push(entrada);
    }
  }
  resultado.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
  return { cumpleanos: resultado };
}

// Pantalla obligatoria #cumple-gate (js/perfil.js) -- la persona logueada
// registra su propia fecha + privacidad. Identidad SIEMPRE del token.
async function guardarFechaNacimiento(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const fecha = _normalizarFechaNac(params.fechaNac);
  if (!fecha) return { exito: false, error: 'Elige una fecha de nacimiento válida.' };
  const fechaPublica = params.fechaPublica === 'Sí' ? 'Sí' : 'No';
  // La edad solo puede ser pública si la fecha también lo es.
  const edadPublica = (fechaPublica === 'Sí' && params.edadPublica === 'Sí') ? 'Sí' : 'No';
  const { error } = await supabase.from('equipo')
    .update({ fecha_nacimiento: fecha, fecha_publica: fechaPublica, edad_publica: edadPublica })
    .eq('username', username);
  if (error) return { exito: false, error: error.message };
  return { exito: true, fechaNacimiento: fecha, fechaPublica, edadPublica };
}

async function getEventosFiltrados(params: Record<string, any>): Promise<Record<string, any>> {
  const { estado, mes, lugar, tipo } = params;
  const { data } = await supabase.from('asistencias').select('id_evento, fecha, donde, inicia, termina, estado').neq('estado', 'Eliminado');
  const [tipoIcono, requiereReserva] = await Promise.all([_mapaTipoIconoPorLugar(), _mapaRequiereReservaPorLugar()]);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const eventos: any[] = [];
  for (const fila of (data ?? [])) {
    const fecha = fila.fecha ? new Date(fila.fecha + 'T00:00:00') : null;
    if (!fecha) continue;
    if (mes && fila.fecha.substring(0, 7) !== mes) continue;
    if (lugar && fila.donde !== lugar) continue;
    const icono = tipoIcono[fila.donde] ?? 'Entrenamiento';
    if (tipo && icono !== tipo) continue;
    const esFuturo = fecha >= hoy;
    if (estado === 'proximos' && !esFuturo) continue;
    if (estado === 'pasados' && esFuturo) continue;
    eventos.push({ idEvento: fila.id_evento, fecha: fila.fecha, lugar: fila.donde, horaInicio: fila.inicia, horaFin: fila.termina, estado: fila.estado, tipoIcono: icono, requiereReserva: requiereReserva[fila.donde] !== false });
  }
  eventos.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
  return { eventos };
}

const ESTADOS_RSVP = ['Asistiré', 'No asistiré', 'No jugador'];
// Estados RSVP que representan una baja -- usados para decidir si avisar a
// los admins cuando alguien cambia de 'Asistiré' a uno de estos (ver más
// abajo). No incluye el caso "nunca había respondido"/estado inicial, solo
// una baja real desde 'Asistiré'.
const ESTADOS_RSVP_BAJA = ['No asistiré', 'No jugador'];

/** Clase de gracia en el servidor (auditoría de Finanzas, 2026-11-26): la app
 *  ya bloqueaba el botón (`motivoSinAsistire` en eventos_repo.dart), pero
 *  Asistencia anticipada (`origenAuto`) seguía creando "Asistiré" a quien
 *  debe la cuota (caso Pechugas: 15 filas hasta 2027). Misma regla que la
 *  app: equipo con clases de gracia, mes sin pagar, y ya usó (o reservó con
 *  "Asistiré") todas sus clases de gracia del mes. Solo exentxs, libres (los Pivots también pagan).
 *  Devuelve el motivo o null si puede marcar. */
async function _motivoSinAsistireServidor(nombre: string, idEvento: string): Promise<string | null> {
  const { data: ev } = await supabase.from('asistencias').select('fecha, tipo_evento').eq('id_evento', idEvento).maybeSingle();
  if (!ev?.fecha || ev.tipo_evento !== 'Entrenamiento') return null;
  const { data: p } = await supabase.from('equipo').select('categoria, exenta_cuota, estado_miembro, roles').eq('username', nombre).maybeSingle();
  if (!p || p.exenta_cuota === true || p.estado_miembro === 'Técnico') return null;
  // Pivots también (Victor, 2026-11-26): si deben, se les aplica igual que a todxs.
  const reglas = await _reglasLiga();
  const eq = String(p.categoria ?? '');
  const g = (reglas.graciaClases ?? {})[eq];
  if (g === undefined || g === null || _cobroEquipo(reglas, eq).modo !== 'mes') return null;
  const n = Math.max(0, Number(g) || 0);
  const fecha = String(ev.fecha).slice(0, 10);
  const mes = fecha.slice(0, 7);
  if ((await _estadosCuotaMes([nombre], mes))[nombre] !== 'debe') return null;
  const [y, m] = mes.split('-').map(Number);
  const nombreMes = _MESES_ES[m - 1];
  if (n === 0) return `Para marcar Asistiré, paga primero tu cuota de ${nombreMes}.`;
  const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const { data: evs } = await supabase.from('asistencias').select('id_evento, fecha, a_horario, tarde')
    .eq('tipo_evento', 'Entrenamiento').not('estado', 'in', '("Evento Cancelado","No se entrena","Eliminado")')
    .gte('fecha', `${mes}-01`).lte('fecha', ultimo).neq('id_evento', idEvento);
  const yo = nombre.trim().toUpperCase();
  const nombres = (v: unknown) => String(v ?? '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
  const vino = new Set((evs ?? []).filter((e: any) => nombres(e.a_horario).includes(yo) || nombres(e.tarde).includes(yo)).map((e: any) => e.id_evento));
  const hoy = _hoyEcuadorISO();
  const futuros = (evs ?? []).filter((e: any) => String(e.fecha).slice(0, 10) >= hoy && !vino.has(e.id_evento)).map((e: any) => e.id_evento);
  let porVenir = 0;
  if (futuros.length) {
    const { data: logs } = await supabase.from('log_asistencias').select('id_evento, estado, marca_temporal')
      .eq('nombre_usuario', nombre).in('id_evento', futuros).in('origen', ['Usuario', 'AsistenciaAnticipada'])
      .order('marca_temporal', { ascending: false });
    const visto = new Set<string>();
    for (const l of logs ?? []) {
      if (visto.has(l.id_evento)) continue;
      visto.add(l.id_evento);
      if (l.estado === 'Asistiré') porVenir++;
    }
  }
  if (vino.size + porVenir < n) return null;
  return `Ya usaste ${n === 1 ? 'tu clase' : `tus ${n} clases`} de gracia de ${nombreMes}. Paga tu cuota para marcar Asistiré.`;
}

/** Lo que una persona le debe al equipo (Victor, 2026-11-26). Solo lo que la
 *  app tiene registrado: cuotas desde noviembre de 2026 (la regla de gracia)
 *  que figuran como "debe" y saldos en contra (clases sin reserva, deudas
 *  anotadas). Un comprobante enviado ya cuenta como pagado. Coaches y exentxs
 *  no deben nada aquí; los Pivots sí (Victor, 2026-11-26). */
async function _deudaPersona(username: string): Promise<{ items: any[]; total: number }> {
  const { data: p } = await supabase.from('equipo').select('username, categoria, exenta_cuota, estado_miembro, roles, eliminado_en').eq('username', username).maybeSingle();
  if (!p || p.eliminado_en || p.exenta_cuota === true || p.estado_miembro === 'Técnico') return { items: [], total: 0 };
  // Los Pivots no se eximen (Victor, 2026-11-26): solo coaches aprobados y exentxs.
  const { data: c } = await supabase.from('coaches').select('estado').eq('username', username).maybeSingle();
  if (c?.estado === 'aprobado') return { items: [], total: 0 };
  const items: any[] = [];
  const hoyMes = _hoyEcuadorISO().slice(0, 7);
  for (let mes = CUOTA_POR_ASISTENCIA_DESDE; mes <= hoyMes; ) {
    const debe = (await _debeCuotaMes([p], mes))[username];
    if (debe?.debe && (await _estadosCuotaMes([username], mes))[username] === 'debe') {
      const m = Number(mes.slice(5, 7));
      items.push({ tipo: 'cuota', mes, que: `Cuota de ${_MESES_ES[m - 1]}`, monto: debe.monto, motivo: debe.motivo });
    }
    const [y, mm] = mes.split('-').map(Number);
    mes = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
  }
  const saldo = await _saldoDisponible(username);
  if (saldo < 0) items.push({ tipo: 'saldo', que: 'Deuda con el equipo', monto: _num2(-saldo), motivo: 'Clases sin reserva u otras deudas anotadas' });
  return { items, total: _num2(items.reduce((t, x) => t + Number(x.monto), 0)) };
}

/** La persona: qué debe y si la liga bloquea la app hasta pagar. */
async function getMiDeuda(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const modo = String((await _reglasLiga()).deudaModo ?? 'asistire');
  if (modo === 'no') return { exito: true, modo, items: [], total: 0, bloquea: false };
  const d = await _deudaPersona(yo);
  return { exito: true, modo, ...d, bloquea: modo === 'bloqueo' && d.total > 0 };
}

async function marcarAsistenciaUsuario(params: Record<string, any>): Promise<Record<string, any>> {
  // Seguridad (2026-11-06, pedido explícito): la identidad sale SIEMPRE del
  // token de sesión. Antes se usaba `params.nombre` sin validar, así que
  // cualquiera podía marcar la asistencia de otra persona. `params.nombre`
  // se sigue aceptando (la web y la app lo mandan) pero se ignora.
  const nombre = await _validarToken(params.token);
  if (!nombre) return { exito: false, error: 'Tu sesión venció. Vuelve a iniciar sesión.' };
  const { idEvento, estado } = params;
  if (!idEvento) return { exito: false, error: 'Evento inválido.' };
  if (!ESTADOS_RSVP.includes(estado)) return { exito: false, error: 'Estado inválido.' };

  const esAuto = params.origenAuto === true || params.origenAuto === 'true';
  if (estado === 'Asistiré') {
    const motivo = await _motivoSinAsistireServidor(nombre, String(idEvento).trim());
    // Anticipada: se omite en silencio (la regla vuelve a intentar cuando pague).
    if (motivo) return esAuto ? { exito: true, omitido: 'cuota' } : { exito: false, error: motivo, cuotaPendiente: true };
    // Otras deudas registradas (clases sin reserva…): tampoco deja marcar Asistiré, salvo que la liga lo desactive.
    if (String((await _reglasLiga()).deudaModo ?? 'asistire') !== 'no') {
      const { data: evT } = await supabase.from('asistencias').select('tipo_evento').eq('id_evento', String(idEvento).trim()).maybeSingle();
      const deuda = evT?.tipo_evento === 'Entrenamiento' ? (await _deudaPersona(nombre)).items.filter((x) => x.tipo === 'saldo') : [];
      if (deuda.length) {
        const m = `Tienes una deuda de ${_monedaLiga}${deuda[0].monto} con el equipo. Págala para marcar Asistiré.`;
        return esAuto ? { exito: true, omitido: 'deuda' } : { exito: false, error: m, deudaPendiente: true };
      }
    }
  }

  // Auto-persist de reglas de asistencia anticipada (`origenAuto`, ver
  // _evAntReconciliarConReglas() en js/eventos.js): esa función solo debe
  // escribir si la persona TODAVÍA no tiene ninguna respuesta para este
  // evento -- pero `_evCargarDatosReales()` se llama desde 6 puntos
  // distintos del frontend sin ningún lock entre sí, así que 2+ pasadas de
  // reconciliación pueden correr en paralelo (o desde pestañas/dispositivos
  // distintos), leer las 2 "todavía sin responder" antes de que la primera
  // termine de escribir, y disparar 2+ auto-persists para el mismo evento
  // (bug real reportado por Victor -- decenas de filas 'AsistenciaAnticipada'
  // duplicadas en log_asistencias para el mismo id_evento+nombre). El guard
  // del cliente (`yaGuardado`, chequea `ev.rsvps` ya cargado) no alcanza para
  // cerrar esa carrera porque lee un snapshot que puede quedar viejo antes de
  // que la escritura anterior sea visible. Server-side, autoritativo: si YA
  // existe CUALQUIER fila (de cualquier origen) para este idEvento+nombre,
  // no-op -- la intención de "auto-persist" es completar un RSVP ausente,
  // nunca agregar otra fila si ya hay una respuesta real o automática previa.
  if (esAuto) {
    const { data: existente } = await supabase.from('log_asistencias')
      .select('id').eq('id_evento', idEvento).eq('nombre_usuario', nombre).limit(1).maybeSingle();
    if (existente) return { exito: true };
  }

  // RSVP anterior de ESTA persona en ESTE evento (origen 'Usuario', la última
  // fila por marca_temporal) -- leído ANTES de insertar la fila nueva de log,
  // igual criterio que adminMarcarAsistencia() usa para "marcaPrevia" más
  // abajo en este archivo. Solo hace falta si el estado nuevo es una baja --
  // evita la query en el camino normal (marcar 'Asistiré', la mayoría).
  let eraAsistire = false;
  if (ESTADOS_RSVP_BAJA.includes(estado)) {
    const { data: previo } = await supabase.from('log_asistencias')
      .select('estado').eq('id_evento', idEvento).eq('nombre_usuario', nombre).eq('origen', 'Usuario')
      .order('marca_temporal', { ascending: false }).limit(1).maybeSingle();
    eraAsistire = previo?.estado === 'Asistiré';
  }

  const origenFinal = esAuto ? 'AsistenciaAnticipada' : 'Usuario';
  if (!esAuto) {
    // Click manual: limpiar filas RSVP previas para que el click siempre sea definitivo
    await supabase.from('log_asistencias')
      .delete()
      .eq('id_evento', idEvento)
      .eq('nombre_usuario', nombre)
      .in('origen', ['Usuario', 'AsistenciaAnticipada']);
  }
  const { error: errLog } = await _agregarFilaLogAsistencia(String(idEvento).trim(), nombre, origenFinal, estado);
  if (errLog) return { exito: false, error: 'No se pudo guardar la asistencia: ' + errLog };

  // Reactivación implícita por RSVP (movida desde js/eventos.js, 2026-09-30):
  // quien marca 'Asistiré' a mano estando Ausente/Lesionadx vuelve a Activx.
  // Antes el front lo hacía mandando `estado_miembro` por
  // actualizarDatosPersona, que ya no acepta ese campo. Solo con token propio
  // (este endpoint no lo exige para el RSVP en sí). Pasa por
  // `_reactivarMiembro()` para la limpieza completa (categoría pre-lesión,
  // exenta_cuota); `cerrarReglas:false` conserva el comportamiento anterior
  // (el RSVP puntual no borra la asistencia anticipada vigente).
  let reactivacion: Record<string, any> = {};
  if (!esAuto && estado === 'Asistiré') {
    const username = await _validarToken(params.token);
    if (username && username === nombre) {
      const { data: fila } = await supabase.from('equipo').select(SELECT_ESTADO_MIEMBRO).eq('username', nombre).maybeSingle();
      if (fila && (fila.estado_miembro === 'Ausente' || fila.estado_miembro === 'Lesionadx')) {
        const r = await _reactivarMiembro(nombre, fila, { cerrarReglas: false });
        if (r.exito) reactivacion = { reactivado: true, categoria: r.categoria, exentaCuota: fila.estado_miembro === 'Lesionadx' ? false : null };
      }
    }
  }

  if (eraAsistire) {
    const { data: ev } = await supabase.from('asistencias').select('fecha, donde, inicia, tipo_evento').eq('id_evento', idEvento).maybeSingle();
    if (ev) {
      const esHoy = ev.fecha === _hoyEcuadorISO();
      await sendPush({
        tipo: 'avisos_admin',
        include_external_user_ids: await _adminDestinatariosPush(undefined, 'asistencia', 'cambios'),
        headings: { es: 'Baja de asistencia' },
        contents: {
          es: ev.tipo_evento === 'Social'
            ? `${nombre} no asistirá al ${await _eventoFraseAviso(String(idEvento), ev.tipo_evento, ev.fecha)} · ${_horaEs(ev.inicia)}`
            : `${nombre} no asistirá al ${ev.tipo_evento || 'evento'} de ${esHoy ? 'hoy' : _fechaEs(ev.fecha)} · ${_horaEs(ev.inicia)} · ${ev.donde || ''}`,
        },
        url: APP_URL + '/?tab=eventos',
        evento: { idEvento: String(idEvento) },
      });
    }
  }

  return { exito: true, ...reactivacion };
}

// Sugeridos al tomar lista (Victor, 2026-11-12): quienes vinieron el mismo
// día de la semana en al menos 3 de las últimas 4 semanas y no faltaron las
// 2 últimas seguidas. Solo lee los eventos de esas 4 fechas.
async function adminSugeridosAsistencia(params: Record<string, any>): Promise<Record<string, any>> {
  if (!await _validarAdminToken(params.adminToken)) return { exito: false, error: 'Sesión admin inválida.' };
  const base = String(params.fecha ?? '').substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return { exito: false, error: 'Fecha inválida.' };
  const fechas = [7, 14, 21, 28].map((d) => {
    const x = new Date(base + 'T12:00:00Z');
    x.setUTCDate(x.getUTCDate() - d);
    return x.toISOString().substring(0, 10);
  });
  const { data: evs } = await supabase.from('asistencias').select('id_evento, fecha').in('fecha', fechas)
    .not('estado', 'in', '("Evento Cancelado","No se entrena","Eliminado")');
  const semanaDe: Record<string, number> = {};
  (evs ?? []).forEach((e: any) => { semanaDe[e.id_evento] = fechas.indexOf(e.fecha); });
  const ids = Object.keys(semanaDe);
  if (!ids.length) return { exito: true, sugeridos: [] };
  const { data: vigente } = await supabase.rpc('fn_asistencia_vigente_por_evento', { ids });
  const semanas: Record<string, Set<number>> = {};
  for (const [idEv, filas] of Object.entries((vigente ?? {}) as Record<string, any[]>)) {
    for (const f of filas) {
      if (f.origen !== 'Admin' || (f.estado !== 'A tiempo' && f.estado !== 'Tarde')) continue;
      (semanas[f.nombre] ??= new Set()).add(semanaDe[idEv]);
    }
  }
  const sugeridos = Object.entries(semanas)
    .filter(([, s]) => s.size >= 3 && (s.has(0) || s.has(1)))
    .map(([u]) => u);
  return { exito: true, sugeridos };
}

// Admins cambian o quitan la respuesta (Asistiré / No asistiré / No jugador)
// de una persona en un evento (Victor, 2026-11-12). `estado` vacío = quitar.
// Queda como respuesta de la persona (origen 'Usuario'), igual que si la
// hubiera marcado; la asistencia real ('Admin') no se toca.
async function adminCambiarRespuesta(params: Record<string, any>): Promise<Record<string, any>> {
  if (!await _validarAdminToken(params.adminToken)) return { exito: false, error: 'Sesión admin inválida.' };
  const idEvento = String(params.idEvento ?? '').trim();
  const nombre = String(params.nombre ?? '').trim();
  const estado = String(params.estado ?? '').trim();
  if (!idEvento || !nombre) return { exito: false, error: 'Faltan datos.' };
  if (estado && !ESTADOS_RSVP.includes(estado)) return { exito: false, error: 'Estado inválido.' };
  const { error: errBorrar } = await supabase.from('log_asistencias').delete()
    .eq('id_evento', idEvento).eq('nombre_usuario', nombre).in('origen', ['Usuario', 'AsistenciaAnticipada']);
  if (errBorrar) return { exito: false, error: 'No se pudo guardar.' };
  if (estado) {
    const { error } = await _agregarFilaLogAsistencia(idEvento, nombre, 'Usuario', estado);
    if (error) return { exito: false, error: 'No se pudo guardar: ' + error };
  }
  return { exito: true };
}

const ESTADOS_ROLLCALL = ['A tiempo', 'Tarde', 'Ninguno'];
// Bug real corregido de paso (encontrado al probar el wizard de pagos
// manuales, que reusa esta acción -- mismo patrón de hueco de seguridad ya
// encontrado en `adminEliminarUsuario()`/`adminRegistrarPago()` de esta
// misma sesión): esta función NO validaba `adminToken` -- cualquier caller
// sin sesión admin podía forjar/alterar el rollcall real de asistencia de
// cualquiera (impacta racha de puntualidad, tiers, todo lo que depende de
// este dato). El frontend siempre la llamó vía `apiPost` con
// `adminToken: _adminToken` (`_evMarcarAsistenciaAdmin()`/js/eventos.js),
// así que este fix no cambia nada del flujo real existente.
// ─── Crear una liga (Victor, 2026-11-17) ────────────────────────────────────
// Cualquiera puede crear una liga: con Google o con su correo verificado por
// código. La liga se crea recién al final, con todo lo elegido en el
// asistente; quien la crea queda como Pivot con todos los permisos.
function _slugLiga(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'liga';
}

async function verificarNombreLiga(params: Record<string, any>): Promise<Record<string, any>> {
  const nombre = String(params.nombre ?? '').trim();
  const deporte = String(params.deporte ?? 'roller_derby');
  if (!nombre) return { exito: true, existe: false };
  const { data } = await supabaseServicio.from('ligas').select('nombre, ciudad, pais, logo').eq('deporte', deporte).ilike('nombre', nombre);
  return { exito: true, existe: (data ?? []).length > 0, ligas: (data ?? []).map((l: any) => ({ nombre: l.nombre, ciudad: l.ciudad ?? '', pais: l.pais ?? '', logo: l.logo ?? '' })) };
}

async function crearLiga(params: Record<string, any>): Promise<Record<string, any>> {
  const s = supabaseServicio;
  let x: any = params.datos;
  if (typeof x === 'string') { try { x = JSON.parse(x); } catch { x = null; } }
  if (!x || typeof x !== 'object') return { exito: false, error: 'Faltan los datos de la liga.' };
  // Identidad: Google o correo verificado.
  let email = String(params.email ?? '').trim().toLowerCase();
  let foto = '';
  if (params.idToken) {
    const info = await _verificarGoogleToken(String(params.idToken));
    if (!info) return { exito: false, error: 'No se pudo verificar tu cuenta de Google. Vuelve a intentarlo.' };
    email = String(info.email ?? '').toLowerCase();
    foto = info.picture ?? '';
  } else if (!email || !params.registroToken || !(await _registroValido(email, String(params.registroToken)))) {
    return { exito: false, error: 'Verifica tu correo con el código antes de crear la liga.' };
  }
  const p = x.perfil ?? {};
  const usuario = String(p.usuario ?? '').trim();
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]{2,40}$/.test(usuario)) return { exito: false, error: 'Tu nombre de usuario solo puede tener letras y espacios.' };
  const { data: yaEmail } = await s.from('equipo').select('username').ilike('email', email).is('eliminado_en', null).limit(1);
  if ((yaEmail ?? []).length) return { exito: false, error: 'Ese correo ya tiene una cuenta en Pivot. Por ahora cada persona está en una sola liga.' };
  const { data: yaUsuario } = await s.from('equipo').select('username').ilike('username', usuario).limit(1);
  if ((yaUsuario ?? []).length) return { exito: false, error: 'Ese nombre de usuario ya está en uso. Prueba con otro.' };

  const nombre = String(x.nombre ?? '').trim().slice(0, 80);
  if (!nombre) return { exito: false, error: 'Ponle un nombre a tu liga.' };
  // Enlace único: si ya existe, se suma un número que no se ve en la app.
  const base = _slugLiga(nombre);
  let slug = base;
  for (let i = 2; i < 200; i++) {
    const { data: hay } = await s.from('ligas').select('id').eq('slug', slug).maybeSingle();
    if (!hay) break;
    slug = `${base}-${i}`;
  }
  const { data: liga, error: e1 } = await s.from('ligas').insert({
    nombre, slug, deporte: 'roller_derby', pais: String(x.pais ?? '').slice(0, 2) || null, ciudad: String(x.ciudad ?? '').trim().slice(0, 60) || null,
    moneda: String(x.monedaCodigo ?? '').slice(0, 3) || null, zona_horaria: String(x.zonaHoraria ?? 'America/Guayaquil').slice(0, 60), logo: String(x.logo ?? '') || null, creada_por: email,
  }).select('id, slug').single();
  if (e1 || !liga) return { exito: false, error: 'No se pudo crear la liga: ' + (e1?.message ?? '') };

  const cliente = await _clienteDeLiga(liga.id);
  try {
    return await _alsLiga.run({ cliente, ligaId: liga.id }, async () => {
      // Equipos (el marcado como "entran aquí" recibe a la gente nueva).
      const equipos = (Array.isArray(x.equipos) && x.equipos.length ? x.equipos : [{ nombre: 'Equipo principal', nuevxs: true }])
        .slice(0, 12).map((e: any, i: number) => ({ nombre: String(e?.nombre ?? '').trim().slice(0, 40) || `Equipo ${i + 1}`, nuevxs: e?.nuevxs === true, cuota: e?.cuota }));
      if (!equipos.some((e: any) => e.nuevxs)) equipos[equipos.length - 1].nuevxs = true;
      await supabase.from('config_tiers').insert(equipos.map((e: any, i: number) => ({ orden: i + 1, nombre: e.nombre, es_default: e.nuevxs, puntos_fuente: 'todos' })));
      // Reglas.
      const c = x.cuota ?? {};
      const cobra = c.cobra === true;
      const cobroEquipos: Record<string, any> = {};
      for (const e of equipos) {
        const propio = c.igual === false ? Number(e.cuota) : null;
        cobroEquipos[e.nombre] = cobra ? { modo: 'mes', precioMensual: propio != null && Number.isFinite(propio) ? propio : null, precioClase: null } : { modo: x.claseSuelta?.vende ? 'clase' : 'sin_cobro', precioMensual: null, precioClase: null };
      }
      const ec = String(x.pais ?? '') === 'EC';
      const reglas: Record<string, any> = {
        cuotaVenceDia: cobra ? Math.max(0, Math.min(28, Math.round(Number(c.dia) || 0))) : 0,
        cuotaRecargo: cobra && c.recargo ? Math.max(0, Number(c.recargo) || 0) : 0,
        cuotaRecargoTipo: c.recargoTipo === 'porcentaje' ? 'porcentaje' : 'fijo',
        cuotaRecargoModo: c.recargoModo === 'mensual' ? 'mensual' : 'unico',
        recompensaPago: { activa: x.premios === true, puntos: 1, claseGratis: false, saldo: 0 },
        cobroEquipos, graciaClases: {},
        atencionMedica: ec ? ['MSP (Ministerio de Salud Pública)', 'IESS', 'Seguro Privado'] : ['Sistema público de salud', 'Seguro Privado'],
        segurosPrivados: ec ? ['Saludsa', 'Ecuasanitas', 'Humana', 'BMI del Ecuador', 'Confiamed', 'BUPA Ecuador', 'Pan American Life', 'CruzBlanca'] : [],
      };
      const filas: any[] = [
        { key: 'reglas_liga', value: JSON.stringify(reglas) },
        { key: 'precio_mensual', value: String(cobra ? Math.max(0, Number(c.monto) || 0) : 0) },
        { key: 'precio_por_clase', value: String(x.claseSuelta?.vende ? Math.max(0, Number(x.claseSuelta.precio) || 0) : 0) },
        { key: 'pais_equipo', value: String(x.pais ?? 'EC').slice(0, 2) },
        { key: 'zona_horaria', value: String(x.zonaHoraria ?? 'America/Guayaquil') },
        { key: 'moneda', value: String(x.moneda ?? '$').slice(0, 8) },
        { key: 'moneda_codigo', value: String(x.monedaCodigo ?? 'USD').slice(0, 3) },
        { key: 'logo_liga', value: String(x.logo ?? '') },
        { key: 'login_correo', value: 'true' },
        { key: 'solicitudes_pivots', value: 'auto' },
        { key: 'asistente_rapido', value: x.modo === 'rapido' ? 'true' : 'false' },
        { key: 'equipos_corte', value: JSON.stringify(x.cambiosEquipo === true ? { modo: 'revisar', dia: 1, avisoDias: 7, autoAprobar: true } : { modo: 'revisar', dia: 1, avisoDias: 7, autoAprobar: false }) },
      ];
            if (Array.isArray(x.roles) && x.roles.length) {
        filas.push({ key: 'roles_equipo', value: JSON.stringify([...new Set([...x.roles.map((r: any) => String(r).trim().slice(0, 30)).filter(Boolean), ROL_COACH])].slice(0, 30)) });
      }
      if (Array.isArray(x.medios) && x.medios.length) {
        filas.push({ key: 'formas_pago', value: JSON.stringify({ medios: x.medios.slice(0, 10).map((m: any, i: number) => ({
          id: `medio${i + 1}`, tipo: ['transferencia', 'efectivo', 'billetera', 'enlace'].includes(String(m?.tipo)) ? String(m.tipo) : 'transferencia',
          nombre: String(m?.nombre ?? '').trim().slice(0, 40) || 'Pago', datos: [], enlace: String(m?.enlace ?? '').trim().slice(0, 300), activo: true, logo: '', color: '',
        })) }) });
      }
      await supabase.from('config_app').upsert(filas, { onConflict: 'liga_id,key' });
      // Entrenamientos: un evento que se repite por cada horario.
      const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const ents = (Array.isArray(x.entrenamientos) ? x.entrenamientos : []).slice(0, 10).map((t: any) => ({
        lugar: String(t?.lugar ?? '').trim().slice(0, 80) || 'Por definir',
        dias: (Array.isArray(t?.dias) ? t.dias : []).filter((d: any) => dias.includes(String(d))).join(', '),
        inicia: /^\d{2}:\d{2}$/.test(String(t?.inicia)) ? t.inicia : '19:00', finaliza: /^\d{2}:\d{2}$/.test(String(t?.finaliza)) ? t.finaliza : '21:00',
        tipo: 'Días de la semana', tipo_icono: 'Entrenamiento', requiere_reserva: x.claseSuelta?.vende === true,
      })).filter((t: any) => t.dias);
      if (ents.length) {
        await supabase.from('venues').insert(ents);
        await supabase.rpc('regenerar_ventana_asistencias');
      }
      // Tu cuenta, y quedas Pivot con todos los permisos.
      const ins = await inscribirPersona({
        nombre: usuario, email, pronombres: p.pronombres ?? '', foto: p.foto || foto, fechaNac: p.fechaNac ?? '',
        prefijo: p.prefijo ?? '', telefono: p.telefono ?? '', necesitaPatines: 'No', necesitaProtecciones: 'No',
        ...(params.idToken ? { idToken: params.idToken } : { registroToken: params.registroToken }),
      });
      if (ins.exito !== true) throw new Error(String(ins.error ?? 'No se pudo crear tu cuenta.'));
      const extra: Record<string, any> = {};
      if (p.nombreDerby) extra.nombre_derby = String(p.nombreDerby).trim().slice(0, 40);
      if (p.numeroDerby) extra.numero_derby = String(p.numeroDerby).trim().slice(0, 8);
      if (Array.isArray(p.roles)) extra.roles = p.roles.map((r: any) => String(r).trim()).filter(Boolean).slice(0, 10);
            if (Object.keys(extra).length) await supabase.from('equipo').update(extra).eq('username', usuario);
      // Quien crea la liga y se pone Coach ya es coach de toda la liga.
      if (Array.isArray(extra.roles) && extra.roles.includes(ROL_COACH)) {
        await supabase.from('coaches').upsert({ username: usuario, estado: 'aprobado', equipos: [], resuelto_por: email, resuelto_en: new Date().toISOString() });
      }
      await supabase.from('admins').insert({ email, areas: AREAS_PIVOT, invited_by: 'creó la liga' });
      const adminToken = await _crearAdminToken(email);
      const fila = await _getEquipoRow(usuario);
      return { exito: true, token: ins.token, nombre: usuario, datos: getDatosCompletos(fila), esAdmin: true, adminToken, liga: { id: liga.id, nombre, slug: liga.slug } };
    });
  } catch (e) {
    // Si algo falló a mitad de camino, la liga no queda a medias.
    await s.from('ligas').delete().eq('id', liga.id).then(() => {}, () => {});
    return { exito: false, error: String((e as Error).message ?? e) };
  }
}

// Directorio "Ligas en Pivot" (para Pivots) y lo que muestra tu liga.
async function getDirectorioLigas(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const { data } = await supabaseServicio.from('ligas').select('id, nombre, slug, deporte, ciudad, pais, logo, contacto, mostrar_comunidad, visible').order('nombre');
  const conComunidad = (data ?? []).filter((l: any) => l.visible && l.mostrar_comunidad).map((l: any) => l.id);
  const { data: com } = conComunidad.length ? await supabaseServicio.from('config_app').select('liga_id, value').eq('key', 'comunidad').in('liga_id', conComunidad) : { data: [] };
  const mia = _ligaEnCurso();
  return {
    exito: true,
    ligas: (data ?? []).filter((l: any) => l.visible || l.id === mia).map((l: any) => {
      let comunidad: any[] = [];
      try { comunidad = JSON.parse((com ?? []).find((c: any) => c.liga_id === l.id)?.value ?? '[]'); } catch { comunidad = []; }
      return { id: l.id, nombre: l.nombre, deporte: l.deporte, ciudad: l.ciudad ?? '', pais: l.pais ?? '', logo: l.logo ?? '', contacto: l.contacto ?? {}, comunidad, mia: l.id === mia };
    }),
  };
}

async function adminMiLigaDirectorio(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const id = _ligaEnCurso();
  if (String(params.accion ?? '') === 'guardar') {
    let contacto: any = params.contacto;
    if (typeof contacto === 'string') { try { contacto = JSON.parse(contacto); } catch { contacto = {}; } }
    const limpio: Record<string, string> = {};
    for (const k of ['correo', 'telefono', 'web', 'instagram']) if (contacto?.[k]) limpio[k] = String(contacto[k]).trim().slice(0, 120);
    await supabaseServicio.from('ligas').update({
      visible: params.visible !== false && params.visible !== 'false', mostrar_comunidad: params.mostrarComunidad === true || params.mostrarComunidad === 'true',
      contacto: limpio, ciudad: String(params.ciudad ?? '').trim().slice(0, 60) || null,
    }).eq('id', id);
  }
  const { data } = await supabaseServicio.from('ligas').select('nombre, ciudad, pais, visible, contacto, mostrar_comunidad').eq('id', id).maybeSingle();
  return { exito: true, liga: data };
}

// Panel del dueño de Pivot: todas las ligas.
async function superLigas(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const { data: duenx } = await supabaseServicio.from('pivot_duenos').select('email').ilike('email', email).maybeSingle();
  if (!duenx) return { exito: false, error: 'Solo para el equipo de Pivot.' };
  const { data: ligas } = await supabaseServicio.from('ligas').select('id, nombre, slug, deporte, ciudad, pais, logo, creada_en, creada_por, visible').order('creada_en', { ascending: false });
  const { data: gente } = await supabaseServicio.from('equipo').select('liga_id').is('eliminado_en', null);
  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: act } = await supabaseServicio.from('log_asistencias').select('liga_id').gte('marca_temporal', desde).limit(20000);
  const contar = (l: any[] | null, id: string) => (l ?? []).filter((r: any) => r.liga_id === id).length;
  return { exito: true, ligas: (ligas ?? []).map((l: any) => ({ ...l, personas: contar(gente, l.id), marcas30: contar(act, l.id) })) };
}

async function esDuenxPivot(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: true, duenx: false };
  const { data } = await supabaseServicio.from('pivot_duenos').select('email').ilike('email', email).maybeSingle();
  return { exito: true, duenx: !!data };
}

// ─── Reglamento de roller derby (Victor, 2026-11-28) ────────────────────────
// Sale del Google Doc de Victor (público con enlace): cada día se vuelve a
// leer y, si cambió, la app baja la versión nueva. Además se mira si WFTDA
// publicó reglas nuevas para avisarle a quien mantiene el documento.
const REGLAMENTO_DOC = '101ePQod3KS4IwBLdjqn4gMlDqLpuONBxl_UvEjflxhg';
const WFTDA_PDFS = ['https://static.wftda.com/rules/wftda-rules-spanish-neutro.pdf', 'https://static.wftda.com/rules/wftda-rules-english.pdf'];

async function _contenido(clave: string): Promise<any | null> {
  const { data } = await supabaseServicio.from('contenido_pivot').select('valor, version, actualizado_en').eq('clave', clave).maybeSingle();
  return data ?? null;
}
async function _guardarContenido(clave: string, valor: any, version: string | null = null): Promise<void> {
  await supabaseServicio.from('contenido_pivot').upsert({ clave, valor, version, actualizado_en: new Date().toISOString() });
}

/** Lee el documento y guarda la versión nueva si cambió. */
async function _actualizarReglamento(): Promise<{ cambio: boolean; version?: string; error?: string; cuenta?: Record<string, number> }> {
  const r = await fetch(`https://docs.google.com/document/d/${REGLAMENTO_DOC}/export?format=md`, { redirect: 'follow' });
  if (!r.ok) return { cambio: false, error: `El documento no se pudo leer (${r.status}).` };
  const md = await r.text();
  const regl = procesarReglamento(md);
  const cuenta = { secciones: regl.secciones.length, casos: regl.casos.length, glosario: regl.glosario.length, faltas: regl.faltas.length };
  // Un documento casi vacío es un error de lectura, no una versión nueva.
  if (regl.secciones.length < 50) return { cambio: false, error: 'El documento llegó incompleto; se mantiene la versión anterior.', cuenta };
  const ya = await _contenido('reglamento');
  if (ya?.version === regl.version) return { cambio: false, version: regl.version, cuenta };
  await _guardarContenido('reglamento', regl, regl.version);
  return { cambio: true, version: regl.version, cuenta };
}

/** Huella de los PDF oficiales de WFTDA (fecha y tamaño que da el servidor). */
async function _huellaWftda(): Promise<string> {
  const partes: string[] = [];
  for (const u of WFTDA_PDFS) {
    try {
      const r = await fetch(u, { method: 'HEAD' });
      partes.push(r.ok ? `${r.headers.get('last-modified') ?? ''}|${r.headers.get('etag') ?? ''}|${r.headers.get('content-length') ?? ''}` : '');
    } catch { partes.push(''); }
  }
  return partes.join('#');
}

// Una vez al día (la primera liga del cron hace la parte global); a cada liga
// solo le toca avisar a quien es del equipo de Pivot.
async function _cronReglamento(): Promise<void> {
  const hoy = _hoyEcuadorISO();
  const rev = await _contenido('reglamento_revision');
  if (rev?.valor?.dia !== hoy) {
    await _guardarContenido('reglamento_revision', { dia: hoy });
    try { await _actualizarReglamento(); } catch (e) { console.error('[reglamento] actualizar:', e); }
    try {
      const huella = await _huellaWftda();
      const antes = await _contenido('wftda_huella');
      if (huella.replace(/[#|]/g, '')) {
        if (antes?.valor?.huella && antes.valor.huella !== huella) await _guardarContenido('wftda_cambio', { huella, fecha: hoy, avisadas: [] });
        if (antes?.valor?.huella !== huella) await _guardarContenido('wftda_huella', { huella });
      }
    } catch (e) { console.error('[reglamento] wftda:', e); }
  }
  const cambio = await _contenido('wftda_cambio');
  if (!cambio?.valor || cambio.valor.visto) return;
  const liga = _ligaEnCurso();
  const avisadas: string[] = cambio.valor.avisadas ?? [];
  if (avisadas.includes(liga)) return;
  await _guardarContenido('wftda_cambio', { ...cambio.valor, avisadas: [...avisadas, liga] });
  const { data: duenos } = await supabaseServicio.from('pivot_duenos').select('email');
  const correos = (duenos ?? []).map((d: any) => String(d.email).toLowerCase());
  if (!correos.length) return;
  const { data: gente } = await supabase.from('equipo').select('username, email').is('eliminado_en', null);
  const usuarios = (gente ?? []).filter((g: any) => correos.includes(String(g.email ?? '').toLowerCase())).map((g: any) => g.username);
  if (!usuarios.length) return;
  await sendPush({
    tipo: 'avisos_admin', personal: true, include_external_user_ids: usuarios, pantalla: 'reglamento',
    headings: { es: '📏 WFTDA actualizó las reglas' }, contents: { es: 'Revisa los cambios y actualiza el documento del reglamento. Pivot lo toma solo al día siguiente.' },
  });
}

async function getReglamento(params: Record<string, any>): Promise<Record<string, any>> {
  const c = await _contenido('reglamento');
  const email = params.adminToken ? await _validarAdminToken(String(params.adminToken)) : null;
  let wftda: any = null;
  if (email) {
    const { data: duenx } = await supabaseServicio.from('pivot_duenos').select('email').ilike('email', email).maybeSingle();
    const cambio = duenx ? await _contenido('wftda_cambio') : null;
    if (cambio?.valor && !cambio.valor.visto) wftda = { fecha: cambio.valor.fecha };
  }
  if (!c) return { exito: true, version: null, wftda };
  if (String(params.version ?? '') === c.version) return { exito: true, version: c.version, igual: true, wftda };
  return { exito: true, version: c.version, reglamento: c.valor, actualizado: c.actualizado_en, wftda };
}

// Solo el equipo de Pivot: leer el documento ahora o marcar como visto el
// aviso de WFTDA.
async function superReglamento(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const { data: duenx } = await supabaseServicio.from('pivot_duenos').select('email').ilike('email', email).maybeSingle();
  if (!duenx) return { exito: false, error: 'Solo para el equipo de Pivot.' };
  if (params.accion === 'visto') {
    const cambio = await _contenido('wftda_cambio');
    if (cambio?.valor) await _guardarContenido('wftda_cambio', { ...cambio.valor, visto: true });
    return { exito: true };
  }
  const r = await _actualizarReglamento();
  return r.error ? { exito: false, ...r } : { exito: true, ...r };
}

// ─── Coach (Victor, 2026-11-16) ─────────────────────────────────────────────
// La persona pide ser coach (o un Pivot la nombra) y elige sus equipos. El
// coach ve a sus jugadorxs (sin datos de salud), lleva su ficha deportiva
// (habilidades de WFTDA editables), toma notas escritas o dictadas (decide
// quién más las ve), arma el cronograma de cada evento y toma asistencia.
async function _coachDe(token: string): Promise<{ user: string; equipos: string[] } | null> {
  const user = await _validarToken(token);
  if (!user) return null;
  const { data } = await supabase.from('coaches').select('equipos, estado').eq('username', user).maybeSingle();
  if (!data || data.estado !== 'aprobado') return null;
  return { user, equipos: (data.equipos as string[]) ?? [] };
}

async function _jugadorxsDe(equipos: string[]): Promise<any[]> {
    let q = supabase.from('equipo').select('username, nombre_derby, foto_perfil, categoria, estado_miembro, pronombres, nivel_coach').is('eliminado_en', null);
  if (equipos.length) q = q.in('categoria', equipos);
  const { data } = await q.order('username');
  return data ?? [];
}

async function _puedeVer(coach: { user: string; equipos: string[] }, username: string): Promise<boolean> {
  const { data } = await supabase.from('equipo').select('categoria').eq('username', username).is('eliminado_en', null).maybeSingle();
  return !!data && (!coach.equipos.length || coach.equipos.includes(data.categoria));
}

/// Asistencias de los últimos 30 días por persona (eventos distintos).
async function _asistencias30(usernames: string[]): Promise<Record<string, number>> {
  if (!usernames.length) return {};
  const desde = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase.from('log_asistencias').select('nombre_usuario, id_evento, estado, marca_temporal')
    .in('nombre_usuario', usernames).gte('fecha_entrenamiento', desde).order('marca_temporal');
  const ultimo: Record<string, string> = {};
  for (const r of data ?? []) ultimo[`${r.nombre_usuario}|${r.id_evento}`] = r.estado;
  const n: Record<string, number> = {};
  for (const [k, e] of Object.entries(ultimo)) if (e === 'A tiempo' || e === 'Tarde') n[k.split('|')[0]] = (n[k.split('|')[0]] ?? 0) + 1;
  return n;
}

async function _habilidades(): Promise<any[]> {
    const { data } = await supabase.from('coach_habilidades').select('id, categoria, nombre, orden, activa, nivel').order('orden');
  return data ?? [];
}

/// Niveles de habilidades de la liga, en orden (Victor, 2026-11-27). Una liga
/// nueva arranca con los dos de siempre.
const _NIVELES_BASE = [
  { clave: 'basica', nombre: 'Habilidades básicas', orden: 1, regla: 'todas', porcentaje: 100 },
  { clave: 'avanzada', nombre: 'Habilidades avanzadas', orden: 2, regla: 'todas', porcentaje: 100 },
];
/// Logros por grupo (Victor, 2026-11-27): un nivel o un grupo se completa al
/// lograr TODAS sus habilidades; ya no hay regla de porcentaje ni «una». Se
/// manda `regla: 'todas'` para que las versiones viejas de la app calculen igual.
async function _nivelesLiga(): Promise<any[]> {
  const { data } = await supabase.from('coach_niveles').select('clave, nombre, orden').order('orden');
  if (data?.length) return data.map((n: any) => ({ ...n, regla: 'todas', porcentaje: 100 }));
  await supabase.from('coach_niveles').insert(_NIVELES_BASE);
  return _NIVELES_BASE;
}

/// Nivel de una persona según lo logrado: los niveles se completan en orden y
/// cada uno al lograr todas sus habilidades. Un nivel sin habilidades no
/// cuenta. Devuelve la clave del último completo ('sin' si ninguno).
function _calcularNivel(habs: any[], niveles: any[], logradas: Set<string>): { nivel: string; completos: string[] } {
  const activas = habs.filter((h: any) => h.activa !== false);
  const primero = niveles[0]?.clave ?? 'basica';
  let nivel = 'sin';
  const completos: string[] = [];
  for (const n of niveles) {
    const hs = activas.filter((h: any) => (h.nivel || primero) === n.clave);
    if (!hs.length) continue;
    if (!hs.every((h: any) => logradas.has(h.id))) break;
    nivel = n.clave;
    completos.push(n.clave);
  }
  return { nivel, completos };
}

/// Logros (Victor, 2026-11-27): cada nivel y cada grupo de un nivel (Frenos,
/// Elementos…) con TODAS sus habilidades activas logradas. Si se agrega una
/// habilidad, el logro se pierde hasta completarla. Un nivel cuenta aunque el
/// anterior no esté completo. Clave del grupo: `nivel|grupo`.
function _logrosDe(habs: any[], niveles: any[], logradas: Set<string>): { clave: string; tipo: 'nivel' | 'grupo'; nivel: string; grupo?: string; nombre: string; ids: string[] }[] {
  const activas = habs.filter((h: any) => h.activa !== false);
  const primero = niveles[0]?.clave ?? 'basica';
  const out: { clave: string; tipo: 'nivel' | 'grupo'; nivel: string; grupo?: string; nombre: string; ids: string[] }[] = [];
  for (const n of niveles) {
    const hs = activas.filter((h: any) => (h.nivel || primero) === n.clave);
    if (!hs.length) continue;
    const grupos = new Map<string, any[]>();
    for (const h of hs) { const g = String(h.categoria ?? ''); if (!grupos.has(g)) grupos.set(g, []); grupos.get(g)!.push(h); }
    for (const [g, gh] of grupos) {
      if (gh.every((h: any) => logradas.has(h.id))) out.push({ clave: `${n.clave}|${g}`, tipo: 'grupo', nivel: n.clave, grupo: g, nombre: g, ids: gh.map((h: any) => h.id) });
    }
    if (hs.every((h: any) => logradas.has(h.id))) out.push({ clave: n.clave, tipo: 'nivel', nivel: n.clave, nombre: n.nombre, ids: hs.map((h: any) => h.id) });
  }
  return out;
}

/// Claves viejas del nivel de una persona ('basicas', 'avanzadas').
function _claveNivel(v: unknown): string {
  const s = String(v ?? '');
  return s === 'basicas' ? 'basica' : s === 'avanzadas' ? 'avanzada' : s;
}

async function _logradasDe(username: string): Promise<Set<string>> {
  const { data: evs } = await supabase.from('coach_evaluaciones').select('habilidad_id, nivel, creado_en').eq('username', username).order('creado_en', { ascending: false }).limit(2000);
  const vistas = new Set<string>(), l = new Set<string>();
  for (const e of evs ?? []) { if (vistas.has(e.habilidad_id)) continue; vistas.add(e.habilidad_id); if (e.nivel === 'logrado') l.add(e.habilidad_id); }
  return l;
}

/// Aviso de logro (Victor, 2026-11-27): si con lo último que marcó lx
/// entrenadorx la persona completó un nivel o un grupo nuevo.
async function _avisarLogros(username: string, antes: string[]): Promise<void> {
  try {
    const logros = _logrosDe(await _habilidades(), await _nivelesLiga(), await _logradasDe(username));
    const nuevos = logros.filter((x) => !antes.includes(x.clave));
    if (!nuevos.length) return;
    // Un nivel nuevo se nombra solo (ya incluye sus grupos).
    const niv = nuevos.filter((x) => x.tipo === 'nivel');
    const nombres = (niv.length ? niv : nuevos).map((x) => x.nombre);
    const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
    await sendPush({
      tipo: 'logro_nivel', include_external_user_ids: [username], personal: true, pantalla: 'progreso',
      headings: { es: '¡Logro completado!' }, contents: { es: `Completaste ${lista}. Míralo en Mi progreso.` }, url: APP_URL + '/',
    });
  } catch (e) { console.error('[coach] logro', username, e); }
}
/// Claves de los logros que la persona tiene ahora (niveles y grupos).
async function _completosDe(username: string): Promise<string[]> {
  return _logrosDe(await _habilidades(), await _nivelesLiga(), await _logradasDe(username)).map((x) => x.clave);
}

/// Último nivel por habilidad (y cuándo), con historial corto.
async function _fichaHabilidades(username: string): Promise<Record<string, any>> {
  const { data } = await supabase.from('coach_evaluaciones').select('habilidad_id, nivel, creado_en, coach').eq('username', username).order('creado_en', { ascending: false }).limit(500);
  const out: Record<string, any> = {};
  for (const e of data ?? []) {
    const x = out[e.habilidad_id] ??= { nivel: e.nivel, fecha: e.creado_en, historial: [] };
    if (x.historial.length < 6) x.historial.push({ nivel: e.nivel, fecha: e.creado_en });
  }
  return out;
}

function _notaJson(n: any, quien: Record<string, any>) {
  const c = quien[String(n.coach).trim().toUpperCase()] ?? {};
  return { id: n.id, texto: n.texto, porVoz: n.por_voz, visible: n.visible, fecha: n.creado_en, coach: n.coach, coachNombre: c.nombreDerby || n.coach, idEvento: n.id_evento ?? null };
}

// Persona: pedir ser coach y ver su estado.
// ─── Personal de liga (Victor, 2026-11-27) ──────────────────────────────────
// Bench, coaches, NSO o SO que no juegan: sin cuota, sin puntos y fuera de
// los cambios de equipo (`tier_modo` 'fijo'), pero confirman asistencia.
const FUNCIONES_PERSONAL = [ROL_COACH, 'Bench', 'NSO', 'SO'];
function _camposPersonalLiga(si: boolean): Record<string, any> {
  return si ? { personal_liga: true, exenta_cuota: true, tier_modo: 'fijo' } : { personal_liga: false, exenta_cuota: false, tier_modo: 'auto' };
}

/** Pivots: enlace de invitación de Personal de liga y cambiar a alguien. */
async function adminPersonalLiga(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const accion = String(params.accion ?? 'enlace');
  if (accion === 'enlace' || accion === 'nuevoEnlace') {
    const { data: c } = await supabase.from('config_app').select('value').eq('key', 'codigo_personal_liga').maybeSingle();
    let codigo = c?.value as string | undefined;
    if (!codigo || accion === 'nuevoEnlace') {
      codigo = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      await supabase.from('config_app').upsert({ key: 'codigo_personal_liga', value: codigo }, { onConflict: 'liga_id,key' });
    }
    return { exito: true, codigo };
  }
  if (accion === 'cambiar') {
    const nombre = String(params.nombre ?? '');
    const si = params.personal === true || params.personal === 'true';
    const { error } = await supabase.from('equipo').update(_camposPersonalLiga(si)).eq('username', nombre);
    if (error) return { exito: false, error: 'No se pudo guardar.' };
    await _registrarAjuste('personal_liga', !si, { nombre, personal: si }, email);
    return { exito: true };
  }
  return { exito: false, error: 'Acción inválida.' };
}

async function pedirCoach(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const { data: ya } = await supabase.from('coaches').select('estado').eq('username', yo).maybeSingle();
  if (ya?.estado === 'aprobado') return { exito: true, estado: 'aprobado' };
  await supabase.from('coaches').upsert({ username: yo, estado: 'pendiente', mensaje: String(params.mensaje ?? '').trim().slice(0, 300) || null, pedido_en: new Date().toISOString(), resuelto_por: null, resuelto_en: null });
  const admins = await _adminDestinatariosPush(undefined, 'equipo');
  if (admins.length) {
    await sendPush({ tipo: 'nueva_solicitud', include_external_user_ids: admins, headings: { es: 'Pedido para sumarse al equipo técnico' }, contents: { es: `${yo} pidió sumarse al equipo técnico. Revísalo en Notificaciones.` }, url: APP_URL + '/' }).catch(() => {});
  }
  return { exito: true, estado: 'pendiente' };
}

// ─── Pago a coaches (Victor, 2026-11-26) ─────────────────────────────────────
// Regla editable de la liga y por equipo (`config_app.pago_coaches`):
//   { activa, desde: 'aaaa-mm', incluye: { cuotas, clases }, tarde: 0.5,
//     liga: { modo: 'porcentaje' | 'fijo', porcentaje, monto },
//     porEquipo: { <equipo>: { modo, porcentaje, monto } },
//     coaches: { <username>: { desde: 'aaaa-mm-dd' } } }
// Cada mes: lo cobrado a las personas de cada equipo (cuotas del mes que
// cubren + clases pagadas ese mes, según Tesorería) × su porcentaje forma la
// bolsa de ese equipo, que se reparte por entrenamiento dado (los que valen
// para ese equipo: de toda la liga o marcados con ese equipo). Cada
// entrenamiento se divide entre los coaches que estuvieron: a horario cobran
// su parte entera, tarde la mitad (`tarde`). En modo 'fijo', cada coach cobra
// `monto` por entrenamiento (tarde, la mitad). Cancelados o sin coaches: esa
// parte queda para el equipo. Un entrenamiento sin ninguna asistencia
// registrada (datos viejos) cuenta como dado por todos los coaches activos.
// Un coach cobra desde su fecha (`coaches[u].desde` o el día que lo
// aprobaron). El resultado queda en saldos_movimientos como "El equipo le
// debe" (`por = 'regla_coaches'`, `fecha` = primer día del mes), uno por coach
// y mes cerrado; se recalcula a diario y solo cambia si cambió el monto.
const PAGO_COACHES_DEF = {
  activa: true, desde: '2026-01', incluye: { cuotas: true, clases: true }, tarde: 0.5,
  liga: { modo: 'porcentaje', porcentaje: 25, monto: 0 }, porEquipo: {} as Record<string, any>,
  coaches: { Sant: { desde: '2026-01-01' }, Vic: { desde: '2026-01-01' } } as Record<string, any>,
  // Meses sin lista completa (del 10/06 al 2/08 no quedó asistencia guardada):
  // la bolsa del mes se reparte en partes iguales entre los coaches activos.
  mesesIguales: ['2026-06', '2026-07'] as string[],
};

async function _reglaPagoCoaches(): Promise<typeof PAGO_COACHES_DEF> {
  const { data } = await supabase.from('config_app').select('value').eq('key', 'pago_coaches').maybeSingle();
  let r: any = {};
  try { r = data?.value ? JSON.parse(data.value) : {}; } catch { r = {}; }
  return {
    ...PAGO_COACHES_DEF, ...r,
    incluye: { ...PAGO_COACHES_DEF.incluye, ...(r.incluye ?? {}) },
    liga: { ...PAGO_COACHES_DEF.liga, ...(r.liga ?? {}) },
    porEquipo: r.porEquipo ?? {}, coaches: r.coaches ?? PAGO_COACHES_DEF.coaches,
    mesesIguales: Array.isArray(r.mesesIguales) ? r.mesesIguales : PAGO_COACHES_DEF.mesesIguales,
  };
}

function _limpiarReglaCoaches(x: any): Record<string, any> {
  const modo = (v: any) => (v?.modo === 'fijo' ? 'fijo' : 'porcentaje');
  const regla = (v: any) => ({ modo: modo(v), porcentaje: Math.min(100, Math.max(0, Number(v?.porcentaje) || 0)), monto: Math.min(10000, Math.max(0, _num2(Number(v?.monto) || 0))) });
  const porEquipo: Record<string, any> = {};
  for (const [k, v] of Object.entries(x?.porEquipo ?? {})) if (k && v) porEquipo[String(k).slice(0, 60)] = regla(v);
  const coaches: Record<string, any> = {};
  for (const [k, v] of Object.entries(x?.coaches ?? {})) if (/^\d{4}-\d{2}-\d{2}$/.test(String((v as any)?.desde ?? ''))) coaches[String(k).slice(0, 60)] = { desde: String((v as any).desde) };
  return {
    activa: x?.activa !== false,
    desde: /^\d{4}-\d{2}$/.test(String(x?.desde ?? '')) ? String(x.desde) : PAGO_COACHES_DEF.desde,
    incluye: { cuotas: x?.incluye?.cuotas !== false, clases: x?.incluye?.clases !== false },
    tarde: Math.min(1, Math.max(0, Number(x?.tarde ?? 0.5))),
    liga: regla(x?.liga ?? PAGO_COACHES_DEF.liga), porEquipo, coaches,
    mesesIguales: (Array.isArray(x?.mesesIguales) ? x.mesesIguales : PAGO_COACHES_DEF.mesesIguales).filter((m: any) => /^\d{4}-\d{2}$/.test(String(m))).slice(0, 24),
  };
}

/** Entrenamientos de un mes con quién estuvo a horario y tarde (asistencias,
 *  lista tomada en log_asistencias para eventos viejos y la hoja de enero a junio). */
async function _entrenamientosDelMes(mes: string): Promise<{ id: string; fecha: string; dado: boolean; equipos: string[]; horario: string[]; tarde: string[]; conLista: boolean }[]> {
  const [y, m] = mes.split('-').map(Number);
  const desde = `${mes}-01`, hasta = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const nombres = (v: unknown) => String(v ?? '').split(',').map((n) => n.trim()).filter(Boolean);
  const cancelado = (e: string) => ['Evento Cancelado', 'No se entrena', 'Eliminado'].includes(e);
  const out = new Map<string, any>();
  const { data: ev } = await supabase.from('asistencias').select('id_evento, fecha, estado, a_horario, tarde, equipos')
    .eq('tipo_evento', 'Entrenamiento').gte('fecha', desde).lte('fecha', hasta);
  for (const e of ev ?? []) {
    const h = nombres(e.a_horario), t = nombres(e.tarde);
    out.set(e.id_evento, { id: e.id_evento, fecha: String(e.fecha).slice(0, 10), dado: !cancelado(String(e.estado ?? '')), equipos: Array.isArray(e.equipos) ? e.equipos : [], horario: h, tarde: t, conLista: h.length + t.length > 0 });
  }
  // Listas tomadas de eventos que ya no están en asistencias (julio y agosto).
  const { data: logs } = await supabase.from('log_asistencias').select('id_evento, fecha_entrenamiento, nombre_usuario, estado, marca_temporal')
    .gte('fecha_entrenamiento', desde).lte('fecha_entrenamiento', `${hasta}T23:59:59Z`).not('origen', 'in', '("Usuario","AsistenciaAnticipada")')
    .order('marca_temporal', { ascending: false });
  const ultimo = new Map<string, any>();
  // Las asistencias externas (`ext_…`, entrenamientos por fuera de la liga) no cuentan.
  for (const l of logs ?? []) if (!out.has(l.id_evento) && !String(l.id_evento).startsWith('ext_')) { const k = `${l.id_evento}|${l.nombre_usuario}`; if (!ultimo.has(k)) ultimo.set(k, l); }
  for (const l of ultimo.values()) {
    const e = out.get(l.id_evento) ?? { id: l.id_evento, fecha: String(l.fecha_entrenamiento).slice(0, 10), dado: true, equipos: [], horario: [], tarde: [], conLista: true };
    if (l.estado === 'A tiempo') e.horario.push(l.nombre_usuario);
    else if (String(l.estado).toLowerCase().startsWith('tarde')) e.tarde.push(l.nombre_usuario);
    out.set(l.id_evento, e);
  }
  // Hoja vieja (tabla puede no existir todavía: se ignora).
  try {
    const { data: lg, error } = await supabase.from('entrenamientos_legado').select('id_evento, fecha, estado, a_horario, tarde').gte('fecha', desde).lte('fecha', hasta);
    if (!error) for (const e of lg ?? []) if (!out.has(e.id_evento)) {
      const h = nombres(e.a_horario), t = nombres(e.tarde);
      out.set(e.id_evento, { id: e.id_evento, fecha: String(e.fecha).slice(0, 10), dado: !cancelado(String(e.estado ?? '')), equipos: [], horario: h, tarde: t, conLista: h.length + t.length > 0 });
    }
  } catch { /* sin tabla */ }
  // El entrenamiento de hoy cuenta para el reparto cuando termina el día (Victor, 2026-11-28).
  return [...out.values()].filter((e) => e.fecha < _hoyEcuadorISO()).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Cálculo de un mes (no guarda nada). */
async function _pagoCoachesMes(mes: string, regla?: Awaited<ReturnType<typeof _reglaPagoCoaches>>): Promise<Record<string, any>> {
  const r = regla ?? await _reglaPagoCoaches();
  const [y, m] = mes.split('-').map(Number);
  const desde = `${mes}-01`, hasta = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const [{ data: gente }, { data: coachesT }, cuotas, clases, ents] = await Promise.all([
    supabase.from('equipo').select('username, categoria, roles'),
    supabase.from('coaches').select('username, estado, equipos, resuelto_en'),
    r.incluye.cuotas ? _paginado((a, b) => supabase.from('tesoreria_movimientos').select('persona, monto').eq('anulado', false).eq('tipo', 'ingreso').eq('categoria', 'cuota').eq('periodo_anio', y).eq('periodo_mes', m).range(a, b)) : Promise.resolve([]),
    r.incluye.clases ? _paginado((a, b) => supabase.from('tesoreria_movimientos').select('persona, monto').eq('anulado', false).eq('tipo', 'ingreso').eq('categoria', 'clase').gte('fecha', desde).lte('fecha', hasta).range(a, b)) : Promise.resolve([]),
    _entrenamientosDelMes(mes),
  ]);
  const equipoDe: Record<string, string> = {};
  for (const p of gente ?? []) equipoDe[String(p.username).trim().toUpperCase()] = String(p.categoria ?? '');
  // Lo cobrado por equipo ('' = sin equipo: usa la regla de la liga).
  const cobrado: Record<string, number> = {};
  for (const x of [...cuotas, ...clases]) { const e = equipoDe[String(x.persona ?? '').trim().toUpperCase()] ?? ''; cobrado[e] = _num2((cobrado[e] ?? 0) + Number(x.monto)); }
  // Coaches que cobran y desde cuándo.
  const coaches: { u: string; desde: string; equipos: string[] }[] = [];
  const vistos = new Set<string>();
  // Solo cobra quien tiene el rol Coach: Bench u otras funciones del equipo técnico no (Victor, 2026-11-28).
  const esCoach = new Set((gente ?? []).filter((p: any) => Array.isArray(p.roles) && p.roles.includes(ROL_COACH)).map((p: any) => String(p.username)));
  for (const c of coachesT ?? []) if (c.estado === 'aprobado' && esCoach.has(c.username)) { vistos.add(c.username); coaches.push({ u: c.username, desde: r.coaches[c.username]?.desde ?? String(c.resuelto_en ?? desde).slice(0, 10), equipos: c.equipos ?? [] }); }
  for (const [u, v] of Object.entries(r.coaches)) if (!vistos.has(u)) coaches.push({ u, desde: (v as any).desde, equipos: [] });
  const reglaDe = (e: string) => r.porEquipo[e] ?? r.liga;
  const por: Record<string, { monto: number; horario: number; tarde: number; sinLista: number }> = {};
  const sumar = (u: string, v: number, k: 'horario' | 'tarde' | 'sinLista') => { const x = por[u] ??= { monto: 0, horario: 0, tarde: 0, sinLista: 0 }; x.monto += v; x[k]++; };
  // Regla de cada entrenamiento: la de su equipo si tiene una propia; si es de toda la liga, la de la liga.
  const reglaEnt = (e: { equipos: string[] }) => { const x = e.equipos.find((q) => r.porEquipo[q]); return x ? r.porEquipo[x] : r.liga; };
  const en = (l: string[], u: string) => l.some((n) => n.toUpperCase() === u.toUpperCase());
  const quienes = (e: any) => {
    const activos = coaches.filter((c) => c.desde <= e.fecha && (!c.equipos.length || !e.equipos.length || e.equipos.some((x: string) => c.equipos.includes(x))));
    // Sin lista tomada no se le paga a nadie (Victor: sin estar a horario no se cobra).
    if (!e.conLista) return { h: [] as typeof activos, t: [] as typeof activos, k: 'horario' as const };
    return { h: activos.filter((c) => en(e.horario, c.u)), t: activos.filter((c) => !en(e.horario, c.u) && en(e.tarde, c.u)), k: 'horario' as const };
  };
  const detalle: any[] = [];
  let paraCoaches = 0, quedaEquipo = 0;
  // 1) Monto fijo por entrenamiento (no depende de lo cobrado).
  const fijos = ents.filter((e) => e.dado && reglaEnt(e).modo === 'fijo');
  if (fijos.length) {
    let rep = 0;
    for (const e of fijos) {
      const { h, t, k } = quienes(e), monto = Number(reglaEnt(e).monto) || 0;
      for (const c of h) { sumar(c.u, monto, k); rep += monto; }
      for (const c of t) { sumar(c.u, monto * r.tarde, 'tarde'); rep += monto * r.tarde; }
    }
    paraCoaches += rep;
    detalle.push({ equipo: 'Monto fijo', modo: 'fijo', entrenamientos: fijos.length, repartido: _num2(rep) });
  }
  // 2) Porcentaje de lo cobrado a cada equipo, repartido en los entrenamientos que valen para ese equipo.
  for (const g of Object.keys(cobrado)) {
    const rg = g === '' ? r.liga : (r.porEquipo[g] ?? r.liga);
    if (rg.modo === 'fijo') continue;
    const valen = ents.filter((e) => (!e.equipos.length || e.equipos.includes(g)) && reglaEnt(e).modo !== 'fijo');
    const dados = valen.filter((e) => e.dado);
    const bolsa = _num2(cobrado[g] * (Number(rg.porcentaje) || 0) / 100);
    let rep = 0;
    if (r.mesesIguales.includes(mes) && bolsa > 0) {
      const activos = coaches.filter((c) => c.desde <= hasta);
      for (const c of activos) { sumar(c.u, bolsa / activos.length, 'sinLista'); rep += bolsa / activos.length; }
    } else if (dados.length) {
      const porEnt = bolsa / dados.length;
      for (const e of dados) {
        const { h, t, k } = quienes(e), n = h.length + t.length;
        if (!n) continue;
        for (const c of h) { sumar(c.u, porEnt / n, k); rep += porEnt / n; }
        for (const c of t) { sumar(c.u, (porEnt / n) * r.tarde, 'tarde'); rep += (porEnt / n) * r.tarde; }
      }
    } else if (bolsa > 0 && !valen.length) {
      // Mes con lo cobrado pero sin ningún entrenamiento registrado: en partes iguales (Victor, 2026-11-26).
      const activos = coaches.filter((c) => c.desde <= hasta);
      for (const c of activos) { sumar(c.u, bolsa / activos.length, 'sinLista'); rep += bolsa / activos.length; }
    }
    paraCoaches += rep;
    quedaEquipo += Math.max(0, bolsa - rep);
    detalle.push({ equipo: g || 'Sin equipo', modo: 'porcentaje', porcentaje: rg.porcentaje, cobrado: cobrado[g], bolsa, entrenamientos: dados.length, cancelados: valen.length - dados.length, repartido: _num2(rep) });
  }
  const quien = await _mapaEquipoPorNombre();
  return {
    mes, cerrado: mes < _hoyEcuadorISO().slice(0, 7), detalle, paraCoaches: _num2(paraCoaches), quedaEquipo: _num2(quedaEquipo),
    entrenamientos: ents.filter((e) => e.dado).length, cancelados: ents.filter((e) => !e.dado).length,
    coaches: Object.entries(por).map(([u, x]) => ({ username: u, nombre: quien[u.toUpperCase()]?.nombreDerby || u, monto: _num2(x.monto), horario: x.horario, tarde: x.tarde, sinLista: x.sinLista })),
  };
}

/** Guarda los meses cerrados del año como "El equipo le debe" a cada coach. */
async function _guardarPagoCoaches(anio: number, por = 'automático'): Promise<Record<string, any>> {
  const r = await _reglaPagoCoaches();
  if (!r.activa) return { exito: true, activa: false };
  // Los $238,25 del 25 % que se cargaron a mano el 25/11 pasan a calcularse
  // con la regla (Victor eligió recalcular 2026): se separan de los egresos.
  const { data: manual } = await supabase.from('saldos_movimientos').select('*').eq('por', 'importacion_csv_egresos_coach').eq('anulado', false);
  for (const s of manual ?? []) {
    const eg = String(s.concepto ?? '').match(/egresos CSV \(\$([\d.,]+)\)/);
    if (!eg) continue;
    const egresos = Number(eg[1].replace(/\./g, '').replace(',', '.'));
    await supabase.from('saldos_movimientos').update({ anulado: true, anulado_por: 'regla_coaches' }).eq('id', s.id);
    await supabase.from('saldos_movimientos').insert({ username: s.username, persona_nombre: s.persona_nombre, fecha: s.fecha, monto: _num2(egresos), tipo: 'a_favor', aplicar: 'aparte', concepto: 'Deuda del equipo: egresos de la hoja Quindes', por: 'importacion_csv_egresos' });
  }
  const hoyMes = _hoyEcuadorISO().slice(0, 7);
  const cambios: any[] = [];
  for (let m = 1; m <= 12; m++) {
    const mes = `${anio}-${String(m).padStart(2, '0')}`;
    if (mes >= hoyMes || mes < r.desde) continue;
    const res = await _pagoCoachesMes(mes, r);
    const fecha = `${mes}-01`;
    const { data: ya } = await supabase.from('saldos_movimientos').select('id, username, monto').eq('por', 'regla_coaches').eq('fecha', fecha).eq('anulado', false);
    const nombreMes = _MESES_ES[m - 1];
    const montoDe: Record<string, number> = {};
    for (const c of res.coaches) montoDe[c.username] = c.monto;
    for (const s of ya ?? []) if (_num2(Number(s.monto)) !== _num2(montoDe[s.username] ?? 0)) {
      await supabase.from('saldos_movimientos').update({ anulado: true, anulado_por: 'regla_coaches' }).eq('id', s.id);
    } else delete montoDe[s.username];
    for (const c of res.coaches) {
      if (!(c.username in montoDe) || !(c.monto > 0)) continue;
      const partes = [`${c.horario} a horario`, ...(c.tarde ? [`${c.tarde} tarde`] : []), ...(c.sinLista ? [`${c.sinLista} sin lista`] : [])];
      await supabase.from('saldos_movimientos').insert({
        username: c.username, persona_nombre: c.nombre, fecha, monto: c.monto, tipo: 'a_favor', aplicar: 'aparte',
        concepto: `Pago a entrenadorxs de ${nombreMes} ${anio}: ${partes.join(', ')}`.slice(0, 200), por: 'regla_coaches',
      });
      cambios.push({ mes, username: c.username, monto: c.monto });
    }
  }
  return { exito: true, cambios, por };
}

/** Pivots de finanzas: ver el cálculo del año, editar la regla y recalcular. */
async function adminPagoCoaches(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const accion = String(params.accion ?? 'ver');
  const anio = Number(params.anio) || Number(_hoyEcuadorISO().slice(0, 4));
  if (accion === 'guardarRegla') {
    let x: any = params.regla;
    if (typeof x === 'string') { try { x = JSON.parse(x); } catch { x = null; } }
    if (!x || typeof x !== 'object') return { exito: false, error: 'Regla inválida.' };
    const antes = await _reglaPagoCoaches();
    const nueva = _limpiarReglaCoaches(x);
    await supabase.from('config_app').upsert({ key: 'pago_coaches', value: JSON.stringify(nueva) }, { onConflict: 'liga_id,key' });
    await _registrarAjuste('pago_coaches', antes, nueva, email);
    await _guardarPagoCoaches(anio, email);
  } else if (accion === 'recalcular') {
    await _guardarPagoCoaches(anio, email);
  }
  const regla = await _reglaPagoCoaches();
  const hoyMes = _hoyEcuadorISO().slice(0, 7);
  const meses: any[] = [];
  for (let m = 1; m <= 12; m++) {
    const mes = `${anio}-${String(m).padStart(2, '0')}`;
    if (mes > hoyMes || mes < regla.desde) continue;
    meses.push(await _pagoCoachesMes(mes, regla));
  }
  const total: Record<string, { nombre: string; monto: number }> = {};
  for (const x of meses) for (const c of x.coaches) { const t = total[c.username] ??= { nombre: c.nombre, monto: 0 }; t.monto = _num2(t.monto + c.monto); }
  const { data: tiers } = await supabase.from('config_tiers').select('nombre').order('orden');
  // Lo que hoy se le debe a cada coach (todo su saldo a favor) y las cuentas para pagarle.
  const usuarios = [...new Set([...Object.keys(total), ...Object.keys(regla.coaches)])];
  const deuda: any[] = [];
  for (const u of usuarios) deuda.push({ username: u, nombre: total[u]?.nombre ?? (await _nombrePersona(u)) ?? u, seLeDebe: _num2(Math.max(0, await _saldoDisponible(u))) });
  const cuentas = (await _saldosCuentas()).filter((c) => c.activa).map((c) => ({ id: c.id, nombre: c.nombre, saldo: c.saldo }));
  return { exito: true, anio, regla, equipos: (tiers ?? []).map((t: any) => t.nombre), meses, totales: Object.entries(total).map(([u, t]) => ({ username: u, ...t })), deuda, cuentas };
}

/** Coach: lo que le corresponde (solo lo suyo). */
async function getMiPagoCoach(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const regla = await _reglaPagoCoaches();
  if (!regla.activa) return { exito: true, activa: false };
  const mes = _hoyEcuadorISO().slice(0, 7);
  const x = await _pagoCoachesMes(mes, regla);
  const mio = x.coaches.find((c: any) => c.username === yo) ?? null;
  return { exito: true, activa: true, mes, estimado: mio };
}

/** Un coach deja de serlo por su cuenta (Victor, QA 2026-11-26: "Dejar de ser entrenadorx"). */
async function dejarDeSerCoach(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  await supabase.from('coaches').update({ estado: 'rechazado', resuelto_por: yo, resuelto_en: new Date().toISOString() }).eq('username', yo);
  const { data: f } = await supabase.from('equipo').select('roles').eq('username', yo).maybeSingle();
  if (Array.isArray(f?.roles) && f!.roles.includes(ROL_COACH)) await supabase.from('equipo').update({ roles: f!.roles.filter((r: string) => r !== ROL_COACH) }).eq('username', yo);
  return { exito: true, estado: null };
}

async function getMiCoach(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const { data } = await supabase.from('coaches').select('estado, equipos').eq('username', yo).maybeSingle();
  return { exito: true, estado: data?.estado ?? null, equipos: data?.equipos ?? [] };
}

// Pivots: pedidos, nombrar, cambiar equipos, quitar.
async function adminCoaches(params: Record<string, any>): Promise<Record<string, any>> {
  // Equipo técnico (Victor, 2026-11-27): quien está en el equipo técnico
  // también suma gente y cambia equipos; aprobar, rechazar y quitar, solo Pivots.
  const emailPivot = params.adminToken ? await _validarAdminToken(String(params.adminToken)) : null;
  const tecnico = emailPivot ? null : await _coachDe(String(params.token ?? ''));
  if (!emailPivot && !tecnico) return { exito: false, error: 'Solo Pivots o el equipo técnico.' };
  const email = emailPivot ?? tecnico!.user;
  const accion = String(params.accion ?? 'listar');
  if (!emailPivot && !['listar', 'nombrar', 'equipos'].includes(accion)) return { exito: false, error: 'Eso lo hace un Pivot.' };
  const username = String(params.username ?? '').trim();
  let equipos: string[] = [];
  try { equipos = JSON.parse(String(params.equipos ?? '[]')).map((x: any) => String(x)).slice(0, 30); } catch { equipos = []; }
  if (accion === 'aprobar' || accion === 'nombrar') {
    if (!username) return { exito: false, error: 'Falta la persona.' };
    const { data: e } = await supabase.from('equipo').select('username').eq('username', username).maybeSingle();
    if (!e) return { exito: false, error: 'No encontramos a esa persona.' };
        await supabase.from('coaches').upsert({ username, estado: 'aprobado', equipos, resuelto_por: email, resuelto_en: new Date().toISOString() });
    // El rol Coach queda en su ficha.
    const { data: f } = await supabase.from('equipo').select('roles').eq('username', username).maybeSingle();
    const rs = Array.isArray(f?.roles) ? f!.roles : [];
    if (!rs.includes(ROL_COACH)) await supabase.from('equipo').update({ roles: [...rs, ROL_COACH] }).eq('username', username);
    await sendPush({ tipo: 'solicitud_resuelta', include_external_user_ids: [username], headings: { es: '¡Ya estás en el equipo técnico!' }, contents: { es: 'Tienes la sección Entreno en la barra de abajo para seguir el progreso de la gente que entrenas.' }, url: APP_URL + '/' }).catch(() => {});
  } else if (accion === 'equipos') {
    await supabase.from('coaches').update({ equipos }).eq('username', username);
  } else if (accion === 'rechazar' || accion === 'quitar') {
        await supabase.from('coaches').update({ estado: 'rechazado', resuelto_por: email, resuelto_en: new Date().toISOString() }).eq('username', username);
    const { data: f } = await supabase.from('equipo').select('roles').eq('username', username).maybeSingle();
    if (Array.isArray(f?.roles) && f!.roles.includes(ROL_COACH)) await supabase.from('equipo').update({ roles: f!.roles.filter((r: string) => r !== ROL_COACH) }).eq('username', username);
    if (accion === 'rechazar') {
      await sendPush({ tipo: 'solicitud_resuelta', include_external_user_ids: [username], headings: { es: 'Pedido para sumarse al equipo técnico' }, contents: { es: 'Esta vez un Pivot no lo aprobó. Puedes hablarlo con el equipo.' }, url: APP_URL + '/' }).catch(() => {});
    }
  }
  const { data } = await supabase.from('coaches').select('*').neq('estado', 'rechazado').order('pedido_en');
  const { data: rolesT } = await supabase.from('equipo').select('username, roles').in('username', (data ?? []).map((c: any) => c.username));
  const rolesDe: Record<string, string[]> = {};
  for (const f of rolesT ?? []) rolesDe[f.username] = (Array.isArray(f.roles) ? f.roles : []).filter((r: string) => ROLES_TECNICOS.includes(r));
  const quien = await _mapaEquipoPorNombre();
  return {
    exito: true,
    coaches: (data ?? []).map((c: any) => {
      const q = quien[String(c.username).trim().toUpperCase()] ?? {};
      return { username: c.username, nombre: q.nombreDerby || c.username, foto: q.fotoPerfil ?? '', estado: c.estado, equipos: c.equipos ?? [], mensaje: c.mensaje ?? '', funciones: rolesDe[c.username] ?? [] };
    }),
    // Pendientes solo para Pivots.
    ...(emailPivot ? {} : { soloTecnico: true }),
  };
}

// Coach: inicio (jugadorxs y próximos planes).
async function getCoach(params: Record<string, any>): Promise<Record<string, any>> {
  const c = await _coachDe(String(params.token ?? ''));
  if (!c) return { exito: false, error: 'No estás en el equipo técnico (o un Pivot todavía no lo aprobó).' };
  const personas = await _jugadorxsDe(c.equipos);
  const asis = await _asistencias30(personas.map((p: any) => p.username));
  const { data: evs } = await supabase.from('coach_evaluaciones').select('username, habilidad_id, nivel, creado_en').in('username', personas.map((p: any) => p.username)).order('creado_en', { ascending: false }).limit(5000);
  const logradas: Record<string, Set<string>> = {};
  const vistas = new Set<string>();
  for (const e of evs ?? []) {
    const k = `${e.username}|${e.habilidad_id}`;
    if (vistas.has(k)) continue;
    vistas.add(k);
    if (e.nivel === 'logrado') (logradas[e.username] ??= new Set()).add(e.habilidad_id);
  }
  const habs = (await _habilidades()).filter((h: any) => h.activa);
  const nivelesL = await _nivelesLiga();
  const hoy = _hoyEcuadorISO();
        const { data: planes } = await supabase.from('coach_planes').select('id, id_evento, fecha, coach, bloques, compartido, equipo, da').gte('fecha', hoy).order('fecha').limit(120);
  // Planes sin fecha (de un evento cancelado) y para elegir equipo y quién lo da (Victor, 2026-11-17).
  const { data: sinFecha } = await supabase.from('coach_planes').select('id, coach, bloques, compartido, equipo, da, actualizado_en').is('id_evento', null).order('actualizado_en', { ascending: false }).limit(30);
  const { data: tiersC } = await supabase.from('config_tiers').select('nombre').order('orden');
  const { data: coachesC } = await supabase.from('coaches').select('username, equipos').eq('estado', 'aprobado');
  const quienC = await _mapaEquipoPorNombre();
  return {
    exito: true,
            pendientes: await _porEvaluar(c),
    sinFecha: sinFecha ?? [],
    equiposPlan: c.equipos.length ? c.equipos : (tiersC ?? []).map((t: any) => t.nombre),
    deTodaLaLiga: !c.equipos.length,
    // Equipo técnico en Entreno (Victor, 2026-11-27): con foto y equipos.
    coaches: (coachesC ?? []).map((x: any) => ({ username: x.username, nombre: quienC[String(x.username).toUpperCase()]?.nombreDerby || x.username, foto: quienC[String(x.username).toUpperCase()]?.fotoPerfil ?? '', equipos: x.equipos ?? [], estado: 'aprobado' })),
    ...(await (async () => {
      const { data: yoC } = await supabase.from('coaches').select('avisar_novedades, sin_avisos').eq('username', c.user).maybeSingle();
      return { avisarNovedades: yoC?.avisar_novedades !== false, sinAvisos: (yoC?.sin_avisos as string[]) ?? [] };
    })()),
    equipos: c.equipos,
    totalHabilidades: habs.length,
    // Las últimas 5 habilidades agregadas, para la portada de Progreso (QA 2026-11-27).
    habilidadesRecientes: await (async () => {
      const { data } = await supabase.from('coach_habilidades').select('id, categoria, nombre, nivel').eq('activa', true).order('created_at', { ascending: false }).limit(5);
      return data ?? [];
    })(),
    jugadorxs: personas.map((p: any) => ({
      username: p.username, nombre: p.nombre_derby || p.username, foto: p.foto_perfil ?? '', equipo: p.categoria ?? '',
      // Solo el estado visible para el equipo: los motivos de salud quedan para admins.
      estado: ['Enfermedad', 'Situación personal', 'Otro'].includes(p.estado_miembro) ? 'Fuera por un tiempo' : (p.estado_miembro ?? 'Activx'),
            pronombres: p.pronombres ?? '', asistencias30: asis[p.username] ?? 0, logradas: logradas[p.username]?.size ?? 0,
      // Nivel (Victor, 2026-11-17): a mano o según lo logrado. Básicas con el
      // 80 % de las habilidades básicas; avanzadas, además, alguna avanzada.
      // Niveles propios de la liga (2026-11-27).
      nivel: p.nivel_coach ? _claveNivel(p.nivel_coach) : _calcularNivel(habs, nivelesL, logradas[p.username] ?? new Set()).nivel,
      nivelAMano: !!p.nivel_coach,
    })),
    habilidades: habs.map((h: any) => ({ id: h.id, categoria: h.categoria, nombre: h.nombre, nivel: h.nivel || (nivelesL[0]?.clave ?? 'basica') })),
    niveles: nivelesL,
    planes: planes ?? [],
  };
}

/// Eventos de los últimos 2 días (Victor, 2026-11-20: antes 7; es un
/// recordatorio, no una obligación) que ya terminaron, con quiénes de sus
/// equipos vinieron y a cuántas ya evaluó (Victor, 2026-11-17: abrir Coach
/// y ver "vinieron ayer estas personas, ¿las evaluamos?").
async function _porEvaluar(c: { user: string; equipos: string[] }): Promise<any[]> {
  const hoy = _hoyEcuadorISO();
    const desde = new Date(Date.parse(hoy + 'T12:00:00-05:00') - 2 * 86400000).toISOString().slice(0, 10);
  const { data: evs } = await supabase.from('asistencias').select('id_evento, fecha, inicia, termina, tipo_evento, estado').gte('fecha', desde).lte('fecha', hoy).order('fecha', { ascending: false });
  const ahora = Date.now();
  const out: any[] = [];
  for (const ev of evs ?? []) {
    if (['Cancelado', 'Sin entrenamiento'].includes(String(ev.estado))) continue;
    const hora = String(ev.termina || ev.inicia || '23:00').slice(0, 5);
    if (Date.parse(`${String(ev.fecha).slice(0, 10)}T${hora}:00-05:00`) > ahora) continue;
    const vinieron = await _vinieron(String(ev.id_evento), c);
    if (!vinieron.length) continue;
    const { data: hecho } = await supabase.from('coach_feedback').select('username').eq('id_evento', ev.id_evento).eq('coach', c.user);
    const evaluados = new Set((hecho ?? []).map((x: any) => x.username)).size;
    out.push({ idEvento: ev.id_evento, fecha: String(ev.fecha).slice(0, 10), inicia: String(ev.inicia ?? '').slice(0, 5), tipo: ev.tipo_evento ?? '', total: vinieron.length, evaluados });
    if (out.length >= 7) break;
  }
  return out;
}

// Ficha deportiva: la ve el coach, un Pivot o la propia persona.
async function getFichaDeportiva(params: Record<string, any>): Promise<Record<string, any>> {
  const token = String(params.token ?? '');
  const yo = await _validarToken(token);
  const adminEmail = params.adminToken ? await _validarAdminToken(String(params.adminToken)) : null;
  const coach = token ? await _coachDe(token) : null;
  const username = String(params.username ?? yo ?? '').trim();
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const propia = !!yo && yo === username;
  if (!propia && !adminEmail && !(coach && await _puedeVer(coach, username))) return { exito: false, error: 'No puedes ver esta ficha.' };
  const [habs, niveles, nivelesL, { data: notas }] = await Promise.all([
    _habilidades(), _fichaHabilidades(username), _nivelesLiga(),
    supabase.from('coach_notas').select('*').eq('username', username).order('creado_en', { ascending: false }).limit(200),
  ]);
    // Quién ve cada nota (Victor, 2026-11-17: se eligen por separado):
  // 'jugadorx' la persona, 'pivots', 'coaches'; quien la escribió siempre.
  const ve = (n: any) => {
    const v = _visSet(n.visible);
    return !!(coach && n.coach === coach.user) || (v.has('coaches') && !!coach) || (v.has('pivots') && !!adminEmail) || (v.has('jugadorx') && propia);
  };
  const quien = await _mapaEquipoPorNombre();
  const asis = await _asistencias30([username]);
  return {
    exito: true,
    username, nombre: quien[username.toUpperCase()]?.nombreDerby || username,
    asistencias30: asis[username] ?? 0,
    // tipo: básica o avanzada (nivel queda para la evaluación). Nivel de la persona (Victor, 2026-11-26).
    // tipo = clave del nivel de la habilidad; nivel = la evaluación.
    habilidades: habs.filter((h: any) => h.activa).map((h: any) => ({ ...h, tipo: h.nivel || (nivelesL[0]?.clave ?? 'basica'), ...(niveles[h.id] ?? { nivel: null }) })),
    nivel: await _nivelPersona(username),
    niveles: nivelesL,
    // Logros: niveles y grupos completos, con la fecha del último logrado
    // (Victor, 2026-11-27). tipo 'nivel' | 'grupo'; clave del grupo: `nivel|grupo`.
    logros: (() => {
      const l = new Set(Object.entries(niveles).filter(([, x]: any) => x.nivel === 'logrado').map(([k]) => k));
      return _logrosDe(habs, nivelesL, l).map(({ ids, ...x }) => ({
        ...x,
        fecha: ids.map((id) => String(niveles[id]?.fecha ?? '')).sort().pop() ?? '',
      }));
    })(),
        notas: (notas ?? []).filter(ve).map((n: any) => _notaJson(n, quien)),
    ...(await _progresoPersona(username, ve)),
    puedeEditar: !!coach && !propia,
  };
}

// Coach: guardar evaluación, nota, plan o la lista de habilidades.
async function coachGuardar(params: Record<string, any>): Promise<Record<string, any>> {
  const c = await _coachDe(String(params.token ?? ''));
  if (!c) return { exito: false, error: 'No estás en el equipo técnico.' };
  const accion = String(params.accion ?? '');
  const username = String(params.username ?? '').trim();
  if (['evaluar', 'nota', 'borrarNota', 'nivel'].includes(accion) && !(await _puedeVer(c, username))) return { exito: false, error: 'Esa persona no está en tus equipos.' };
  if (accion === 'evaluar') {
    const nivel = String(params.nivel ?? '');
    if (!['no', 'proceso', 'logrado'].includes(nivel)) return { exito: false, error: 'Nivel inválido.' };
    const antes = nivel === 'logrado' ? await _completosDe(username) : null;
    await supabase.from('coach_evaluaciones').insert({ username, habilidad_id: String(params.habilidadId ?? ''), nivel, coach: c.user });
    if (antes) await _avisarLogros(username, antes);
  } else if (accion === 'nota') {
    const texto = String(params.texto ?? '').trim().slice(0, 4000);
    if (!texto) return { exito: false, error: 'La nota está vacía.' };
        const visible = _visibleDe(params.visible);
    await supabase.from('coach_notas').insert({ username, coach: c.user, texto, por_voz: params.porVoz === true || params.porVoz === 'true', visible, id_evento: String(params.idEvento ?? '') || null });
  } else if (accion === 'borrarNota') {
    await supabase.from('coach_notas').delete().eq('id', String(params.id ?? '')).eq('coach', c.user);
  } else if (accion === 'plan') {
    let bloques: any[] = [];
    try { bloques = JSON.parse(String(params.bloques ?? '[]')); } catch { bloques = []; }
    bloques = (Array.isArray(bloques) ? bloques : []).slice(0, 40).map((b: any) => ({
      titulo: String(b?.titulo ?? '').trim().slice(0, 80), minutos: Math.max(0, Math.min(600, Math.round(Number(b?.minutos) || 0))), detalle: String(b?.detalle ?? '').trim().slice(0, 600),
    })).filter((b: any) => b.titulo);
        const idEvento = String(params.idEvento ?? '').trim();
    const fecha = String(params.fecha ?? '').slice(0, 10);
    if (!idEvento || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { exito: false, error: 'Falta el evento.' };
    // Un plan por equipo; '' = toda la liga, solo para coaches de toda la liga (Victor, 2026-11-17).
    let equipo = String(params.equipo ?? '').trim();
    if (equipo.startsWith('personas:')) {
      // Plan para personas puntuales (Victor, 2026-11-27): 'personas:a,b' (ordenadas).
      const gente = [...new Set(equipo.slice(9).split(',').map((x) => x.trim()).filter(Boolean))].sort().slice(0, 20);
      if (!gente.length) return { exito: false, error: 'Elige al menos una persona.' };
      for (const u of gente) if (!(await _puedeVer(c, u))) return { exito: false, error: 'Solo puedes armar planes para personas de tus equipos.' };
      equipo = `personas:${gente.join(',')}`.slice(0, 1200);
    } else {
      equipo = equipo.slice(0, 60);
      // Plan por nivel ('nivel:basicas'…), para cualquier entrenadorx (Victor, 2026-11-26).
      if (!equipo.startsWith('nivel:') && c.equipos.length && !c.equipos.includes(equipo)) return { exito: false, error: 'Solo puedes armar planes para tus equipos.' };
    }
    let da: string[] = [];
    try { da = JSON.parse(String(params.da ?? '[]')).map((x: any) => String(x)).slice(0, 10); } catch { da = []; }
    if (!bloques.length) await supabase.from('coach_planes').delete().eq('id_evento', idEvento).eq('equipo', equipo);
    else {
      const { error } = await supabase.from('coach_planes').upsert(
        { id_evento: idEvento, fecha, equipo, da, coach: c.user, bloques, compartido: params.compartido === true || params.compartido === 'true', actualizado_en: new Date().toISOString() },
        { onConflict: 'liga_id,id_evento,equipo' },
      );
      if (error) return { exito: false, error: 'No se pudo guardar. Intenta de nuevo; si sigue fallando, avísale a un Pivot.' };
    }
  } else if (accion === 'asignarPlan') {
    // Plan sin fecha a un evento (si ese evento ya tiene plan de ese equipo, se reemplaza).
    const id = String(params.id ?? ''), idEvento = String(params.idEvento ?? '').trim(), fecha = String(params.fecha ?? '').slice(0, 10);
    const { data: pl } = await supabase.from('coach_planes').select('equipo').eq('id', id).maybeSingle();
    if (!pl || !idEvento) return { exito: false, error: 'Falta el plan o el evento.' };
        const { data: ya } = await supabase.from('coach_planes').select('id').eq('id_evento', idEvento).eq('equipo', pl.equipo).maybeSingle();
    if (ya) return { exito: false, error: 'Ese evento ya tiene un plan para ese equipo.' };
    await supabase.from('coach_planes').update({ id_evento: idEvento, fecha }).eq('id', id);
      } else if (accion === 'nivel') {
    // Nivel de una persona en Coach a mano (null = calculado).
    const claves = ['sin', ...(await _nivelesLiga()).map((n: any) => n.clave)];
    const nivel = claves.includes(_claveNivel(params.nivel)) ? _claveNivel(params.nivel) : null;
    await supabase.from('equipo').update({ nivel_coach: nivel }).eq('username', username);
  } else if (accion === 'marcarGrupo') {
    // Varias personas y varias habilidades logradas de una vez (quienes ya
    // pasaron un curso antes de la app, Victor 2026-11-17).
    let personas: string[] = [], habs: string[] = [];
    try { personas = JSON.parse(String(params.personas ?? '[]')).map(String).slice(0, 200); } catch { personas = []; }
    try { habs = JSON.parse(String(params.habilidades ?? '[]')).map(String).slice(0, 200); } catch { habs = []; }
    const ok: string[] = [];
    for (const u of personas) if (await _puedeVer(c, u)) ok.push(u);
    if (!ok.length || !habs.length) return { exito: false, error: 'Elige personas y habilidades.' };
    const filas = ok.flatMap((u) => habs.map((h) => ({ username: u, habilidad_id: h, nivel: 'logrado', coach: c.user })));
    const antes: Record<string, string[]> = {};
    for (const u of ok) antes[u] = await _completosDe(u);
    for (let i = 0; i < filas.length; i += 500) await supabase.from('coach_evaluaciones').insert(filas.slice(i, i + 500));
    for (const u of ok) await _avisarLogros(u, antes[u]);
    return { exito: true, marcadas: filas.length };
  } else if (accion === 'ajustes') {
    await supabase.from('coaches').update({ avisar_novedades: params.avisarNovedades !== false && params.avisarNovedades !== 'false' }).eq('username', c.user);
  } else if (accion === 'avisosPersona') {
    // Qué personas reciben tus avisos de entrenador (Victor, 2026-11-26).
    if (!(await _puedeVer(c, username))) return { exito: false, error: 'Esa persona no está en tus equipos.' };
    const { data: f } = await supabase.from('coaches').select('sin_avisos').eq('username', c.user).maybeSingle();
    const l = new Set<string>((f?.sin_avisos as string[]) ?? []);
    if (params.activo === false || params.activo === 'false') l.add(username); else l.delete(username);
    await supabase.from('coaches').update({ sin_avisos: [...l] }).eq('username', c.user);
  } else if (accion === 'enviarAviso') {
    // Aviso de entrenador a sus personas (Victor, 2026-11-26).
    const texto = String(params.texto ?? '').trim().slice(0, 400);
    const titulo = String(params.titulo ?? '').trim().slice(0, 80);
    if (!texto) return { exito: false, error: 'Escribe el aviso.' };
    let para: string[] = [];
    try { para = JSON.parse(String(params.para ?? '[]')).map(String).slice(0, 300); } catch { para = []; }
    const { data: f } = await supabase.from('coaches').select('sin_avisos').eq('username', c.user).maybeSingle();
    const callados = new Set<string>((f?.sin_avisos as string[]) ?? []);
    const mias = new Set((await _jugadorxsDe(c.equipos)).map((x: any) => String(x.username)));
    const ok = (para.length ? para : [...mias]).filter((u) => mias.has(u) && !callados.has(u) && u !== c.user);
    if (!ok.length) return { exito: false, error: 'No hay a quién mandarlo.' };
    const quien = await _mapaEquipoPorNombre();
    const yoNombre = quien[c.user.toUpperCase()]?.nombreDerby || c.user;
    await sendPush({ tipo: 'aviso_entrenador', include_external_user_ids: ok, personal: true, headings: { es: titulo || `Aviso de ${yoNombre}` }, contents: { es: texto }, url: APP_URL + '/' });
    return { exito: true, enviados: ok.length };
  } else if (accion === 'guardarNivel') {
    // Niveles propios (Victor, 2026-11-27): solo el nombre; todos se completan
    // al lograr todas sus habilidades (logros por grupo, 2026-11-27).
    const nombre = String(params.nombre ?? '').trim().slice(0, 60);
    const regla = 'todas', porcentaje = 100;
    if (!nombre) return { exito: false, error: 'Ponle un nombre al nivel.' };
    const nv = await _nivelesLiga();
    const clave = String(params.clave ?? '');
    if (clave) {
      if (!nv.some((n: any) => n.clave === clave)) return { exito: false, error: 'Ese nivel ya no existe.' };
      await supabase.from('coach_niveles').update({ nombre, regla, porcentaje }).eq('clave', clave);
    } else {
      const base = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'nivel';
      let nueva = base, i = 2;
      while (nv.some((n: any) => n.clave === nueva) || nueva === 'sin') nueva = `${base}-${i++}`;
      await supabase.from('coach_niveles').insert({ clave: nueva, nombre, regla, porcentaje, orden: (nv[nv.length - 1]?.orden ?? 0) + 1 });
    }
  } else if (accion === 'quitarNivel') {
    const clave = String(params.clave ?? '');
    const nv = await _nivelesLiga();
    if (nv.length <= 1) return { exito: false, error: 'Tiene que quedar al menos un nivel.' };
    const { count } = await supabase.from('coach_habilidades').select('id', { count: 'exact', head: true }).eq('nivel', clave);
    if (count) return { exito: false, error: 'Ese nivel tiene habilidades. Muévelas a otro nivel primero.' };
    await supabase.from('coach_niveles').delete().eq('clave', clave);
  } else if (accion === 'ordenNiveles') {
    let claves: string[] = [];
    try { claves = JSON.parse(String(params.claves ?? '[]')).map(String); } catch { claves = []; }
    for (const [i, k] of claves.entries()) await supabase.from('coach_niveles').update({ orden: i + 1 }).eq('clave', k);
  } else if (accion === 'habilidad') {
    // Agregar, renombrar o apagar una habilidad de la lista de la liga.
    const id = String(params.id ?? '');
        const fila: Record<string, any> = { categoria: String(params.categoria ?? '').trim().slice(0, 60), nombre: String(params.nombre ?? '').trim().slice(0, 100), activa: params.activa !== false && params.activa !== 'false' };
    // Básica o avanzada (Victor, 2026-11-17).
    if (params.nivel != null) {
      const nv = await _nivelesLiga();
      fila.nivel = nv.some((n: any) => n.clave === String(params.nivel)) ? String(params.nivel) : (nv[0]?.clave ?? 'basica');
    }
    if (!fila.nombre || !fila.categoria) return { exito: false, error: 'Falta el nombre o la categoría.' };
    if (id) await supabase.from('coach_habilidades').update(fila).eq('id', id);
    else {
      const { data: ult } = await supabase.from('coach_habilidades').select('orden').eq('categoria', fila.categoria).order('orden', { ascending: false }).limit(1).maybeSingle();
      const { data: mx } = await supabase.from('coach_habilidades').select('orden').order('orden', { ascending: false }).limit(1).maybeSingle();
      await supabase.from('coach_habilidades').insert({ ...fila, orden: (ult?.orden ?? (mx?.orden ?? 0) + 10) + 1 });
    }
  } else {
    return { exito: false, error: 'Acción desconocida.' };
  }
  return { exito: true };
}

async function getHabilidades(params: Record<string, any>): Promise<Record<string, any>> {
  const c = await _coachDe(String(params.token ?? ''));
  if (!c) return { exito: false, error: 'No estás en el equipo técnico.' };
  return { exito: true, habilidades: await _habilidades(), niveles: await _nivelesLiga() };
}

// Plan de un evento: lo edita el coach; lxs jugadorxs lo ven si está compartido.
/// Nivel de entrenamiento de una persona: a mano o según lo logrado (misma
/// regla que getCoach).
async function _nivelPersona(username: string): Promise<string> {
  const { data: f } = await supabase.from('equipo').select('nivel_coach').eq('username', username).maybeSingle();
  if (f?.nivel_coach) return _claveNivel(f.nivel_coach);
  return _nivelDe(username);
}

async function getPlanEvento(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const coach = await _coachDe(String(params.token ?? ''));
    const { data } = await supabase.from('coach_planes').select('*').eq('id_evento', String(params.idEvento ?? ''));
  // Coach: los de sus equipos (y el de toda la liga). Resto: los compartidos de
  // su equipo o de toda la liga (Victor, 2026-11-17).
  const { data: yoFila } = await supabase.from('equipo').select('categoria').eq('username', yo).maybeSingle();
  const quien = await _mapaEquipoPorNombre();
  const miNivel = !coach && (data ?? []).some((p: any) => String(p.equipo ?? '').startsWith('nivel:')) ? await _nivelPersona(yo) : null;
  // Plan para personas (2026-11-27): lo ven lxs entrenadorxs y, si se comparte, esas personas.
  const deGente = (p: any) => String(p.equipo ?? '').slice(9).split(',').filter(Boolean);
  const ve = (p: any) => String(p.equipo ?? '').startsWith('personas:')
    ? (!!coach || (p.compartido && deGente(p).includes(yo)))
    : String(p.equipo ?? '').startsWith('nivel:')
    ? (!!coach || (p.compartido && `nivel:${miNivel}` === `nivel:${_claveNivel(String(p.equipo).slice(6))}`))
    : coach ? (!coach.equipos.length || p.equipo === '' || coach.equipos.includes(p.equipo)) : (p.compartido && (p.equipo === '' || p.equipo === yoFila?.categoria));
  const planes = (data ?? []).filter(ve).sort((a: any, b: any) => String(a.equipo).localeCompare(String(b.equipo))).map((p: any) => ({
    id: p.id, equipo: p.equipo ?? '', bloques: p.bloques ?? [], compartido: p.compartido, coach: p.coach,
    ...(String(p.equipo ?? '').startsWith('personas:') ? { personas: deGente(p).map((u: string) => ({ username: u, nombre: quien[String(u).toUpperCase()]?.nombreDerby || u })) } : {}),
    da: (p.da ?? []).map((u: string) => ({ username: u, nombre: quien[String(u).toUpperCase()]?.nombreDerby || u })),
  }));
  return {
    exito: true, planes, plan: planes[0] ?? null, esCoach: !!coach,
    ...(coach ? { equiposPlan: coach.equipos.length ? coach.equipos : ((await supabase.from('config_tiers').select('nombre').order('orden')).data ?? []).map((t: any) => t.nombre), deTodaLaLiga: !coach.equipos.length } : {}),
  };
}

/// Al cancelar un evento con planes (Victor, 2026-11-17): se pasan a otro
/// evento o quedan sin fecha. Lo hace un Pivot o un coach.
async function moverPlanesEvento(params: Record<string, any>): Promise<Record<string, any>> {
  const esPivot = !!(params.adminToken && await _validarAdminToken(String(params.adminToken)));
  const coach = esPivot ? null : await _coachDe(String(params.token ?? ''));
  if (!esPivot && !coach) return { exito: false, error: 'Sin permiso.' };
  const desde = String(params.desde ?? '').trim(), a = String(params.a ?? '').trim();
  if (!desde) return { exito: false, error: 'Falta el evento.' };
    const { data: planes } = await supabase.from('coach_planes').select('id, equipo').eq('id_evento', desde);
  if (params.soloContar === true || params.soloContar === 'true') return { exito: true, cantidad: (planes ?? []).length };
  if (!a) {
    await supabase.from('coach_planes').update({ id_evento: null, fecha: null }).eq('id_evento', desde);
    return { exito: true, movidos: (planes ?? []).length };
  }
  const { data: ev } = await supabase.from('asistencias').select('fecha').eq('id_evento', a).maybeSingle();
  if (!ev) return { exito: false, error: 'No existe ese evento.' };
    // Si el evento de destino ya tiene plan de ese equipo, este queda sin fecha (no se pisa nada).
  let sinFecha = 0;
  for (const p of planes ?? []) {
    const { data: ya } = await supabase.from('coach_planes').select('id').eq('id_evento', a).eq('equipo', p.equipo).maybeSingle();
    if (ya) { await supabase.from('coach_planes').update({ id_evento: null, fecha: null }).eq('id', p.id); sinFecha++; continue; }
    await supabase.from('coach_planes').update({ id_evento: a, fecha: String(ev.fecha).slice(0, 10) }).eq('id', p.id);
  }
  return { exito: true, movidos: (planes ?? []).length - sinFecha, sinFecha };
}

// ─── Coach etapa 3 (Victor, 2026-11-16): pruebas, feedback y recordatorios ──
// Sirve para cualquier evento del timeline (práctica, scrimmage, partido…).

/// Quién ve una nota, feedback o prueba (Victor, 2026-11-17): lista separada
/// por comas de 'jugadorx', 'pivots', 'coaches' (vacío o 'yo' = solo quien la
/// escribió). Los valores viejos de uno solo eran escalonados.
function _visSet(v: unknown): Set<string> {
  const s = String(v ?? '').trim();
  if (s === 'jugadorx') return new Set(['jugadorx', 'pivots', 'coaches']);
  if (s === 'pivots') return new Set(['pivots', 'coaches']);
  if (s === 'coaches') return new Set(['coaches']);
  return new Set(s.split(',').map((x) => x.trim()).filter((x) => ['jugadorx', 'pivots', 'coaches'].includes(x)));
}

/// Lo que llega de la app: lista o texto; se guarda ordenado ('yo' si nada).
function _visibleDe(v: unknown, porDefecto = 'yo'): string {
  if (v == null || v === '') return porDefecto;
  let l: string[] = [];
  if (Array.isArray(v)) l = v.map(String);
  else { try { const j = JSON.parse(String(v)); l = Array.isArray(j) ? j.map(String) : String(v).split(','); } catch { l = String(v).split(','); } }
  const ok = ['jugadorx', 'pivots', 'coaches'].filter((x) => l.map((y) => y.trim()).includes(x));
  // Una sola opción de las viejas se guarda con coma para no leerse escalonada.
  return ok.length ? ok.join(',') + (ok.length === 1 ? ',' : '') : 'yo';
}

/// Quién de sus equipos vino a un evento (última marca A tiempo o Tarde).
async function _vinieron(idEvento: string, coach: { equipos: string[] }): Promise<string[]> {
  const { data } = await supabase.from('log_asistencias').select('nombre_usuario, estado, origen, marca_temporal').eq('id_evento', idEvento).order('marca_temporal');
  const ultimo: Record<string, string> = {};
  for (const r of data ?? []) if (['A tiempo', 'Tarde', 'Ninguno'].includes(r.estado)) ultimo[r.nombre_usuario] = r.estado;
  const vinieron = Object.entries(ultimo).filter(([, e]) => e !== 'Ninguno').map(([u]) => u);
  if (!vinieron.length) return [];
  const personas = await _jugadorxsDe(coach.equipos);
  const mios = new Set(personas.map((p: any) => p.username));
  return vinieron.filter((u) => mios.has(u));
}

async function coachPruebas(params: Record<string, any>): Promise<Record<string, any>> {
  const c = await _coachDe(String(params.token ?? ''));
  if (!c) return { exito: false, error: 'No estás en el equipo técnico.' };
  const accion = String(params.accion ?? 'listar');
  if (accion === 'guardar') {
    let personas: string[] = [];
    try { personas = JSON.parse(String(params.personas ?? '[]')).map((x: any) => String(x)).slice(0, 200); } catch { personas = []; }
    const fila = {
      nombre: String(params.nombre ?? '').trim().slice(0, 80),
      unidad: String(params.unidad ?? 'vueltas').trim().slice(0, 30) || 'vueltas',
      mas_es_mejor: params.masEsMejor !== false && params.masEsMejor !== 'false',
      personas, activa: params.activa !== false && params.activa !== 'false',
            visible: _visibleDe(params.visible, 'jugadorx,'),
    };
    if (!fila.nombre) return { exito: false, error: 'Ponle un nombre a la prueba.' };
    const id = String(params.id ?? '');
    if (id) await supabase.from('coach_pruebas').update(fila).eq('id', id);
    else await supabase.from('coach_pruebas').insert({ ...fila, creado_por: c.user });
  } else if (accion === 'marca') {
    const username = String(params.username ?? '').trim();
    if (!(await _puedeVer(c, username))) return { exito: false, error: 'Esa persona no está en tus equipos.' };
    const valor = Number(String(params.valor ?? '').replace(',', '.'));
    if (!isFinite(valor)) return { exito: false, error: 'Escribe un número.' };
    await supabase.from('coach_marcas').insert({
      prueba_id: String(params.pruebaId ?? ''), username, valor, id_evento: String(params.idEvento ?? '') || null,
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(params.fecha ?? '')) ? String(params.fecha) : _hoyEcuadorISO(), coach: c.user,
    });
  } else if (accion === 'borrarMarca') {
    await supabase.from('coach_marcas').delete().eq('id', String(params.id ?? '')).eq('coach', c.user);
  }
  const { data } = await supabase.from('coach_pruebas').select('*').order('created_at');
  return {
    exito: true,
    pruebas: (data ?? []).map((p: any) => ({ id: p.id, nombre: p.nombre, unidad: p.unidad, masEsMejor: p.mas_es_mejor, personas: p.personas ?? [], activa: p.activa, visible: p.visible })),
  };
}

/// Pruebas y feedback de una persona, según quién mira (misma regla que las notas).
async function _progresoPersona(username: string, ve: (x: any) => boolean): Promise<Record<string, any>> {
  const [{ data: pruebas }, { data: marcas }, { data: fb }] = await Promise.all([
    supabase.from('coach_pruebas').select('*').eq('activa', true),
    supabase.from('coach_marcas').select('id, prueba_id, valor, fecha, coach, id_evento').eq('username', username).order('fecha'),
    supabase.from('coach_feedback').select('*').eq('username', username).order('fecha'),
  ]);
  const quien = await _mapaEquipoPorNombre();
  const nombre = (u: string) => quien[String(u).trim().toUpperCase()]?.nombreDerby || u;
  const lista = (pruebas ?? [])
    .filter((p: any) => !(p.personas ?? []).length || (p.personas ?? []).includes(username))
    .filter((p: any) => ve({ visible: p.visible, coach: p.creado_por }))
    .map((p: any) => {
      const m = (marcas ?? []).filter((x: any) => x.prueba_id === p.id);
      const valores = m.map((x: any) => Number(x.valor));
      const mejor = valores.length ? (p.mas_es_mejor ? Math.max(...valores) : Math.min(...valores)) : null;
      return { id: p.id, nombre: p.nombre, unidad: p.unidad, masEsMejor: p.mas_es_mejor, mejor, marcas: m.map((x: any) => ({ id: x.id, valor: Number(x.valor), fecha: x.fecha, coach: x.coach })) };
    });
  // Feedback por tema: última nota, la anterior y el historial.
  const temas: Record<string, any[]> = {};
  for (const f of (fb ?? []).filter(ve)) (temas[f.tema] ??= []).push({ id: f.id, nota: f.nota, comentario: f.comentario ?? '', porVoz: f.por_voz, fecha: f.fecha, coach: f.coach, coachNombre: nombre(f.coach), visible: f.visible, idEvento: f.id_evento });
  return { pruebas: lista, feedback: Object.entries(temas).map(([tema, l]) => ({ tema, items: l })) };
}

// Feedback de un evento: lxs que vinieron de sus equipos y lo ya anotado.
async function coachFeedbackEvento(params: Record<string, any>): Promise<Record<string, any>> {
  const c = await _coachDe(String(params.token ?? ''));
  if (!c) return { exito: false, error: 'No estás en el equipo técnico.' };
  const idEvento = String(params.idEvento ?? '').trim();
  if (!idEvento) return { exito: false, error: 'Falta el evento.' };
  if (String(params.accion ?? '') === 'guardar') {
    let items: any[] = [];
    try { items = JSON.parse(String(params.items ?? '[]')); } catch { items = []; }
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(params.fecha ?? '')) ? String(params.fecha) : _hoyEcuadorISO();
        const visible = _visibleDe(params.visible);
    const filas: any[] = [];
    for (const it of (Array.isArray(items) ? items : []).slice(0, 300)) {
      const username = String(it?.username ?? '').trim();
      if (!username || !(await _puedeVer(c, username))) continue;
      const nota = it?.nota == null || it.nota === '' ? null : Math.max(1, Math.min(10, Math.round(Number(it.nota))));
      const comentario = String(it?.comentario ?? '').trim().slice(0, 2000) || null;
            // "Lo que trabajó" solo, sin nota ni comentario, también se guarda (Victor, 2026-11-20).
      if (nota == null && !comentario && it?.trabajo !== true) continue;
      filas.push({ id_evento: idEvento, fecha, username, tema: String(it?.tema ?? 'General').trim().slice(0, 80) || 'General', nota, comentario, por_voz: it?.porVoz === true, visible, coach: c.user });
    }
    if (!filas.length) return { exito: false, error: 'No hay nada para guardar.' };
    const { error } = await supabase.from('coach_feedback').insert(filas);
    if (error) return { exito: false, error: 'No se pudo guardar. Intenta de nuevo; si sigue fallando, avísale a un Pivot.' };
  }
  const vinieron = await _vinieron(idEvento, c);
  const quien = await _mapaEquipoPorNombre();
  const { data: hecho } = await supabase.from('coach_feedback').select('username, tema, nota, comentario').eq('id_evento', idEvento).eq('coach', c.user);
    const { data: planesEv } = await supabase.from('coach_planes').select('bloques').eq('id_evento', idEvento);
  return {
    exito: true,
    temas: [...new Set((planesEv ?? []).flatMap((p: any) => ((p.bloques as any[]) ?? []).map((b: any) => String(b.titulo))).filter(Boolean))],
    personas: vinieron.map((u) => ({ username: u, nombre: quien[u.toUpperCase()]?.nombreDerby || u, foto: quien[u.toUpperCase()]?.fotoPerfil ?? '' })),
    hecho: hecho ?? [],
  };
}


/// Los lunes: a quien tiene novedades visibles en su ficha deportiva de los
/// últimos 7 días (notas, feedback o pruebas que la persona puede ver), un
/// solo aviso. Sin novedades, nada. Solo de coaches que dejan avisar.
/// Recordatorios para entrenadorxs (Victor, 2026-11-26): por la mañana, lo
/// que falta evaluar de ayer y los entrenamientos de mañana sin plan.
async function _avisosEntrenadorxs(): Promise<void> {
  const hoy = _hoyEcuadorISO();
  const ayer = new Date(Date.parse(hoy + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  const manana = new Date(Date.parse(hoy + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  const { data: coaches } = await supabase.from('coaches').select('username, equipos').eq('estado', 'aprobado');
  if (!coaches?.length) return;
  const { data: evManana } = await supabase.from('asistencias').select('id_evento, tipo_evento, estado, inicia').eq('fecha', manana);
  const entrenos = (evManana ?? []).filter((e: any) => String(e.tipo_evento ?? '') === 'Entrenamiento' && !['Cancelado', 'Sin entrenamiento'].includes(String(e.estado)));
  const { data: planes } = entrenos.length ? await supabase.from('coach_planes').select('id_evento').in('id_evento', entrenos.map((e: any) => e.id_evento)) : { data: [] as any[] };
  const conPlan = new Set((planes ?? []).map((x: any) => String(x.id_evento)));
  const sinPlan = entrenos.filter((e: any) => !conPlan.has(String(e.id_evento)));
  for (const co of coaches) {
    const c = { user: String(co.username), equipos: (co.equipos as string[]) ?? [] };
    try {
      const falta = (await _porEvaluar(c)).filter((x: any) => x.fecha === ayer && x.evaluados < x.total);
      if (falta.length) {
        const n = falta.reduce((a: number, x: any) => a + (x.total - x.evaluados), 0);
        await sendPush({
          tipo: 'coach_por_evaluar', include_external_user_ids: [c.user], personal: true, pantalla: 'entrenamiento',
          headings: { es: 'Falta evaluar el entrenamiento de ayer' },
          contents: { es: n === 1 ? 'Falta 1 persona por evaluar.' : `Faltan ${n} personas por evaluar.` }, url: APP_URL + '/',
        });
      }
      if (sinPlan.length) {
        const e = sinPlan[0];
        await sendPush({
          tipo: 'coach_pedido_plan', include_external_user_ids: [c.user], personal: true, pantalla: 'entrenamiento',
          headings: { es: 'El entrenamiento de mañana no tiene plan' },
          contents: { es: `Mañana${e.inicia ? ' a las ' + String(e.inicia).slice(0, 5) : ''}. Puedes armarlo desde Entreno.` }, url: APP_URL + '/',
        });
      }
    } catch (e) { console.error('[coach] recordatorio', c.user, e); }
  }
}

async function _avisarNovedadesFicha(): Promise<number> {
  const hoy = _hoyEcuadorISO();
  if (new Date(hoy + 'T12:00:00Z').getUTCDay() !== 1) return 0;
  const desde = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: coaches } = await supabase.from('coaches').select('username, avisar_novedades, sin_avisos').eq('estado', 'aprobado');
  const avisan = new Set((coaches ?? []).filter((c: any) => c.avisar_novedades !== false).map((c: any) => c.username));
  // Personas a las que cada entrenadorx no les manda avisos (Victor, 2026-11-26).
  const callados = new Set((coaches ?? []).flatMap((c: any) => ((c.sin_avisos as string[]) ?? []).map((u) => `${c.username}|${u}`)));
  const avisa = (coach: string, u: string) => avisan.has(coach) && !callados.has(`${coach}|${u}`);
  if (!avisan.size) return 0;
  const [{ data: notas }, { data: fb }, { data: marcas }, { data: pruebas }] = await Promise.all([
        supabase.from('coach_notas').select('username, coach').like('visible', '%jugadorx%').gte('creado_en', desde),
    supabase.from('coach_feedback').select('username, coach').like('visible', '%jugadorx%').gte('creado_en', desde),
    supabase.from('coach_marcas').select('username, coach, prueba_id').gte('creado_en', desde),
    supabase.from('coach_pruebas').select('id, visible'),
  ]);
    const visibles = new Set((pruebas ?? []).filter((p: any) => _visSet(p.visible).has('jugadorx')).map((p: any) => p.id));
  const quienes = new Set<string>();
  for (const x of [...(notas ?? []), ...(fb ?? [])]) if (avisa(x.coach, x.username)) quienes.add(x.username);
  for (const x of marcas ?? []) if (avisa(x.coach, x.username) && visibles.has(x.prueba_id)) quienes.add(x.username);
  if (!quienes.size) return 0;
  await sendPush({
    tipo: 'novedades_progreso', include_external_user_ids: [...quienes], pantalla: 'progreso',
    headings: { es: 'Novedades en tu progreso' },
    contents: { es: 'El equipo técnico dejó notas o resultados esta semana. Míralos en Mi progreso.' }, url: APP_URL + '/',
  }).catch(() => {});
  return quienes.size;
}

// Coach toma asistencia de sus equipos (sin ser Pivot).
async function coachMarcarAsistencia(params: Record<string, any>): Promise<Record<string, any>> {
  const c = await _coachDe(String(params.token ?? ''));
  if (!c) return { exito: false, error: 'No estás en el equipo técnico.' };
  const nombre = String(params.nombre ?? '').trim();
  if (!(await _puedeVer(c, nombre))) return { exito: false, error: 'Esa persona no está en tus equipos.' };
  return await adminMarcarAsistencia({ idEvento: params.idEvento, nombre, estado: params.estado }, c.user);
}

async function adminMarcarAsistencia(params: Record<string, any>, porCoach?: string): Promise<Record<string, any>> {
  // porCoach: solo desde coachMarcarAsistencia (ya validó al coach y sus equipos).
  const adminEmail = porCoach ? `coach:${porCoach}` : await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const idEvento = String(params.idEvento ?? '').trim();
  const nombre   = String(params.nombre   ?? '').trim();
  const estado   = String(params.estado   ?? '').trim();
  if (!idEvento || !nombre) return { exito: false, error: 'Datos incompletos.' };
  if (!ESTADOS_ROLLCALL.includes(estado)) return { exito: false, error: 'Estado inválido.' };

  // Fix real (racha inflada en re-marcados, ver MANIFEST.md/CHANGELOG.md):
  // chequear ANTES de insertar la fila nueva de log -- si se chequeara
  // después, esa misma fila recién insertada ya contaría como "marca
  // previa" y CUALQUIER llamada (la primera incluida) se vería como una
  // corrección.
  const { data: marcaPrevia } = await supabase.from('log_asistencias')
    .select('id').eq('id_evento', idEvento).eq('nombre_usuario', nombre).eq('origen', 'Admin').limit(1).maybeSingle();
  const esCorreccion = !!marcaPrevia;

  const logResult = await _agregarFilaLogAsistencia(idEvento, nombre, 'Admin', estado);
  if (logResult.error) return { exito: false, error: 'Error insertando log: ' + logResult.error };

  // Actualizar a_horario / tarde en asistencias directamente
  // `fecha` sumada al select (bug real, ver MANIFEST.md/CHANGELOG.md --
  // "puntos totales muestran de más en un mes sin asistencia real"): hace
  // falta más abajo para acreditar el bonus de racha al MES DEL EVENTO, no
  // al mes en que el admin hizo click (ver ese comentario).
  const { data: ev, error: errorLectura } = await supabase.from('asistencias').select('a_horario, tarde, fecha').eq('id_evento', idEvento).maybeSingle();
  if (errorLectura) return { exito: false, error: 'Error leyendo asistencias: ' + errorLectura.message };
  if (!ev) return { exito: false, error: 'No existe fila en asistencias para evento: ' + idEvento };

  const parseNames = (s: string) => String(s ?? '').split(',').map((n: string) => n.trim()).filter(Boolean);
  let aHorario = parseNames(ev.a_horario).filter((n: string) => n.toUpperCase() !== nombre.toUpperCase());
  let tarde     = parseNames(ev.tarde).filter((n: string) => n.toUpperCase() !== nombre.toUpperCase());
  if (estado === 'A tiempo') aHorario.push(nombre);
  else if (estado === 'Tarde') tarde.push(nombre);
  const { error: errorUpdate } = await supabase.from('asistencias').update({ a_horario: aHorario.join(', '), tarde: tarde.join(', ') }).eq('id_evento', idEvento);
  if (errorUpdate) return { exito: false, error: 'Error actualizando asistencias: ' + errorUpdate.message };

  // Racha de asistencias consecutivas (ver MANIFEST.md/CHANGELOG.md) --
  // `equipo.racha_actual` sube 1 en cada marca real de 'A tiempo'/'Tarde'
  // y se resetea a 0 en 'Ninguno'; cada 3ra consecutiva acredita +2 a
  // `puntos_mensuales.puntos_extra`.
  //
  // Bug real corregido (ver MANIFEST.md/CHANGELOG.md -- "puntos totales
  // muestran 2 en un mes con asistencia y tareas en 0"): este bonus se
  // acreditaba al mes ACTUAL (`new Date()`, la fecha real del click del
  // admin), mientras que `_reconstruirRachasHistoricas()` (más abajo en
  // este archivo, la reconstrucción completa/autoritativa que corre al
  // final de `recalcularPuntosAsistencia()`) siempre lo acredita al MES DEL
  // EVENTO (`mesAnioPorEvento`, ahí mismo). Si un admin toma lista de un
  // evento días/semanas después de que ocurrió (catch-up real, no
  // infrecuente) y esa marca resulta ser la 3ra consecutiva, el camino en
  // vivo de acá abajo acreditaba el bonus al mes en que se hizo el click, NO
  // al mes del evento -- un mes sin ninguna asistencia real podía terminar
  // con `puntos_extra:2` (y por lo tanto `puntos_total:2`, columna
  // GENERATED) pese a `puntos_asistencia`/`puntos_tareas` en 0. Fix: usar
  // la fecha real del evento (`ev.fecha`, ya seleccionada arriba) para
  // ambos, mismo criterio que la reconstrucción -- los 2 caminos quedan
  // consistentes entre sí. (Datos ya escritos con el bug viejo se corrigen
  // solos la próxima vez que corra `recalcularPuntosAsistencia()`/
  // "Recalcular ahora" para ese mes -- `_reconstruirRachasHistoricas()`
  // SOBREESCRIBE `puntos_extra`, no lo suma.)
  const [anioEvento, mesEvento] = String(ev.fecha).split('-').map((n: string) => Number(n));
  //
  // Fix real (racha inflada en re-marcados): el incremento en vivo de
  // abajo asume que CADA llamada es una marca nueva -- si esta misma
  // persona ya tenía una marca previa para ESTE evento (`esCorreccion`,
  // calculado arriba ANTES de insertar la fila nueva), es una corrección
  // (ej. el admin tocó "A tiempo" por error y lo cambia a "Tarde"), no un
  // evento nuevo -- sumar/resetear la racha en vivo la infla o desinfla
  // sin motivo real. En ese caso, reconstruye la racha de ESTA persona
  // desde cero a partir de `log_asistencias` (`_reconstruirRachasHistoricas()`,
  // acotada por `soloUsuario` -- más abajo en este archivo) en vez de
  // aplicar el incremento.
  if (esCorreccion) {
    await _reconstruirRachasHistoricas(nombre);
  } else {
    const { data: filaEquipo } = await supabase.from('equipo').select('racha_actual').eq('username', nombre).maybeSingle();
    if (estado === 'A tiempo' || estado === 'Tarde') {
            const rachaNueva = (Number(filaEquipo?.racha_actual) || 0) + 1;
      await supabase.from('equipo').update({ racha_actual: rachaNueva }).eq('username', nombre);
      if (rachaNueva % 3 === 0) {
        await _acreditarPuntosExtra(nombre, anioEvento, mesEvento, 2);
      }
      try { await _recompensasRacha(nombre, rachaNueva, idEvento, String(ev.fecha)); } catch (e) { console.error('[recompensas] racha:', e); }
    } else if (estado === 'Ninguno') {
      await supabase.from('equipo').update({ racha_actual: 0 }).eq('username', nombre);
    }
  }

  // Reactivación automática (ver `_reactivarPorAsistencia()`): FUERA del
  // if/else de `esCorreccion` a propósito -- antes vivía solo en la rama
  // no-corrección, así que re-marcar a alguien (corrección) nunca lo
  // reactivaba.
    if (estado === 'A tiempo' || estado === 'Tarde') {
        await _reactivarPorAsistencia(nombre, idEvento);
    try { await _deudaSiVinoSinPago(nombre, idEvento); } catch (e) { console.error('[deuda] al marcar:', e); }
  } else {
    try { await _anularDeudaSinReserva(nombre, idEvento, 'automático'); } catch (e) { console.error('[deuda] anular:', e); }
  }

  // Batch 8 (ver MANIFEST.md): recalcula los stats de ESTA persona apenas
  // se confirma que la asistencia quedó guardada -- antes solo pasaba con
  // el botón manual "Recalcular ahora" (recalcularStatsEquipo(), completo,
  // no se toca acá). Después del `return` de arriba (errores), nunca antes.
    await recalcularStatsUsuario(nombre);

  // Bug real (2026-11-13): los puntos de asistencia solo se recalculaban con
  // el botón "Recalcular ahora" de Mi Liga web; desde que la lista se toma en
  // la app (octubre) nadie lo apretaba y noviembre quedó en 0. Ahora se
  // recalcula el mes del evento de ESTA persona al marcar, y el cron diario
  // recalcula el mes actual y el anterior para todo el equipo.
  try {
    const { data: evFecha } = await supabase.from('asistencias').select('fecha').eq('id_evento', idEvento).maybeSingle();
    const f = String(evFecha?.fecha ?? '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) await _recalcularPuntosAsistenciaPersona(nombre, Number(f.slice(5, 7)), Number(f.slice(0, 4)));
  } catch (e) { console.error('[puntos] persona:', e); }

  return { exito: true };
}

/** Puntos de asistencia de UNA persona en un mes (misma cuenta que
 * recalcularPuntosAsistencia: última marca por evento, valores de la regla). */
async function _recalcularPuntosAsistenciaPersona(nombre: string, mes: number, anio: number): Promise<void> {
  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const hasta = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
    const { data: logs } = await supabase.from('log_asistencias').select('id_evento, estado, marca_temporal, fecha_entrenamiento')
    .eq('nombre_usuario', nombre).in('origen', ['Admin', 'Externa'])
    .gte('fecha_entrenamiento', desde).lt('fecha_entrenamiento', hasta);
    const ultima: Record<string, { estado: string; marca: number; fecha: string }> = {};
  for (const l of logs ?? []) {
    const marca = l.marca_temporal ? new Date(l.marca_temporal).getTime() : 0;
    if (!ultima[l.id_evento] || marca >= ultima[l.id_evento].marca) ultima[l.id_evento] = { estado: l.estado, marca, fecha: String(l.fecha_entrenamiento ?? '').slice(0, 10) };
  }
    const versiones = await _versionesPuntos();
  const eqDe = await _equipoEnMes(versiones, [nombre]);
  const puntos = Object.values(ultima).reduce((s, x) => s + _valorMarca(x.estado, x.fecha, versiones, eqDe(nombre, x.fecha)), 0);
  await supabase.from('puntos_mensuales').upsert({ nombre_usuario: nombre, anio, mes, puntos_asistencia: puntos }, { onConflict: 'nombre_usuario,anio,mes' });
}

/**
 * Cuánto vale cada marca, por versiones con fecha de inicio (config_app
 * `valores_puntos`, Mi Liga). Regla de oro (Victor, 2026-11-13): un cambio
 * empieza siempre después de hoy, así nunca altera puntos ya ganados.
 */
// Por equipo (Victor, 2026-11-16): una versión con `equipo` vale solo para
// ese equipo; sin `equipo`, para todos. Para cada marca se usa el equipo en
// que estaba la persona ese mes (historial_tier), así un cambio de equipo
// nunca recalcula distinto lo ya ganado.
type VersionPuntos = { desde: string; aTiempo: number; tarde: number; tardeCuenta: boolean; equipo?: string | null };
const VERSION_PUNTOS_BASE: VersionPuntos = { desde: '2000-01-01', aTiempo: 1, tarde: 0.5, tardeCuenta: true };
async function _versionesPuntos(): Promise<VersionPuntos[]> {
  const { data } = await supabase.from('config_app').select('value').eq('key', 'valores_puntos').maybeSingle();
  let l: VersionPuntos[] = [];
  try { l = JSON.parse(String(data?.value ?? '[]')); } catch { l = []; }
  return [VERSION_PUNTOS_BASE, ...(Array.isArray(l) ? l : [])]
    .filter((v) => v && /^\d{4}-\d{2}-\d{2}$/.test(String(v.desde)))
    .sort((a, b) => a.desde.localeCompare(b.desde));
}
function _versionEn(fecha: string, versiones: VersionPuntos[], equipo?: string | null): VersionPuntos {
  let v = versiones[0] ?? VERSION_PUNTOS_BASE;
  for (const x of versiones) if (x.desde <= fecha && (!x.equipo || x.equipo === equipo)) v = x;
  return v;
}
function _valorMarca(estado: string, fecha: string, versiones: VersionPuntos[], equipo?: string | null): number {
  const v = _versionEn(fecha || '2000-01-01', versiones, equipo);
  if (estado === 'A tiempo') return Number(v.aTiempo) || 0;
  if (estado === 'Tarde') return v.tardeCuenta === false ? 0 : (Number(v.tarde) || 0);
  return 0;
}

/** Equipo de cada persona en un mes ('aaaa-mm'): el del historial de ese mes
 *  o, si no hay, el actual. Solo hace consultas si algún equipo tiene puntos
 *  propios (si no, todos usan los mismos valores). */
async function _equipoEnMes(versiones: VersionPuntos[], usernames?: string[]): Promise<(u: string, fecha: string) => string | null> {
  if (!versiones.some((v) => v.equipo)) return () => null;
  let qh = supabase.from('historial_tier').select('username, mes, tier_nombre');
  let qe = supabase.from('equipo').select('username, categoria');
  if (usernames?.length) { qh = qh.in('username', usernames); qe = qe.in('username', usernames); }
  const [{ data: h }, { data: e }] = await Promise.all([qh, qe]);
  const porMes: Record<string, string> = {}, actual: Record<string, string> = {};
  (h ?? []).forEach((r: any) => { porMes[`${r.username}|${r.mes}`] = r.tier_nombre; });
  (e ?? []).forEach((r: any) => { actual[r.username] = r.categoria; });
  return (u, fecha) => porMes[`${u}|${String(fecha).slice(0, 7)}`] ?? actual[u] ?? null;
}

/** Las reglas guardadas con el nombre de un equipo lo siguen al renombrarlo
 *  (Victor, 2026-11-16): cobros, clases de gracia, qué cuenta como clase,
 *  puntos por asistencia y su historial mensual. */
async function _renombrarEquipoEnReglas(viejo: string, nuevo: string): Promise<void> {
    const { data: fila } = await supabase.from('config_app').select('value').eq('key', 'reglas_liga').maybeSingle();
  let r: Record<string, any> = {};
  try { r = JSON.parse(String(fila?.value ?? '{}')) ?? {}; } catch { r = {}; }
  let cambio = false;
  for (const k of ['cobroEquipos', 'graciaClases', 'queCuentaEquipos', 'porEquipo']) {
    const m = r[k];
    if (m && typeof m === 'object' && viejo in m) { m[nuevo] = m[viejo]; delete m[viejo]; cambio = true; }
  }
  for (const x of Array.isArray(r.periodosSinCobro) ? r.periodosSinCobro : []) {
    if (Array.isArray(x?.equipos) && x.equipos.includes(viejo)) { x.equipos = x.equipos.map((e: string) => (e === viejo ? nuevo : e)); cambio = true; }
  }
  if (cambio) await supabase.from('config_app').upsert({ key: 'reglas_liga', value: JSON.stringify(r) }, { onConflict: 'liga_id,key' });
  const { data } = await supabase.from('config_app').select('value').eq('key', 'valores_puntos').maybeSingle();
  try {
    const l = JSON.parse(String(data?.value ?? '[]'));
    if (Array.isArray(l) && l.some((v: any) => v?.equipo === viejo)) {
      await supabase.from('config_app').upsert({ key: 'valores_puntos', value: JSON.stringify(l.map((v: any) => (v?.equipo === viejo ? { ...v, equipo: nuevo } : v))) }, { onConflict: 'liga_id,key' });
    }
  } catch { /* sin cambio */ }
  await supabase.from('historial_tier').update({ tier_nombre: nuevo }).eq('tier_nombre', viejo);
}

/** Qué cuenta como clase para un equipo (o la regla general). */
function _reglaClase(reglas: Record<string, any>, equipo?: string | null): { tipos: string[] | null; tarde: boolean } {
  const x = equipo ? (reglas.queCuentaEquipos ?? {})[equipo] : null;
  const tipos = x ? x.tiposCuentan : reglas.tiposCuentan;
  return { tipos: Array.isArray(tipos) && tipos.length ? tipos.map(String) : null, tarde: (x ? x.tardeCuentaClase : reglas.tardeCuentaClase) !== false };
}

// Asistencia externa (feat nueva, ver MANIFEST.md) -- una jugadora entrenó
// con otro equipo; un admin la registra desde su perfil de Equipo. Fila en
// `log_asistencias` con `origen:'Externa'` + `estado:'A tiempo'` (1 punto,
// misma escala que una marca real de admin) + `id_evento` único `ext_<uuid>`
// (sin fila en `asistencias` -- nunca colisiona con la de-duplicación por
// (evento, persona) de los cálculos de puntos, así 2 externas el mismo día
// suman 2). Cuenta SOLO para `puntos_asistencia`: los 3 lectores de ese
// concepto (`recalcularPuntosAsistencia()`, el total en vivo de
// `getEquipo()`, `getDesglosePuntos()`/'asistencia') filtran
// `origen IN ('Admin','Externa')`; todo lo demás que lee `origen==='Admin'`
// (racha, clases/tiers, última asistencia/Ausente, rollcall) la ignora a
// propósito -- no fue un entrenamiento del club. Los puntos se acreditan con
// el recálculo autoritativo del mes de `fecha` (mismo que "Recalcular ahora"),
// no con un incremento a mano que podría desalinearse del log.
async function adminRegistrarAsistenciaExterna(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const idJugadora = String(params.idJugadora ?? '').trim();
  const fecha      = String(params.fecha ?? '').trim();
  const lugar      = String(params.lugar ?? '').trim();
  if (!idJugadora) return { exito: false, error: 'Falta la persona.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(new Date(fecha + 'T00:00:00Z').getTime())) return { exito: false, error: 'Fecha inválida.' };
  if (lugar.length > 60) return { exito: false, error: 'El lugar no puede superar 60 caracteres.' };
  const hoyEc = new Date(Date.now() - 5 * 3600 * 1000).toISOString().substring(0, 10); // Ecuador = UTC-5, sin DST
  if (fecha > hoyEc) return { exito: false, error: 'La fecha no puede ser futura.' };

  const { data: persona } = await supabase.from('equipo').select('username').eq('username', idJugadora).maybeSingle();
  if (!persona) return { exito: false, error: 'No existe esa persona.' };

  const { error } = await supabase.from('log_asistencias').insert({
    id_evento: 'ext_' + crypto.randomUUID(),
    fecha_entrenamiento: fecha + 'T00:00:00Z', // mismo formato que _agregarFilaLogAsistencia()
    nombre_usuario: persona.username,
    origen: 'Externa',
    estado: 'A tiempo',
    lugar_externo: lugar || null,
    marca_temporal: new Date().toISOString(),
  });
  if (error) return { exito: false, error: 'Error guardando la asistencia: ' + error.message };

  const [anio, mes] = fecha.split('-').map((n: string) => Number(n));
  const recalc = await recalcularPuntosAsistencia(mes, anio);
  if (!recalc.exito) return { exito: false, error: 'Asistencia guardada, pero falló el recálculo de puntos: ' + (recalc.error ?? '') };
  return { exito: true };
}

// Lista de asistencias externas de una persona (subsección "Asistencias
// externas" del perfil de Equipo, admin). Solo filas `origen:'Externa'`,
// más reciente primero. `fecha` = 'YYYY-MM-DD' (la columna guarda
// `fecha + 'T00:00:00Z'`, ver adminRegistrarAsistenciaExterna()).
async function adminGetAsistenciasExternas(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const idJugadora = String(params.idJugadora ?? '').trim();
  if (!idJugadora) return { exito: false, error: 'Falta la persona.' };
  const { data, error } = await supabase.from('log_asistencias')
    .select('id_evento, fecha_entrenamiento, lugar_externo, marca_temporal')
    .eq('nombre_usuario', idJugadora).eq('origen', 'Externa')
    .order('fecha_entrenamiento', { ascending: false })
    .order('marca_temporal', { ascending: false });
  if (error) return { exito: false, error: 'Error leyendo las asistencias externas: ' + error.message };
  const asistencias = (data ?? []).map((r: any) => ({
    idEvento: r.id_evento,
    fecha: String(r.fecha_entrenamiento ?? '').substring(0, 10),
    lugar: r.lugar_externo ?? null,
    marcaTemporal: r.marca_temporal ?? null,
  }));
  return { exito: true, asistencias };
}

// Elimina UNA asistencia externa. Doble guard (prefijo `ext_` + `origen`
// 'Externa' en el mismo DELETE) para que nunca pueda borrar una asistencia
// real de un evento. Después recalcula los puntos del mes de esa fecha, igual
// que al registrar.
async function adminEliminarAsistenciaExterna(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const idEvento = String(params.idEvento ?? '').trim();
  if (!idEvento.startsWith('ext_')) return { exito: false, error: 'Solo se pueden eliminar asistencias externas.' };
  const { data: borradas, error } = await supabase.from('log_asistencias')
    .delete()
    .eq('id_evento', idEvento).eq('origen', 'Externa')
    .select('fecha_entrenamiento');
  if (error) return { exito: false, error: 'Error eliminando la asistencia: ' + error.message };
  if (!borradas || !borradas.length) return { exito: false, error: 'No se encontró esa asistencia externa.' };

  const fecha = String(borradas[0].fecha_entrenamiento ?? '').substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [anio, mes] = fecha.split('-').map((n: string) => Number(n));
    const recalc = await recalcularPuntosAsistencia(mes, anio);
    if (!recalc.exito) return { exito: false, error: 'Asistencia eliminada, pero falló el recálculo de puntos: ' + (recalc.error ?? '') };
  }
  return { exito: true };
}

async function adminBuscarPersonasParaEvento(params: Record<string, any>): Promise<Record<string, any>> {
  const idEvento = String(params.idEvento ?? '').trim();
  // `estado_miembro` sumada al select (feat nueva, ver MANIFEST.md --
  // "Sin respuesta no debe mostrar usuarios inactivos") -- `js/eventos.js`
  // (`_evRenderDetalleAsistencia()`) la usa para sacar del grupo "Sin
  // respuesta" a quien esté 'Ausente' (el único valor de este enum que
  // representa inactividad detectada -- ver el mismo criterio en
  // `adminMarcarAsistencia()`, arriba en este archivo).
  const { data: equipo } = await supabase.from('equipo').select('username, estado_miembro, nombre_derby, foto_perfil').is('eliminado_en', null).order('username');
  const asistLog = await _ultimaAsistenciaPorPersonaTodas([idEvento]);
  const yaMarcadas: Record<string, string> = {};
  (asistLog[idEvento] ?? []).forEach((a: any) => { yaMarcadas[a.nombre] = a.estado; });
  // `ultimaAsistencia` no es una columna real de `equipo` -- se calcula
  // desde `log_asistencias` vía `_ultimaAsistenciaRealPorUsuario()` (ver ese
  // comentario, arriba en este archivo), mismo criterio que
  // `adminGetRosterEquipo()`/`getEquipo()` más abajo (30+ días sin marca
  // real = inactivo; cuenta `'Admin'` Y `'Externa'`, nunca RSVP).
  const ultimaPorUsuario = await _ultimaAsistenciaRealPorUsuario();
  const personas = (equipo ?? []).map((r: any) => { const u = _ultimaAsistenciaDe(ultimaPorUsuario, r.username); return { nombre: r.username, nombreDerby: r.nombre_derby ?? '', fotoPerfil: r.foto_perfil ?? '', estadoActual: yaMarcadas[r.username] ?? null, estadoMiembro: r.estado_miembro ?? 'Activx', ultimaAsistencia: u ? u.slice(0, 10) : null }; });
  return { personas };
}

// ─── Acciones: rectificación de asistencia ────────────────────────────────────
// Tabla `rectificaciones_asistencia` (creación manual pendiente, ver
// MANIFEST.md "Tareas pendientes manuales"): id uuid pk, nombre text,
// id_evento text, fecha_evento text, estado_solicitado text ('A tiempo' |
// 'Tarde' | 'Sin registrar'), decision text default 'Pendiente', created_at
// timestamptz default now().

const ESTADOS_RECTIFICACION = ['A tiempo', 'Tarde', 'Sin registrar'];

async function solicitarRectificacionAsistencia(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const idEvento = String(params.idEvento ?? '').trim();
  const estadoSolicitado = String(params.estadoSolicitado ?? '').trim();
  if (!idEvento) return { exito: false, error: 'Evento inválido.' };
  if (!ESTADOS_RECTIFICACION.includes(estadoSolicitado)) return { exito: false, error: 'Estado inválido.' };
    // Una sola revisión pendiente por evento; a los 7 días sin respuesta se
  // descarta sola y se puede volver a pedir (Victor, 2026-11-12).
  const desde = new Date(Date.now() - (await _diasRectificacion()) * 86400000).toISOString();
  const { data: abierta } = await supabase.from('rectificaciones_asistencia').select('id')
    .eq('nombre', username).eq('id_evento', idEvento).eq('decision', 'Pendiente').gte('created_at', desde).limit(1).maybeSingle();
  if (abierta) return { exito: false, error: 'Ya pediste revisar esta asistencia. Un Pivot la revisará pronto.' };
  const { data: ev } = await supabase.from('asistencias').select('fecha, tipo').eq('id_evento', idEvento).maybeSingle();
    const { data: nueva, error } = await supabase.from('rectificaciones_asistencia').insert({
    nombre: username,
    id_evento: idEvento,
    fecha_evento: ev?.fecha ?? null,
    estado_solicitado: estadoSolicitado,
    decision: 'Pendiente',
  }).select('id').maybeSingle();
  if (error) return { exito: false, error: 'No se pudo enviar. Intenta de nuevo.' };
  const pivot = await _pedidoDePivot(username);
  if (pivot.auto && nueva?.id) {
    await adminSetEstadoRectificacion({ adminToken: _TOKEN_INTERNO, id: nueva.id, decision: 'Aprobada' });
    return { exito: true, aprobada: true };
  }
  const { data: fila } = await supabase.from('equipo').select('nombre_derby').eq('username', username).maybeSingle();
  await sendPush({
    tipo: 'avisos_admin',
    include_external_user_ids: await _adminDestinatariosPush(pivot.email ?? undefined, 'asistencia', 'rectificaciones'),
    headings: { es: 'Revisión de asistencia' },
    contents: { es: `${fila?.nombre_derby || username} pide corregir su asistencia${ev?.fecha ? ' del ' + ev.fecha : ''}: ${estadoSolicitado}.` },
    url: APP_URL + '/',
  });
  return { exito: true };
}

/** Días para revisar una rectificación (Mi Liga → reglas, por defecto 7). */
async function _diasRectificacion(): Promise<number> {
  return Number((await _reglasLiga()).rectificacionDias) || 7;
}

// Mis pedidos de revisión de asistencia de los últimos 60 días, para mostrar
// "Revisión pendiente" (con los días que quedan) o cómo se resolvió.
async function getMisRectificaciones(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const desde = new Date(Date.now() - 60 * 86400000).toISOString();
  const { data } = await supabase.from('rectificaciones_asistencia').select('id, id_evento, estado_solicitado, decision, created_at')
    .eq('nombre', username).gte('created_at', desde).order('created_at', { ascending: false });
  const DIAS_RECTIFICACION = await _diasRectificacion();
  const limite = Date.now() - DIAS_RECTIFICACION * 86400000;
  const porEvento: Record<string, any> = {};
  for (const r of data ?? []) {
    if (porEvento[r.id_evento]) continue; // la más reciente manda
    const vencida = r.decision === 'Pendiente' && new Date(r.created_at).getTime() < limite;
    const quedan = Math.max(0, Math.ceil((new Date(r.created_at).getTime() + DIAS_RECTIFICACION * 86400000 - Date.now()) / 86400000));
    porEvento[r.id_evento] = { id: r.id, estadoSolicitado: r.estado_solicitado, decision: vencida ? 'Descartada' : r.decision, creada: r.created_at, diasQuedan: quedan };
  }
  return { exito: true, porEvento, dias: DIAS_RECTIFICACION };
}

async function adminGetRectificaciones(params: Record<string, any>): Promise<any[]> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return [];
  const { data } = await supabase.from('rectificaciones_asistencia').select('*').eq('decision', 'Pendiente').order('created_at', { ascending: true });
  return (data ?? []).map((r: any) => ({ id: r.id, nombre: r.nombre, fechaEvento: r.fecha_evento, estadoSolicitado: r.estado_solicitado }));
}

// Aplica una rectificación aprobada -- mismo mecanismo que adminMarcarAsistencia()
// (arriba): fila nueva en log_asistencias (origen 'Admin') + actualiza
// a_horario/tarde en `asistencias`. 'Sin registrar' es el único caso sin
// equivalente directo en ESTADOS_ROLLCALL -- en vez de agregar una fila,
// borra las filas de asistencia REAL (rollcall) previas de esa persona para
// ese evento, dejándola sin marca (mismo resultado que "nunca se tomó
// lista"), y no vuelve a agregar el nombre a a_horario/tarde.
async function _aplicarRectificacion(idEvento: string, nombre: string, estadoSolicitado: string): Promise<void> {
  if (estadoSolicitado === 'Sin registrar') {
    await supabase.from('log_asistencias').delete().eq('id_evento', idEvento).eq('nombre_usuario', nombre).in('estado', ESTADOS_ROLLCALL);
  } else {
    await _agregarFilaLogAsistencia(idEvento, nombre, 'Admin', estadoSolicitado);
  }
  const { data: ev } = await supabase.from('asistencias').select('a_horario, tarde').eq('id_evento', idEvento).maybeSingle();
  if (ev) {
    const parseNames = (s: string) => String(s ?? '').split(',').map((n: string) => n.trim()).filter(Boolean);
    const aHorario = parseNames(ev.a_horario).filter((n: string) => n.toUpperCase() !== nombre.toUpperCase());
    const tarde = parseNames(ev.tarde).filter((n: string) => n.toUpperCase() !== nombre.toUpperCase());
    if (estadoSolicitado === 'A tiempo') aHorario.push(nombre);
    else if (estadoSolicitado === 'Tarde') tarde.push(nombre);
    await supabase.from('asistencias').update({ a_horario: aHorario.join(', '), tarde: tarde.join(', ') }).eq('id_evento', idEvento);
    // Batch 8 (ver MANIFEST.md): mismo hook que adminMarcarAsistencia() --
    // esta función también escribe `a_horario`/`tarde` directamente (una
    // rectificación aprobada es, en los hechos, otra forma de marcar
    // asistencia), así que también necesita disparar el recálculo de ESTA
    // persona. Corre para los 3 estados (incluido 'Sin registrar' -- ese
    // caso también cambia el resultado real, al sacar a la persona de
    // `aHorario`/`tarde` arriba).
    await recalcularStatsUsuario(nombre);
  }
  // Una rectificación aprobada a 'A tiempo'/'Tarde' es una marca real de
  // presente, mismo efecto que en adminMarcarAsistencia().
    if (estadoSolicitado === 'A tiempo' || estadoSolicitado === 'Tarde') {
        await _reactivarPorAsistencia(nombre, idEvento);
    try { await _deudaSiVinoSinPago(nombre, idEvento); } catch (e) { console.error('[deuda] rectificación:', e); }
  } else {
    try { await _anularDeudaSinReserva(nombre, idEvento, 'automático'); } catch (e) { console.error('[deuda] anular:', e); }
  }
}

async function adminSetEstadoRectificacion(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const id = params.id;
  const decision = String(params.decision ?? '').trim();
  if (!id || !['Aprobada', 'Rechazada'].includes(decision)) return { exito: false, error: 'Parámetros inválidos.' };
  const { data: rect } = await supabase.from('rectificaciones_asistencia').select('*').eq('id', id).maybeSingle();
  if (!rect) return { exito: false, error: 'Solicitud no encontrada.' };
  const { error } = await supabase.from('rectificaciones_asistencia').update({ decision }).eq('id', id);
  if (error) return { exito: false, error: error.message };
  if (decision === 'Aprobada') await _aplicarRectificacion(rect.id_evento, rect.nombre, rect.estado_solicitado);
  return { exito: true };
}

// ─── Acciones: excepciones de pago (ausencias justificadas / dificultad económica) ────
// Mismo patrón exacto que rectificaciones_asistencia (arriba): tabla propia,
// solicitarX identifica a la persona por token (nunca por un id mandado por
// el cliente), adminGetX/adminSetEstadoX requieren adminToken. `datos` viaja
// como JSON string en el body form-urlencoded (apiPost()) -- se parsea acá
// igual que `actualizarDatosPersona()` parsea su propio `datos`.
// Panel "Excepción de cuota" de la app (Victor, 2026-11-08): las solicitudes
// propias (con a quiénes se enviaron) y las excepciones que aplican a la
// persona (aprobadas o puestas a mano por administradorxs), con su mes.
async function getMisExcepciones(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const [{ data: sols }, { data: exc }, admins] = await Promise.all([
    supabase.from('solicitudes_excepcion').select('id, tipo, estado, mes_aplicacion, nota_admin, created_at, admins_destino, vigente_hasta, indefinida, efecto, cancelada_en').eq('nombre', username).order('created_at', { ascending: false }),
    supabase.from('cuota_excepcion').select('mes, tipo, monto, notas, creado_en').eq('id_miembro', username).order('mes', { ascending: false }),
    _administradorxs(),
  ]);
  const nombre: Record<string, string> = {};
  admins.forEach((a: any) => { nombre[a.username] = a.nombre ?? a.username; });
  return {
    exito: true,
    solicitudes: (sols ?? []).map((s: any) => ({
      id: s.id, tipo: s.tipo, estado: s.estado, mes: s.mes_aplicacion, nota: s.nota_admin ?? '', creada: s.created_at,
      hasta: s.indefinida ? null : (s.vigente_hasta ?? s.mes_aplicacion), indefinida: !!s.indefinida, efecto: s.efecto ?? null, cancelada: !!s.cancelada_en,
      leen: (s.admins_destino ?? []).length ? (s.admins_destino as string[]).map((u) => nombre[u] ?? u) : [],
    })),
    excepciones: (exc ?? []).map((e: any) => ({ mes: e.mes, tipo: e.tipo, monto: e.monto, notas: e.notas ?? '', creada: e.creado_en })),
  };
}

async function solicitarExcepcion(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const tipo = String(params.tipo ?? '').trim();
  if (!['ausencias', 'economica'].includes(tipo)) return { exito: false, error: 'Tipo de solicitud inválido.' };
  const mesAplicacion = String(params.mesAplicacion ?? '').trim();
  if (!mesAplicacion) return { exito: false, error: 'Mes de aplicación inválido.' };
    let datos = params.datos;
  if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch { return { exito: false, error: 'Datos inválidos.' }; } }
  // Administradorxs que pueden leerla (2026-11-08): vacío = todxs. Solo se
  // aceptan usernames que de verdad son admins.
  let destino: string[] = [];
  try { destino = Array.isArray(params.adminsDestino) ? params.adminsDestino : JSON.parse(String(params.adminsDestino ?? '[]')); } catch { destino = []; }
  const admins = (await _administradorxs()).map((a) => a.username);
  destino = destino.map(String).filter((u) => admins.includes(u));
  if (destino.length === admins.length) destino = [];
  const { data, error } = await supabase.from('solicitudes_excepcion').insert({
    nombre: username, tipo, datos: datos ?? {}, mes_aplicacion: mesAplicacion, estado: 'pendiente', admins_destino: destino,
  }).select('id').maybeSingle();
    if (error) return { exito: false, error: error.message };
  const pivot = await _pedidoDePivot(username);
  if (pivot.auto && data?.id) {
    await adminSetEstadoExcepcion({ adminToken: _TOKEN_INTERNO, id: data.id, estado: 'aprobada' });
    return { exito: true, id: data.id, aprobada: true };
  }
  const todos = await _adminDestinatariosPush(pivot.email ?? undefined, 'finanzas', 'excepciones');
  await sendPush({
    tipo: 'avisos_admin',
    include_external_user_ids: destino.length ? todos.filter((u) => destino.includes(u)) : todos,
    headings: { es: 'Solicitud de excepción de cuota' },
    contents: { es: `${username} pidió ${tipo === 'ausencias' ? 'media cuota por ausencias justificadas' : 'una subvención por dificultad económica'}. Revísala en Mi Liga.` },
    url: APP_URL + '/?tab=miliga',
  });
  return { exito: true, id: data?.id };
}

/** Admins con fila en Equipo (username, nombre y foto), sin archivadxs. */
async function _administradorxs(): Promise<{ username: string; nombre: string; foto: string; email: string }[]> {
  const { data: adminsRows } = await supabase.from('admins').select('email');
  const emails = new Set([ADMIN_PRINCIPAL.toLowerCase(), ...(adminsRows ?? []).map((a: any) => String(a.email).toLowerCase())]);
  const { data: filas } = await supabase.from('equipo').select('username, nombre_derby, foto_perfil, email, eliminado_en');
  return (filas ?? [])
    .filter((r: any) => r.email && emails.has(String(r.email).toLowerCase()) && !_estaArchivado(r))
    .map((r: any) => ({ username: r.username, nombre: r.nombre_derby || r.username, foto: r.foto_perfil || '', email: String(r.email).toLowerCase() }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Lista para elegir quién lee una solicitud (cualquier persona con sesión). */
async function getAdministradorxs(params: Record<string, any>): Promise<Record<string, any>> {
  if (!(await _validarToken(params.token))) return { exito: false, error: 'Sesión inválida.' };
  return { exito: true, admins: (await _administradorxs()).map(({ email: _e, ...a }) => a) };
}

/** ¿Este admin puede ver la solicitud? (vacío = todxs). */
async function _puedeVerExcepcion(adminEmail: string, destino: string[] | null): Promise<boolean> {
    if (!destino || destino.length === 0 || adminEmail === _EMAIL_SISTEMA) return true;
  const yo = (await _administradorxs()).find((a) => a.email === adminEmail.toLowerCase());
  return !!yo && destino.includes(yo.username);
}

async function adminGetExcepciones(params: Record<string, any>): Promise<any[]> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return [];
    const { data } = await supabase.from('solicitudes_excepcion').select('*').eq('estado', 'pendiente').order('created_at', { ascending: false });
  const visibles: any[] = [];
  for (const r of data ?? []) if (await _puedeVerExcepcion(adminEmail, r.admins_destino)) visibles.push(r);
  return visibles.map((r: any) => ({ id: r.id, nombre: r.nombre, tipo: r.tipo, datos: r.datos, mesAplicacion: r.mes_aplicacion, createdAt: r.created_at, adminsDestino: r.admins_destino ?? [] }));
}

const _MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function _mesLegible(m: string): string {
  const [a, mm] = m.split('-').map(Number);
  return a && mm ? `${_MESES_ES[mm - 1]} de ${a}` : m;
}
function _mesClave(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function _mesActualClave(): string {
  const { anio, mes } = _mesEcuadorActual();
  return _mesClave(anio, mes);
}

// Escribe en `cuota_excepcion` los meses que cubre una excepción aprobada:
// del mes pedido hasta `vigente_hasta` (o, si es indefinida, hasta el mes en
// curso; el cron diario agrega cada mes nuevo). La nota lleva la solicitud
// para poder quitar los meses futuros si se cancela.
async function _aplicarExcepcionCuota(sol: { id: any; nombre: string; tipo: string; mes_aplicacion: string; efecto: string; vigente_hasta: string | null; indefinida: boolean }): Promise<{ mitad: number }> {
    const precios = await getPreciosClases({}, (await supabase.from('equipo').select('categoria').eq('username', sol.nombre).maybeSingle()).data?.categoria ?? null);
  const mitad = Math.round(Number(precios.precioMensual ?? 0) * 50) / 100;
  const actual = _mesActualClave();
  const fin = sol.indefinida ? (actual > sol.mes_aplicacion ? actual : sol.mes_aplicacion) : (sol.vigente_hasta ?? sol.mes_aplicacion);
  const [a0, m0] = sol.mes_aplicacion.split('-').map(Number);
  const nota = (sol.efecto === 'exenta' ? 'No paga cuota' : (sol.tipo === 'ausencias' ? 'Media cuota por ausencias justificadas' : 'Media cuota por dificultad económica')) + ` (solicitud ${sol.id})`;
  const filas: any[] = [];
  for (let i = 0; i < 120; i++) {
    const clave = _mesClave(a0, m0 + i);
    if (clave > fin) break;
    filas.push(sol.efecto === 'exenta'
      ? { id_miembro: sol.nombre, mes: clave, tipo: 'exenta', monto: null, notas: nota }
      : { id_miembro: sol.nombre, mes: clave, tipo: 'pago', monto: mitad, notas: nota });
  }
  if (filas.length) await supabase.from('cuota_excepcion').upsert(filas, { onConflict: 'id_miembro,mes' });
  return { mitad };
}

// Excepciones vigentes (aprobadas, sin terminar), para el panel de Pivots.
async function adminGetExcepcionesVigentes(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const actual = _mesActualClave();
  const { data } = await supabase.from('solicitudes_excepcion')
    .select('id, nombre, tipo, mes_aplicacion, vigente_hasta, indefinida, efecto, cancelada_en, admins_destino')
    .eq('estado', 'aprobada').or(`indefinida.eq.true,vigente_hasta.gte.${actual}`).order('mes_aplicacion', { ascending: true });
  const visibles: any[] = [];
  for (const r of data ?? []) if (await _puedeVerExcepcion(adminEmail, r.admins_destino)) visibles.push(r);
  const usuarios = [...new Set(visibles.map((r) => r.nombre))];
  const { data: per } = usuarios.length ? await supabase.from('equipo').select('username, nombre_derby, foto_perfil').in('username', usuarios) : { data: [] as any[] };
  const pe: Record<string, any> = {}; (per ?? []).forEach((p: any) => { pe[p.username] = p; });
  return {
    exito: true,
    actual,
    excepciones: visibles.map((r) => ({
      id: r.id, nombre: r.nombre, nombreMostrar: pe[r.nombre]?.nombre_derby || r.nombre, foto: pe[r.nombre]?.foto_perfil || '',
      tipo: r.tipo, desde: r.mes_aplicacion, hasta: r.indefinida ? null : r.vigente_hasta, efecto: r.efecto ?? 'media', cancelada: !!r.cancelada_en,
    })),
  };
}

// Cancelar: dura hasta el fin del mes en curso (Victor, 2026-11-12); los
// meses siguientes se quitan.
async function adminCancelarExcepcion(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { data: sol } = await supabase.from('solicitudes_excepcion').select('id, nombre, tipo, admins_destino, estado').eq('id', params.id).maybeSingle();
  if (!sol || sol.estado !== 'aprobada') return { exito: false, error: 'La excepción no existe.' };
  if (!(await _puedeVerExcepcion(adminEmail, sol.admins_destino))) return { exito: false, error: 'Esta excepción no está dirigida a ti.' };
  const actual = _mesActualClave();
  const { error } = await supabase.from('solicitudes_excepcion').update({ indefinida: false, vigente_hasta: actual, cancelada_en: new Date().toISOString() }).eq('id', sol.id);
  if (error) return { exito: false, error: 'No se pudo cancelar.' };
  await supabase.from('cuota_excepcion').delete().eq('id_miembro', sol.nombre).gt('mes', actual).like('notas', `%(solicitud ${sol.id})%`);
  await sendPush({
    tipo: 'solicitud_resuelta',
    include_external_user_ids: [sol.nombre],
    headings: { es: 'Tu excepción de cuota termina este mes' },
    contents: { es: `Sigue vigente hasta el fin de ${_mesLegible(actual)}. Desde el mes que viene la cuota vuelve a ser la normal.` },
    url: APP_URL + '/',
  });
  return { exito: true, hasta: actual };
}

// Cron diario: las excepciones indefinidas suman el mes nuevo.
async function _extenderExcepcionesIndefinidas(): Promise<void> {
  const { data } = await supabase.from('solicitudes_excepcion').select('id, nombre, tipo, mes_aplicacion, efecto').eq('estado', 'aprobada').eq('indefinida', true);
  for (const s of data ?? []) await _aplicarExcepcionCuota({ ...s, efecto: s.efecto ?? 'media', vigente_hasta: null, indefinida: true });
}

async function adminSetEstadoExcepcion(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const id = params.id;
  const estado = String(params.estado ?? '').trim();
  if (!id || !['aprobada', 'rechazada'].includes(estado)) return { exito: false, error: 'Parámetros inválidos.' };
    const notaAdmin = params.notaAdmin != null && params.notaAdmin !== '' ? String(params.notaAdmin) : null;
    const { data: sol } = await supabase.from('solicitudes_excepcion').select('nombre, tipo, mes_aplicacion, admins_destino, estado').eq('id', id).maybeSingle();
  if (!sol) return { exito: false, error: 'La solicitud no existe.' };
  if (!(await _puedeVerExcepcion(adminEmail, sol.admins_destino))) return { exito: false, error: 'Esta solicitud no está dirigida a ti.' };
  // Editar una ya aprobada (Victor, 2026-11-13: todo pedido es editable por
  // un Pivot y se avisa a la persona): se quitan los meses desde el actual
  // que puso esta solicitud y se vuelven a aplicar con lo nuevo. Los meses
  // pasados no se tocan.
  const editando = sol.estado === 'aprobada' && estado === 'aprobada' && (params.editar === true || params.editar === 'true');
  if (editando) {
    await supabase.from('cuota_excepcion').delete().eq('id_miembro', sol.nombre).gte('mes', _mesActualClave()).like('notas', `%(solicitud ${id})%`);
  }
  // Duración y efecto que decide el Pivot al aprobar (Victor, 2026-11-12):
  // duracion 'mes' (solo el mes pedido), 'hasta' (hasta el mes `hasta`,
  // 'AAAA-MM') o 'indefinida'; efecto 'media' (media cuota) o 'exenta' (no
  // paga). Ausencias justificadas siempre es media cuota.
  const duracion = ['mes', 'hasta', 'indefinida'].includes(String(params.duracion)) ? String(params.duracion) : 'mes';
  const hasta = duracion === 'hasta' && /^\d{4}-\d{2}$/.test(String(params.hasta ?? '')) ? String(params.hasta) : null;
  if (duracion === 'hasta' && (!hasta || hasta < sol.mes_aplicacion)) return { exito: false, error: 'Elige hasta qué mes dura.' };
  const efecto = sol.tipo === 'ausencias' ? 'media' : (params.efecto === 'exenta' ? 'exenta' : 'media');
  const cambios: Record<string, any> = { estado, nota_admin: notaAdmin };
  if (estado === 'aprobada') {
    cambios.efecto = efecto;
    cambios.indefinida = duracion === 'indefinida';
    cambios.vigente_hasta = duracion === 'indefinida' ? null : (hasta ?? sol.mes_aplicacion);
  }
  const { error } = await supabase.from('solicitudes_excepcion').update(cambios).eq('id', id);
  if (error) return { exito: false, error: error.message };
  let detalle = '';
  if (estado === 'aprobada') {
    const r = await _aplicarExcepcionCuota({ id, nombre: sol.nombre, tipo: sol.tipo, mes_aplicacion: sol.mes_aplicacion, efecto, vigente_hasta: cambios.vigente_hasta, indefinida: cambios.indefinida });
    const cuanto = efecto === 'exenta' ? 'no pagas cuota' : `pagas media cuota ($${r.mitad.toFixed(2)})`;
    detalle = duracion === 'indefinida'
      ? ` Desde ${_mesLegible(sol.mes_aplicacion)} ${cuanto}, hasta que un Pivot lo cambie.`
      : duracion === 'hasta' ? ` De ${_mesLegible(sol.mes_aplicacion)} a ${_mesLegible(hasta!)} ${cuanto}.` : ` En ${_mesLegible(sol.mes_aplicacion)} ${cuanto}.`;
  }
  await sendPush({
    tipo: 'solicitud_resuelta',
    include_external_user_ids: [sol.nombre],
        headings: { es: editando ? 'Un Pivot cambió tu excepción de cuota' : estado === 'aprobada' ? 'Tu solicitud fue aprobada' : 'Tu solicitud fue rechazada' },
    contents: {
      es: (sol.tipo === 'ausencias' ? 'Media cuota por ausencias justificadas: ' : 'Subvención por dificultad económica: ')
                + (editando ? 'ahora queda así.' : estado === 'aprobada' ? 'aprobada.' : 'rechazada.') + detalle + (notaAdmin ? ` Nota: ${notaAdmin}` : ''),
    },
    url: APP_URL + '/',
  });
  return { exito: true };
}

// ─── Acciones: reservas ───────────────────────────────────────────────────────

async function getProximosEntrenamientos(): Promise<any[]> {
  const lista = await _proximosEntrenamientos();
  return lista.map((ev: any) => ({ fecha: ev.idEvento, estado: 'Evento Programado', mapsUrl: ev.mapsUrl, descripcion: ev.descripcion, horaFin: ev.horaFin, duracion: ev.duracion, donde: ev.donde, horaInicio: ev.horaInicio, fechaCalendario: ev.fecha, videoInstructivo: ev.videoInstructivo ?? '' }));
}

/// Listas propias de la liga (no patines ni protecciones del sistema) que una
/// persona usa, con su stock (Victor, 2026-11-17). Las del sistema siguen con
/// `talla`/`protecciones` de la reserva.
async function _otrasDeLiga(nombre: string, soloEsta?: unknown): Promise<{ eq: Record<string, string>; listas: ListaEntrenar[]; cupo: (l: ListaEntrenar, v: string) => number }> {
  const listas = (await _listasEntrenar()).filter((l) => !l.sistema);
  // Equipamiento solo para esta reserva (`equipo` de la app) o el del perfil.
  let todo: Record<string, string> | null = null;
  if (soloEsta != null && soloEsta !== '') {
    try { const j = typeof soloEsta === 'object' ? soloEsta : JSON.parse(String(soloEsta)); if (j && typeof j === 'object') todo = j as Record<string, string>; } catch { todo = null; }
  }
  if (!todo) {
    const { data: fila } = await supabase.from('equipo').select('equipo_liga').eq('username', nombre).maybeSingle();
    todo = (fila?.equipo_liga as Record<string, string>) ?? {};
  }
  const usadas = listas.filter((l) => l.id in todo);
  const eq: Record<string, string> = {};
  for (const l of usadas) eq[l.id] = todo[l.id];
  const { data: st } = usadas.length ? await supabase.from('inventario_stock').select('lista_id, variante, cantidad').in('lista_id', usadas.map((l) => l.id)) : { data: [] };
  const cupo = (l: ListaEntrenar, v: string) => {
    const filas = (st ?? []).filter((x: any) => x.lista_id === l.id);
    if (l.tipo === 'tallas') return Number(filas.find((x: any) => String(x.variante) === v)?.cantidad) || 0;
    if (l.tipo === 'set' && l.piezas.length) return Math.min(...l.piezas.map((p: any) => Math.floor((Number(filas.find((x: any) => x.variante === p.nombre)?.cantidad) || 0) / (Number(p.cantidad) || 1))));
    return filas.reduce((s: number, x: any) => s + (Number(x.cantidad) || 0), 0);
  };
  return { eq, listas: usadas, cupo };
}

/// Razón por la que no alcanza lo de la liga para un evento, o ''.
function _faltaDeLiga(o: { eq: Record<string, string>; listas: ListaEntrenar[]; cupo: (l: ListaEntrenar, v: string) => number }, reservasEvento: any[]): string {
  for (const l of o.listas) {
    const v = o.eq[l.id] ?? '';
    const usadas = reservasEvento.filter((r: any) => r.equipo && l.id in r.equipo && (l.tipo !== 'tallas' || String(r.equipo[l.id]) === v)).length;
    if (usadas >= o.cupo(l, v)) return l.tipo === 'tallas' ? `Sin ${l.nombre.toLowerCase()} talla ${v} disponibles` : `Sin ${l.nombre.toLowerCase()} disponibles`;
  }
  return '';
}

async function getFechasDisponibles(params: Record<string, any>): Promise<any[]> {
  const { nombre, talla, necesitaProtecciones } = params;
    const otras = await _otrasDeLiga(String(nombre ?? ''), params.equipo);
    const proximos = await _proximosEntrenamientos(true);
  const { data: tallasSupa } = await supabase.from('equipamiento_tallas').select('talla, cantidad');
  const stockPatines: Record<string, number> = {};
  (tallasSupa ?? []).forEach((t: any) => { stockPatines[t.talla] = t.cantidad; });
  const { data: cfgProt } = await supabase.from('config_equipamiento').select('total_protecciones').limit(1).maybeSingle();
  const totalProtecciones = cfgProt?.total_protecciones ?? 0;

  // Reservas activas desde Supabase (no Canceladas)
    const { data: reservas } = await supabase.from('reservas').select('nombre_usuario, id_evento, talla, protecciones, estado, equipo').neq('estado', 'Cancelada').not('id_evento', 'is', null);
  const resArr = reservas ?? [];

  return proximos.map((ev: any) => {
    const idEvento = ev.idEvento;
    const extra = { mapsUrl: ev.mapsUrl, descripcion: ev.descripcion, horaFin: ev.horaFin, duracion: ev.duracion, donde: ev.donde, horaInicio: ev.horaInicio, fechaCalendario: ev.fecha, videoInstructivo: ev.videoInstructivo ?? '' };
        const yaReservo = resArr.some((r: any) => r.nombre_usuario === nombre && r.id_evento === idEvento);
    if (ev.cerradaDesde && !yaReservo) return { ...extra, fecha: idEvento, disponible: false, razon: `Las reservas para esta clase cerraron a las ${ev.cerradaDesde}` };
    if (yaReservo) return { ...extra, fecha: idEvento, disponible: false, razon: 'Ya tienes una reserva para esta fecha' };
    const reservasEstaFecha = resArr.filter((r: any) => r.id_evento === idEvento);
    if (talla && talla !== '') {
      const usadasTalla = reservasEstaFecha.filter((r: any) => r.talla === talla).length;
      if (usadasTalla >= (stockPatines[talla] ?? 0)) return { ...extra, fecha: idEvento, disponible: false, razon: 'Sin patines talla ' + talla + ' disponibles' };
    }
    if (necesitaProtecciones && necesitaProtecciones.toLowerCase() !== 'no' && necesitaProtecciones !== '') {
      const usadasProtec = reservasEstaFecha.filter((r: any) => r.protecciones && r.protecciones !== '').length;
            if (usadasProtec >= totalProtecciones) return { ...extra, fecha: idEvento, disponible: false, razon: 'Sin protecciones disponibles' };
    }
    const falta = _faltaDeLiga(otras, reservasEstaFecha);
    if (falta) return { ...extra, fecha: idEvento, disponible: false, razon: falta };
    return { ...extra, fecha: idEvento, disponible: true, razon: '' };
  });
}

async function guardarReserva(params: Record<string, any>): Promise<Record<string, any>> {
    const { nombre, fecha, talla, protecciones, email } = params;
  const esMensual = !fecha.startsWith('ev_');
  // Año del mes (los meses se eligen en una ventana de 12 desde el actual,
  // 2026-11-07): si viene, la vigencia es el fin de ESE mes; si no, se deduce.
  const anioMes = Number(params.anio) || null;

  // Check duplicate
    const { data: dup } = await supabase.from('reservas').select('id').eq('nombre_usuario', nombre).eq('id_evento', fecha).neq('estado', 'Cancelada').maybeSingle();
  if (dup) return { exito: false, mensaje: 'Ya tienes una reserva para esta fecha.' };
  // Equipamiento de las listas propias de la liga (Victor, 2026-11-17).
    const otras = esMensual ? null : await _otrasDeLiga(String(nombre ?? ''), params.equipo);
  if (otras && otras.listas.length) {
    const { data: delEvento } = await supabase.from('reservas').select('equipo').eq('id_evento', fecha).neq('estado', 'Cancelada');
    const falta = _faltaDeLiga(otras, delEvento ?? []);
    if (falta) return { exito: false, mensaje: falta + ' para esa clase.' };
  }


  // Check duplicate (reserva mensual pendiente/confirmada para el mismo mes -- id_evento
  // queda null en reservas mensuales, así que el check de arriba nunca las atrapa)
  if (esMensual) {
        // Mismo mes Y mismo año (validez_hasta = fin de ese mes, ver migración
    // 20261107160000_reservas_vigencia_mensual.sql) -- Octubre 2027 no choca con Octubre 2026.
        const vigencia = _vigenciaMensualISO(fecha, new Date().toISOString().substring(0, 10), anioMes);
    const { data: dupsMes } = await supabase.from('reservas').select('id, validez_hasta').eq('nombre_usuario', nombre).eq('mes_texto', fecha).neq('estado', 'Cancelada');
    const dupMensual = (dupsMes ?? []).some((r: any) => !r.validez_hasta || r.validez_hasta === vigencia);
    if (dupMensual) return { exito: false, mensaje: 'Ya tienes una reserva pendiente para ese mes. Espera a que sea revisada.' };
  }

    // Precio server-side (con el precio propio de su equipo, si tiene)
    const equipoReserva = (await supabase.from('equipo').select('categoria').eq('username', nombre).maybeSingle()).data?.categoria ?? null;
  const precios = await getPreciosClases({}, equipoReserva);
    let montoFinal = esMensual ? Number(precios.precioMensual ?? 0) : Number(precios.precioPorClase ?? 0);
  // Clase dentro de un mes o periodo sin cobro (Victor, 2026-11-20): gratis o con su %.
  let pctClase = 100;
  if (!esMensual) {
    const { data: evF } = await supabase.from('asistencias').select('fecha').eq('id_evento', fecha).limit(1).maybeSingle();
    if (evF?.fecha) pctClase = _pctClaseEn(await _reglasLiga(), equipoReserva, String(evF.fecha));
    if (pctClase < 100) montoFinal = _num2(montoFinal * pctClase / 100);
  }
  // Recargo fijo por pagar la cuota después del vencimiento + gracia (Mi Liga → Cobros).
    let recargo = 0;
  let saldoAplicado: number | null = null;
  if (esMensual) {
    const vig = _vigenciaMensualISO(fecha, new Date().toISOString().substring(0, 10), anioMes);
    // Descanso con cuota proporcional en ese mes (Victor, 2026-11-19): nunca el mes entero.
    // Meses y periodos sin cobro de su equipo (Victor, 2026-11-20).
    const fp = vig ? await _factorCuotaMes(vig.slice(0, 7), equipoReserva) : null;
    if (fp?.sinCobro) {
      const nm = _MESES_ES[Number(vig!.slice(5, 7)) - 1];
      return { exito: false, mensaje: `${nm.charAt(0).toUpperCase() + nm.slice(1)} no se cobra: no necesitas suscribirte.` };
    }
    if (fp) montoFinal = _num2(montoFinal * fp.factor);
        recargo = vig ? _recargoCuota(vig.slice(0, 7), _hoyEcuadorISO(), await _reglasDeEquipo(equipoReserva), montoFinal) : 0;
                                montoFinal += recargo;
  }
    // Plan de N meses (Victor, 2026-11-16): cada mes vale precio / N, sin recargo.
  let planIdUsado: string | null = null;
  if (esMensual && params.planId) {
    const plan = await _planDe(String(params.planId), nombre);
    if (!plan || plan.tipo !== 'meses') return { exito: false, mensaje: 'Ese plan ya no está disponible.' };
    montoFinal = _num2(Number(plan.precio) / Number(plan.cantidad));
    recargo = 0;
    planIdUsado = plan.id;
  }
  // Cupón manual de descuento (Victor, 2026-11-16): un % para el próximo
  // pago, una sola vez. Vuelve si se cancela esa reserva.
  let descuentoPct: number | null = null, descuentoMonto: number | null = null;
  const pideGratis0 = params.monto === undefined || Number(params.monto) === 0;
  if (montoFinal > 0 && !pideGratis0 && (await _validarToken(String(params.token ?? ''))) === nombre) {
    const { data: cu } = await supabase.from('equipo').select('cupon_descuento').eq('username', nombre).maybeSingle();
    const pct = Number(cu?.cupon_descuento) || 0;
    if (pct > 0) {
      const { data: tomado } = await supabase.from('equipo').update({ cupon_descuento: null }).eq('username', nombre).eq('cupon_descuento', pct).select('username');
      if (tomado?.length) {
        descuentoPct = pct;
        descuentoMonto = _num2(montoFinal * pct / 100);
        montoFinal = _num2(montoFinal - descuentoMonto);
      }
    }
  }
  // Saldo con el equipo (cuotas y clases). 'usar' descuenta el saldo a favor
  // (solo cuotas); 'pagar' suma la deuda. Las clases que pasaron a deuda
  // (Victor, 2026-11-14) se cobran siempre en la próxima reserva pagada,
  // aunque no se pida. Solo con la sesión de la misma persona. Se registra
  // al confirmar la reserva.
  if (montoFinal > 0 && (await _validarToken(String(params.token ?? ''))) === nombre) {
    const pide = String(params.saldo ?? '');
    const disp = await _saldoDisponible(nombre);
        // La persona elige cuánto usar (Victor, 2026-11-21), también en clases.
    const tope = Number(params.saldoMonto) > 0 ? Number(params.saldoMonto) : Infinity;
    if (pide === 'usar' && disp > 0) {
      saldoAplicado = _num2(Math.min(disp, montoFinal, tope)); montoFinal = _num2(montoFinal - saldoAplicado);
    } else if (disp < 0) {
      const obligada = await _deudaClases(nombre, disp);
      const deuda = pide === 'pagar' ? -disp : obligada;
      if (deuda > 0) { saldoAplicado = _num2(-deuda); montoFinal = _num2(montoFinal + deuda); }
    }
  }


    // Consumir crédito o cupón -- solo cuando el cliente pidió esa clase gratis
  // (manda monto 0, web y app, 2026-11-07); antes se aplicaba siempre, aunque
  // la persona no hubiera elegido el cupón o fuera una cuota mensual.
  // Una clase que no se cobra no gasta la clase a favor, el plan ni el cupón.
  const pideGratis = (params.monto === undefined || Number(params.monto) === 0) && pctClase > 0;
    const credito = pideGratis ? await _consumirCreditoReal(nombre) : false;
  let usoCupon = false;
  // Clase de un plan de clases (antes que el cupón de bienvenida).
  const creditoPlan = !credito && pideGratis && !esMensual ? await _consumirCreditoPlan(nombre) : null;
  if (creditoPlan) {
    montoFinal = 0;
    planIdUsado = creditoPlan.plan_id ?? null;
  } else if (credito) {
    montoFinal = 0;
  } else if (pideGratis) {
    const { data: eq } = await supabase.from('equipo').select('cupon_disponible').eq('username', nombre).maybeSingle();
    if (eq?.cupon_disponible) {
      await supabase.from('equipo').update({ cupon_disponible: false }).eq('username', nombre);
      montoFinal = 0;
      usoCupon = true;
    }
  }

  const hoyISO = new Date().toISOString().substring(0, 10);
    const { data: nueva } = await supabase.from('reservas').insert({
    nombre_usuario: nombre, id_evento: esMensual ? null : fecha, tipo: esMensual ? 'mensual' : 'clase',
        mes_texto: esMensual ? fecha : null, talla: talla ?? null, protecciones: protecciones ?? null,
    equipo: otras && otras.listas.length ? otras.eq : null,
                                estado: 'Pendiente', monto: montoFinal, fecha_pago: _hoyEcuadorISO(), email: email ?? null, saldo_aplicado: saldoAplicado,
                validez_hasta: esMensual ? _vigenciaMensualISO(fecha, hoyISO, anioMes) : null,
        uso_cupon: usoCupon,
        descuento_pct: descuentoPct, descuento_monto: descuentoMonto,
    plan_id: planIdUsado, plan_credito_id: creditoPlan?.id ?? null,
    // Dónde dice que pagó (2026-11-13), para que el Pivot sepa dónde revisar.
        medio_pago: /^[a-z0-9_-]{1,40}$/.test(String(params.medio ?? '')) ? String(params.medio) : null,
        medio_nombre: String(params.medioNombre ?? '').trim().slice(0, 60) || null,
  }).select('id, monto').maybeSingle();
  // El id permite subir el comprobante justo después (2026-11-14).
    await supabase.from('reservas_en_curso').delete().eq('nombre', nombre);
  return { exito: true, id: nueva?.id ?? null, monto: Number(nueva?.monto) || 0, saldoAplicado: saldoAplicado ?? 0 };
}

// Fin del mes que cubre una reserva mensual (mismo cálculo que
// public.fn_vigencia_mensual en la BD): mes_texto no trae año, se toma el de
// la fecha de referencia corrigiendo el cruce de año.
function _vigenciaMensualISO(mesTexto: string, refISO: string, anioFijo: number | null = null): string | null {
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const n = meses.indexOf((mesTexto ?? '').toLowerCase().trim()) + 1;
  if (!n) return null;
  const [y, m] = refISO.split('-').map(Number);
  const anio = anioFijo ?? (y + (n < m - 6 ? 1 : n > m + 6 ? -1 : 0));
  const fin = new Date(Date.UTC(anio, n, 0));
  return fin.toISOString().substring(0, 10);
}

// "aaaa-mm-dd" -> "d/m/aaaa" (formato que la web y la app leen en `validezHasta`).
function _fechaDMA(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.substring(0, 10).split('-').map(Number);
  return `${d}/${m}/${y}`;
}

async function getReservasPersona(params: Record<string, any>): Promise<any[]> {
  const { nombre } = params;
  // Solo las propias (2026-11-14): antes cualquiera podía pedir las reservas
  // de otra persona por su usuario. Un Pivot con sesión válida también puede.
  const propia = !!nombre && (await _validarToken(params.token)) === nombre;
  if (!propia && !(params.adminToken && await _validarAdminToken(String(params.adminToken)))) return [];
  const { data: reservas } = await supabase.from('reservas').select('*').eq('nombre_usuario', nombre).order('fecha_pago', { ascending: false });
  if (!reservas?.length) return [];
  // Enrich with asistencias data for clase reservas
  const ids = reservas.filter((r: any) => r.id_evento).map((r: any) => r.id_evento);
  const { data: eventos } = ids.length ? await supabase.from('asistencias').select('id_evento, fecha, donde, inicia').in('id_evento', ids) : { data: [] };
  const eventosPorId: Record<string, any> = {};
  (eventos ?? []).forEach((e: any) => { eventosPorId[e.id_evento] = e; });
  return reservas.map((r: any) => {
    const ev = eventosPorId[r.id_evento];
    return {
      ...r,
      fecha: r.id_evento ?? r.mes_texto ?? null,
      fechaCalendario: ev?.fecha ?? null,
      fechaEvento: ev?.fecha ?? null,
      donde: ev?.donde ?? null,
            horaInicio: ev?.inicia?.substring(0, 5) ?? null,
      // Antes la web leía `validezHasta` pero solo llegaba `validez_hasta`: toda
      // cuota mensual contaba como al día para siempre.
      validezHasta: r.tipo === 'mensual' ? _fechaDMA(r.validez_hasta ?? _vigenciaMensualISO(r.mes_texto, r.fecha_pago ?? new Date().toISOString().substring(0, 10))) : null,
    };
  });
}

// Notifica a los admins una baja/reagendo de reserva MENSUAL (r.tipo -- ver
// guardarReserva() más arriba -- 'mensual' vs 'clase') -- reservas de clase
// puntual son frecuentes y de bajo impacto, a propósito fuera de este aviso.
async function _notificarReservaMensualCambio(r: Record<string, any>, nombre: string, accion: 'cancelar' | 'reagendar'): Promise<void> {
  if (r?.tipo !== 'mensual') return;
  await sendPush({
    tipo: 'avisos_admin',
    include_external_user_ids: await _adminDestinatariosPush(undefined, 'finanzas', 'reservas'),
    headings: { es: accion === 'cancelar' ? 'Suscripción cancelada' : 'Suscripción reagendada' },
    contents: { es: `${nombre} ${accion === 'cancelar' ? 'canceló' : 'reagendó'} su suscripción mensual.` },
    url: APP_URL + '/?tab=miliga',
  });
}

// Aviso a las admins: alguien registró un pago (DeUna o transferencia) que
// queda pendiente de revisión (pedido 2026-11-07). Lo llaman la web y la app
// una sola vez por pago, después de guardar las reservas.
async function avisarPagoPendiente(params: Record<string, any>): Promise<Record<string, any>> {
  const nombre = await _validarToken(params.token);
  if (!nombre || nombre !== params.nombre) return { exito: false, error: 'Sesión inválida.' };
  const monto = Number(params.monto) || 0;
  if (monto <= 0) return { exito: true };
  const detalle = String(params.detalle ?? '').trim();
  await sendPush({
    tipo: 'avisos_admin',
    include_external_user_ids: await _adminDestinatariosPush(undefined, 'finanzas', 'pagos'),
    headings: { es: 'Pago pendiente de revisión' },
    contents: { es: `${nombre} registró un pago de $${monto.toFixed(2)}${detalle ? ` (${detalle})` : ''}. Revísalo para aprobar la suscripción.` },
    url: APP_URL + '/?tab=miliga',
  });
  return { exito: true };
}

// Busca la reserva activa de una persona: por evento (clase) o, para una
// cuota mensual, por nombre del mes (+ año opcional vía `validez_hasta`).
// Antes solo buscaba por `id_evento`, y las mensuales lo tienen en null:
// cancelar o reagendar un mes nunca encontraba la reserva (2026-11-07).
async function _reservaActiva(nombre: string, fecha: string, anio: number | null, columnas = '*'): Promise<any | null> {
  if (String(fecha ?? '').startsWith('ev_')) {
    const { data } = await supabase.from('reservas').select(columnas).eq('nombre_usuario', nombre).eq('id_evento', fecha).neq('estado', 'Cancelada').limit(1);
    return data?.[0] ?? null;
  }
  const { data } = await supabase.from('reservas').select(columnas).eq('nombre_usuario', nombre).eq('tipo', 'mensual').ilike('mes_texto', String(fecha ?? '').trim()).neq('estado', 'Cancelada');
  const filas = data ?? [];
  if (anio) return filas.find((r: any) => String(r.validez_hasta ?? '').startsWith(String(anio))) ?? null;
  // Sin año: la del mes vigente o futuro más próximo.
  const hoy = new Date().toISOString().substring(0, 10);
  return filas.filter((r: any) => !r.validez_hasta || r.validez_hasta >= hoy).sort((a: any, b: any) => String(a.validez_hasta).localeCompare(String(b.validez_hasta)))[0] ?? filas[0] ?? null;
}

// ¿Faltan al menos `minutos` para que empiece el evento? (hora de Ecuador, UTC-5).
async function _faltaAlMenos(idEvento: string, minutos: number): Promise<boolean> {
  const { data: ev } = await supabase.from('asistencias').select('fecha, inicia').eq('id_evento', idEvento).limit(1).maybeSingle();
  if (!ev?.fecha) return false;
  const inicio = Date.parse(`${String(ev.fecha).substring(0, 10)}T${String(ev.inicia ?? '00:00').substring(0, 5)}:00-05:00`);
  return Number.isFinite(inicio) && inicio - Date.now() >= minutos * 60 * 1000;
}

async function cancelarReserva(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre, fecha } = params;
  // Solo la propia persona cancela sus reservas.
  if ((await _validarToken(params.token)) !== nombre) return { exito: false, error: 'Sesión inválida.' };
  const r = await _reservaActiva(nombre, fecha, Number(params.anio) || null);
  if (!r) return { exito: false, error: 'Reserva no encontrada.' };
    await supabase.from('reservas').update({ estado: 'Cancelada' }).eq('id', r.id);
  // El cupón vuelve solo si ESTA reserva lo usó y se cancela con al menos 1
  // hora de anticipación (Victor, 2026-11-07). Antes se devolvía a
  // cualquiera que cancelara una reserva confirmada, la hubiera pagado con
  // cupón o no. Al reagendar, el cupón viaja con la reserva.
  let cuponRestaurado = false;
        if (r.uso_cupon && r.id_evento && (await _reglasLiga()).cuponVuelve !== false && (await _faltaAlMenos(r.id_evento, Number((await _reglasLiga()).cuponCancelarMin) || 0))) {
    await supabase.from('equipo').update({ cupon_disponible: true }).eq('username', nombre);
    cuponRestaurado = true;
  }
      // La clase de un plan vuelve al plan.
  if (r.plan_credito_id) {
    const { data: pc } = await supabase.from('plan_creditos').select('usadas').eq('id', r.plan_credito_id).maybeSingle();
    if (pc && Number(pc.usadas) > 0) await supabase.from('plan_creditos').update({ usadas: Number(pc.usadas) - 1 }).eq('id', r.plan_credito_id);
  }
  // El descuento manual vuelve si no tiene otro.
  if (r.descuento_pct) await supabase.from('equipo').update({ cupon_descuento: r.descuento_pct }).eq('username', nombre).is('cupon_descuento', null);
  await _notificarReservaMensualCambio(r, nombre, 'cancelar');
  return { exito: true, cuponRestaurado };
}

async function reagendarReserva(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre, fechaAnterior, fechaNueva } = params;
  if ((await _validarToken(params.token)) !== nombre) return { exito: false, error: 'Sesión inválida.' };
  const reserva = await _reservaActiva(nombre, fechaAnterior, Number(params.anioAnterior) || null, 'id, tipo');
  if (!reserva) return { exito: false, error: 'Reserva no encontrada.' };
  // Mensual: cambia el mes (y su vencimiento); clase: cambia el evento.
  const cambio = reserva.tipo === 'mensual'
    ? { mes_texto: fechaNueva, validez_hasta: _vigenciaMensualISO(fechaNueva, new Date().toISOString().substring(0, 10), Number(params.anioNuevo) || null), estado: 'Pendiente' }
    : { id_evento: fechaNueva, estado: 'Pendiente' };
  if (reserva.tipo !== 'mensual') {
    const { data: dup } = await supabase.from('reservas').select('id').eq('nombre_usuario', nombre).eq('id_evento', fechaNueva).neq('estado', 'Cancelada').limit(1);
    if (dup?.length) return { exito: false, error: 'Ya tienes una reserva para esa fecha.' };
  }
  const { error } = await supabase.from('reservas').update(cambio).eq('id', reserva.id);
  if (error) return { exito: false, error: error.message };
  await _notificarReservaMensualCambio(reserva, nombre, 'reagendar');
  return { exito: true };
}

async function getTallasDisponiblesParaFecha(params: Record<string, any>): Promise<any[]> {
  const { fecha: idEvento, nombreExcluir } = params;
  const { data: tallas } = await supabase.from('equipamiento_tallas').select('talla, cantidad');
  const { data: reservas } = await supabase.from('reservas').select('talla, nombre_usuario').eq('id_evento', idEvento).neq('estado', 'Cancelada').not('talla', 'is', null);
  const usadas: Record<string, number> = {};
  (reservas ?? []).forEach((r: any) => { if (r.nombre_usuario === nombreExcluir) return; usadas[r.talla] = (usadas[r.talla] ?? 0) + 1; });
  const result = (tallas ?? []).map((t: any) => ({ talla: t.talla, disponibles: Math.max(0, t.cantidad - (usadas[t.talla] ?? 0)) }));
  return result;
}

// Cambiar la talla de patines de una reserva de clase propia (2026-11-14).
// Antes esperaba `id`/`talla`/`idEvento` sin sesión, pero la web manda
// `nombre`/`fecha` (id_evento)/`tallaNueva`: nunca guardaba. Ahora valida la
// sesión y busca la reserva propia de ese evento, igual que las protecciones.
async function actualizarTallaReserva(params: Record<string, any>): Promise<Record<string, any>> {
  const nombre = String(params.nombre ?? ''), idEvento = String(params.fecha ?? params.idEvento ?? ''), talla = String(params.tallaNueva ?? params.talla ?? '').trim();
  if (!nombre || (await _validarToken(params.token)) !== nombre) return { exito: false, error: 'Sesión inválida.' };
  if (!idEvento || !talla) return { exito: false, error: 'Faltan datos.' };
  const { data: mia } = await supabase.from('reservas').select('id').eq('nombre_usuario', nombre).eq('id_evento', idEvento).neq('estado', 'Cancelada').limit(1).maybeSingle();
  if (!mia) return { exito: false, error: 'Reserva no encontrada.' };
  const { data: stock } = await supabase.from('equipamiento_tallas').select('cantidad').eq('talla', talla).maybeSingle();
  const { data: usadas } = await supabase.from('reservas').select('id').eq('id_evento', idEvento).eq('talla', talla).neq('estado', 'Cancelada').neq('id', mia.id);
  if ((usadas?.length ?? 0) >= (stock?.cantidad ?? 0)) return { exito: false, error: 'No quedan patines talla ' + talla + ' para esa clase.' };
  const { error } = await supabase.from('reservas').update({ talla }).eq('id', mia.id);
  if (error) return { exito: false, error: 'No se pudo guardar.' };
  return { exito: true };
}

/// Cambiar el equipamiento de la liga de una suscripción ya hecha (Victor,
/// 2026-11-22): las listas propias de la liga (no patines ni protecciones,
/// que siguen por talla/protecciones). `equipo` = {listaId: talla o piezas}.
async function actualizarEquipoReserva(params: Record<string, any>): Promise<Record<string, any>> {
  const nombre = String(params.nombre ?? ''), idEvento = String(params.fecha ?? params.idEvento ?? '');
  if (!nombre || (await _validarToken(params.token)) !== nombre) return { exito: false, error: 'Sesión inválida.' };
  if (!idEvento) return { exito: false, error: 'Faltan datos.' };
  const { data: mia } = await supabase.from('reservas').select('id').eq('nombre_usuario', nombre).eq('id_evento', idEvento).neq('estado', 'Cancelada').limit(1).maybeSingle();
  if (!mia) return { exito: false, error: 'Reserva no encontrada.' };
  const pedido = params.equipo && typeof params.equipo === 'object' ? params.equipo : (() => { try { return JSON.parse(String(params.equipo ?? '{}')); } catch { return {}; } })();
  const o = await _otrasDeLiga(nombre, pedido ?? {});
  const { data: delEvento } = await supabase.from('reservas').select('equipo').eq('id_evento', idEvento).neq('estado', 'Cancelada').neq('id', mia.id);
  const falta = _faltaDeLiga(o, delEvento ?? []);
  if (falta) return { exito: false, error: falta + ' para esa clase.' };
  const { error } = await supabase.from('reservas').update({ equipo: Object.keys(o.eq).length ? o.eq : null }).eq('id', mia.id);
  if (error) return { exito: false, error: 'No se pudo guardar.' };
  return { exito: true };
}

async function usarCreditos(params: Record<string, any>): Promise<Record<string, any>> {
  const nombre = params.nombre, cantidad = parseInt(params.cantidad, 10) || 0;
  if (cantidad <= 0) return { exito: true, usados: 0 };
  const { data: reagendables } = await supabase.from('reservas').select('id').eq('nombre_usuario', nombre).eq('estado', 'Reagendar').limit(cantidad);
  let usados = 0;
  for (const r of (reagendables ?? [])) {
    await supabase.from('reservas').update({ estado: 'Crédito usado' }).eq('id', r.id);
    usados++;
  }
  return { exito: true, usados };
}

// ─── Tesorería (HOJA_DE_RUTA etapa 5, Victor 2026-11-13) ───────────────────
// Cuentas con saldo inicial; cada ingreso o gasto dice de qué cuenta; nada se
// borra (corregir = anular y volver a registrar); conciliación; saldos de
// personas; fondos de viaje; transparencia opcional.
const CATEGORIAS_TESORERIA = ['cuota', 'clase', 'merch', 'evento', 'equipamiento', 'alquiler', 'viaje', 'prestamo', 'abono', 'donacion', 'coaches', 'comision', 'otro'];

function _num2(n: number): number { return Math.round(n * 100) / 100; }

/** Cuenta que corresponde a un medio de pago ('deuna' | 'transferencia' | 'efectivo'). */
async function _cuentaPorMedio(medio: string): Promise<string | null> {
  // El medio puede decir a qué cuenta entra; si no, se busca por tipo.
  const m = ((await _formasPago())?.medios ?? []).find((x: any) => x.id === medio);
  if (m?.cuentaId) {
    const { data: c } = await supabase.from('tesoreria_cuentas').select('id').eq('id', m.cuentaId).eq('activa', true).maybeSingle();
    if (c) return c.id;
  }
  const t = m?.tipo ?? medio;
  const tipo = t === 'deuna' || t === 'billetera' || t === 'enlace' ? 'deuna' : t === 'transferencia' || t === 'banco' ? 'banco' : t === 'efectivo' ? 'efectivo' : '';
  if (!tipo) return null;
  const { data } = await supabase.from('tesoreria_cuentas').select('id').eq('tipo', tipo).eq('activa', true).order('orden').limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _nombrePersona(username: string | null | undefined): Promise<string | null> {
  if (!username) return null;
  const { data } = await supabase.from('equipo').select('nombre_derby').eq('username', username).maybeSingle();
  return data?.nombre_derby || username;
}

/** Anular en Tesorería anula también lo que lo originó (auditoría de Finanzas,
 *  2026-11-26): antes la fila de `pagos`, la reserva o el saldo seguían vivos y
 *  "Cuotas del mes" daba por pagado algo que la caja ya no contaba. */
async function _anularOrigenMovimiento(m: any, por: string, motivo: string): Promise<void> {
  if (!m?.origen_id && m?.origen !== 'saldo') return;
  if (m.origen === 'pago') {
    const { data: p } = await supabase.from('pagos').update({ anulado: true, anulado_por: por, anulado_en: new Date().toISOString(), motivo_anulacion: motivo })
      .eq('id', m.origen_id).select('reserva_id, saldo_movimiento_id').maybeSingle();
    if (p?.reserva_id) await supabase.from('reservas').update({ estado: 'Cancelada', motivo_rechazo: 'Pago anulado en Tesorería' }).eq('id', p.reserva_id).eq('estado', 'Confirmada');
    if (p?.saldo_movimiento_id) await supabase.from('saldos_movimientos').update({ anulado: true, anulado_por: por }).eq('id', p.saldo_movimiento_id);
  } else if (m.origen === 'reserva') {
    const { data: r } = await supabase.from('reservas').update({ estado: 'Cancelada', motivo_rechazo: 'Pago anulado en Tesorería' })
      .eq('id', m.origen_id).eq('estado', 'Confirmada').select('saldo_movimiento_id').maybeSingle();
    if (r?.saldo_movimiento_id) await supabase.from('saldos_movimientos').update({ anulado: true, anulado_por: por }).eq('id', r.saldo_movimiento_id);
  } else if (m.origen === 'saldo') {
    await supabase.from('saldos_movimientos').update({ anulado: true, anulado_por: por }).eq('movimiento_id', m.id).eq('anulado', false);
  }
}

/** "Mensualidad abril", "Cuota 4/2026", "Mensualidad Octubre" → {mes, anio}. */
function _periodoDeMovimiento(m: Record<string, any>): { mes: number; anio: number } | null {
  if (m.periodo_mes && m.periodo_anio) return { mes: Number(m.periodo_mes), anio: Number(m.periodo_anio) };
  const t = String(m.descripcion ?? '').toLowerCase();
  const num = t.match(/cuota\s+(\d{1,2})\/(\d{4})/);
  if (num) return { mes: Number(num[1]), anio: Number(num[2]) };
  const i = _MESES_ES.findIndex((x) => t.includes(`mensualidad ${x}`));
  if (i >= 0) return { mes: i + 1, anio: Number(String(m.fecha ?? _hoyEcuadorISO()).slice(0, 4)) };
  return null;
}

/** Registra un movimiento (solo si hay cuentas creadas, para no ensuciar antes de empezar). */
// ─── Cierre anual (Victor, 2026-11-27) ──────────────────────────────────────
// Un año cerrado queda con candado: no se registran, anulan ni corrigen
// movimientos con fecha de ese año. Lo automático que llega tarde (un pago de
// diciembre aprobado en enero) entra el 1 de enero del primer año abierto.
async function _aniosCerrados(): Promise<Set<number>> {
  const { data, error } = await supabase.from('cierres_anuales').select('anio');
  if (error) { console.error('[cierre] lectura:', error.message); return new Set(); }
  return new Set((data ?? []).map((r: any) => Number(r.anio)));
}
async function _anioCerrado(fecha: unknown): Promise<boolean> {
  const a = Number(String(fecha ?? '').slice(0, 4));
  return !!a && (await _aniosCerrados()).has(a);
}

async function _registrarMovimiento(m: Record<string, any>): Promise<string | null> {
  const { count } = await supabase.from('tesoreria_cuentas').select('id', { count: 'exact', head: true });
  if (!count) return null;
  {
    const cerrados = await _aniosCerrados();
    let a = Number(String(m.fecha ?? '').slice(0, 4));
    if (a && cerrados.has(a)) {
      const original = a;
      while (cerrados.has(a)) a++;
      m.fecha = `${a}-01-01`;
      m.descripcion = `${m.descripcion ? m.descripcion + ' ' : ''}(del ${original}, ya cerrado)`.slice(0, 300);
    }
  }
  if (m.origen && m.origen_id) {
    const { data: ya } = await supabase.from('tesoreria_movimientos').select('id').eq('origen', m.origen).eq('origen_id', String(m.origen_id)).eq('anulado', false).maybeSingle();
    if (ya) return ya.id;
  }
  // Una sola cuota activa por persona y mes (auditoría 2026-11-26: Ale junio
  // y Darah abril quedaron dos veces). El periodo se guarda en columnas.
  if (m.categoria === 'cuota' && m.persona && m.tipo === 'ingreso' && !m.reemplaza_id) {
    const per = _periodoDeMovimiento(m);
    if (per) {
      m.periodo_mes = per.mes; m.periodo_anio = per.anio;
      const { data: ya } = await supabase.from('tesoreria_movimientos').select('id').eq('persona', m.persona).eq('categoria', 'cuota')
        .eq('periodo_mes', per.mes).eq('periodo_anio', per.anio).eq('anulado', false).limit(1).maybeSingle();
      if (ya) { console.warn('[tesoreria] cuota duplicada evitada', m.persona, per); return ya.id; }
    }
  }
  const fila = { ...m, persona_nombre: m.persona_nombre ?? await _nombrePersona(m.persona) };
  const { data, error } = await supabase.from('tesoreria_movimientos').insert(fila).select('id').single();
  if (error) { console.error('[tesoreria]', error.message); return null; }
  return data.id;
}

async function _saldosCuentas(hasta?: string): Promise<any[]> {
  const [{ data: cuentas }, movs, { data: conc }] = await Promise.all([
    supabase.from('tesoreria_cuentas').select('*').order('orden').order('created_at'),
    _paginado((a, b) => supabase.from('tesoreria_movimientos').select('tipo, monto, cuenta_id, cuenta_destino_id, fecha').eq('anulado', false).range(a, b)),
    supabase.from('tesoreria_conciliaciones').select('cuenta_id, fecha, saldo_real, diferencia, created_at').order('created_at', { ascending: false }).limit(200),
  ]);
  return (cuentas ?? []).map((c: any) => {
    let saldo = Number(c.saldo_inicial) || 0;
    for (const m of movs) {
      if (m.fecha < c.fecha_inicial || (hasta && m.fecha > hasta)) continue;
      const v = Number(m.monto) || 0;
      if (m.tipo === 'ingreso' && m.cuenta_id === c.id) saldo += v;
      if (m.tipo === 'egreso' && m.cuenta_id === c.id) saldo -= v;
      if (m.tipo === 'transferencia') { if (m.cuenta_id === c.id) saldo -= v; if (m.cuenta_destino_id === c.id) saldo += v; }
    }
    const ultima = (conc ?? []).find((x: any) => x.cuenta_id === c.id) ?? null;
    return {
      id: c.id, nombre: c.nombre, tipo: c.tipo, responsable: c.responsable ?? '', saldoInicial: Number(c.saldo_inicial) || 0,
            fechaInicial: c.fecha_inicial, activa: c.activa && !c.archivada, archivada: !!c.archivada, saldo: _num2(saldo),
      conciliacion: ultima ? { fecha: ultima.fecha, saldoReal: Number(ultima.saldo_real), diferencia: Number(ultima.diferencia) } : null,
    };
  });
}

function _filaMovimiento(m: any, cuentas: Record<string, string>): Record<string, any> {
  return {
    id: m.id, fecha: m.fecha, tipo: m.tipo, monto: Number(m.monto), cuenta: cuentas[m.cuenta_id] ?? '', cuentaId: m.cuenta_id,
    cuentaDestino: m.cuenta_destino_id ? (cuentas[m.cuenta_destino_id] ?? '') : null, categoria: m.categoria, descripcion: m.descripcion ?? '',
    persona: m.persona ?? null, personaNombre: m.persona_nombre ?? null, origen: m.origen, anulado: m.anulado, motivoAnulacion: m.motivo_anulacion ?? null,
    reemplazaId: m.reemplaza_id ?? null, creado: m.created_at,
  };
}

/** Saldo con el equipo menos lo ya apartado en reservas pendientes (para no usarlo dos veces). */
async function _saldoDisponible(username: string): Promise<number> {
  const saldo = (await _saldoPersonas(username))[username] ?? 0;
  const { data } = await supabase.from('reservas').select('saldo_aplicado').eq('nombre_usuario', username).eq('estado', 'Pendiente').not('saldo_aplicado', 'is', null);
  return _num2(saldo - (data ?? []).reduce((a: number, r: any) => a + (Number(r.saldo_aplicado) || 0), 0));
}

/** Saldo propio con el equipo (solo la persona; nada se guarda en el teléfono). */
// ─── Comprobantes de pago (Victor, 2026-11-14) ───────────────────────────────
// La reserva se guarda sin comprobante (cuando era obligatorio se perdían
// reservas). La persona lo sube en la app; se le recuerda a las 2 horas y al
// día siguiente; los Pivots pueden pedirlo con un toque. La imagen vive en un
// almacenamiento privado y se borra a los 30 días.
const COMPROBANTES_DESDE = '2026-11-14T18:00:00Z'; // no se recuerda a reservas de antes

/** La persona sube el comprobante de una reserva suya pendiente. */
async function subirComprobante(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const ids = String(params.ids ?? params.id ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12);
  if (!ids.length) return { exito: false, error: 'Falta la reserva.' };
  const parsed = await _base64ToBuffer(String(params.base64Data ?? '').trim());
  if (!parsed) return { exito: false, error: 'No pudimos leer la imagen. Prueba con otra captura.' };
  if (parsed.buffer.byteLength > 3 * 1024 * 1024) return { exito: false, error: 'La imagen es muy grande. Prueba con una captura de pantalla.' };
  const { data: mias } = await supabase.from('reservas').select('id, nombre_usuario, tipo, mes_texto').in('id', ids).eq('nombre_usuario', yo).eq('estado', 'Pendiente');
  if (!mias?.length) return { exito: false, error: 'Esa reserva ya no está pendiente.' };
  // Un mismo pago puede cubrir varias reservas: se guarda una vez y se liga a todas.
  const path = `reservas/${mias[0].id}-${Date.now()}.${parsed.mimeType.includes('png') ? 'png' : 'jpg'}`;
  const { error } = await supabase.storage.from('comprobantes').upload(path, parsed.buffer, { contentType: parsed.mimeType, upsert: true });
  if (error) { console.error('[subirComprobante]', error); return { exito: false, error: 'No se pudo subir. Intenta de nuevo.' }; }
  await supabase.from('reservas').update({ comprobante_path: path, comprobante_subido_en: new Date().toISOString() }).in('id', mias.map((r: any) => r.id));
  const quien = await _nombrePersona(yo);
  const pivots = await _adminDestinatariosPush(undefined, 'finanzas', 'pagos');
  await sendPush({ tipo: 'avisos_admin', include_external_user_ids: pivots, headings: { es: 'Comprobante recibido' },
    contents: { es: `${quien} subió el comprobante de ${mias[0].tipo === 'mensual' ? `su mensualidad ${mias[0].mes_texto ?? ''}`.trim() : 'su suscripción a la clase'}. Ya puedes revisarlo en Novedades.` }, url: APP_URL }).catch(() => {});
  return { exito: true, reservas: mias.length };
}

/** Un Pivot pide el comprobante con un toque (sin escribir por WhatsApp). */
async function adminPedirComprobante(params: Record<string, any>): Promise<Record<string, any>> {
  if (!(await _validarAdminToken(String(params.adminToken ?? '')))) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const { data: r } = await supabase.from('reservas').select('id, nombre_usuario, tipo, mes_texto, comprobante_avisos').eq('id', String(params.id ?? '')).eq('estado', 'Pendiente').maybeSingle();
  if (!r) return { exito: false, error: 'Esa reserva ya no está pendiente.' };
  // "Pedir comprobante (24 h)" (Victor, 2026-11-19): en vez de rechazar, queda
  // "Esperando comprobante" y se descarta sola si no llega a tiempo
  // (`_descartarSinComprobante`). Pedirlo otra vez no alarga el plazo.
  const limite = new Date(Date.now() + 24 * 3600e3).toISOString();
  const mensual = r.tipo === 'mensual';
  await sendPush({ tipo: 'comprobante_pendiente', include_external_user_ids: [r.nombre_usuario],
    headings: { es: mensual ? `Falta tu comprobante: suscripción a ${String(r.mes_texto ?? '').toLowerCase()}`.trim() : 'Falta tu comprobante' },
    contents: { es: `Adjunta tu comprobante en las próximas 24 h; si no, la solicitud se descarta y tendrás que volver a suscribirte.` }, url: APP_URL });
  await supabase.from('reservas').update({ comprobante_avisos: (Number(r.comprobante_avisos) || 0) + 1, comprobante_ultimo_aviso: new Date().toISOString() }).eq('id', r.id);
  const { data: conPlazo } = await supabase.from('reservas').update({ comprobante_limite: limite }).eq('id', r.id).is('comprobante_limite', null).select('comprobante_limite');
  const fin = conPlazo?.[0]?.comprobante_limite ?? (await supabase.from('reservas').select('comprobante_limite').eq('id', r.id).maybeSingle()).data?.comprobante_limite ?? limite;
  return { exito: true, comprobanteLimite: fin };
}

/** Solicitudes con plazo de comprobante vencido y sin comprobante: se descartan
 *  (quedan Canceladas con motivo) y se avisa a la persona. Corre cada hora y al
 *  abrir Notificaciones. */
const SIN_COMPROBANTE_A_TIEMPO = 'No llegó el comprobante a tiempo';
async function _descartarSinComprobante(ahora = Date.now()): Promise<void> {
  const { data } = await supabase.from('reservas').update({ estado: 'Cancelada', motivo_rechazo: SIN_COMPROBANTE_A_TIEMPO })
    .eq('estado', 'Pendiente').is('comprobante_subido_en', null).not('comprobante_limite', 'is', null).lt('comprobante_limite', new Date(ahora).toISOString())
    .select('id, nombre_usuario, tipo, mes_texto');
  for (const r of data ?? []) {
    const mensual = r.tipo === 'mensual';
    await sendPush({ tipo: 'solicitud_resuelta', include_external_user_ids: [r.nombre_usuario],
      headings: { es: mensual ? `Se descartó tu suscripción a ${String(r.mes_texto ?? '').toLowerCase()}`.trim() : 'Se descartó tu suscripción a la clase' },
      contents: { es: `Pasaron 24 h sin comprobante. Si todavía quieres, vuelve a suscribirte y adjunta tu comprobante de pago.` }, url: APP_URL }).catch(() => {});
  }
}

/** Cada hora: recuerda el comprobante a las 2 h y después cada 12 h (hasta 5 veces,
 *  Victor 2026-11-28: más insistente); borra imágenes de más de 30 días. */
async function _recordarComprobantes(ahora: number): Promise<void> {
  try { await _descartarSinComprobante(ahora); } catch (e) { console.error('[comprobantes] descartar:', e); }
  // Las que ya tienen plazo de 24 h (las pidió un Pivot) no reciben estos avisos.
  const { data } = await supabase.from('reservas').select('id, nombre_usuario, tipo, mes_texto, created_at, comprobante_avisos, comprobante_ultimo_aviso')
    .eq('estado', 'Pendiente').gt('monto', 0).is('comprobante_subido_en', null).is('comprobante_limite', null).gte('created_at', COMPROBANTES_DESDE).lt('comprobante_avisos', 5);
  // Una sola notificación por persona aunque tenga varias reservas.
  const porPersona: Record<string, any[]> = {};
  for (const r of data ?? []) {
    const n = Number(r.comprobante_avisos) || 0;
    const desde = n === 0 ? Date.parse(r.created_at) + 2 * 3600e3 : Date.parse(r.comprobante_ultimo_aviso ?? r.created_at) + 12 * 3600e3;
    if (ahora >= desde) (porPersona[r.nombre_usuario] ??= []).push(r);
  }
  for (const [u, rs] of Object.entries(porPersona)) {
    const una = rs.length === 1;
    await sendPush({ tipo: 'comprobante_pendiente', include_external_user_ids: [u], headings: { es: 'Falta tu comprobante' },
      contents: { es: una ? `Sube el comprobante de ${rs[0].tipo === 'mensual' ? `tu mensualidad ${rs[0].mes_texto ?? ''}`.trim() : 'tu suscripción a la clase'}. Si no lo adjuntas, tu pago no se aprobará.` : `Sube el comprobante de tus ${rs.length} suscripciones. Si no lo adjuntas, tus pagos no se aprobarán.` },
      url: APP_URL }).catch(() => {});
    for (const r of rs) await supabase.from('reservas').update({ comprobante_avisos: (Number(r.comprobante_avisos) || 0) + 1, comprobante_ultimo_aviso: new Date(ahora).toISOString() }).eq('id', r.id);
  }
  // Imágenes de más de 30 días: se borran (queda la fecha en que se subió).
  const { data: viejas } = await supabase.from('reservas').select('id, comprobante_path').not('comprobante_path', 'is', null)
    .lt('comprobante_subido_en', new Date(ahora - 30 * 24 * 3600e3).toISOString()).limit(200);
  if (viejas?.length) {
    await supabase.storage.from('comprobantes').remove([...new Set(viejas.map((r: any) => r.comprobante_path))]);
    await supabase.from('reservas').update({ comprobante_path: null }).in('id', viejas.map((r: any) => r.id));
  }
}

/**
 * La persona cancela una solicitud suya que sigue pendiente (Victor,
 * 2026-11-14). Nada se borra: queda como cancelada en su Bandeja y deja de
 * aparecerles a los Pivots. Para cambiar algo: cancelar y pedir de nuevo.
 */
async function cancelarMiSolicitud(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const tipo = String(params.tipo ?? ''), id = String(params.id ?? '');
  const CANCELADA = 'Cancelada por la persona';
  let r: any = null;
  if (tipo === 'reserva') {
    r = await supabase.from('reservas').update({ estado: 'Cancelada', motivo_rechazo: CANCELADA }).eq('id', id).eq('nombre_usuario', yo).eq('estado', 'Pendiente').select('id');
  } else if (tipo === 'rectificacion') {
    r = await supabase.from('rectificaciones_asistencia').update({ decision: 'Cancelada' }).eq('id', id).eq('nombre', yo).eq('decision', 'Pendiente').select('id');
  } else if (tipo === 'excepcion') {
    r = await supabase.from('solicitudes_excepcion').update({ estado: 'rechazada', nota_admin: CANCELADA }).eq('id', id).eq('nombre', yo).eq('estado', 'pendiente').select('id');
  } else if (tipo === 'prestamo') {
    r = await supabase.from('inventario_prestamos').update({ estado: 'cancelado' }).eq('id', id).eq('username', yo).eq('estado', 'pendiente').select('id');
  } else if (tipo === 'lesion') {
        r = await supabase.from('equipo').update({ solicitud_lesion_pendiente: false, solicitud_estado: null }).eq('username', yo)
      .or('solicitud_lesion_pendiente.eq.true,solicitud_estado.not.is.null').select('username');
  } else {
    return { exito: false, error: 'Esta solicitud no se puede cancelar.' };
  }
  if (r?.error) { console.error('[cancelarMiSolicitud]', r.error); return { exito: false, error: 'No se pudo cancelar.' }; }
  if (!r?.data?.length) return { exito: false, error: 'Ya no está pendiente: un Pivot la revisó.' };
  return { exito: true };
}

/**
 * Editar un pedido propio pendiente (Victor, 2026-11-14): en una reserva de
 * clase, cambiar a otra clase próxima; en una excepción o un préstamo,
 * cambiar el motivo. Lo demás se cancela y se pide de nuevo.
 * Reserva sin `idEvento`: devuelve las clases a las que se puede cambiar.
 */
async function editarMiSolicitud(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const tipo = String(params.tipo ?? ''), id = String(params.id ?? '');
  const YA = 'Ya no está pendiente: un Pivot la revisó.';
  if (tipo === 'reserva') {
    const { data: r } = await supabase.from('reservas').select('id, id_evento, tipo').eq('id', id).eq('nombre_usuario', yo).eq('estado', 'Pendiente').maybeSingle();
    if (!r) return { exito: false, error: YA };
    if (r.tipo !== 'clase') return { exito: false, error: 'La mensualidad no se cambia: cancélala y pide la del mes que quieras.' };
    const hoy = _hoyEcuadorISO();
    const hasta = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
    const [{ data: evs }, { data: mias }] = await Promise.all([
      supabase.from('asistencias').select('id_evento, fecha, inicia, donde, tipo_evento')
        .gte('fecha', hoy).lte('fecha', hasta).in('estado', ['Evento Programado', 'Próximo']).order('fecha').order('inicia').limit(60),
      supabase.from('reservas').select('id_evento').eq('nombre_usuario', yo).in('estado', ['Pendiente', 'Confirmada']).not('id_evento', 'is', null),
    ]);
    const tomadas = new Set((mias ?? []).map((x: any) => x.id_evento));
    const opciones = (evs ?? []).filter((e: any) => e.id_evento !== r.id_evento && !tomadas.has(e.id_evento));
    const nuevo = String(params.idEvento ?? '');
    if (!nuevo) return { exito: true, opciones: opciones.map((e: any) => ({ idEvento: e.id_evento, fecha: e.fecha, inicia: e.inicia, donde: e.donde, tipo: e.tipo_evento })) };
    if (!opciones.some((e: any) => e.id_evento === nuevo)) return { exito: false, error: 'Esa clase ya no está disponible.' };
    const u = await supabase.from('reservas').update({ id_evento: nuevo }).eq('id', id).eq('estado', 'Pendiente').select('id');
    if (u.error || !u.data?.length) return { exito: false, error: YA };
    return { exito: true };
  }
  const motivo = String(params.motivo ?? '').trim().slice(0, 500);
  if (!motivo) return { exito: false, error: 'Escribe el motivo.' };
  if (tipo === 'excepcion') {
    const { data: x } = await supabase.from('solicitudes_excepcion').select('id, tipo, datos').eq('id', id).eq('nombre', yo).eq('estado', 'pendiente').maybeSingle();
    if (!x) return { exito: false, error: YA };
    const datos = { ...(x.datos ?? {}) };
    if (x.tipo === 'ausencias') datos.motivo = motivo; else datos.situacionEconomica = motivo;
    const u = await supabase.from('solicitudes_excepcion').update({ datos }).eq('id', id).eq('estado', 'pendiente').select('id');
    if (u.error || !u.data?.length) return { exito: false, error: YA };
    return { exito: true };
  }
  if (tipo === 'prestamo') {
    const u = await supabase.from('inventario_prestamos').update({ motivo }).eq('id', id).eq('username', yo).eq('estado', 'pendiente').select('id');
    if (u.error || !u.data?.length) return { exito: false, error: YA };
    return { exito: true };
  }
  return { exito: false, error: 'Esta solicitud no se puede editar: cancélala y pídela de nuevo.' };
}

/**
 * Deuda por clases o cuotas que un Pivot pasó a deuda (`aplicar` 'con_cuota'),
 * menos lo ya pagado así; nunca más que la deuda total disponible (`disp` < 0).
 */
async function _deudaClases(username: string, disp?: number): Promise<number> {
  const d = disp ?? await _saldoDisponible(username);
  if (d >= 0) return 0;
  const { data } = await supabase.from('saldos_movimientos').select('monto').eq('username', username).eq('anulado', false).eq('aplicar', 'con_cuota');
  const pendiente = -(data ?? []).reduce((s: number, r: any) => s + (Number(r.monto) || 0), 0);
  return _num2(Math.max(0, Math.min(pendiente, -d)));
}

// ─── Reserva sin terminar (Victor, 2026-11-22) ───────────────────────────────
// La app avisa al llegar al paso de pago ('inicio') y al salir con volver o
// cerrar ('fin'). Guardar la reserva también lo borra. Si a los 30 minutos
// sigue, se le pregunta una sola vez si quiere terminarla.
async function reservaEnCurso(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  if (params.accion === 'ver') {
    const { data } = await supabase.from('reservas_en_curso').select('detalle, pantalla, pago_en, medio_nombre, creado_en').eq('nombre', yo).maybeSingle();
    return { exito: true, enCurso: data ?? null };
  }
  // Salió a pagar con un enlace y todavía no subió la foto (Victor, 2026-11-27).
  if (params.accion === 'pago') {
    await supabase.from('reservas_en_curso').update({ pago_en: new Date().toISOString(), medio_nombre: String(params.medioNombre ?? '').slice(0, 60) || null, avisado_en: null }).eq('nombre', yo);
    return { exito: true };
  }
  if (params.accion === 'inicio') {
    let clases: string[] = [];
    try { clases = JSON.parse(String(params.clases ?? '[]')).map(String).slice(0, 20); } catch { /* sin clases */ }
    await supabase.from('reservas_en_curso').upsert(
            {
        nombre: yo, detalle: String(params.detalle ?? '').slice(0, 200) || null, clases, creado_en: new Date().toISOString(), avisado_en: null, // pago_en y medio_nombre se conservan: si ya pagó, al volver solo falta la foto.
        pantalla: /^suscribirse:(clase|mes):[\w,-]{1,400}$/.test(String(params.pantalla ?? '')) ? String(params.pantalla) : null,
      },
      { onConflict: 'liga_id,nombre' },
    );
  } else {
    await supabase.from('reservas_en_curso').delete().eq('nombre', yo);
  }
  return { exito: true };
}

/** "Anotado/anotada/anotade/anotadx" según los pronombres de la persona. */
async function _anotadxDe(username: string): Promise<string> {
  const { data } = await supabase.from('equipo').select('pronombres').eq('username', username).maybeSingle();
  const t = String(data?.pronombres ?? '').toLowerCase();
  const ella = /\bella\b/.test(t), el = /(^|[^a-záéíóúñ])(él|el)([^a-záéíóúñ]|$)/.test(t), elle = /\belle\b/.test(t);
  if ([ella, el, elle].filter(Boolean).length !== 1) return 'anotadx';
  return ella ? 'anotada' : el ? 'anotado' : 'anotade';
}

// Suscripción a medias (Victor, 2026-11-27): aviso a los 15 minutos y otro
// unas horas antes de la primera clase elegida. Sin comprobante (transferencia
// o billetera) la suscripción no se crea, así que nadie queda "anotadx" sin saberlo.
async function _avisarReservasSinTerminar(): Promise<void> {
  const ahora = Date.now();
  const antes = new Date(ahora - 15 * 60 * 1000).toISOString();
  // Sin pago, se olvidan al día; si ya salió a pagar, a la semana.
  await supabase.from('reservas_en_curso').delete().is('pago_en', null).lt('creado_en', new Date(ahora - 86400000).toISOString());
  await supabase.from('reservas_en_curso').delete().lt('creado_en', new Date(ahora - 7 * 86400000).toISOString());
  const { data: filas } = await supabase.from('reservas_en_curso').select('*').lt('creado_en', antes);
  if (!filas?.length) return;
  const proximos = await _proximosEntrenamientos();
  const abiertas = new Set(proximos.map((e: any) => e.idEvento));
  for (const f of filas) {
    const { count } = await supabase.from('reservas').select('id', { count: 'exact', head: true }).eq('nombre_usuario', f.nombre).gte('created_at', f.creado_en);
    if (count) { await supabase.from('reservas_en_curso').delete().eq('id', f.id); continue; }
    const clases: string[] = Array.isArray(f.clases) ? f.clases : [];
    if (clases.length && !clases.some((c) => abiertas.has(c))) continue; // ya cerró la reserva de esas clases
    const anotadx = await _anotadxDe(f.nombre);
    const titulo = f.pago_en ? `Todavía no estás ${anotadx}: falta tu comprobante` : 'Tu suscripción aún no se completó';
    const texto = f.pago_en
      ? `Sube la foto del pago${f.detalle ? ` de ${f.detalle}` : ''} para terminar tu suscripción.`
      : (f.detalle ? `Si quieres suscribirte a ${f.detalle}, completa el registro.` : 'Si quieres suscribirte a una clase o mensualidad, completa el registro.');
    const avisar = async (campo: string) => {
      await supabase.from('reservas_en_curso').update({ [campo]: new Date().toISOString() }).eq('id', f.id);
      await sendPush({ tipo: 'reserva_sin_terminar', include_external_user_ids: [f.nombre], personal: true, headings: { es: titulo }, contents: { es: texto }, pantalla: f.pantalla ?? 'pagos' }).catch(() => {});
    };
    if (!f.avisado_en) { await avisar('avisado_en'); continue; }
    // Unas horas antes de la primera clase elegida (3 h).
    if (!f.aviso_previo_en && clases.length) {
      const inicio = proximos.filter((e: any) => clases.includes(e.idEvento))
        .map((e: any) => _instanteEventoUTC(e.fecha, e.horaInicio)).filter((t: any) => typeof t === "number" && !isNaN(t)).sort((a: number, b: number) => a - b)[0];
      if (inicio && inicio - ahora <= 3 * 3600e3 && inicio > ahora) await avisar('aviso_previo_en');
    }
  }
}

async function getMiSaldo(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const saldo = await _saldoDisponible(yo);
  return { exito: true, saldo, deudaClases: await _deudaClases(yo, saldo) };
}

/**
 * Pasar a deuda (Victor, 2026-11-14): alguien vino y su reserva nunca se
 * confirmó (sin comprobante o el pago no apareció). La reserva se cierra y
 * queda una deuda que se cobra junto con su próxima reserva pagada.
 */
async function adminDeudaReserva(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const { data: r } = await supabase.from('reservas').select('id, nombre_usuario, tipo, mes_texto, monto, id_evento').eq('id', String(params.id ?? '')).eq('estado', 'Pendiente').maybeSingle();
  if (!r) return { exito: false, error: 'Esa reserva ya no está pendiente.' };
  const monto = _num2(Number(r.monto) || 0);
  if (!(monto > 0)) return { exito: false, error: 'Esta reserva no tiene monto a pagar.' };
  let que = r.tipo === 'mensual' ? `Mensualidad ${r.mes_texto ?? ''}`.trim() : 'Clase';
  if (r.tipo !== 'mensual' && r.id_evento) {
    const { data: ev } = await supabase.from('asistencias').select('fecha').eq('id_evento', r.id_evento).maybeSingle();
    if (ev?.fecha) que = `Clase del ${String(ev.fecha).slice(8, 10)}/${String(ev.fecha).slice(5, 7)}`;
  }
    await _pasarADeuda(r, que, monto, email);
  return { exito: true };
}

async function _pasarADeuda(r: Record<string, any>, que: string, monto: number, por: string): Promise<void> {
  await supabase.from('reservas').update({ estado: 'Cancelada', motivo_rechazo: 'Pasó a deuda' }).eq('id', r.id);
  await supabase.from('saldos_movimientos').insert({
    username: r.nombre_usuario, persona_nombre: await _nombrePersona(r.nombre_usuario), fecha: _hoyEcuadorISO(),
    monto: -monto, tipo: 'cargo', aplicar: 'con_cuota', concepto: `${que} sin pagar`, por,
  });
  await sendPush({ tipo: 'solicitud_resuelta', include_external_user_ids: [r.nombre_usuario], headings: { es: 'Quedó una deuda' },
    contents: { es: `No pudimos confirmar el pago de tu ${que.toLowerCase()}. Quedó una deuda de $${monto.toFixed(2)} que pagarás junto con tu próxima suscripción.` }, url: APP_URL }).catch(() => {});
}

// Reservas de clase nunca aprobadas (Victor, 2026-11-14): 2 h después de que
// termina la clase se cierran solas. Si la persona vino (la lista la marca
// presente), queda la deuda de esa clase; si no, se cancela y se le avisa por
// qué. Si la lista se toma después, `_deudaSiVinoSinPago()` crea la deuda.
const SIN_APROBAR = 'No se aprobó antes de la clase';
const _fechaCorta = (f: string) => `${String(f).slice(8, 10)}/${String(f).slice(5, 7)}`;

async function _vinoAlEvento(nombre: string, idEvento: string): Promise<boolean> {
  const { data } = await supabase.from('log_asistencias').select('estado, origen, marca_temporal')
    .eq('id_evento', idEvento).eq('nombre_usuario', nombre).not('origen', 'in', '("Usuario","AsistenciaAnticipada")')
    .order('marca_temporal', { ascending: false }).limit(1);
  return ['A tiempo', 'Tarde'].includes(String(data?.[0]?.estado ?? ''));
}

async function _cerrarReservasVencidas(ahora: number): Promise<void> {
  const { data: rs } = await supabase.from('reservas').select('id, nombre_usuario, tipo, mes_texto, monto, id_evento')
    .eq('estado', 'Pendiente').eq('tipo', 'clase').not('id_evento', 'is', null).limit(500);
  if (!rs?.length) return;
    const ids = [...new Set(rs.map((r: any) => r.id_evento))];
  const horasCierre = Number((await _reglasLiga()).sinAprobarHoras) || 2;
  const { data: evs } = await supabase.from('asistencias').select('id_evento, fecha, inicia, termina').in('id_evento', ids);
  const ev: Record<string, any> = {};
  for (const e of evs ?? []) ev[e.id_evento] = e;
  for (const r of rs) {
    const e = ev[r.id_evento];
    if (!e?.fecha) continue;
    const fin = Date.parse(`${e.fecha}T${String(e.termina || e.inicia || '23:59:00').slice(0, 8)}-05:00`);
        if (!Number.isFinite(fin) || ahora < fin + horasCierre * 3600 * 1000) continue;
    const que = `Clase del ${_fechaCorta(e.fecha)}`;
    const monto = _num2(Number(r.monto) || 0);
    if (monto > 0 && await _vinoAlEvento(r.nombre_usuario, r.id_evento)) { await _pasarADeuda(r, que, monto, 'automático'); continue; }
    const u = await supabase.from('reservas').update({ estado: 'Cancelada', motivo_rechazo: SIN_APROBAR }).eq('id', r.id).eq('estado', 'Pendiente').select('id');
    if (!u.data?.length) continue;
    await sendPush({ tipo: 'solicitud_resuelta', include_external_user_ids: [r.nombre_usuario], headings: { es: 'Se canceló tu suscripción' },
      contents: { es: `Tu suscripción a la ${que.toLowerCase()} se canceló porque el pago no se aprobó antes de la clase. Si ya pagaste, escríbele a un Pivot.` }, url: APP_URL }).catch(() => {});
  }
}

/** Al marcar presente: si su reserva de esa clase se canceló por no aprobarse, queda la deuda.
 *  Sin ninguna reserva, también, si debía pagar esa clase (`_deudaVinoSinReserva`). */
async function _deudaSiVinoSinPago(nombre: string, idEvento: string): Promise<void> {
  const { data: r } = await supabase.from('reservas').select('id, nombre_usuario, tipo, mes_texto, monto, id_evento')
    .eq('nombre_usuario', nombre).eq('id_evento', idEvento).eq('estado', 'Cancelada').eq('motivo_rechazo', SIN_APROBAR).limit(1).maybeSingle();
  if (!r) { await _deudaVinoSinReserva(nombre, idEvento); return; }
  const monto = _num2(Number(r?.monto) || 0);
  if (!(monto > 0)) return;
  const { data: e } = await supabase.from('asistencias').select('fecha').eq('id_evento', idEvento).maybeSingle();
  await _pasarADeuda(r, e?.fecha ? `Clase del ${_fechaCorta(e.fecha)}` : 'Clase', monto, 'automático');
}




// Vino sin reserva (Victor, 2026-11-15): quien debía pagar esa clase y vino
// sin reservar queda debiendo el valor por clase. "Debía pagar" = su equipo
// no tiene clases de gracia (esos pagan por mes), no está exentx ni es
// Técnico, no tiene pagado el mes del evento y el evento es un
// Entrenamiento. Estar Lesionadx o De viaje no exime. Solo eventos desde el
// 2026-11-16: corregir listas viejas no crea deudas hacia atrás. Queda una
// reserva cancelada con `VINO_SIN_RESERVA` que guarda el cargo para poder
// anularlo si después se corrige la asistencia.
const VINO_SIN_RESERVA = 'Vino sin reserva';
const DEUDA_SIN_RESERVA_DESDE = '2026-11-16';
async function _deudaVinoSinReserva(nombre: string, idEvento: string): Promise<void> {
  const { data: ya } = await supabase.from('reservas').select('id').eq('nombre_usuario', nombre).eq('id_evento', idEvento).limit(1);
  if (ya?.length) return; // cualquier reserva (pagada, pendiente, con cupón o ya pasada a deuda)
  const { data: e } = await supabase.from('asistencias').select('fecha, tipo_evento').eq('id_evento', idEvento).maybeSingle();
  if (!e?.fecha || e.tipo_evento !== 'Entrenamiento' || String(e.fecha) < DEUDA_SIN_RESERVA_DESDE) return;
    const { data: p } = await supabase.from('equipo').select('categoria, exenta_cuota, estado_miembro').eq('username', nombre).maybeSingle();
  if (!p || p.exenta_cuota === true || p.estado_miembro === 'Técnico') return;
  const cobro = _cobroEquipo(await _reglasLiga(), p.categoria);
  if (cobro.modo === 'mes' || cobro.modo === 'sin_cobro') return; // paga por mes (clases de gracia) o no paga
  const mes = String(e.fecha).slice(0, 7);
  if ((await _estadosCuotaMes([nombre], mes))[nombre] !== 'debe') return;
  // Mes o periodo sin cobro (Victor, 2026-11-20): no se cobra o se cobra su %.
  const pct = _pctClaseEn(await _reglasLiga(), p.categoria, String(e.fecha));
  const monto = _num2((Number((await getPreciosClases({}, p.categoria)).precioPorClase) || 0) * pct / 100);
  if (!(monto > 0)) return;
  const que = `Clase del ${_fechaCorta(e.fecha)}`;
  const { data: mov } = await supabase.from('saldos_movimientos').insert({
    username: nombre, persona_nombre: await _nombrePersona(nombre), fecha: _hoyEcuadorISO(),
    monto: -monto, tipo: 'cargo', aplicar: 'con_cuota', concepto: `${que}: vino sin reserva`, por: 'automático',
  }).select('id').maybeSingle();
  await supabase.from('reservas').insert({
    nombre_usuario: nombre, id_evento: idEvento, tipo: 'clase', estado: 'Cancelada', motivo_rechazo: VINO_SIN_RESERVA,
    monto, fecha_pago: e.fecha, saldo_movimiento_id: mov?.id ?? null,
  });
  await sendPush({ tipo: 'solicitud_resuelta', include_external_user_ids: [nombre], headings: { es: 'Quedó una deuda' },
    contents: { es: `Viniste a la ${que.toLowerCase()} sin suscribirte, así que quedó una deuda de ${_monedaLiga}${monto}. Se cobra junto con tu próximo pago.` }, url: APP_URL }).catch(() => {});
}

/** Si se corrige la asistencia (ya no vino), se anula la deuda de "vino sin reserva". */
async function _anularDeudaSinReserva(nombre: string, idEvento: string, por: string): Promise<void> {
  const { data: r } = await supabase.from('reservas').select('id, saldo_movimiento_id').eq('nombre_usuario', nombre).eq('id_evento', idEvento)
    .eq('estado', 'Cancelada').eq('motivo_rechazo', VINO_SIN_RESERVA).limit(1).maybeSingle();
  if (!r) return;
  if (r.saldo_movimiento_id) await supabase.from('saldos_movimientos').update({ anulado: true, anulado_por: por }).eq('id', r.saldo_movimiento_id);
  await supabase.from('reservas').delete().eq('id', r.id);
}

async function _saldoPersonas(username?: string): Promise<Record<string, number>> {
  let q = supabase.from('saldos_movimientos').select('username, monto').eq('anulado', false);
  if (username) q = q.eq('username', username);
  const { data } = await q;
  const out: Record<string, number> = {};
  (data ?? []).forEach((r: any) => { out[r.username] = _num2((out[r.username] ?? 0) + (Number(r.monto) || 0)); });
  return out;
}

/** Registra los cobros programados que ya vencieron, uno por periodo, desde su
 *  fecha `desde` (también los meses pasados). No duplica: cada periodo tiene
 *  su origen_id `<cobro>:<aaaa-mm>`. Corre a diario y al guardar un cobro. */
async function _generarCobrosProgramados(por = 'automático'): Promise<{ generados: number }> {
  const { data: cobros } = await supabase.from('tesoreria_cobros_programados').select('*').eq('activo', true);
  const hoy = _hoyEcuadorISO();
  let generados = 0;
  for (const c of cobros ?? []) {
    const [y0, m0] = String(c.desde).slice(0, 7).split('-').map(Number);
    const paso = c.frecuencia === 'anual' ? 12 : 1;
    for (let i = 0; i < 600; i += paso) {
      const y = y0 + Math.floor((m0 - 1 + i) / 12), m = ((m0 - 1 + i) % 12) + 1;
      const fecha = `${y}-${String(m).padStart(2, '0')}-${String(c.dia).padStart(2, '0')}`;
      if (fecha > hoy) break;
      if (fecha < String(c.desde)) continue;
      const origenId = `${c.id}:${fecha.slice(0, 7)}`;
      const { data: ya } = await supabase.from('tesoreria_movimientos').select('id').eq('origen', 'cobro_programado').eq('origen_id', origenId).maybeSingle();
      if (ya) continue;
      const id = await _registrarMovimiento({
        fecha, tipo: 'egreso', monto: _num2(Number(c.monto)), cuenta_id: c.cuenta_id, categoria: 'comision',
        descripcion: `${c.nombre} (cobro programado)`, origen: 'cobro_programado', origen_id: origenId, registrado_por: por,
      });
      if (id) generados++;
    }
  }
  return { generados };
}

async function adminTesoreria(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const accion = String(params.accion ?? 'resumen');
  const leer = (v: unknown) => { if (v == null || v === '') return {}; if (typeof v === 'object') return v as Record<string, any>; try { return JSON.parse(String(v)); } catch { return {}; } };
  const d = leer(params.datos);
  const fechaOk = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null;
  const hoy = _hoyEcuadorISO();

  if (accion === 'resumen') {
    const cuentas = await _saldosCuentas();
    const nombres: Record<string, string> = {}; cuentas.forEach((c) => { nombres[c.id] = c.nombre; });
    const mes = hoy.slice(0, 7) + '-01';
    const [{ data: ult }, { data: delMes }, saldos, { data: transp }] = await Promise.all([
      supabase.from('tesoreria_movimientos').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(30),
      supabase.from('tesoreria_movimientos').select('tipo, monto').eq('anulado', false).gte('fecha', mes),
      _saldoPersonas(),
      supabase.from('config_app').select('value').eq('key', 'tesoreria_transparencia').maybeSingle(),
    ]);
    const suma = (t: string) => _num2((delMes ?? []).filter((m: any) => m.tipo === t).reduce((s: number, m: any) => s + Number(m.monto), 0));
    const deben = Object.values(saldos).filter((v) => v < 0);
    return {
      exito: true, cuentas, total: _num2(cuentas.filter((c) => c.activa).reduce((s, c) => s + c.saldo, 0)),
      mes: { ingresos: suma('ingreso'), egresos: suma('egreso') },
      movimientos: (ult ?? []).map((m: any) => _filaMovimiento(m, nombres)),
      saldos: { personasDeben: deben.length, totalDeben: _num2(-deben.reduce((s, v) => s + v, 0)), personasAFavor: Object.values(saldos).filter((v) => v > 0).length },
      transparencia: transp?.value === 'true', categorias: CATEGORIAS_TESORERIA,
    };
  }

  if (accion === 'movimientos' || accion === 'exportar') {
    const f = d;
    const cuentas = await _saldosCuentas();
    const nombres: Record<string, string> = {}; cuentas.forEach((c) => { nombres[c.id] = c.nombre; });
    const filas = await _paginado((a, b) => {
      let q = supabase.from('tesoreria_movimientos').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false });
      if (fechaOk(f.desde)) q = q.gte('fecha', f.desde);
      if (fechaOk(f.hasta)) q = q.lte('fecha', f.hasta);
      if (f.cuentaId) q = q.or(`cuenta_id.eq.${f.cuentaId},cuenta_destino_id.eq.${f.cuentaId}`);
      if (f.tipo) q = q.eq('tipo', String(f.tipo));
      if (f.categoria) q = q.eq('categoria', String(f.categoria));
      if (f.persona) q = q.eq('persona', String(f.persona));
      if (!f.incluirAnulados) q = q.eq('anulado', false);
      return q.range(a, b);
    });
    const lista = filas.map((m: any) => _filaMovimiento(m, nombres));
    const validos = lista.filter((m) => !m.anulado);
    const totales = {
      ingresos: _num2(validos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)),
      egresos: _num2(validos.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0)),
    };
    if (accion === 'exportar') {
      const esc = (v: unknown) => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const lineas = [['Fecha', 'Tipo', 'Monto', 'Cuenta', 'Cuenta destino', 'Categoría', 'Descripción', 'Persona', 'Anulado', 'Motivo anulación'].join(',')];
      for (const m of lista) lineas.push([m.fecha, m.tipo, m.monto.toFixed(2), m.cuenta, m.cuentaDestino ?? '', m.categoria, m.descripcion, m.personaNombre ?? '', m.anulado ? 'sí' : '', m.motivoAnulacion ?? ''].map(esc).join(','));
      // Filas para el .xlsx de la app (Victor, 2026-11-26).
      const filasX = lista.map((m) => [m.fecha, m.tipo, m.monto, m.cuenta, m.cuentaDestino ?? '', m.categoria, m.descripcion, m.personaNombre ?? '', m.anulado ? 'sí' : '', m.motivoAnulacion ?? '']);
      return { exito: true, csv: '﻿' + lineas.join('\n'), filas: filasX, totales, cantidad: lista.length };
    }
    return { exito: true, movimientos: lista, totales };
  }

  if (accion === 'guardarCuenta') {
    const fila: Record<string, any> = {
      nombre: String(d.nombre ?? '').trim().slice(0, 60),
      tipo: ['efectivo', 'deuna', 'banco', 'otro'].includes(String(d.tipo)) ? String(d.tipo) : 'otro',
      responsable: String(d.responsable ?? '').trim().slice(0, 60) || null,
      saldo_inicial: Number(d.saldoInicial) || 0,
      activa: d.activa !== false,
    };
    if (!fila.nombre) return { exito: false, error: 'Falta el nombre de la cuenta.' };
    let antes: any = null;
    if (d.id) ({ data: antes } = await supabase.from('tesoreria_cuentas').select('*').eq('id', d.id).maybeSingle());
    // Fecha inicial (auditoría 2026-11-26): editar una cuenta ya no la pasa a
    // hoy (así Banco Pichincha quedó en $0 y dejó fuera sus movimientos), y
    // una cuenta nueva sin saldo inicial cuenta todos sus movimientos.
    fila.fecha_inicial = fechaOk(d.fechaInicial) ?? antes?.fecha_inicial ?? (fila.saldo_inicial ? hoy : '2000-01-01');
    if (d.id) {
      const { error } = await supabase.from('tesoreria_cuentas').update(fila).eq('id', d.id);
      if (error) return { exito: false, error: error.message };
    } else {
      const { error } = await supabase.from('tesoreria_cuentas').insert(fila);
      if (error) return { exito: false, error: error.message };
    }
    await _registrarAjuste('cuenta', antes, fila, email);
    return adminTesoreria({ ...params, accion: 'resumen' });
  }

    if (accion === 'borrarCuenta') {
    // Una cuenta creada por error se borra; con movimientos se archiva para
    // no perder el historial (Victor, 2026-11-13).
    const { data: c } = await supabase.from('tesoreria_cuentas').select('*').eq('id', d.id).maybeSingle();
    if (!c) return { exito: false, error: 'No se encontró la cuenta.' };
    const [{ count: movs }, { count: conc }] = await Promise.all([
      supabase.from('tesoreria_movimientos').select('id', { count: 'exact', head: true }).or(`cuenta_id.eq.${c.id},cuenta_destino_id.eq.${c.id}`),
      supabase.from('tesoreria_conciliaciones').select('id', { count: 'exact', head: true }).eq('cuenta_id', c.id),
    ]);
    if ((movs ?? 0) + (conc ?? 0) > 0) {
      await supabase.from('tesoreria_cuentas').update({ archivada: true, activa: false }).eq('id', c.id);
      await _registrarAjuste('cuenta', c, { ...c, archivada: true }, email);
      return { exito: true, archivada: true };
    }
    await supabase.from('tesoreria_cuentas').delete().eq('id', c.id);
    await _registrarAjuste('cuenta', c, null, email);
    return { exito: true, borrada: true };
  }

  if (accion === 'restaurarCuenta') {
    await supabase.from('tesoreria_cuentas').update({ archivada: false, activa: true }).eq('id', d.id);
    return { exito: true };
  }

  if (accion === 'registrar') {
    if (await _anioCerrado(fechaOk(d.fecha) ?? hoy)) return { exito: false, error: `Las cuentas de ${String(d.fecha).slice(0, 4)} ya están cerradas. Usa una fecha de este año.` };
    const tipo = ['ingreso', 'egreso', 'transferencia'].includes(String(d.tipo)) ? String(d.tipo) : '';
    const monto = _num2(Number(d.monto));
    if (!tipo) return { exito: false, error: 'Tipo inválido.' };
    if (!(monto > 0)) return { exito: false, error: 'El monto debe ser mayor a 0.' };
    if (!d.cuentaId) return { exito: false, error: 'Elige la cuenta.' };
    if (tipo === 'transferencia' && (!d.cuentaDestinoId || d.cuentaDestinoId === d.cuentaId)) return { exito: false, error: 'Elige otra cuenta de destino.' };
    const id = await _registrarMovimiento({
      fecha: fechaOk(d.fecha) ?? hoy, tipo, monto, cuenta_id: d.cuentaId, cuenta_destino_id: tipo === 'transferencia' ? d.cuentaDestinoId : null,
      categoria: CATEGORIAS_TESORERIA.includes(String(d.categoria)) ? String(d.categoria) : (tipo === 'transferencia' ? 'otro' : 'otro'),
      descripcion: String(d.descripcion ?? '').trim().slice(0, 300) || null, persona: d.persona || null,
      origen: 'manual', registrado_por: email, reemplaza_id: d.reemplazaId || null, comprobante_url: d.comprobanteUrl || null,
    });
    if (!id) return { exito: false, error: 'Primero crea al menos una cuenta.' };
    return { exito: true, id };
  }

  // Cobros programados del banco (Victor, 2026-11-26).
  if (accion === 'cobros') {
    const { data } = await supabase.from('tesoreria_cobros_programados').select('*').eq('activo', true).order('created_at');
    return { exito: true, cobros: data ?? [] };
  }
  if (accion === 'guardarCobro') {
    const monto = _num2(Number(d.monto));
    const fila = {
      cuenta_id: String(d.cuentaId ?? ''), nombre: String(d.nombre ?? '').trim().slice(0, 80), monto,
      frecuencia: d.frecuencia === 'anual' ? 'anual' : 'mensual', dia: Math.min(28, Math.max(1, Math.round(Number(d.dia) || 1))),
      desde: fechaOk(d.desde) ?? hoy, creado_por: email,
    };
    if (!fila.cuenta_id) return { exito: false, error: 'Elige la cuenta.' };
    if (!fila.nombre) return { exito: false, error: 'Ponle un nombre al cobro.' };
    if (!(monto > 0)) return { exito: false, error: 'El monto debe ser mayor a 0.' };
    const q = d.id ? supabase.from('tesoreria_cobros_programados').update(fila).eq('id', d.id) : supabase.from('tesoreria_cobros_programados').insert(fila);
    const { error } = await q;
    if (error) return { exito: false, error: error.message };
    const r = await _generarCobrosProgramados(email);
    return { exito: true, generados: r.generados };
  }
  if (accion === 'quitarCobro') {
    // Deja de cobrarse desde hoy; lo ya registrado queda.
    await supabase.from('tesoreria_cobros_programados').update({ activo: false }).eq('id', String(d.id ?? ''));
    return { exito: true };
  }

  // Revisión de Tesorería (auditoría 2026-11-26): lo que no cuadra, para
  // corregirlo antes de que se acumule. Solo lee; no cambia nada.
  if (accion === 'salud') {
    const [cuentas, movs, { data: pags }, { data: res }] = await Promise.all([
      _saldosCuentas(),
      _paginado((a, b) => supabase.from('tesoreria_movimientos').select('id, fecha, tipo, monto, cuenta_id, cuenta_destino_id, categoria, descripcion, persona, persona_nombre, origen, origen_id, anulado, reemplaza_id, periodo_mes, periodo_anio').range(a, b)),
      supabase.from('pagos').select('id, nombre_usuario, mes, anio, monto, exoneradx, tipo, id_evento, fecha, reserva_id, anulado'),
      supabase.from('reservas').select('id, nombre_usuario, tipo, mes_texto, id_evento, estado, monto, fecha_pago, uso_cupon, validez_hasta'),
    ]);
    const activos = movs.filter((m: any) => !m.anulado);
    const porOrigen = new Set(activos.filter((m: any) => m.origen_id).map((m: any) => `${m.origen}:${m.origen_id}`));
    const cuotaDe = new Set(activos.filter((m: any) => m.categoria === 'cuota' && m.periodo_mes).map((m: any) => `${m.persona}:${m.periodo_anio}-${m.periodo_mes}`));
    const pagosVivos = (pags ?? []).filter((p: any) => !p.anulado);
    const reservaDePago = new Set(pagosVivos.filter((p: any) => p.reserva_id).map((p: any) => p.reserva_id));
    const clasePagada = new Set(pagosVivos.filter((p: any) => p.tipo === 'clase').map((p: any) => `${p.nombre_usuario}:${p.id_evento}`));
    const nombres: Record<string, string> = {}; cuentas.forEach((c) => { nombres[c.id] = c.nombre; });
    const sinMovReserva = (res ?? []).filter((r: any) => r.estado === 'Confirmada' && Number(r.monto) > 0 && !r.uso_cupon && !porOrigen.has(`reserva:${r.id}`)
      && !reservaDePago.has(r.id) && !clasePagada.has(`${r.nombre_usuario}:${r.id_evento}`)
      && !(r.tipo === 'mensual' && cuotaDe.has(`${r.nombre_usuario}:${_mesDeReserva(r).slice(0, 4)}-${Number(_mesDeReserva(r).slice(5, 7))}`)))
      .map((r: any) => ({ id: r.id, persona: r.nombre_usuario, tipo: r.tipo, que: r.tipo === 'mensual' ? `Mensualidad ${r.mes_texto ?? ''}`.trim() : 'Clase', fecha: r.fecha_pago, monto: Number(r.monto) }));
    const sinMovPago = pagosVivos.filter((p: any) => Number(p.monto) > 0 && !p.exoneradx && !porOrigen.has(`pago:${p.id}`) && !(p.tipo !== 'clase' && cuotaDe.has(`${p.nombre_usuario}:${p.anio}-${p.mes}`)))
      .map((p: any) => ({ id: p.id, persona: p.nombre_usuario, que: p.tipo === 'clase' ? 'Clase' : `Cuota ${p.mes}/${p.anio}`, fecha: p.fecha, monto: Number(p.monto) }));
    const reemplazados = new Set(activos.filter((m: any) => m.reemplaza_id).map((m: any) => m.reemplaza_id));
    const pagoVivo = new Set(pagosVivos.map((p: any) => p.id));
    const reservaViva = new Set((res ?? []).filter((r: any) => r.estado === 'Confirmada').map((r: any) => r.id));
    const anuladosConOrigen = movs.filter((m: any) => m.anulado && m.origen_id && !reemplazados.has(m.id) && !porOrigen.has(`${m.origen}:${m.origen_id}`)
      && ((m.origen === 'pago' && pagoVivo.has(m.origen_id)) || (m.origen === 'reserva' && reservaViva.has(m.origen_id))))
      .map((m: any) => _filaMovimiento(m, nombres));
    const grupos: Record<string, any[]> = {};
    for (const m of activos) if (m.categoria === 'cuota' && m.persona && m.periodo_mes) (grupos[`${m.persona}:${m.periodo_anio}-${m.periodo_mes}`] ??= []).push(m);
    const duplicados = Object.values(grupos).filter((g) => g.length > 1).map((g) => ({ persona: g[0].persona_nombre || g[0].persona, mes: g[0].periodo_mes, anio: g[0].periodo_anio, movimientos: g.map((m: any) => _filaMovimiento(m, nombres)) }));
    const cuentasFuera = cuentas.map((c) => ({ c, n: activos.filter((m: any) => (m.cuenta_id === c.id || m.cuenta_destino_id === c.id) && m.fecha < c.fechaInicial) }))
      .filter((x) => x.n.length).map((x) => ({ cuenta: x.c.nombre, fechaInicial: x.c.fechaInicial, movimientos: x.n.length, monto: _num2(x.n.reduce((t: number, m: any) => t + Number(m.monto), 0)) }));
    // Deudores del mes con "Asistiré" a futuro.
    const mes = hoy.slice(0, 7);
    const { data: gente } = await supabase.from('equipo').select('username, nombre_derby, categoria, exenta_cuota, roles').is('eliminado_en', null);
    const pagan = (gente ?? []).filter((p: any) => p.exenta_cuota !== true);
    const debeMes = await _debeCuotaMes(pagan, mes);
    const estados = await _estadosCuotaMes(Object.keys(debeMes), mes);
    const deudores = Object.keys(debeMes).filter((u) => debeMes[u].debe && estados[u] === 'debe');
    let conAsistire: any[] = [];
    if (deudores.length) {
      const { data: logs } = await supabase.from('log_asistencias').select('nombre_usuario, id_evento, estado, origen, marca_temporal, fecha_entrenamiento')
        .in('nombre_usuario', deudores).gte('fecha_entrenamiento', hoy).in('origen', ['Usuario', 'AsistenciaAnticipada']).order('marca_temporal', { ascending: false });
      const ultimo: Record<string, any> = {};
      for (const l of logs ?? []) ultimo[`${l.nombre_usuario}:${l.id_evento}`] ??= l;
      const cuenta: Record<string, { total: number; anticipada: number }> = {};
      for (const l of Object.values(ultimo)) if (l.estado === 'Asistiré') { const c = cuenta[l.nombre_usuario] ??= { total: 0, anticipada: 0 }; c.total++; if (l.origen === 'AsistenciaAnticipada') c.anticipada++; }
      conAsistire = Object.entries(cuenta).map(([u, c]) => ({ persona: u, nombre: (gente ?? []).find((g: any) => g.username === u)?.nombre_derby || u, asistire: c.total, anticipada: c.anticipada, debe: debeMes[u].monto }));
    }
    const total = sinMovReserva.length + sinMovPago.length + anuladosConOrigen.length + duplicados.length + cuentasFuera.length + conAsistire.length;
    return {
      exito: true, total, sinMovimientoReservas: sinMovReserva, sinMovimientoPagos: sinMovPago, anuladosConOrigenVivo: anuladosConOrigen,
      duplicados, cuentasConMovimientosAntes: cuentasFuera, deudoresConAsistire: conAsistire,
    };
  }

  if (accion === 'anular' || accion === 'corregir') {
    const { data: m } = await supabase.from('tesoreria_movimientos').select('*').eq('id', d.id).maybeSingle();
    if (!m) return { exito: false, error: 'No se encontró el movimiento.' };
    if (m.anulado) return { exito: false, error: 'Ya estaba anulado.' };
    if (await _anioCerrado(m.fecha)) return { exito: false, error: `Las cuentas de ${String(m.fecha).slice(0, 4)} ya están cerradas: este movimiento no se puede cambiar.` };
    const motivo = String(d.motivo ?? '').trim().slice(0, 200) || (accion === 'corregir' ? 'Corrección' : 'Anulado');
    await supabase.from('tesoreria_movimientos').update({ anulado: true, anulado_por: email, anulado_en: new Date().toISOString(), motivo_anulacion: motivo }).eq('id', m.id);
    // Corregir crea el reemplazo enseguida, así que el origen sigue vivo; anular lo cancela.
    if (accion === 'anular') await _anularOrigenMovimiento(m, email, motivo);
    if (accion === 'corregir') {
      const n = leer(d.nuevo);
      return adminTesoreria({ ...params, accion: 'registrar', datos: { ...n, reemplazaId: m.id } });
    }
    return { exito: true };
  }

  if (accion === 'conciliar') {
    const cuentas = await _saldosCuentas();
    const c = cuentas.find((x) => x.id === d.cuentaId);
    if (!c) return { exito: false, error: 'Cuenta inválida.' };
    const real = _num2(Number(d.saldoReal));
    if (!Number.isFinite(real)) return { exito: false, error: 'Saldo inválido.' };
    const diferencia = _num2(real - c.saldo);
    await supabase.from('tesoreria_conciliaciones').insert({ cuenta_id: c.id, fecha: hoy, saldo_real: real, saldo_app: c.saldo, diferencia, nota: String(d.nota ?? '').slice(0, 200) || null, por: email });
    return { exito: true, saldoApp: c.saldo, saldoReal: real, diferencia };
  }

  if (accion === 'saldos') {
    const saldos = await _saldoPersonas();
    const usuarios = Object.keys(saldos).filter((u) => saldos[u] !== 0);
    const { data: gente } = usuarios.length ? await supabase.from('equipo').select('username, nombre_derby, foto_perfil').in('username', usuarios) : { data: [] as any[] };
    const pe: Record<string, any> = {}; (gente ?? []).forEach((p: any) => { pe[p.username] = p; });
    const { data: nombresHist } = usuarios.length ? await supabase.from('saldos_movimientos').select('username, persona_nombre').in('username', usuarios) : { data: [] as any[] };
    const hist: Record<string, string> = {}; (nombresHist ?? []).forEach((r: any) => { if (r.persona_nombre) hist[r.username] = r.persona_nombre; });
    return {
      exito: true,
      personas: usuarios.map((u) => ({ username: u, nombre: pe[u]?.nombre_derby || hist[u] || u, foto: pe[u]?.foto_perfil || '', saldo: saldos[u], sinCuenta: !pe[u] }))
        .sort((a, b) => a.saldo - b.saldo),
    };
  }

    // Desglose de cuotas de un mes (Victor, 2026-11-14): quién pagó qué mes,
  // cuánto, cuándo y con qué medio; quién está en revisión y quién debe.
  if (accion === 'cuotasMes') {
    const mes = /^\d{4}-\d{2}$/.test(String(d.mes ?? '')) ? String(d.mes) : _hoyEcuadorISO().slice(0, 7);
    const [y, m] = mes.split('-').map(Number);
    const desde = `${mes}-01`, hasta = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const [{ data: gente }, { data: res }, { data: pag }, { data: exc }] = await Promise.all([
      supabase.from('equipo').select('username, nombre_derby, foto_perfil, categoria, paga_cuota, exenta_cuota, estado_miembro').is('eliminado_en', null),
      supabase.from('reservas').select('nombre_usuario, estado, monto, fecha_pago, medio_nombre, medio_pago').eq('tipo', 'mensual').in('estado', ['Confirmada', 'Pendiente']).gte('validez_hasta', desde).lt('validez_hasta', hasta),
      supabase.from('pagos').select('nombre_usuario, monto, fecha, forma_pago, exoneradx').eq('mes', m).eq('anio', y).eq('anulado', false),
      supabase.from('cuota_excepcion').select('id_miembro, tipo, notas').eq('mes', mes),
    ]);
    const filas: Record<string, any> = {};
    const base = (u: string) => {
      const p = (gente ?? []).find((g: any) => g.username === u);
      return filas[u] ??= { username: u, nombre: p?.nombre_derby || u, foto: p?.foto_perfil ?? '', equipo: p?.categoria ?? '', estado: 'debe', pagos: [] };
    };
    // Quién debe (Victor, 2026-11-19, desde noviembre 2026 y hacia atrás hasta
    // ese mes porque la regla vieja era un bug): ver `_debeCuotaMes`.
    const debe = mes >= CUOTA_POR_ASISTENCIA_DESDE ? await _debeCuotaMes(gente ?? [], mes) : null;
    for (const p of gente ?? []) {
      const paga = /^s[ií]$/i.test(String(p.paga_cuota ?? '').trim());
      if (!paga || p.estado_miembro !== 'Activx') continue;
      if (p.exenta_cuota) { base(p.username).estado = 'exenta'; continue; }
      if (!debe) { base(p.username).estado = 'debe'; continue; }
      const x = debe[p.username];
      if (!x) continue; // mes futuro o su equipo no paga por mes
      Object.assign(base(p.username), { estado: x.sinCobro ? 'sin_cobro' : x.debe ? 'debe' : 'no_vino', monto: x.monto, motivo: x.motivo });
    }
    for (const r of res ?? []) {
      const f = base(r.nombre_usuario);
      f.pagos.push({ fecha: r.fecha_pago, monto: Number(r.monto) || 0, medio: r.medio_nombre || r.medio_pago || '', origen: 'app', enRevision: r.estado === 'Pendiente' });
      if (r.estado === 'Confirmada') f.estado = 'pagado'; else if (f.estado !== 'pagado') f.estado = 'en_revision';
    }
    for (const r of pag ?? []) {
      if (!(Number(r.monto) > 0) && !r.exoneradx) continue;
      const f = base(r.nombre_usuario);
      f.pagos.push({ fecha: r.fecha, monto: Number(r.monto) || 0, medio: r.exoneradx ? 'Exoneradx' : (r.forma_pago || ''), origen: 'manual', enRevision: false });
      f.estado = 'pagado';
    }
    for (const r of exc ?? []) { const f = base(r.id_miembro); if (f.estado !== 'pagado') f.estado = 'exenta'; }
    const lista = Object.values(filas).sort((a: any, b: any) => String(a.nombre).localeCompare(String(b.nombre)));
    const total = lista.reduce((s: number, f: any) => s + f.pagos.filter((x: any) => !x.enRevision).reduce((t: number, x: any) => t + x.monto, 0), 0);
    const totalDeben = lista.reduce((s: number, f: any) => s + (f.estado === 'debe' ? Number(f.monto) || 0 : 0), 0);
    return { exito: true, mes, total: _num2(total), totalDeben: _num2(totalDeben), reglaAsistencia: !!debe, personas: lista };
  }

  if (accion === 'saldoPersona') {
    const u = String(d.username ?? '');
    const { data } = await supabase.from('saldos_movimientos').select('*').eq('username', u).order('fecha', { ascending: false }).order('created_at', { ascending: false });
    return { exito: true, saldo: (await _saldoPersonas(u))[u] ?? 0, movimientos: data ?? [] };
  }

  if (accion === 'registrarSaldo') {
    // tipo: 'a_favor' (pagó de más / el equipo le debe), 'cargo' (debe), 'prestamo'
    // (el equipo le prestó: sale de una cuenta), 'abono' (paga lo que debe: entra a una cuenta).
    const u = String(d.username ?? '').trim();
        // 'devolucion' (Victor, 2026-11-21): se le devuelve su saldo a favor; sale de una cuenta y pide motivo.
    const tipo = ['cargo', 'abono', 'prestamo', 'a_favor', 'devolucion'].includes(String(d.tipo)) ? String(d.tipo) : '';
    const monto = _num2(Math.abs(Number(d.monto)));
    if (!u || !tipo) return { exito: false, error: 'Faltan datos.' };
    if (!(monto > 0)) return { exito: false, error: 'El monto debe ser mayor a 0.' };
    const concepto = String(d.concepto ?? '').trim().slice(0, 200);
    if (!concepto) return { exito: false, error: 'Escribe el concepto.' };
        const signo = tipo === 'a_favor' || tipo === 'abono' ? 1 : -1;
    if (tipo === 'devolucion') {
      const disp = await _saldoDisponible(u);
      if (monto > disp) return { exito: false, error: `Solo tiene ${_monedaLiga}${_num2(Math.max(0, disp))} a favor.` };
    }
    let movimientoId: string | null = null;
    if ((tipo === 'prestamo' || tipo === 'abono' || tipo === 'a_favor' || tipo === 'devolucion') && d.cuentaId) {
      const sale = tipo === 'prestamo' || tipo === 'devolucion';
      movimientoId = await _registrarMovimiento({
        fecha: fechaOk(d.fecha) ?? hoy, tipo: sale ? 'egreso' : 'ingreso', monto, cuenta_id: d.cuentaId,
        // Pago a un coach de lo que el equipo le debe (Victor, 2026-11-26): categoría propia.
        categoria: tipo === 'prestamo' ? 'prestamo' : tipo === 'devolucion' ? (d.pagoCoach ? 'coaches' : 'otro') : 'abono',
        descripcion: tipo === 'devolucion' ? (d.pagoCoach ? `Pago a entrenadorx: ${concepto}` : `Devolución de saldo: ${concepto}`) : concepto, persona: u, origen: 'saldo', registrado_por: email,
      });
    }
    const { error } = await supabase.from('saldos_movimientos').insert({
      username: u, persona_nombre: await _nombrePersona(u), fecha: fechaOk(d.fecha) ?? hoy, monto: signo * monto, concepto, tipo,
      aplicar: ['aparte', 'con_cuota', 'cuotas'].includes(String(d.aplicar)) ? String(d.aplicar) : 'aparte',
      monto_por_cuota: d.aplicar === 'cuotas' ? (_num2(Number(d.montoPorCuota)) || null) : null, movimiento_id: movimientoId, por: email,
    });
    if (error) return { exito: false, error: error.message };
    return { exito: true, saldo: (await _saldoPersonas(u))[u] ?? 0 };
  }

  if (accion === 'anularSaldo') {
    const { data: s } = await supabase.from('saldos_movimientos').select('*').eq('id', d.id).maybeSingle();
    if (!s || s.anulado) return { exito: false, error: 'No se encontró.' };
    await supabase.from('saldos_movimientos').update({ anulado: true, anulado_por: email }).eq('id', s.id);
    if (s.movimiento_id) await supabase.from('tesoreria_movimientos').update({ anulado: true, anulado_por: email, anulado_en: new Date().toISOString(), motivo_anulacion: 'Saldo anulado' }).eq('id', s.movimiento_id);
    return { exito: true };
  }

  // Cierre anual: revisión, equipo técnico, saldos, resumen y candado.
  if (accion === 'cierre' || accion === 'cerrarAnio') {
    const anio = Number(d.anio) || Number(hoy.slice(0, 4)) - 1;
    if (anio >= Number(hoy.slice(0, 4))) return { exito: false, error: 'Solo se cierra un año que ya terminó.' };
    const fin = `${anio}-12-31`, ini = `${anio}-01-01`;
    const { data: ya } = await supabase.from('cierres_anuales').select('*').eq('anio', anio).maybeSingle();
    if (ya) return { exito: true, anio, cerrado: { en: ya.cerrado_en, por: ya.cerrado_por }, resumen: ya.resumen };
    const [cuentasFin, cuentasHoy, movs, saldos, coaches] = await Promise.all([
      _saldosCuentas(fin), _saldosCuentas(),
      _paginado((a, b) => supabase.from('tesoreria_movimientos').select('fecha, tipo, monto, categoria').eq('anulado', false).in('tipo', ['ingreso', 'egreso']).gte('fecha', ini).lte('fecha', fin).range(a, b)),
      adminTesoreria({ ...params, accion: 'saldos' }),
      adminPagoCoaches({ adminToken: params.adminToken, anio }),
    ]);
    const meses: Record<string, { ingresos: number; egresos: number }> = {};
    const porCat: Record<string, { ingresos: number; egresos: number }> = {};
    let ingresos = 0, egresos = 0;
    for (const m of movs) {
      const v = Number(m.monto) || 0, k = String(m.fecha).slice(0, 7), c = String(m.categoria || 'otro');
      const x = meses[k] ??= { ingresos: 0, egresos: 0 }, y = porCat[c] ??= { ingresos: 0, egresos: 0 };
      if (m.tipo === 'ingreso') { ingresos += v; x.ingresos = _num2(x.ingresos + v); y.ingresos = _num2(y.ingresos + v); }
      else { egresos += v; x.egresos = _num2(x.egresos + v); y.egresos = _num2(y.egresos + v); }
    }
    const conciliadaHoy: Record<string, any> = {}; cuentasHoy.forEach((c) => { conciliadaHoy[c.id] = c.conciliacion; });
    const cuentas = cuentasFin.filter((c) => c.activa || c.saldo !== 0).map((c) => ({
      id: c.id, nombre: c.nombre, saldo: c.saldo, conciliada: !!conciliadaHoy[c.id] && String(conciliadaHoy[c.id].fecha) >= `${anio}-12-01`,
    }));
    const personas = (saldos.personas ?? []) as any[];
    const tecnico = ((coaches.deuda ?? []) as any[]).filter((x) => x.seLeDebe > 0);
    const resumen = {
      anio, ingresos: _num2(ingresos), egresos: _num2(egresos), resultado: _num2(ingresos - egresos),
      saldoFinal: _num2(cuentas.reduce((t, c) => t + c.saldo, 0)), cuentas, meses, categorias: porCat,
      deben: personas.filter((p) => p.saldo < 0).map((p) => ({ nombre: p.nombre, saldo: p.saldo })),
      aFavor: personas.filter((p) => p.saldo > 0).map((p) => ({ nombre: p.nombre, saldo: p.saldo })),
      tecnico: tecnico.map((x) => ({ nombre: x.nombre, monto: x.seLeDebe })),
    };
    if (accion === 'cierre') return { exito: true, anio, cerrado: null, disponible: hoy.slice(5, 7) === '01', resumen };
    if (!(await _areasDe(email)).includes('finanzas')) return { exito: false, error: 'Solo un Pivot de Finanzas puede cerrar las cuentas.' };
    const { error } = await supabase.from('cierres_anuales').insert({ anio, cerrado_por: email, resumen });
    if (error) return { exito: false, error: error.code === '23505' ? `Las cuentas de ${anio} ya estaban cerradas.` : 'No se pudo cerrar. Intenta de nuevo.' };
    await _registrarAjuste('cierre_anual', null, anio, email);
    return { exito: true, anio, cerrado: { en: new Date().toISOString(), por: email }, resumen };
  }

  if (accion === 'transparencia') {
    const v = d.activa === true || d.activa === 'true';
    await supabase.from('config_app').upsert({ key: 'tesoreria_transparencia', value: v ? 'true' : 'false' }, { onConflict: 'liga_id,key' });
    await _registrarAjuste('transparencia', !v, v, email);
    return { exito: true, transparencia: v };
  }

  if (accion === 'fondos') {
    const { data } = await supabase.from('fondos_viaje').select('*').order('created_at', { ascending: false });
    return { exito: true, fondos: data ?? [] };
  }

  if (accion === 'guardarFondo' || accion === 'previsualizarFondo') {
    const desde = fechaOk(d.ventanaDesde), hasta = fechaOk(d.ventanaHasta) ?? hoy;
    if (!desde) return { exito: false, error: 'Elige desde cuándo se cuenta la asistencia.' };
    const monto = _num2(Number(d.monto) || 0);
    let tramos: { min: number; pct: number }[] = Array.isArray(d.tramos) ? d.tramos : [];
    tramos = tramos.map((t: any) => ({ min: Math.max(0, Math.min(100, Number(t.min) || 0)), pct: Math.max(0, Math.min(100, Number(t.pct) || 0)) }))
      .sort((a, b) => b.min - a.min);
    if (tramos.reduce((s, t) => s + t.pct, 0) > 100) return { exito: false, error: 'Los tramos suman más del 100 %.' };
    const vista = await _repartoFondo(desde, hasta, monto, tramos);
    if (accion === 'previsualizarFondo') return { exito: true, ...vista };
    const nombre = String(d.nombre ?? '').trim().slice(0, 80);
    if (!nombre) return { exito: false, error: 'Ponle nombre al viaje.' };
    const fila = { nombre, monto, fecha: fechaOk(d.fecha), ventana_desde: desde, ventana_hasta: hasta, tramos, creado_por: email };
    const { error } = d.id ? await supabase.from('fondos_viaje').update(fila).eq('id', d.id) : await supabase.from('fondos_viaje').insert(fila);
    if (error) return { exito: false, error: error.message };
    return { exito: true, ...vista };
  }

  return { exito: false, error: 'Acción desconocida.' };
}

/** Reparto de un fondo de viaje: % de asistencia de cada persona de equipos que califican. */
async function _repartoFondo(desde: string, hasta: string, monto: number, tramos: { min: number; pct: number }[]): Promise<Record<string, any>> {
  const [{ data: tiers }, eventos, logs, { data: gente }] = await Promise.all([
    supabase.from('config_tiers').select('nombre, califica_fondos_viaje'),
    _paginado((a, b) => supabase.from('asistencias').select('id_evento').not('estado', 'in', '("Evento Cancelado","No se entrena","Eliminado")').gte('fecha', desde).lte('fecha', hasta).range(a, b)),
    _paginado((a, b) => supabase.from('log_asistencias').select('id_evento, nombre_usuario, estado, marca_temporal').eq('origen', 'Admin').gte('fecha_entrenamiento', desde).lte('fecha_entrenamiento', hasta).range(a, b)),
    supabase.from('equipo').select('username, nombre_derby, foto_perfil, categoria').is('eliminado_en', null),
  ]);
  const califican = new Set((tiers ?? []).filter((t: any) => t.califica_fondos_viaje).map((t: any) => t.nombre));
  const idsEventos = new Set(eventos.map((e: any) => e.id_evento));
  // Solo eventos con lista tomada cuentan en el total.
  const conLista = new Set(logs.map((l: any) => l.id_evento).filter((id: string) => idsEventos.has(id)));
  const ultima: Record<string, { estado: string; marca: number }> = {};
  for (const l of logs) {
    if (!conLista.has(l.id_evento)) continue;
    const k = l.id_evento + '|' + l.nombre_usuario;
    const marca = l.marca_temporal ? new Date(l.marca_temporal).getTime() : 0;
    if (!ultima[k] || marca >= ultima[k].marca) ultima[k] = { estado: l.estado, marca };
  }
  const fue: Record<string, number> = {};
  for (const [k, v] of Object.entries(ultima)) if (v.estado === 'A tiempo' || v.estado === 'Tarde') { const u = k.split('|').slice(1).join('|'); fue[u] = (fue[u] ?? 0) + 1; }
  const total = conLista.size;
  const personas = (gente ?? []).filter((p: any) => califican.has(p.categoria)).map((p: any) => ({
    username: p.username, nombre: p.nombre_derby || p.username, foto: p.foto_perfil || '', categoria: p.categoria,
    clases: fue[p.username] ?? 0, pct: total ? Math.round(((fue[p.username] ?? 0) * 1000) / total) / 10 : 0, recibe: 0, tramo: -1,
  }));
  tramos.forEach((t, i) => {
    const max = i === 0 ? Infinity : tramos[i - 1].min;
    const en = personas.filter((p) => p.pct >= t.min && p.pct < max);
    const parte = en.length ? _num2((monto * t.pct / 100) / en.length) : 0;
    en.forEach((p) => { p.recibe = parte; p.tramo = i; });
  });
  personas.sort((a, b) => b.pct - a.pct);
  const repartido = _num2(personas.reduce((s, p) => s + p.recibe, 0));
  return { eventosConLista: total, personas, repartido, sobrante: _num2(monto - repartido) };
}

/** Transparencia (cualquier persona con sesión): totales por mes y en qué se gasta. Nunca datos de personas. */
async function getTransparencia(params: Record<string, any>): Promise<Record<string, any>> {
  if (!(await _validarToken(params.token))) return { exito: false, error: 'Sesión inválida.' };
  const { data: t } = await supabase.from('config_app').select('value').eq('key', 'tesoreria_transparencia').maybeSingle();
  if (t?.value !== 'true') return { exito: true, activa: false };
  const desde = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const movs = await _paginado((a, b) => supabase.from('tesoreria_movimientos').select('fecha, tipo, monto, categoria').eq('anulado', false).in('tipo', ['ingreso', 'egreso']).gte('fecha', desde).range(a, b));
  const meses: Record<string, { ingresos: number; egresos: number; gastos: Record<string, number> }> = {};
  for (const m of movs) {
    const k = String(m.fecha).slice(0, 7);
    const x = meses[k] ??= { ingresos: 0, egresos: 0, gastos: {} };
    if (m.tipo === 'ingreso') x.ingresos = _num2(x.ingresos + Number(m.monto));
    else { x.egresos = _num2(x.egresos + Number(m.monto)); x.gastos[m.categoria] = _num2((x.gastos[m.categoria] ?? 0) + Number(m.monto)); }
  }
  const cuentas = await _saldosCuentas();
  // Cierres anuales: solo totales, nunca datos de personas.
  const { data: cierres } = await supabase.from('cierres_anuales').select('anio, cerrado_en, resumen').order('anio', { ascending: false });
  const cierresPublicos = (cierres ?? []).map((c: any) => ({ anio: c.anio, cerradoEn: c.cerrado_en, ingresos: c.resumen?.ingresos ?? 0, egresos: c.resumen?.egresos ?? 0, resultado: c.resumen?.resultado ?? 0, saldoFinal: c.resumen?.saldoFinal ?? 0, categorias: c.resumen?.categorias ?? {} }));
  return { exito: true, activa: true, total: _num2(cuentas.filter((c) => c.activa).reduce((s, c) => s + c.saldo, 0)), meses, cierres: cierresPublicos };
}

// ─── Acciones: pagos ──────────────────────────────────────────────────────────

// Bug real corregido de paso (encontrado mientras se extendía esta función
// para el wizard de pagos manuales, pedido explícito de Victor): NINGUNA de
// estas 3 acciones (pago/ingreso/egreso) validaba `adminToken` -- mismo
// patrón de hueco de seguridad ya encontrado y corregido en
// `adminEliminarUsuario()` (ver ese comentario) -- cualquier caller sin
// sesión admin podía insertar pagos/ingresos/egresos arbitrarios. El
// frontend siempre las llamó vía `adminApi()` (inyecta `adminToken`
// automáticamente), así que este fix no cambia nada del flujo real
// existente.
//
// `tipo`/`esManual`/`idEvento` (nuevos, wizard de registro manual de pagos
// en 4 pasos, Mi Liga, `_mlPagoWizarGuardar()`/js/admin.js): `tipo` --
// 'clase' o 'mensual' (default 'mensual', compatible con el sheet simple
// pre-existente que nunca manda este campo); `esManual` -- default `true`
// (hoy el 100% de `pagos` se origina en una acción admin manual); `idEvento`
// -- solo se completa para `tipo:'clase'`, trazabilidad hacia el evento real
// (ver migración `20260912160000_pagos_manual_wizard.sql`).
/// Estado de la cuota de una persona en los últimos 6 meses, este y los
/// próximos 6, para "No paga un mes" (Victor, 2026-11-22): 'pagado' (al día),
/// 'no_paga' (ya tiene la excepción), 'en_revision' o '' (pendiente).
async function adminMesesCuota(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const nombre = String(params.nombre ?? '').trim();
  if (!nombre) return { exito: false, error: 'Falta la persona.' };
  const h = _hoyEcuadorISO();
  const y = Number(h.slice(0, 4)), m = Number(h.slice(5, 7));
  const meses = Array.from({ length: 13 }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 + i - 6, 1)); return d.toISOString().slice(0, 7); });
  const { data: exc } = await supabase.from('cuota_excepcion').select('mes, tipo').eq('id_miembro', nombre).in('mes', meses);
  const estados = await Promise.all(meses.map((mes) => _estadosCuotaMes([nombre], mes)));
  return {
    exito: true,
    meses: meses.map((mes, i) => {
      const e = (exc ?? []).find((x: any) => x.mes === mes);
      const s = estados[i][nombre];
      return { mes, estado: e?.tipo === 'exenta' ? 'no_paga' : s === 'al_dia' ? 'pagado' : s === 'en_revision' ? 'en_revision' : '' };
    }),
  };
}

/// Clases de una persona para registrarle un pago a mano (Victor, 2026-11-21):
/// las de los últimos 45 días y los próximos 30, con si ya está pagada, si
/// quedó debiendo (vino sin reserva o pasó a deuda) o si tiene una reserva
/// pendiente de aprobar.
async function adminClasesParaPago(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const nombre = String(params.nombre ?? '').trim();
  if (!nombre) return { exito: false, error: 'Falta la persona.' };
  const hoy = _hoyEcuadorISO();
  const desde = new Date(Date.parse(hoy) - 45 * 86400000).toISOString().slice(0, 10);
  const hasta = new Date(Date.parse(hoy) + 30 * 86400000).toISOString().slice(0, 10);
  const [{ data: evs }, { data: res }, { data: p }] = await Promise.all([
    supabase.from('asistencias').select('id_evento, fecha, inicia, donde, estado, tipo_evento').eq('tipo_evento', 'Entrenamiento')
      .not('estado', 'in', '("Evento Cancelado","Eliminado")').gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }),
    supabase.from('reservas').select('id_evento, estado, motivo_rechazo, monto').eq('nombre_usuario', nombre).not('id_evento', 'is', null).gte('fecha_pago', desde),
    supabase.from('equipo').select('categoria').eq('username', nombre).maybeSingle(),
  ]);
    const precios = await getPreciosClases({}, p?.categoria ?? null);
  const precio = Number(precios.precioPorClase) || 0;
  const clases = (evs ?? []).map((e: any) => {
    const rs = (res ?? []).filter((r: any) => r.id_evento === e.id_evento);
    const deuda = rs.find((r: any) => r.estado === 'Cancelada' && (r.motivo_rechazo === VINO_SIN_RESERVA || r.motivo_rechazo === 'Pasó a deuda'));
    const estado = rs.some((r: any) => r.estado === 'Confirmada') ? 'pagada' : rs.some((r: any) => r.estado === 'Pendiente') ? 'pendiente' : deuda ? 'debe' : '';
    return { idEvento: e.id_evento, fecha: e.fecha, hora: String(e.inicia ?? '').slice(0, 5), lugar: e.donde ?? '', estado, monto: deuda ? _num2(Number(deuda.monto) || 0) : precio };
  });
    return { exito: true, clases, precioPorClase: precio, precioMensual: Number(precios.precioMensual) || 0, saldo: await _saldoDisponible(nombre) };
}

async function adminRegistrarPago(params: Record<string, any>): Promise<any> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  let datos = params.datosJson ?? params.datos;
  if (typeof datos === 'string') datos = JSON.parse(datos);
  const nombre = String(datos.nombre ?? '').trim();
  const montoTotal = _num2(Number(datos.monto) || 0);
  const cuentaPago = async () => String(datos.cuentaId ?? '') || await _cuentaPorMedio(String(datos.formaPago ?? '').toLowerCase().includes('deuna') ? 'deuna' : String(datos.formaPago ?? '').toLowerCase().includes('efectivo') ? 'efectivo' : 'transferencia');
  const aFavor = async (monto: number, concepto: string) => {
    if (!(monto > 0)) return;
    await supabase.from('saldos_movimientos').insert({
      username: nombre, persona_nombre: await _nombrePersona(nombre), fecha: _hoyEcuadorISO(), monto: _num2(monto), tipo: 'a_favor', aplicar: 'aparte', concepto, por: adminEmail,
    });
  };
  // Pago libre (Victor, 2026-11-21): todo queda como saldo a favor para usar después.
  if (datos.tipo === 'saldo') {
    if (!nombre || !(montoTotal > 0)) return { exito: false, error: 'Indica el monto.' };
    const cuenta = await cuentaPago();
    const movId = cuenta ? await _registrarMovimiento({
      fecha: _hoyEcuadorISO(), tipo: 'ingreso', monto: montoTotal, cuenta_id: cuenta, categoria: 'abono',
      descripcion: String(datos.notas ?? '').trim() || 'Saldo a favor', persona: nombre, origen: 'saldo', registrado_por: adminEmail,
    }) : null;
    await supabase.from('saldos_movimientos').insert({
      username: nombre, persona_nombre: await _nombrePersona(nombre), fecha: _hoyEcuadorISO(), monto: montoTotal, tipo: 'a_favor', aplicar: 'aparte',
      concepto: String(datos.notas ?? '').trim().slice(0, 200) || 'Pago a favor', movimiento_id: movId, por: adminEmail,
    });
    return { exito: true, saldo: (await _saldoPersonas(nombre))[nombre] ?? 0 };
  }
  // Pago de una clase: salda la deuda si vino sin reserva o pasó a deuda; si no,
  // queda su reserva confirmada (así no se le cobra al tomar asistencia).
  let extraClase = 0;
  // Vínculos para que anular el pago en Tesorería deshaga también esto (2026-11-26).
  let reservaId: string | null = null, saldoId: string | null = null;
  if (datos.tipo !== 'clase' && nombre && datos.mes && datos.anio) {
    const { data: ya } = await supabase.from('pagos').select('id, monto, exoneradx').eq('nombre_usuario', nombre).eq('mes', datos.mes).eq('anio', datos.anio)
      .eq('tipo', 'mensual').eq('anulado', false);
    if ((ya ?? []).some((r: any) => r.exoneradx || Number(r.monto) > 0)) return { exito: false, error: 'Esa mensualidad ya está registrada. Si hay un error, anula el pago anterior en Tesorería.' };
  }
  if (datos.tipo === 'clase') {
    const idEvento = String(datos.idEvento ?? '');
    if (!nombre || !idEvento) return { exito: false, error: 'Elige la clase.' };
    if (!(montoTotal > 0)) return { exito: false, error: 'Indica el monto.' };
    const { data: rs } = await supabase.from('reservas').select('id, estado, motivo_rechazo, monto, saldo_movimiento_id').eq('nombre_usuario', nombre).eq('id_evento', idEvento);
    if ((rs ?? []).some((r: any) => r.estado === 'Confirmada')) return { exito: false, error: 'Esa clase ya está pagada.' };
    if ((rs ?? []).some((r: any) => r.estado === 'Pendiente')) return { exito: false, error: 'Tiene una reserva pendiente para esa clase: apruébala desde Novedades.' };
    const { data: ev } = await supabase.from('asistencias').select('fecha').eq('id_evento', idEvento).maybeSingle();
    const que = ev?.fecha ? `Clase del ${_fechaCorta(ev.fecha)}` : 'Clase';
    const deuda = (rs ?? []).find((r: any) => r.estado === 'Cancelada' && (r.motivo_rechazo === VINO_SIN_RESERVA || r.motivo_rechazo === 'Pasó a deuda'));
    if (deuda) {
      const debe = _num2(Number(deuda.monto) || 0);
      const paga = Math.min(montoTotal, debe);
      const { data: ab } = await supabase.from('saldos_movimientos').insert({
        username: nombre, persona_nombre: await _nombrePersona(nombre), fecha: _hoyEcuadorISO(), monto: _num2(paga), tipo: 'abono', aplicar: 'con_cuota',
        concepto: `${que}: pagada`, por: adminEmail,
      }).select('id').single();
      saldoId = ab?.id ?? null;
      extraClase = _num2(montoTotal - paga);
    } else {
      const precio = Number((await getPreciosClases({}, (await supabase.from('equipo').select('categoria').eq('username', nombre).maybeSingle()).data?.categoria ?? null)).precioPorClase) || montoTotal;
      const paga = Math.min(montoTotal, precio);
      const { data: rv } = await supabase.from('reservas').insert({
        nombre_usuario: nombre, id_evento: idEvento, tipo: 'clase', estado: 'Confirmada', monto: _num2(paga), fecha_pago: _hoyEcuadorISO(),
        medio_pago: String(datos.formaPago ?? '').toLowerCase().includes('deuna') ? 'deuna' : String(datos.formaPago ?? '').toLowerCase().includes('efectivo') ? 'efectivo' : 'transferencia',
      }).select('id').single();
      reservaId = rv?.id ?? null;
      await _asistireAlConfirmar(idEvento, nombre);
      extraClase = _num2(montoTotal - paga);
    }
    await aFavor(extraClase, `${que}: pagó de más`);
  }
  // Mensualidad: si paga más que la cuota, el resto queda a favor.
  let montoPago = montoTotal;
  if (datos.tipo !== 'clase' && !datos.exoneradx && montoTotal > 0 && nombre) {
    const cat = (await supabase.from('equipo').select('categoria').eq('username', nombre).maybeSingle()).data?.categoria ?? null;
    const precioMes = Number((await getPreciosClases({}, cat)).precioMensual) || 0;
    if (precioMes > 0 && montoTotal > precioMes) {
      montoPago = _num2(precioMes);
      await aFavor(_num2(montoTotal - precioMes), `Cuota ${datos.mes}/${datos.anio}: pagó de más`);
    }
  }
  const { data, error } = await supabase.from('pagos').insert({
    nombre_usuario: datos.nombre, mes: datos.mes, anio: datos.anio, exoneradx: !!datos.exoneradx,
        monto: datos.tipo === 'clase' ? montoTotal : montoPago, forma_pago: datos.formaPago ?? null, comprobante_url: datos.comprobanteUrl ?? null,
    notas: datos.notas ?? null, fecha: datos.fecha ?? null,
    tipo: datos.tipo === 'clase' ? 'clase' : 'mensual',
    es_manual: datos.esManual !== false,
        id_evento: datos.tipo === 'clase' ? (datos.idEvento ?? null) : null,
    reserva_id: reservaId, saldo_movimiento_id: saldoId,
  }).select();
    if (error) return { exito: false, error: error.message };
  const pago = data?.[0];
  if (pago && Number(pago.monto) > 0 && !pago.exoneradx) {
    const cuenta = String(datos.cuentaId ?? '') || await _cuentaPorMedio(String(datos.formaPago ?? '').toLowerCase().includes('deuna') ? 'deuna' : String(datos.formaPago ?? '').toLowerCase().includes('efectivo') ? 'efectivo' : 'transferencia');
    if (cuenta) await _registrarMovimiento({
            // Entra a la cuenta todo lo que pagó (también lo que quedó a favor).
      fecha: _hoyEcuadorISO(), tipo: 'ingreso', monto: montoTotal || Number(pago.monto), cuenta_id: cuenta, categoria: pago.tipo === 'clase' ? 'clase' : 'cuota',
      descripcion: pago.tipo === 'clase' ? 'Clase' : `Cuota ${pago.mes}/${pago.anio}`, persona: pago.nombre_usuario, origen: 'pago', origen_id: String(pago.id), registrado_por: adminEmail,
      ...(pago.tipo === 'clase' ? {} : { periodo_mes: pago.mes, periodo_anio: pago.anio }),
    });
  }
  return { exito: true, pago: pago ?? null };
}

async function adminRegistrarIngreso(params: Record<string, any>): Promise<any> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  let datos = params.datosJson ?? params.datos;
  if (typeof datos === 'string') datos = JSON.parse(datos);
  const { data, error } = await supabase.from('ingresos').insert({
    titulo: datos.titulo, valor: datos.valor, responsables: datos.responsables ?? null,
    mes: datos.mes ?? null, anio: datos.anio ?? null, registrado_el: datos.registradoEl ?? null,
    medio: datos.medio ?? null, descripcion: datos.descripcion ?? null, comprobante_url: datos.comprobanteUrl ?? null, notas: datos.notas ?? null,
  }).select();
  if (error) return { exito: false, error: error.message };
  return data;
}

async function adminRegistrarEgreso(params: Record<string, any>): Promise<any> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  let datos = params.datosJson ?? params.datos;
  if (typeof datos === 'string') datos = JSON.parse(datos);
  const { data, error } = await supabase.from('egresos').insert({
    titulo: datos.titulo, valor: datos.valor, responsables: datos.responsables ?? null,
    mes: datos.mes ?? null, anio: datos.anio ?? null, registrado_el: datos.registradoEl ?? null,
    medio: datos.medio ?? null, descripcion: datos.descripcion ?? null, comprobante_url: datos.comprobanteUrl ?? null, notas: datos.notas ?? null,
  }).select();
  if (error) return { exito: false, error: error.message };
  return data;
}

// Bug real (ver MANIFEST.md/CHANGELOG.md -- "nivel_actual congelado"):
// `nivel_actual` era un snapshot poblado una sola vez (12 de agosto,
// confirmado por `actualizado_en` idéntico en las 43 filas) y nunca
// actualizado desde entonces -- desde ese día quedó completamente
// desincronizado de `equipo.categoria` (fuente real, mantenida por
// `recalcular-categorias`/cambios manuales de admin). Verificado en vivo
// antes de este fix: `nivel_actual` marcaba solo 2 personas como Quindes
// (Nico, Vic); `equipo.categoria='Quindes'` real eran 8 (Ale, Cami,
// Gringa la Vikinga, Laru, Lucile, Nadinka, Sant, Vic) -- 7 personas que
// sí deben pagar cuota quedaban invisibles para estas 2 pantallas de
// pagos. `equipo.categoria` usa los mismos strings `'Quindes'`/`'Mirlxs'`,
// sin necesidad de mapear `nivel_orden`.
async function adminGetEstadoPagosMes(params: Record<string, any>): Promise<any[]> {
  const mes = Number(params.mes), anio = Number(params.anio);
  const hoy = new Date();
  const { data: quindes } = await supabase.from('equipo').select('username').eq('categoria', 'Quindes').is('eliminado_en', null);
  const personas = (quindes ?? []).map((n: any) => n.username);
  const [{ data: pagosDelMes }, { data: solicitudesAprobadas }] = await Promise.all([
    supabase.from('pagos').select('nombre_usuario, exoneradx, monto').eq('mes', mes).eq('anio', anio).eq('anulado', false),
    supabase.from('solicitudes_pago').select('nombre_usuario, tipo').eq('estado', 'aprobada').eq('mes', mes).eq('anio', anio),
  ]);
  return personas.map((nombre: string) => ({ nombre, estado: _estadoPagoPersonaMes(nombre, mes, anio, pagosDelMes ?? [], solicitudesAprobadas ?? [], hoy) }));
}

// Mismo fix que adminGetEstadoPagosMes() -- ver comentario ahí.
async function adminGetPagosAnual(params: Record<string, any>): Promise<Record<string, any>> {
  const anio = Number(params.anio);
  const hoy = new Date();
  const { data: quindes } = await supabase.from('equipo').select('username').eq('categoria', 'Quindes').is('eliminado_en', null);
  const personas = (quindes ?? []).map((n: any) => n.username);
  const [{ data: pagosDelAnio }, { data: solicitudesDelAnio }] = await Promise.all([
    supabase.from('pagos').select('nombre_usuario, mes, exoneradx, monto').eq('anio', anio).eq('anulado', false),
    supabase.from('solicitudes_pago').select('nombre_usuario, tipo, mes').eq('estado', 'aprobada').eq('anio', anio),
  ]);
  const resultado: Record<string, string[]> = {};
  for (const nombre of personas) {
    resultado[nombre] = [];
    for (let mes = 1; mes <= 12; mes++) {
      const pagosDelMes = (pagosDelAnio ?? []).filter((p: any) => p.mes === mes);
      const solicitudesDelMes = (solicitudesDelAnio ?? []).filter((s: any) => s.mes === mes);
      resultado[nombre].push(_estadoPagoPersonaMes(nombre, mes, anio, pagosDelMes, solicitudesDelMes, hoy));
    }
  }
  return resultado;
}

async function adminGetBalanceFinanciero(): Promise<Record<string, any>> {
  const [{ data: ingresos }, { data: egresos }] = await Promise.all([
    supabase.from('ingresos').select('titulo, valor, responsables, registrado_el').order('registrado_el', { ascending: false }),
    supabase.from('egresos').select('titulo, valor, responsables, registrado_el').order('registrado_el', { ascending: false }),
  ]);
  const totalIngresos = (ingresos ?? []).reduce((s: number, i: any) => s + (Number(i.valor) || 0), 0);
  const totalEgresos  = (egresos  ?? []).reduce((s: number, e: any) => s + (Number(e.valor) || 0), 0);
  return { enCaja: totalIngresos - totalEgresos, totalIngresos, totalEgresos, ultimosIngresos: (ingresos ?? []).slice(0, 5), ultimosEgresos: (egresos ?? []).slice(0, 5) };
}

async function crearSolicitudPago(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const { error } = await supabase.from('solicitudes_pago').insert({
    nombre_usuario: username, mes: Number(params.mes), anio: Number(params.anio),
    tipo: params.tipo, notas: params.notas ?? null, estado: 'pendiente',
  });
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

// Solo Pivots (antes no pedía sesión, arreglo 2026-11-12).
async function adminGetSolicitudesPago(params: Record<string, any>): Promise<any[]> {
  if (!await _validarAdminToken(params.adminToken)) return [];
  const { data } = await supabase.from('solicitudes_pago').select('*').order('created_at', { ascending: false });
  return data ?? [];
}

async function adminResolverSolicitudPago(params: Record<string, any>): Promise<Record<string, any>> {
  if (!await _validarAdminToken(params.adminToken)) return { exito: false, error: 'Sesión admin inválida.' };
  const { id, accion } = params; // accion: 'aprobar' | 'rechazar'
  const estado = accion === 'aprobar' ? 'aprobada' : 'rechazada';
  await supabase.from('solicitudes_pago').update({ estado }).eq('id', id);
  return { exito: true };
}

// ─── Acciones: usuarios / admins ─────────────────────────────────────────────

// `inactiva` (sumada al shape de salida, ver MANIFEST.md -- "Eliminar
// usuarios desde Equipo"): calculada server-side con el MISMO helper que
// `getEquipo()`/`adminGetRosterEquipo()`/`adminEliminarUsuario()`
// (`_ultimaAsistenciaRealPorUsuario()`, ver ese comentario arriba en este
// archivo) y el MISMO criterio de "sin ninguna marca real = inactiva" que
// `_eqEsInactivo()`/js/equipo.js (`Infinity` días sin `ultimaAsistencia`,
// no el criterio opuesto de `_evEsInactivo()`/js/eventos.js) -- Mi Liga ->
// Usuarios (js/admin.js) la usa para mostrar el botón "Eliminar" SOLO en
// personas inactivas, sin duplicar la cuenta de días en un 4to lugar.
// A diferencia del resto de los rosters de este archivo, ESTE
// deliberadamente NO filtra `eliminado_en` -- pedido explícito, ver
// MANIFEST.md sección "Archivado de usuarios": Mi Liga → Usuarios es la
// única pantalla donde las cuentas archivadas siguen siendo visibles (de
// solo lectura, con la marca "Cuenta eliminada" + botón "Restaurar cuenta"
// si `eliminadoPor==='admin'`, js/admin.js) -- es la única forma de ver/
// gestionar quién está archivado sin entrar a la base directo.
async function adminGetUsuarios(): Promise<any[]> {
  const { data } = await supabase.from('equipo').select('username, nombre_derby, email, cupon_disponible, eliminado_en, eliminado_por').order('username');
  const personas = (data ?? []).map((r: any) => ({
    nombre: r.username, nombreDerby: r.nombre_derby || r.username, email: r.email, cuponDisponible: !!r.cupon_disponible,
    eliminado: !!r.eliminado_en, eliminadoPor: r.eliminado_por || null,
  }));
  if (!personas.length) return personas;
    const ultimaPorUsuario = await _ultimaAsistenciaRealPorUsuario();
  const diasInactiva = Number((await _reglasLiga()).inactividadDias) || 30;
  personas.forEach((p: any) => {
    const u = _ultimaAsistenciaDe(ultimaPorUsuario, p.nombre);
    const dias = u ? Math.floor((Date.now() - new Date(u).getTime()) / 86400000) : Infinity;
    p.inactiva = dias >= diasInactiva;
  });
  return personas;
}

async function adminToggleCupon(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { nombre, cuponDisponible } = params;
  if (!nombre) return { exito: false, error: 'Parámetros inválidos.' };
    // La app manda 'true'/'false' como texto (form-urlencoded); la web, booleano.
  const valor = cuponDisponible === true || String(cuponDisponible) === 'true';
  const { error } = await supabase.from('equipo').update({ cupon_disponible: valor }).eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

// 'Técnico' se quitó como estado (Victor, 2026-11-14; nadie lo tenía).
// Estados nuevos (Victor, 2026-11-15): sin el motivo a la vista del equipo
// (la salud es privada). Qué hace cada uno se edita en Reglas → Estados.
const ESTADOS_NUEVOS = ['Enfermedad', 'Situación personal', 'Otro'];
const ESTADOS_MIEMBRO = ['Activx', 'Ausente', 'Lesionadx', ...ESTADOS_NUEVOS];

/** Qué hace un estado: si congela el equipo y si exime de la cuota. */
function _cfgEstado(reglas: Record<string, any>, estado: string): { activo: boolean; congela: boolean; exentaCuota: boolean; aprobacion: boolean } {
  const base = (REGLAS_LIGA_BASE.estados ?? {})[estado] ?? { activo: true, congela: false, exentaCuota: false, aprobacion: false };
  const c = { ...base, ...((reglas.estados ?? {})[estado] ?? {}) };
  return { activo: c.activo !== false, congela: c.congela === true, exentaCuota: c.exentaCuota === true, aprobacion: c.aprobacion === true };
}

/** Campos al entrar a un estado pedido (Lesionadx o uno de los nuevos). */
async function _camposEntradaEstado(fila: Record<string, any> | null, estado: string): Promise<Record<string, any>> {
  if (estado === 'Lesionadx') return { ..._camposSalidaEstado(fila, estado), ..._camposEntradaLesion(fila), solicitud_estado: null };
  const cfg = _cfgEstado(await _reglasLiga(), estado);
  return { ..._camposSalidaEstado(fila, estado), estado_miembro: estado, exenta_cuota: cfg.exentaCuota, solicitud_estado: null };
}

// ─── Transiciones de estado_miembro (helpers compartidos) ────────────────────
// Modelo de autodeclaración (ver MANIFEST.md): la persona declara su propio
// estado (De viaje / Lesionadx / Ausente) sin aprobación, y una marca real de
// presente la devuelve a Activx sola. Estos helpers son el ÚNICO lugar que
// arma los campos de entrada/salida de cada estado -- los usan
// adminSetEstadoMiembro(), autodeclararEstado(), recuperarseLesion(),
// terminarMiViaje(), adminAprobarLesion() y la reactivación por asistencia.
const SELECT_ESTADO_MIEMBRO = 'estado_miembro, categoria, categoria_pre_lesion';
// Estados de los que una marca real de presente saca a la persona.
const ESTADOS_REACTIVABLES = ['Ausente', 'Lesionadx', 'De viaje', ...ESTADOS_NUEVOS];

// Campos a limpiar al SALIR de `fila.estado_miembro` hacia `estadoNuevo`
// (vacío si no cambia de estado).
//  · De viaje → limpia viaje_desde/viaje_hasta.
//  · Lesionadx → restaura `categoria` desde `categoria_pre_lesion` (tier en
//    pausa durante la lesión, `recalcular-categorias` la saltea), limpia
//    `categoria_pre_lesion`, `exenta_cuota=false` (la exención estaba atada a
//    la lesión, Cambio 55) y `solicitud_lesion_pendiente=false`.
function _camposSalidaEstado(fila: Record<string, any> | null, estadoNuevo: string): Record<string, any> {
  const previo = fila?.estado_miembro ?? null;
  const u: Record<string, any> = {};
  if (!previo || previo === estadoNuevo) return u;
  // Al volver a Activx desde un estado que congela, se anota la vuelta (2026-11-27).
  if (estadoNuevo === 'Activx' && (previo === 'De viaje' || previo === 'Lesionadx' || ESTADOS_NUEVOS.includes(previo))) u.vuelta_en = _hoyEcuadorISO();
    if (previo === 'De viaje') { u.viaje_desde = null; u.viaje_hasta = null; }
  if (ESTADOS_NUEVOS.includes(previo)) u.exenta_cuota = false;
  if (previo === 'Lesionadx') {
    if (fila?.categoria_pre_lesion) u.categoria = fila.categoria_pre_lesion;
    u.categoria_pre_lesion = null;
    u.exenta_cuota = false;
    u.solicitud_lesion_pendiente = false;
  }
  return u;
}

// Campos al ENTRAR a Lesionadx: guarda la categoría de antes (solo si viene
// de otro estado, para no pisar el valor guardado con un no-op) y exime de
// cuota.
function _camposEntradaLesion(fila: Record<string, any> | null): Record<string, any> {
  const u: Record<string, any> = { estado_miembro: 'Lesionadx', exenta_cuota: true, solicitud_lesion_pendiente: false };
  if (fila?.estado_miembro !== 'Lesionadx') u.categoria_pre_lesion = fila?.categoria ?? null;
  return u;
}

// Salida de estado hacia Activx, con limpieza completa + cierre de las reglas
// "No asistiré" vigentes (para que la asistencia anticipada no le siga
// marcando ausencias). `extra` se suma al UPDATE (adminSetEstadoMiembro manda
// `exenta_cuota:false`, su sync histórico). `cerrarReglas:false` solo para
// terminarMiViaje() (la regla del viaje ya se está borrando/editando).
async function _reactivarMiembro(
  nombre: string,
  fila: Record<string, any> | null,
  opts: { extra?: Record<string, any>; cerrarReglas?: boolean } = {},
): Promise<Record<string, any>> {
  const actual = fila ?? (await supabase.from('equipo').select(SELECT_ESTADO_MIEMBRO).eq('username', nombre).maybeSingle()).data;
  if (!actual) return { exito: false, error: 'No existe esa persona.' };
  const update = { estado_miembro: 'Activx', ..._camposSalidaEstado(actual, 'Activx'), ...(opts.extra ?? {}) };
  const { error } = await supabase.from('equipo').update(update).eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  if (opts.cerrarReglas !== false && ESTADOS_REACTIVABLES.includes(actual.estado_miembro)) {
    await _cerrarReglasNoAsistireVigentes(nombre);
  }
  return { exito: true, categoria: update.categoria ?? actual.categoria ?? null };
}

// RSVP vigente de una persona para un evento: el último 'Usuario' si existe
// (una respuesta real le gana a una regla automática, mismo criterio que
// `_ultimaAsistenciaPorPersonaTodas()`), si no el último 'AsistenciaAnticipada'.
async function _rsvpVigente(idEvento: string, nombre: string): Promise<string | null> {
  const { data } = await supabase.from('log_asistencias')
    .select('estado, origen').eq('id_evento', idEvento).eq('nombre_usuario', nombre)
    .in('origen', ['Usuario', 'AsistenciaAnticipada'])
    .order('marca_temporal', { ascending: false }).limit(50);
  const filas = data ?? [];
  const fila = filas.find((f: any) => f.origen === 'Usuario') ?? filas[0];
  return fila?.estado ?? null;
}

// Reactivación automática al marcar 'A tiempo'/'Tarde' (adminMarcarAsistencia,
// también en correcciones, y rectificaciones aprobadas). Una marca real de
// presente ES la validación del estado autodeclarado: Ausente/Lesionadx/De
// viaje → Activx. NO toca 'Técnico'. Excepción: Lesionadx con RSVP vigente
// 'No jugador' para ESE evento sigue Lesionadx (vino a patinar, no a
// entrenar) -- solo para Lesionadx, De viaje/Ausente se reactivan igual.
// La asistencia externa (adminRegistrarAsistenciaExterna) no pasa por acá.
async function _reactivarPorAsistencia(nombre: string, idEvento: string): Promise<void> {
  const { data: fila } = await supabase.from('equipo').select(SELECT_ESTADO_MIEMBRO).eq('username', nombre).maybeSingle();
  if (!fila || !ESTADOS_REACTIVABLES.includes(fila.estado_miembro)) return;
  if (fila.estado_miembro === 'Lesionadx' && (await _rsvpVigente(idEvento, nombre)) === 'No jugador') return;
  await _reactivarMiembro(nombre, fila);
}

// Cierra (fecha fin = hoy, Ecuador) las reglas de asistencia anticipada
// "No asistiré" de la persona que ya están en curso. Las que todavía no
// empezaron no se tocan. `reglas_asistencia` no tiene UPDATE para anon (el
// frontend edita con DELETE+POST), acá va con service_role. 'indefinido'
// ignora `fecha_hasta` y 'meses' no tiene fechas (ver
// `_evAntReconciliarConReglas()`/js/eventos.js), así que ambas se convierten
// a 'periodo' [inicio real, hoy].
async function _cerrarReglasNoAsistireVigentes(nombre: string): Promise<void> {
  const hoy = _hoyEcuadorISO();
  const anio = hoy.slice(0, 4);
  const mesHoy = Number(hoy.slice(5, 7));
  const { data: reglas } = await supabase.from('reglas_asistencia')
    .select('id, tipo_rango, fecha_desde, fecha_hasta, meses').eq('nombre', nombre).eq('estado', 'No asistiré');
  for (const r of reglas ?? []) {
    let desde: string | null = null;
    if (r.tipo_rango === 'periodo') {
      if (!r.fecha_desde || r.fecha_desde > hoy || (r.fecha_hasta && r.fecha_hasta <= hoy)) continue;
      desde = r.fecha_desde;
    } else if (r.tipo_rango === 'indefinido') {
      if (!r.fecha_desde || r.fecha_desde > hoy) continue;
      desde = r.fecha_desde;
    } else if (r.tipo_rango === 'meses') {
            // Meses como aaaamm (2026-11-07); 1..12 = regla vieja, mes de cualquier año.
      const claveHoy = Number(anio) * 100 + mesHoy;
      const meses = (Array.isArray(r.meses) ? r.meses : []).map((m: any) => Number(m)).map((m: number) => (m > 12 ? m : Number(anio) * 100 + m));
      if (!meses.includes(claveHoy)) continue;
      const primero = Math.min(...meses.filter((m: number) => m <= claveHoy));
      desde = `${Math.floor(primero / 100)}-${String(primero % 100).padStart(2, '0')}-01`;
    } else continue;
    await supabase.from('reglas_asistencia')
      .update({ tipo_rango: 'periodo', fecha_desde: desde, fecha_hasta: hoy, meses: null }).eq('id', r.id);
  }
}

// Avisa al resto del equipo (nunca a la propia persona) cuando alguien
// ENTRA a 'De viaje'/'Lesionadx'/'Ausente' -- pedido explícito, sin
// detalles de la lesión (motivo/duración real), solo el hecho. Un solo
// call site para los 3 caminos que pueden disparar esto (autodeclararEstado,
// adminSetEstadoMiembro, adminActualizarEstadoViaje) -- evita triplicar el
// texto y el criterio de "nunca detalles". Solo dispara en la TRANSICIÓN
// real (`estadoPrevio !== estadoNuevo`) -- evita duplicados si la misma
// persona guarda el mismo estado 2 veces (ej. un admin re-confirma fechas
// de un viaje ya vigente, o alguien repite su propia autodeclaración).
async function _notificarCambioEstadoMiembro(
  username: string,
  estadoPrevio: string | null | undefined,
    estadoNuevo: string,
  fechas?: { desde?: string | null; hasta?: string | null },
): Promise<void> {
  if (estadoPrevio === estadoNuevo) return;
  const { data: fila } = await supabase.from('equipo').select('nombre_derby').eq('username', username).maybeSingle();
  const nombreMostrar = fila?.nombre_derby || username;
  let mensaje: string;
  if (estadoNuevo === 'De viaje') {
    const desdeTxt = fechas?.desde ? _fechaEs(fechas.desde) : null;
    const hastaTxt = fechas?.hasta ? _fechaEs(fechas.hasta) : null;
    mensaje = desdeTxt && hastaTxt
      ? `${nombreMostrar} estará de viaje del ${desdeTxt} al ${hastaTxt}.`
      : `${nombreMostrar} estará de viaje por un tiempo.`;
    } else if (estadoNuevo === 'Lesionadx') {
    mensaje = `${nombreMostrar} está lesionadx y no participará de los entrenamientos por un tiempo.`;
  } else if (ESTADOS_NUEVOS.includes(estadoNuevo)) {
    mensaje = `${nombreMostrar} no vendrá a los entrenamientos por un tiempo.`; // sin el motivo
  } else {
    mensaje = `${nombreMostrar} estará ausente por un tiempo.`;
  }
  await sendPush({
    tipo: 'cambio_estado_miembro',
    broadcastEquipo: true,
    excluirUsernames: [username],
    headings: { es: 'Novedades del equipo' },
    contents: { es: mensaje },
    url: APP_URL + '/?tab=equipo',
  });
}

async function adminSetEstadoMiembro(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { nombre, estadoMiembro } = params;
  if (!nombre || !ESTADOS_MIEMBRO.includes(estadoMiembro)) return { exito: false, error: 'Parámetros inválidos.' };
  const { data: actual } = await supabase.from('equipo').select(SELECT_ESTADO_MIEMBRO).eq('username', nombre).maybeSingle();
  if (!actual) return { exito: false, error: 'No existe esa persona.' };
  // `exenta_cuota` sigue a Lesionadx como única fuente de verdad (Cambio 55)
  // sin importar el camino que llega acá -- este action es compartido por
  // el selector de Mi Liga → Categorías y por el perfil de Equipo.
  // 'De viaje' se entra SOLO por adminActualizarEstadoViaje() (no está en
  // ESTADOS_MIEMBRO); cualquier otro estado elegido acá cierra el viaje
  // (`_camposSalidaEstado()`).
  if (estadoMiembro === 'Activx') {
    return await _reactivarMiembro(nombre, actual, { extra: { exenta_cuota: false } });
  }
    const exentaNuevo = ESTADOS_NUEVOS.includes(estadoMiembro) && _cfgEstado(await _reglasLiga(), estadoMiembro).exentaCuota;
  const update: Record<string, any> = estadoMiembro === 'Lesionadx'
    ? { ..._camposSalidaEstado(actual, 'Lesionadx'), ..._camposEntradaLesion(actual) }
    : { ..._camposSalidaEstado(actual, estadoMiembro), estado_miembro: estadoMiembro, exenta_cuota: exentaNuevo };
  const { error } = await supabase.from('equipo').update(update).eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  if (estadoMiembro !== 'Activx') {
    await _notificarCambioEstadoMiembro(nombre, actual.estado_miembro, estadoMiembro);
  }
  return { exito: true };
}

// Autodeclaración de estado (modelo nuevo, ver MANIFEST.md) -- la PROPIA
// persona (identidad por token, nunca por un nombre del cliente) pasa a
// 'De viaje', 'Lesionadx' o 'Ausente', sin aprobación ni justificación. La
// llaman el wizard de Asistencia anticipada (regla "No asistiré" con motivo
// De viaje/Lesionadx/Inactivx) y "Reportar lesión" del detalle propio de
// Equipo. Un admin puede corregir a mano; la validación real es la
// asistencia (`_reactivarPorAsistencia()`).
//  · De viaje: `viajeDesde`/`viajeHasta` (YYYY-MM-DD o null) = rango de la
//    regla. Viaje futuro: mismo criterio que adminActualizarEstadoViaje() --
//    el estado cambia ya y las fechas quedan guardadas (el cron lo cierra al
//    pasar `viaje_hasta`).
//  · Lesionadx: guarda `categoria_pre_lesion`, `exenta_cuota=true`.
//  · Ausente ("Inactivx" en la UI): solo el estado.
// 'Técnico' no se pisa (categoría de membresía propia): responde
// `sinCambio:true` y la regla sigue aplicando solo los RSVPs.
const ESTADOS_AUTODECLARABLES = ['De viaje', 'Lesionadx', 'Ausente', ...ESTADOS_NUEVOS];
async function autodeclararEstado(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const estado = String(params.estado ?? '').trim();
  if (!ESTADOS_AUTODECLARABLES.includes(estado)) return { exito: false, error: 'Estado inválido.' };
  const normFecha = (v: unknown): string | null | false => {
    // apiPost() (form-urlencoded) manda `null` como el texto "null".
    if (v === null || v === undefined || v === '' || v === 'null' || v === 'undefined') return null;
    const t = String(v).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(t) && !isNaN(Date.parse(t + 'T00:00:00Z')) ? t : false;
  };
  const desde = normFecha(params.viajeDesde);
  const hasta = normFecha(params.viajeHasta);
  if (desde === false || hasta === false) return { exito: false, error: 'Fecha inválida.' };
  if (desde && hasta && hasta < desde) return { exito: false, error: 'La fecha de regreso no puede ser anterior a la de salida.' };

  const { data: fila } = await supabase.from('equipo').select(SELECT_ESTADO_MIEMBRO).eq('username', username).maybeSingle();
  if (!fila) return { exito: false, error: 'Usuarix no encontradx.' };
  if (fila.estado_miembro === 'Técnico') return { exito: true, sinCambio: true, estado: 'Técnico' };

    // Estados que aprueba un Pivot (Victor, 2026-11-16): queda el pedido y el
  // estado cambia al aprobarlo. Un Pivot que pide algo para sí sigue la regla
  // de Pivots y permisos.
  if ((estado === 'Lesionadx' || ESTADOS_NUEVOS.includes(estado)) && fila.estado_miembro !== estado) {
    const cfg = _cfgEstado(await _reglasLiga(), estado);
    if (estado !== 'Lesionadx' && !cfg.activo) return { exito: false, error: 'Ese estado no está disponible.' };
    if (cfg.aprobacion && !(await _pedidoDePivot(username)).auto) {
      const { error: e1 } = await supabase.from('equipo').update({ solicitud_estado: estado, solicitud_estado_en: new Date().toISOString() }).eq('username', username);
      if (e1) return { exito: false, error: e1.message };
      const { data: f } = await supabase.from('equipo').select('nombre_derby').eq('username', username).maybeSingle();
      await sendPush({
        tipo: 'avisos_admin', include_external_user_ids: await _adminDestinatariosPush(undefined, 'salud', 'lesiones'),
        headings: { es: 'Pedido de estado' },
        contents: { es: `${f?.nombre_derby || username} pide pasar a ${estado === 'Lesionadx' ? 'Lesionadx' : 'otro estado por un tiempo'}. Revísalo en Notificaciones.` },
        url: APP_URL + '/',
      }).catch(() => {});
      return { exito: true, pendiente: true, estado: fila.estado_miembro ?? 'Activx', pedido: estado };
    }
  }
  let update: Record<string, any>;
  if (estado === 'Lesionadx') update = { ..._camposSalidaEstado(fila, estado), ..._camposEntradaLesion(fila) };
    else if (estado === 'De viaje') update = { ..._camposSalidaEstado(fila, estado), estado_miembro: 'De viaje', viaje_desde: desde, viaje_hasta: hasta };
  else if (ESTADOS_NUEVOS.includes(estado)) {
    const cfg = _cfgEstado(await _reglasLiga(), estado);
    if (!cfg.activo) return { exito: false, error: 'Ese estado no está disponible.' };
    update = { ..._camposSalidaEstado(fila, estado), estado_miembro: estado, exenta_cuota: cfg.exentaCuota };
  } else update = { ..._camposSalidaEstado(fila, estado), estado_miembro: 'Ausente' };
  const { error } = await supabase.from('equipo').update(update).eq('username', username);
  if (error) return { exito: false, error: error.message };
    await _notificarCambioEstadoMiembro(username, fila.estado_miembro, estado, { desde, hasta });
  return {
    exito: true,
    estado,
    categoria: update.categoria ?? fila.categoria ?? null,
        exentaCuota: estado === 'Lesionadx' ? true : (update.exenta_cuota ?? null),
    viajeDesde: estado === 'De viaje' ? desde : null,
    viajeHasta: estado === 'De viaje' ? hasta : null,
  };
}

// Fin anticipado del viaje propio (eliminar/editar una regla "No asistiré ·
// De viaje" en Asistencia anticipada). Solo actúa si la persona sigue
// 'De viaje'; vuelve a Activx con limpieza de fechas. No cierra otras reglas.
async function terminarMiViaje(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const { data: fila } = await supabase.from('equipo').select(SELECT_ESTADO_MIEMBRO).eq('username', username).maybeSingle();
  if (!fila) return { exito: false, error: 'Usuarix no encontradx.' };
  if (fila.estado_miembro !== 'De viaje') return { exito: true, sinCambio: true, estado: fila.estado_miembro };
  const res = await _reactivarMiembro(username, fila, { cerrarReglas: false });
  return res.exito ? { ...res, estado: 'Activx' } : res;
}

// Estado "De viaje" (feat nueva, ver MANIFEST.md) -- admin-only, desde el
// selector de Estado del perfil de Equipo (pill "De viaje" + sheet de
// período). `viaje_desde`/`viaje_hasta` opcionales (`YYYY-MM-DD` o null;
// ambas null = "Omitir fechas", solo cambia el estado). Mismo efecto que
// Lesionadx sobre el tier: `recalcular-categorias` saltea 'De viaje' (tier
// congelado); a diferencia de Lesionadx NO exime de cuota (`exenta_cuota`
// false, mismo "sync" que adminSetEstadoMiembro() aplica a todo estado que no
// sea Lesionadx). Fin automático: `marcar_eventos_finalizados_y_recalcular()`
// (migración 20260925010000_estado_de_viaje.sql) la pasa a Activx y limpia
// las fechas cuando `viaje_hasta` ya pasó.
//
// Viaje registrado a posteriori (`viaje_hasta` < hoy, Ecuador) con AMBAS
// fechas: dispara `recalcular-categorias` en modo `soloUsuario` con la
// exclusión [viaje_desde, viaje_hasta] -- recalcula el tier de ESTA persona
// sin penalizar las ausencias del viaje (ver ese archivo). Solo con
// `viaje_hasta` (sin desde) no hay período que excluir -- no se recalcula.
async function adminActualizarEstadoViaje(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const idJugadora = String(params.idJugadora ?? '').trim();
  if (!idJugadora) return { exito: false, error: 'Falta la persona.' };
  const normFecha = (v: unknown): string | null | false => {
    if (v === null || v === undefined || v === '') return null;
    const t = String(v).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(t) && !isNaN(Date.parse(t + 'T00:00:00Z')) ? t : false;
  };
  const desde = normFecha(params.viaje_desde);
  const hasta = normFecha(params.viaje_hasta);
  if (desde === false || hasta === false) return { exito: false, error: 'Fecha inválida.' };
  if (desde && hasta && hasta < desde) return { exito: false, error: 'La fecha de regreso no puede ser anterior a la de salida.' };

  const { data: persona } = await supabase.from('equipo').select('username, estado_miembro').eq('username', idJugadora).maybeSingle();
  if (!persona) return { exito: false, error: 'No existe esa persona.' };

  const { error } = await supabase.from('equipo')
    .update({ estado_miembro: 'De viaje', exenta_cuota: false, viaje_desde: desde, viaje_hasta: hasta })
    .eq('username', persona.username);
  if (error) return { exito: false, error: error.message };
  await _notificarCambioEstadoMiembro(persona.username, persona.estado_miembro, 'De viaje', { desde, hasta });

  const hoyEc = new Date(Date.now() - 5 * 3600 * 1000).toISOString().substring(0, 10); // Ecuador = UTC-5, sin DST
  let recalculado = false;
  if (desde && hasta && hasta < hoyEc) {
    if (!CRON_SECRET) return { exito: true, recalculado: false, aviso: 'Estado guardado, pero no se pudo recalcular el tier (falta CRON_SECRET).' };
    try {
      const resp = await fetch(SUPABASE_URL + '/functions/v1/recalcular-categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
        body: JSON.stringify({ soloUsuario: persona.username, excluirDesde: desde, excluirHasta: hasta }),
      });
      const out = await resp.json().catch(() => ({}));
      recalculado = resp.ok && out?.ok === true;
      if (!recalculado) return { exito: true, recalculado: false, aviso: 'Estado guardado, pero falló el recálculo del tier: ' + (out?.error ?? resp.status) };
    } catch (e) {
      return { exito: true, recalculado: false, aviso: 'Estado guardado, pero falló el recálculo del tier: ' + String((e as any)?.message ?? e) };
    }
  }
  return { exito: true, recalculado };
}

// "Cancelar viaje" (feat nueva, ver MANIFEST.md) -- link admin-only en la
// fila "De viaje" del perfil de Equipo: el viaje no ocurrió (o se cargó por
// error). Vuelve a 'Activx' y limpia las fechas, SIN recálculo de tier (si
// nunca viajó no hay ausencias que compensar; mientras estuvo 'De viaje' el
// tier solo estuvo congelado). Solo actúa si la persona sigue 'De viaje'.
async function adminCancelarViaje(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const idJugadora = String(params.idJugadora ?? '').trim();
  if (!idJugadora) return { exito: false, error: 'Falta la persona.' };
  const { data: persona } = await supabase.from('equipo').select('username, estado_miembro').eq('username', idJugadora).maybeSingle();
  if (!persona) return { exito: false, error: 'No existe esa persona.' };
  if (persona.estado_miembro !== 'De viaje') return { exito: false, error: 'No está marcadx como De viaje.' };
  const { error } = await supabase.from('equipo')
    .update({ estado_miembro: 'Activx', viaje_desde: null, viaje_hasta: null })
    .eq('username', persona.username);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

// Fija/libera la categoría (Cambio 55, control Quindes/Auto/Mirlxs del
// perfil de Equipo, ver _eqCambiarTier()/js/equipo.js) -- `categoria` se
// actualiza también de una, no solo `tier_modo`: fijar a mano sin tocar la
// categoría actual la dejaría desincronizada hasta el próximo "Recalcular
// ahora" (que además, con tier_modo!='auto', ahora se salta a esta persona,
// ver recalcular-categorias/index.ts) -- fijar "Quindes" debe hacer a la
// persona Quindes de inmediato, no solo "protegerla" del próximo recálculo.
async function adminSetTierModo(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
    const { nombre, tierModo } = params;
  // Cualquier liga (Victor, 2026-11-17): 'fijo' + `equipo` (nombre de un
  // equipo de la liga). 'quinde'/'mirlxs' quedan por compatibilidad.
  if (!nombre || !['auto', 'quinde', 'mirlxs', 'fijo'].includes(tierModo)) return { exito: false, error: 'Parámetros inválidos.' };
  const update: Record<string, any> = { tier_modo: tierModo };
  if (tierModo === 'quinde') update.categoria = 'Quindes';
  else if (tierModo === 'mirlxs') update.categoria = 'Mirlxs';
  else if (tierModo === 'fijo') {
    const equipo = String(params.equipo ?? '').trim();
    const { data: t } = await supabase.from('config_tiers').select('nombre').eq('nombre', equipo).maybeSingle();
    if (!t) return { exito: false, error: 'Ese equipo no existe en la liga.' };
    update.categoria = t.nombre;
  }
  const { error } = await supabase.from('equipo').update(update).eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

// Exención de cuota (Cambio 55, toggle "Paga cuota" del perfil de Equipo,
// ver _eqToggleCuota()/js/equipo.js) -- columna dedicada `exenta_cuota`,
// distinta de `paga_cuota` (texto 'sí'/'no', propósito no relacionado, ver
// la migración 20260829_equipo_campos_nuevos.sql).
async function adminSetExentaCuota(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { nombre } = params;
  if (!nombre) return { exito: false, error: 'Parámetros inválidos.' };
    // Booleano robusto: la app manda form-urlencoded ('true'/'false' como texto).
  const valor = params.valor === true || params.valor === 'true';
  const { error } = await supabase.from('equipo').update({ exenta_cuota: valor }).eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

// ─── Acciones: excepciones de cuota (admin marca a una persona Quindes/
// Mirlxs como exenta de un mes puntual, o registra que ya lo pagó por
// fuera del sistema de reservas mensuales) -- tabla propia `cuota_excepcion`
// (ver supabase/migrations/20260910191527_cuota_excepcion.sql), sin tocar
// `reservas`/`_evMesPagado()`. Distinta de `solicitudes_excepcion` (arriba,
// "ausencias justificadas"/"dificultad económica" -- una PERSONA pide una
// excepción para que el admin la revise); esto es la acción directa del
// admin, sin solicitud de por medio, siempre atada a un mes calendario
// concreto.
//
// listarExcepcionesCuota: SIN admin gate a propósito -- js/eventos.js la
// llama para TODA cuenta logueada al cargar sesión (_evTieneCuotaAlDia()
// necesita saber si la propia cuenta tiene una excepción este mes), mismo
// criterio "directorio visible para cualquier cuenta logueada, sin token"
// que ya usa getEquipo()/getNombres() (ver esos comentarios) -- ninguna
// acción de solo lectura de este archivo exige sesión.
async function listarExcepcionesCuota(params: Record<string, any>): Promise<Record<string, any>> {
  const mes = String(params.mes ?? '').trim();
  // Pivots ven todas; el resto solo las propias (antes cualquiera veía las
  // de todo el equipo, con montos y notas -- arreglo 2026-11-12).
  const esPivot = !!(await _validarAdminToken(String(params.adminToken ?? '')));
  const yo = esPivot ? null : await _validarToken(String(params.token ?? ''));
  if (!esPivot && !yo) return { excepciones: [] };
  let q = supabase.from('cuota_excepcion').select('id_miembro, mes, tipo, monto, notas, creado_en');
  if (mes) q = q.eq('mes', mes);
  if (!esPivot) q = q.eq('id_miembro', yo);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return {
    excepciones: (data ?? []).map((r: any) => ({
      idMiembro: r.id_miembro, mes: r.mes, tipo: r.tipo, monto: r.monto, notas: r.notas ?? '', creadoEn: r.creado_en,
    })),
  };
}

// guardarExcepcionCuota: admin-only (`adminSetExentaCuota()`, arriba, mismo
// criterio). Upsert por (id_miembro, mes) -- el índice único de la
// migración es lo que hace que `onConflict` resuelva a UPDATE en vez de
// duplicar la fila. `tipo` vacío/null borra la excepción en vez de
// guardarla (equivalente a "Quitar excepción" del frontend) -- así el
// mismo endpoint cubre los 3 botones ("Ya pagó"/"Exenta"/"Quitar
// excepción") sin necesitar una acción de borrado aparte. `monto` se
// descarta (queda `null`) salvo con `tipo:'pago'` -- 'exenta' nunca debería
// llevar un monto (ver el `check` de la migración, que sí permite null en
// cualquier caso, pero no tiene sentido guardar un monto con una exención).
async function guardarExcepcionCuota(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const idMiembro = String(params.idMiembro ?? '').trim();
  const mes = String(params.mes ?? '').trim();
  if (!idMiembro || !mes) return { exito: false, error: 'Parámetros inválidos.' };
  const tipo = String(params.tipo ?? '').trim();
  if (!tipo) {
    const { error } = await supabase.from('cuota_excepcion').delete().eq('id_miembro', idMiembro).eq('mes', mes);
    if (error) return { exito: false, error: error.message };
    return { exito: true };
  }
    if (!['pago', 'exenta'].includes(tipo)) return { exito: false, error: 'Tipo de excepción inválido.' };
  // Un mes ya pagado no se marca como "no paga" (Victor, 2026-11-22).
  if (tipo === 'exenta' && /^\d{4}-\d{2}$/.test(mes)) {
    const { data: ya } = await supabase.from('cuota_excepcion').select('tipo').eq('id_miembro', idMiembro).eq('mes', mes).maybeSingle();
    if (ya?.tipo !== 'exenta' && (await _estadosCuotaMes([idMiembro], mes))[idMiembro] === 'al_dia') return { exito: false, error: 'Ese mes ya está pagado.' };
  }
  const monto = tipo === 'pago' && params.monto != null && params.monto !== '' ? Number(params.monto) : null;
  const notas = params.notas != null && params.notas !== '' ? String(params.notas) : null;
  const { error } = await supabase.from('cuota_excepcion')
    .upsert({ id_miembro: idMiembro, mes, tipo, monto, notas }, { onConflict: 'id_miembro,mes' });
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

// Diferencia en horas entre 2 strings "HH:MM" (o "HH:MM:SS", el formato real
// que devuelve un `time` de Postgres -- se ignoran los segundos) -- 0 si
// cualquiera de los 2 falta o no parsea, en vez de tirar NaN a `equipo.horas_ano`.
function _horasEntreHorarios(inicia: string | null | undefined, termina: string | null | undefined): number {
  const aMin = (s: string | null | undefined): number | null => {
    const partes = String(s ?? '').split(':');
    if (partes.length < 2) return null;
    const h = parseInt(partes[0], 10), m = parseInt(partes[1], 10);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };
  const mi = aMin(inicia), mt = aMin(termina);
  if (mi === null || mt === null) return 0;
  return Math.max(0, mt - mi) / 60;
}

// Recalcula equipo.horas_ano/asistencias_ano/total_eventos_ano desde
// `asistencias` (Cambio 58, ver MANIFEST.md) -- botón "Recalcular ahora" de
// Mi Liga → Categorías (mismo trigger que categorías/puntos) e invocada
// también al final de recalcular-categorias/index.ts (mismo adminToken, ver
// ese archivo). **Desvío real respecto al pedido -- comparación contra
// `username`, no `nombre_derby`:** el pedido pedía comparar los nombres
// separados de `a_horario`/`tarde` contra `nombre_derby`, pero esas 2
// columnas en realidad guardan el `username` real -- confirmado contra los 2
// únicos escritores reales de esas columnas (`adminMarcarAsistencia`, arriba
// en este archivo, y `_evMarcarAsistenciaAdmin()`/js/eventos.js, que arma el
// `nombre` que manda desde `p.nombre` del roster, `username` según
// `getEquipo()`) y contra el único otro lector real que ya existía
// (`recalcular-categorias/index.ts`, `contarClases()`, compara
// `nombresDe(fila.a_horario)` contra `username.trim().toUpperCase()`).
// Comparar contra `nombre_derby` como pedía el pedido literal habría dejado
// esta función sin ningún match real en producción -- se usó el mismo
// criterio ya validado que el resto del repo.
async function recalcularStatsEquipo(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };

  const hoy = new Date();
  const inicioAnio = hoy.getUTCFullYear() + '-01-01';
  const hoyISO = hoy.toISOString().substring(0, 10);

  // Bug real (Cambio 62): este filtro comparaba contra 'Cancelado'/'No se
  // entrena', pero el valor REAL de la columna `estado` para un evento
  // cancelado es 'Evento Cancelado' (con el prefijo "Evento " -- ver
  // _EV_ESTADO_MAP/js/eventos.js, que documenta el mismo desfasaje para
  // 2 de los 4 valores posibles) -- nunca matcheaba, así que ningún evento
  // cancelado quedaba afuera. Además, un evento de hoy todavía no marcado
  // ('Evento Programado', `fecha <= hoyISO`) tampoco quedaba excluido,
  // inflando el denominador de asistencia % con clases que ni siquiera
  // pasaron. Fix original: filtrar directo por el único estado que
  // representa un evento real ya sucedido, 'Evento Finalizado'.
  //
  // Bug real #2 (Bug 13, "stats de Andrea siguen en 0" -- investigación
  // completa): ESE fix asumía que algo transiciona `estado` a 'Evento
  // Finalizado' cuando un evento pasa. Verificado contra datos reales
  // (`asistencias.estado` agrupado por fecha): todo evento hasta
  // 2026-08-19 es 'Evento Finalizado', pero CUALQUIER evento desde
  // 2026-08-20/22 en adelante -- incluidos ya pasados -- quedó atascado en
  // 'Evento Programado' para siempre. Nada en este repo escribe 'Evento
  // Finalizado' (confirmado por grep -- ni acá, ni en las migraciones SQL,
  // ni en `regenerar_ventana_asistencias()`, que solo inserta 'Próximo').
  // La transición vivía en la automatización vieja de Apps Script/Sheets,
  // huérfana desde que la generación de eventos se migró a pg_cron nativo
  // de Postgres (Cambio 57/migración `20260828_regenerar_ventana_...`) --
  // coincide con el corte real observado en los datos. Cualquier persona
  // cuya asistencia real caiga solo en ese rango (como Andrea, sus 2 únicas
  // marcas son del 24 y 29 de agosto) queda con stats en 0 para siempre,
  // sin importar cuántas veces se recalculen. Fix real: dejar de confiar en
  // el status (nadie lo mantiene) y derivar "ya sucedió" de la FECHA en vez
  // -- `fecha < hoyISO` (estricto, no `<=`, preserva la razón original de
  // Cambio 62 de no contar el evento de hoy todavía no jugado) + excluir
  // por nombre los 2 estados reales que SÍ representan "no cuenta"
  // ('Evento Cancelado'/'No se entrena', las 2 strings reales confirmadas
  // contra la tabla -- no una lista vieja incorrecta como la de Cambio 62).
  const { data: filasAsist, error: errorAsist } = await supabase.from('asistencias')
    .select('fecha, a_horario, tarde, inicia, termina')
    .not('estado', 'in', '("Evento Cancelado","No se entrena","Eliminado")')
    .gte('fecha', inicioAnio).lt('fecha', hoyISO);
  if (errorAsist) return { exito: false, error: errorAsist.message };
  const eventos = filasAsist ?? [];
  const totalEventos = eventos.length;

  const { data: miembros, error: errorMiembros } = await supabase.from('equipo').select('username').is('eliminado_en', null);
  if (errorMiembros) return { exito: false, error: errorMiembros.message };

  const parseNombres = (s: string | null | undefined): string[] =>
    String(s ?? '').split(',').map((n: string) => n.trim().toUpperCase()).filter(Boolean);

  for (const m of (miembros ?? [])) {
    const u = String(m.username).trim().toUpperCase();
    let horas = 0;
    let asistencias = 0;
    for (const ev of eventos) {
      const enHorario = parseNombres(ev.a_horario).includes(u);
      const enTarde = parseNombres(ev.tarde).includes(u);
      if (!enHorario && !enTarde) continue;
      const horasEvento = _horasEntreHorarios(ev.inicia, ev.termina);
      if (enHorario) horas += horasEvento;
      if (enTarde) horas += horasEvento / 2;
      asistencias++;
    }
    await supabase.from('equipo')
      .update({ horas_ano: horas, asistencias_ano: asistencias, total_eventos_ano: totalEventos })
      .eq('username', m.username);
  }

  return { exito: true, totalEventos, procesados: (miembros ?? []).length };
}

// Acción admin nueva (Bug 13, "corregir stats históricos como el de
// Andrea") -- wrapper sobre las 2 funciones de arriba/abajo según venga o
// no `username`: con `username`, recalcula SOLO esa persona
// (`recalcularStatsUsuario()`, ahora devuelve diagnóstico en vez de `void`)
// y devuelve el resultado real (útil para confirmar en el momento si el
// UPDATE encontró la fila o no, sin tener que ir a mirar logs). Sin
// `username`, delega en `recalcularStatsEquipo()` tal cual -- mismo
// comportamiento que el botón "Recalcular ahora" ya existente, sin
// duplicar ese loop acá.
// Recalcula equipo.puntos_mensuales.puntos_asistencia de TODO el equipo
// para un mes/año dado, a partir de `log_asistencias` (rollcall real de
// admin, no RSVP -- ver MANIFEST.md, `origen==='Admin'` es el filtro
// establecido en todo el repo para distinguir asistencia real de RSVP).
// `fecha_entrenamiento` ya viene copiada de `asistencias.fecha` al
// insertar (`_agregarFilaLogAsistencia()`, arriba en este archivo) -- sin
// JOIN a ninguna tabla de eventos (esta app no tiene una tabla `eventos`
// separada, es `asistencias`). 'A tiempo' = 1 punto, 'Tarde' = 0.5 --
// cualquier otro estado ('Ninguno', o filas de RSVP que ya quedaron fuera
// por el filtro `origen==='Admin'`) no suma nada.
//
// Limitación real, a propósito (mismo alcance que pidió Victor): el
// UPSERT solo toca las columnas `nombre_usuario`/`anio`/`mes` que
// aparecen en el resultado agregado -- si alguien pierde TODAS sus marcas
// reales de un mes (ej. una rectificación a 'Sin registrar' que la deja
// en 0), su fila existente en `puntos_mensuales` no se resetea a 0 acá
// (nunca se genera una fila con 0 para forzar el UPDATE). No es un caso
// real hoy (nadie pierde el 100% de su asistencia de un mes de un
// plumazo), pero es una desprolijidad conocida si llegara a pasar.
async function recalcularPuntosAsistencia(mes: number, anio: number): Promise<{ exito: boolean; error?: string; procesados?: number }> {
  const mesStr = String(mes).padStart(2, '0');
  const desde = anio + '-' + mesStr + '-01';
  const anioSiguiente = mes === 12 ? anio + 1 : anio;
  const mesSiguiente = mes === 12 ? 1 : mes + 1;
  const hasta = anioSiguiente + '-' + String(mesSiguiente).padStart(2, '0') + '-01';

  const { data: logs, error: errorLogs } = await supabase.from('log_asistencias')
    .select('nombre_usuario, id_evento, estado, fecha_entrenamiento, marca_temporal')
    .in('origen', ['Admin', 'Externa']) // 'Externa' = adminRegistrarAsistenciaExterna(), ver ese comentario
    .gte('fecha_entrenamiento', desde).lt('fecha_entrenamiento', hasta);
  if (errorLogs) return { exito: false, error: errorLogs.message };

  // Bug real corregido (ver MANIFEST.md/CHANGELOG.md -- "puntos de
  // asistencia inflados por re-marcados"): `_agregarFilaLogAsistencia()`
  // (arriba en este archivo) SIEMPRE hace `.insert()`, nunca update -- cada
  // vez que un admin re-marca la misma persona en el mismo evento (ej.
  // corrige "A tiempo" a "Tarde", o simplemente re-toca por las dudas) se
  // suma una fila NUEVA a `log_asistencias`, la vieja queda ahí tal cual.
  // Confirmado contra producción: casos reales con más de 10 filas
  // `origen==='Admin'` para el mismo (evento, persona) -- ej. 13 marcas
  // "A tiempo" para el mismo evento, todas contando de más. Antes de este
  // fix, el `forEach` de abajo sumaba TODAS esas filas sin ningún criterio
  // de de-duplicación -- 13 marcas "A tiempo" del mismo evento sumaban 13
  // puntos en vez de 1. Fix: "última marca real por (evento, persona)"
  // ANTES de sumar -- mismo patrón EXACTO ya usado por
  // `_reconstruirRachasHistoricas()` (`ultimaPorClave`, más abajo en este
  // archivo) para el mismo problema aplicado a la racha -- acá recién se
  // extiende también a `puntos_asistencia`, que hasta ahora había quedado
  // afuera de ese fix.
    const ultimaPorClave: Record<string, { estado: string; nombre_usuario: string; marca: number; fecha: string }> = {};
  (logs ?? []).forEach((l: any) => {
    const u = String(l.nombre_usuario ?? '').trim();
    if (!u) return;
    const clave = l.id_evento + '|' + u;
    const marca = l.marca_temporal ? new Date(l.marca_temporal).getTime() : 0;
    const actual = ultimaPorClave[clave];
        if (!actual || marca >= actual.marca) ultimaPorClave[clave] = { estado: l.estado, nombre_usuario: u, marca, fecha: String(l.fecha_entrenamiento ?? '').slice(0, 10) };
  });

  // Valores por fecha (regla de oro, Victor 2026-11-13: un cambio nunca toca puntos ya ganados).
    const versiones = await _versionesPuntos();
  const eqDe = await _equipoEnMes(versiones);
  // Personal de liga no suma puntos (Victor, 2026-11-27).
  const { data: personal } = await supabase.from('equipo').select('username').eq('personal_liga', true);
  const sinPuntos = new Set((personal ?? []).map((x: any) => String(x.username)));
  const puntosPorUsuario: Record<string, number> = {};
  Object.keys(ultimaPorClave).forEach((clave) => {
    const l = ultimaPorClave[clave];
    if (sinPuntos.has(l.nombre_usuario)) return;
    const v = _valorMarca(l.estado, l.fecha, versiones, eqDe(l.nombre_usuario, l.fecha));
    if (v) puntosPorUsuario[l.nombre_usuario] = (puntosPorUsuario[l.nombre_usuario] || 0) + v;
  });

  const filas = Object.keys(puntosPorUsuario).map((nombre_usuario) => ({
    nombre_usuario, anio, mes, puntos_asistencia: puntosPorUsuario[nombre_usuario],
  }));
  if (!filas.length) {
    // Igual reconstruye rachas -- ver comentario de _reconstruirRachasHistoricas()
    // más abajo: es independiente del mes/año pedidos acá, corre siempre
    // que se recalculan puntos de asistencia.
    await _reconstruirRachasHistoricas();
    return { exito: true, procesados: 0 };
  }

  // `onConflict` acota el UPDATE a las columnas realmente mandadas en cada
  // fila (`puntos_asistencia`) -- `puntos_tareas`/`puntos_bonificacion`/
  // `puntos_extra` de una fila ya existente quedan intactos. `puntos_total`
  // (columna GENERATED, ver MANIFEST.md) nunca se manda -- Postgres la
  // recalcula solo.
  const { error: errorUpsert } = await supabase.from('puntos_mensuales')
    .upsert(filas, { onConflict: 'nombre_usuario,anio,mes' });
  if (errorUpsert) return { exito: false, error: errorUpsert.message };

  // Reconstrucción de racha (feature nueva, ver MANIFEST.md/CHANGELOG.md):
  // "al final del cálculo de puntos de asistencia por mes, TAMBIÉN
  // reconstruir rachas históricas" (pedido explícito) -- permite
  // reconstruir racha_actual + los bonus de puntos_extra desde cero si
  // quedaron inflados/desinflados por re-marcados (ver comentario en
  // adminMarcarAsistencia()) o por cualquier otra corrección manual de
  // log_asistencias.
  await _reconstruirRachasHistoricas();
  return { exito: true, procesados: filas.length };
}

// Reconstruye racha_actual (equipo) y los bonus de racha (puntos_extra,
// puntos_mensuales) desde CERO, recorriendo TODO el historial de
// log_asistencias en orden cronológico REAL del evento (no la fecha en
// que se hizo la marca) -- a diferencia del cálculo de puntos_asistencia
// de arriba (que solo mira el mes pedido), una racha depende de TODO lo
// que pasó antes: no se puede calcular mirando un mes aislado.
//
// Costo real: recorre TODA `asistencias`/`log_asistencias` de punta a
// punta en cada llamada -- aceptable acá porque `recalcularPuntosAsistencia()`
// es una acción de recálculo manual/ocasional (disparada por un admin, o
// al final de `adminRecalcularStats()`, también manual), NUNCA por cada
// marca individual de asistencia -- ese camino en caliente sigue siendo
// el incremento en vivo de `adminMarcarAsistencia()` (racha_actual +=1 /
// =0, arriba en este archivo). Mismo criterio de costo que ya documentó
// Batch 7 para no conectar el equivalente de `recalcularStatsEquipo()`
// (recorre TODO el equipo) a cada marca individual.
//
// SET, no ADD -- a diferencia de `_acreditarPuntosExtra()` (aditivo, cada
// marca en vivo es un evento nuevo que se suma), acá se recalcula el
// total completo de cada mes tocado por una racha y se SOBREESCRIBE: de
// otro modo, correr esta reconstrucción 2 veces duplicaría cada bonus ya
// acreditado. Ambos caminos (en vivo vs. reconstrucción completa)
// convergen al mismo resultado si los datos no cambiaron entre medio --
// misma regla en los 2: +1 en cada asistencia real ('A tiempo'/'Tarde'),
// reset a 0 en 'Ninguno', +2 de puntos_extra cada 3ra consecutiva.
//
// "Sus asistencias" (pedido) se interpreta como SOLO los eventos ya
// ocurridos (`fecha < hoy` -- uno futuro/pendiente no puede ser "training
// perdido" todavía) desde que la persona tiene su PRIMERA marca real de
// admin (`log_asistencias`, `origen==='Admin'`) -- eventos anteriores a esa
// primera marca no cuentan ni como racha ni como corte (todavía no
// empezaba a trackearse). DESDE esa primera marca en adelante, en cambio,
// CUALQUIER evento real (no cancelado) sin una marca de presente para esa
// persona SÍ corta la racha -- ver "Ruptura automática de racha" más abajo
// (CAMBIO 1, ya no es "no todo evento aplica a toda persona", ver
// MANIFEST.md para el detalle de este cambio de criterio explícito).
//
// `soloUsuario` (opcional, fix real "racha inflada en re-marcados" --
// `adminMarcarAsistencia()`, arriba en este archivo): acota la
// reconstrucción a UNA sola persona, en vez de recorrer/reescribir todo
// el equipo -- ese camino en caliente (re-marcar el mismo evento+persona
// para corregir un click) necesita recalcular YA, no puede esperar a la
// próxima corrida completa/manual de `recalcularPuntosAsistencia()`. Los
// eventos siguen leyéndose completos (el orden cronológico es compartido,
// no depende de quién se está recalculando) -- solo la lista de usuarios a
// recorrer cambia.
//
// Ruptura automática de racha (CAMBIO 1, ver MANIFEST.md -- "racha
// congelada para quien dejó de venir"): antes, un evento sin ninguna fila
// para una persona (nunca se le tomó lista) simplemente se ignoraba -- ni
// sumaba ni cortaba. Eso significa que alguien que deja de venir y a quien
// ningún admin vuelve a marcarle nada (ni con 'Ninguno') conserva su racha
// vieja CONGELADA para siempre (caso real confirmado: "Gringa la Vikinga",
// racha=4 casi 2 semanas después de su última asistencia real). Fix: desde
// la primera marca real de la persona en adelante, un evento real (no
// cancelado) SIN marca para ella se trata como un 'Ninguno' implícito --
// corta la racha igual que uno explícito.
//
// Eventos cancelados y CAMBIO 4 (ver MANIFEST.md -- "bug en
// _reconstruirRachasHistoricas() con eventos cancelados"): antes, un
// evento marcado luego como 'Evento Cancelado'/'No se entrena' se sacaba
// por completo de `ordenPorEvento`, así que CUALQUIER fila de
// `log_asistencias` apuntando a ese evento -- incluido un 'Ninguno' real
// que un admin ya había registrado ahí -- se descartaba en silencio (línea
// `if (!ordenPorEvento[...]) return`). Un corte de racha genuino
// desaparecía sin dejar rastro (caso real confirmado: Vic, racha=17 en vez
// de 13, por un 'Ninguno' del 10-ago en un evento cancelado después). Fix:
// los eventos cancelados/"no se entrena" YA NO se sacan de `ordenPorEvento`
// -- entran igual que cualquier otro (así ninguna fila de log queda
// huérfana), pero al recorrer la secuencia de cada persona un evento
// cancelado NUNCA incrementa la racha ni cuenta como "training perdido" si
// no tiene marca -- excepto que, si tiene un 'Ninguno' explícito registrado
// ahí, ESE reset se respeta igual (fue una decisión real de un admin, no
// un hueco de datos).
async function _reconstruirRachasHistoricas(soloUsuario?: string): Promise<void> {
  const fechaISO = (d: Date): string => d.toISOString().slice(0, 10);
  const hoyISO = fechaISO(new Date());
  const { data: eventosTodos } = await supabase.from('asistencias')
    .select('id_evento, fecha, inicia, estado')
    .order('fecha', { ascending: true })
    .order('inicia', { ascending: true, nullsFirst: false });
  if (!eventosTodos || !eventosTodos.length) return;
  // Solo eventos YA ocurridos -- uno futuro no puede ser "training perdido"
  // ni sumar asistencia todavía (mismo criterio de corte que
  // `getEquipo()`/`recalcular-categorias` usan para el termómetro).
  const eventos = eventosTodos.filter((ev: any) => String(ev.fecha) < hoyISO);
  if (!eventos.length) return;

  const ordenPorEvento: Record<string, number> = {};
  const mesAnioPorEvento: Record<string, { anio: number; mes: number }> = {};
  const canceladoPorEvento: Record<string, boolean> = {};
  eventos.forEach((ev: any, i: number) => {
    ordenPorEvento[ev.id_evento] = i;
    const partes = String(ev.fecha).split('-');
    mesAnioPorEvento[ev.id_evento] = { anio: Number(partes[0]), mes: Number(partes[1]) };
    canceladoPorEvento[ev.id_evento] = ev.estado === 'Evento Cancelado' || ev.estado === 'No se entrena' || ev.estado === 'Eliminado';
  });

  // Usuarios a recorrer -- CAMBIO 1 necesita la secuencia completa de
  // eventos para CADA persona (no solo las que tienen alguna fila en
  // `log_asistencias`, ya que ahora un evento SIN fila también puede
  // cortar la racha) -- sin `soloUsuario`, se recorre todo `equipo`.
  let usuarios: string[];
  if (soloUsuario) {
    usuarios = [soloUsuario];
  } else {
    const { data: equipoRows } = await supabase.from('equipo').select('username').is('eliminado_en', null);
    usuarios = (equipoRows ?? []).map((r: any) => String(r.username ?? '').trim()).filter(Boolean);
  }

    // Última marca 'Admin' por (evento, persona), resuelta en la base
  // (`fn_ultima_marca_admin`, migración 20261112170000) en vez de traer
  // todas las filas 'Admin' de la historia y quedarse con la última acá.
  const { data: ultimasAdmin, error: errorUltimas } = await supabase.rpc('fn_ultima_marca_admin', { solo_usuario: soloUsuario ?? null });
  if (errorUltimas) console.error('[racha] error rpc:', JSON.stringify(errorUltimas));



  // Última marca real por (evento, persona) -- puede haber más de 1 fila
  // para el mismo evento+persona (re-marcados, rectificaciones aprobadas).
  // Ya NO se descartan las filas de eventos cancelados (CAMBIO 4, ver
  // comentario grande arriba) -- solo las de un evento futuro/inexistente
  // (no entró a `ordenPorEvento` porque `eventos` ya está acotado a
  // `fecha < hoy`, o porque el `id_evento` no existe más en `asistencias`).
    const ultimaPorClave: Record<string, { estado: string; marca: number }> = {};
  for (const [clave, v] of Object.entries((ultimasAdmin ?? {}) as Record<string, any>)) {
    const idEvento = clave.substring(0, clave.lastIndexOf('|'));
    if (!Object.prototype.hasOwnProperty.call(ordenPorEvento, idEvento)) continue;
    ultimaPorClave[clave] = { estado: v.estado, marca: Number(v.marca) || 0 };
  }


  const puntosExtraPorClaveMes: Record<string, number> = {}; // clave 'usuario|anio|mes' -> total del mes
  const rachaFinalPorUsuario: Record<string, number> = {};

  usuarios.forEach((u) => {
    let racha = 0;
    let empezo = false; // todavía sin primera marca real -- eventos previos no cuentan ni como racha ni como corte
    eventos.forEach((ev: any) => {
      const marcaInfo = ultimaPorClave[ev.id_evento + '|' + u];
      if (!empezo) {
        if (!marcaInfo) return; // sin ninguna marca real todavía para esta persona -- no aplica
        empezo = true;
      }
      if (canceladoPorEvento[ev.id_evento]) {
        // CAMBIO 4: cancelado nunca suma ni cuenta como perdido -- pero un
        // 'Ninguno' explícito ahí sí se respeta como reset intencional.
        if (marcaInfo && marcaInfo.estado === 'Ninguno') racha = 0;
        return;
      }
      const mesAnio = mesAnioPorEvento[ev.id_evento];
      const claveMes = u + '|' + mesAnio.anio + '|' + mesAnio.mes;
      if (puntosExtraPorClaveMes[claveMes] === undefined) puntosExtraPorClaveMes[claveMes] = 0;
      // CAMBIO 1: sin marca en un entrenamiento real ya ocurrido == 'Ninguno' implícito.
      const estado = marcaInfo ? marcaInfo.estado : 'Ninguno';
      if (estado === 'A tiempo' || estado === 'Tarde') {
        racha++;
        if (racha % 3 === 0) puntosExtraPorClaveMes[claveMes] += 2;
      } else {
        racha = 0;
      }
    });
    rachaFinalPorUsuario[u] = racha;
  });

  // Bug real corregido (ver MANIFEST.md/CHANGELOG.md -- "2 puntos totales
  // en un mes sin ningún entrenamiento todavía"): el bucle de arriba solo
  // agrega una clave a `puntosExtraPorClaveMes` para (usuario, mes) con AL
  // MENOS 1 evento real marcado ese mes -- un mes recién empezado, sin
  // ningún evento marcado todavía, NUNCA entra ahí, así que el upsert de
  // abajo nunca lo toca. El comentario de la función de arriba prometía
  // "los datos ya escritos con el bug viejo se corrigen solos la próxima
  // vez que corra esta reconstrucción" -- cierto SOLO para un mes que SÍ
  // tiene eventos (el upsert lo sobreescribe con el valor recalculado,
  // incluido 0); FALSO para un mes sin eventos en absoluto, que queda
  // huérfano para siempre con cualquier `puntos_extra` viejo que haya
  // quedado ahí (típicamente del bug de "mes del click" pre-commit
  // 58c01f6: un admin tomando lista tarde de un evento de fin del mes
  // ANTERIOR corría ese click ya en el mes nuevo). Fix: buscar filas
  // EXISTENTES con `puntos_extra != 0` (acotadas a `soloUsuario` si
  // aplica) y sumarlas al mismo mapa con `0` si no quedaron ya cubiertas
  // por el recálculo real de arriba -- mismo upsert, mismo onConflict, sin
  // pisar ningún valor legítimo (`if (=== undefined)` nunca sobreescribe
  // una clave que el recálculo real ya fijó).
  let queryFilasConExtra = supabase.from('puntos_mensuales').select('nombre_usuario, anio, mes').neq('puntos_extra', 0);
  if (soloUsuario) queryFilasConExtra = queryFilasConExtra.eq('nombre_usuario', soloUsuario);
  const { data: filasConExtraViejas } = await queryFilasConExtra;
  (filasConExtraViejas ?? []).forEach((fila: any) => {
    const clave = fila.nombre_usuario + '|' + fila.anio + '|' + fila.mes;
    if (puntosExtraPorClaveMes[clave] === undefined) puntosExtraPorClaveMes[clave] = 0;
  });

  const filasPuntosExtra = Object.keys(puntosExtraPorClaveMes).map((clave) => {
    const partes = clave.split('|');
    return { nombre_usuario: partes[0], anio: Number(partes[1]), mes: Number(partes[2]), puntos_extra: puntosExtraPorClaveMes[clave] };
  });
  if (filasPuntosExtra.length) {
    await supabase.from('puntos_mensuales').upsert(filasPuntosExtra, { onConflict: 'nombre_usuario,anio,mes' });
  }

  for (const u of Object.keys(rachaFinalPorUsuario)) {
    await supabase.from('equipo').update({ racha_actual: rachaFinalPorUsuario[u] }).eq('username', u);
  }
}

// Acción admin nueva: recalcula puntos_asistencia para un mes/año puntual
// (default: mes/año actuales) -- útil para corregir un mes histórico sin
// esperar a que `adminRecalcularStats()` (que solo toca el mes actual, ver
// abajo) llegue ahí.
async function adminRecalcularPuntosAsistencia(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const hoy = new Date();
  const mes = (params.mes !== undefined && params.mes !== null && params.mes !== '') ? Number(params.mes) : hoy.getUTCMonth() + 1;
  const anio = (params.anio !== undefined && params.anio !== null && params.anio !== '') ? Number(params.anio) : hoy.getUTCFullYear();
  return await recalcularPuntosAsistencia(mes, anio);
}

async function adminRecalcularStats(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const username = String(params.username ?? '').trim();
  const resultado = username ? await recalcularStatsUsuario(username) : await recalcularStatsEquipo(params);
  // Al final (pedido explícito de Victor): recalcula puntos_asistencia del
  // mes actual junto con las stats -- mismo criterio que
  // recalcularStatsEquipo()/recalcularStatsUsuario() de arriba, que solo
  // cubren horas_ano/asistencias_ano/total_eventos_ano, nunca los puntos.
  const hoy = new Date();
  await recalcularPuntosAsistencia(hoy.getUTCMonth() + 1, hoy.getUTCFullYear());
  return username ? { ...resultado, username } : resultado;
}

// Recalcula equipo.horas_ano/asistencias_ano/total_eventos_ano para UNA sola
// persona (Batch 8, ver MANIFEST.md -- hallazgo de Batch 7: los stats no se
// actualizaban tras marcar asistencia, solo con el botón manual "Recalcular
// ahora"/recalcularStatsEquipo() de arriba). Misma fórmula EXACTA que esa
// función, acotada a `username` -- 1 sola query a `asistencias` (mismo
// filtro `estado = 'Evento Finalizado'`/ventana del año) + 1 sola fila de
// `equipo` actualizada, en vez de recorrer TODO el equipo por CADA marca
// individual (el costo real que Batch 7 documentó como motivo para no
// conectar recalcularStatsEquipo() acá). Pensada para colgarse del final de
// cada escritor real de `asistencias.a_horario`/`.tarde` -- ver
// `adminMarcarAsistencia()`/`_aplicarRectificacion()`, los 2 callers reales,
// más abajo en este archivo. Sin `adminToken` propio ni entrada en el
// switch de acciones: es un helper interno que corre DESPUÉS de que el
// caller ya validó lo que tenía que validar, mismo criterio que
// `_aplicarRectificacion()`/`_agregarFilaLogAsistencia()` (tampoco expuestas
// como acciones propias). `username`, no un `userId` numérico -- esta app
// no tiene ningún id propio por persona, el username ES el id real en todo
// el resto del repo (ver `_eqCambiarTier()`/js/equipo.js). Sin `try/catch`
// propio: cualquier error acá queda silencioso (mismo criterio que
// `_aplicarRectificacion()`) -- no debe poder tumbar la respuesta real de
// "asistencia guardada", que ya tuvo éxito antes de llegar a este punto.
async function recalcularStatsUsuario(username: string): Promise<{ exito: boolean; error?: string; horas?: number; asistencias?: number; totalEventos?: number }> {
  if (!username) return { exito: false, error: 'username vacío.' };
  const usernameTrim = String(username).trim();
  const u = usernameTrim.toUpperCase();

  const hoy = new Date();
  const inicioAnio = hoy.getUTCFullYear() + '-01-01';
  const hoyISO = hoy.toISOString().substring(0, 10);

  // Mismo fix real que recalcularStatsEquipo() (arriba, ver ese comentario
  // completo -- Bug 13): 'Evento Finalizado' es un status huérfano que nada
  // transiciona desde que la generación de eventos se migró a pg_cron.
  // `fecha < hoyISO` + excluir por nombre 'Evento Cancelado'/'No se
  // entrena' reemplaza la dependencia de ese status.
  const { data: filasAsist, error: errorAsist } = await supabase.from('asistencias')
    .select('fecha, a_horario, tarde, inicia, termina')
    .not('estado', 'in', '("Evento Cancelado","No se entrena","Eliminado")')
    .gte('fecha', inicioAnio).lt('fecha', hoyISO);
  if (errorAsist) return { exito: false, error: errorAsist.message };
  const eventos = filasAsist ?? [];
  const totalEventos = eventos.length;

  const parseNombres = (s: string | null | undefined): string[] =>
    String(s ?? '').split(',').map((n: string) => n.trim().toUpperCase()).filter(Boolean);

  let horas = 0;
  let asistencias = 0;
  for (const ev of eventos) {
    const enHorario = parseNombres(ev.a_horario).includes(u);
    const enTarde = parseNombres(ev.tarde).includes(u);
    if (!enHorario && !enTarde) continue;
    const horasEvento = _horasEntreHorarios(ev.inicia, ev.termina);
    if (enHorario) horas += horasEvento;
    if (enTarde) horas += horasEvento / 2;
    asistencias++;
  }

  // Bug real (Bug 13, "stats de Andrea siguen en 0"): este UPDATE comparaba
  // contra `username` crudo mientras el resto de la función ya normaliza
  // con `.trim().toUpperCase()` (`u`, arriba) -- un espacio de más en el
  // nombre recibido (típico en datos con historial migrado desde Sheets)
  // hace que `.eq('username', username)` no matchee ninguna fila real de
  // `equipo` y el UPDATE quede en 0 filas afectadas, sin error, sin aviso.
  // `usernameTrim` (recortado pero sin tocar mayúsculas -- `equipo.username`
  // no está garantizado en un solo case) cierra ese gap sin arriesgar un
  // mismatch nuevo por mayúsculas para el resto de las cuentas.
  const { error: errorUpdate, data: dataUpdate } = await supabase.from('equipo')
    .update({ horas_ano: horas, asistencias_ano: asistencias, total_eventos_ano: totalEventos })
    .eq('username', usernameTrim)
    .select('username');
  if (errorUpdate) return { exito: false, error: errorUpdate.message };
  // `dataUpdate` vacío (`.select()` sin filas) es la señal real de "el
  // WHERE no matcheó nada en `equipo`" -- sin esto, un `UPDATE` de 0 filas
  // se ve idéntico a uno exitoso (mismo motivo raíz que Bug 13 antes del
  // `.trim()`, ver comentario de arriba -- ahora queda explícito en vez de
  // silencioso para quien llame a esta función esperando un resultado).
  if (!dataUpdate || !dataUpdate.length) return { exito: false, error: 'Ningún registro de equipo coincide con username="' + usernameTrim + '" -- el UPDATE no tocó ninguna fila.' };
  return { exito: true, horas, asistencias, totalEventos };
}

// ─── Acciones: solicitud de lesión (auto-reporte usuario + aprobación admin) ──
// Mismo patrón que rectificaciones/excepciones (arriba): la persona se
// identifica por token, nunca por un id mandado por el cliente. A diferencia
// de esas 2 (tabla propia `solicitudes_*`), acá no hace falta una tabla
// aparte -- el pedido es 1 solicitud pendiente por persona a la vez, así que
// vive como 2 columnas directas en `equipo` (`estado_miembro`/
// `solicitud_lesion_pendiente`, ver la migración 20260829_solicitud_lesion.sql).
//
// OBSOLETO desde el modelo de autodeclaración (ver MANIFEST.md): la lesión
// ya no pasa por aprobación. `solicitarLesion` queda solo por clientes PWA con
// JS viejo en caché y ahora aplica Lesionadx directo (misma lógica que
// `autodeclararEstado`), sin crear solicitudes pendientes.
// `cancelarSolicitudLesion`/`adminGetSolicitudesLesion`/`adminAprobarLesion`/
// `adminRechazarLesion` siguen vivas solo para resolver las solicitudes
// pendientes que ya existían antes del cambio.
async function solicitarLesion(params: Record<string, any>): Promise<Record<string, any>> {
  const r = await autodeclararEstado({ token: params.token, estado: 'Lesionadx' });
  const username = await _validarToken(params.token);
  if (r?.exito !== false && username && (await _pedidoDePivot(username)).auto) {
    await adminAprobarLesion({ adminToken: _TOKEN_INTERNO, nombre: username });
    return { ...r, aprobada: true };
  }
  return r;
}

async function cancelarSolicitudLesion(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const { error } = await supabase.from('equipo').update({ solicitud_lesion_pendiente: false }).eq('username', username);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

async function recuperarseLesion(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const { data: fila } = await supabase.from('equipo').select(SELECT_ESTADO_MIEMBRO).eq('username', username).maybeSingle();
  if (!fila || fila.estado_miembro !== 'Lesionadx') return { exito: false, error: 'No estás marcadx como Lesionadx.' };
  // Salida centralizada (`_reactivarMiembro()`): restaura la categoría de
  // antes de la lesión, exenta_cuota=false, limpia la solicitud y cierra las
  // reglas "No asistiré" vigentes.
  return await _reactivarMiembro(username, fila);
}

async function adminGetSolicitudesLesion(params: Record<string, any>): Promise<any[]> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return [];
  const { data } = await supabase.from('equipo').select('username, nombre_derby, foto_perfil, estado_miembro')
    .eq('solicitud_lesion_pendiente', true).is('eliminado_en', null).order('username');
  return (data ?? []).map((r: any) => ({
    nombre: r.username, nombreDerby: r.nombre_derby ?? '', fotoPerfil: r.foto_perfil ?? '',
    estado_miembro: r.estado_miembro ?? 'Activx',
  }));
}

// No toca `paga_cuota` (columna TEXT real, 'sí'/'no') -- ese campo ya existe
// pero con un propósito distinto y no relacionado: gatea el `dashboardAdmin`
// del propio ADMIN cuando NO ha pagado su cuota (ver loginGoogle()/
// adminLogin() arriba), no un flag general de "está exento de cuota" por
// cualquier miembro. **Actualización Cambio 55:** ahora sí existe un campo
// real dedicado para la exención general (`exenta_cuota`, ver la migración
// 20260829_equipo_campos_nuevos.sql) -- se setea acá junto con
// `estado_miembro`, cerrando el TODO que había quedado abierto en el
// Cambio 54.
async function adminAprobarLesion(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { nombre } = params;
  if (!nombre) return { exito: false, error: 'Parámetros inválidos.' };
  const { data: fila } = await supabase.from('equipo').select(SELECT_ESTADO_MIEMBRO).eq('username', nombre).maybeSingle();
  if (!fila) return { exito: false, error: 'No existe esa persona.' };
    // Pedido de estado (Lesionadx o uno de los nuevos, 2026-11-16) o la
  // solicitud de lesión vieja.
  const { data: ped } = await supabase.from('equipo').select('solicitud_estado').eq('username', nombre).maybeSingle();
  const estado = String(ped?.solicitud_estado ?? 'Lesionadx');
  const u = await _camposEntradaEstado(fila, estado);
  const { error } = await supabase.from('equipo').update(u).eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  await _notificarCambioEstadoMiembro(nombre, fila.estado_miembro, estado);
  await sendPush({
    tipo: 'solicitud_resuelta', include_external_user_ids: [nombre],
    headings: { es: 'Pedido aprobado' }, contents: { es: `Ya estás como ${estado}. Si vienes a entrenar, vuelves a Activx.` }, url: APP_URL + '/',
  }).catch(() => {});
  return { exito: true };
}

async function adminRechazarLesion(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { nombre } = params;
  if (!nombre) return { exito: false, error: 'Parámetros inválidos.' };
    const { error } = await supabase.from('equipo').update({ solicitud_lesion_pendiente: false, solicitud_estado: null }).eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  await sendPush({
    tipo: 'solicitud_resuelta', include_external_user_ids: [nombre],
    headings: { es: 'Pedido no aprobado' }, contents: { es: 'Un Pivot no aprobó tu cambio de estado. Si tienes dudas, escríbele.' }, url: APP_URL + '/',
  }).catch(() => {});
  return { exito: true };
}

// Archivado (soft delete) -- pedido explícito, ver MANIFEST.md sección
// "Archivado de usuarios". Historia completa de este endpoint: primero
// (2026-09-12) se encontró que no validaba `adminToken` y dejaba 151+
// filas huérfanas en 6 tablas al borrar `equipo` directo (fix: borrado
// explícito por tabla + `ON DELETE CASCADE`, ver
// `20260912120000_cascade_delete_usuario.sql`); el 2026-10-27 se confirmó
// que ese CASCADE (automático, sin que nadie lo revisara) ya se había
// comido el historial de pagos/asistencias/puntos de 10 cuentas reales --
// la causa de fondo no era "faltaba borrar una tabla más", era borrar
// `equipo` en absoluto. Esta versión YA NO BORRA LA FILA -- marca
// `eliminado_en`+`eliminado_por:'admin'` nada más, sin tocar ningún dato
// personal (a diferencia de `eliminarCuenta()`, arriba, que sí los vacía --
// la persona lo pide para sí misma; un admin archivando a otra persona no
// tiene por qué borrarle sus datos). Las 12 tablas con historial real
// (`log_asistencias`/`reservas`/`puntos_mensuales`/`asignaciones_tareas`/
// `rectificaciones_asistencia`/`solicitudes_excepcion`/`solicitudes_pago`/
// `pagos`/`historial_tier`/`cuota_excepcion`/`nivel_actual`/
// `reglas_asistencia`) ya tienen `ON DELETE RESTRICT` hacia `equipo`
// (`20261028022932_archivar_usuarios_restrict_fk.sql`) -- red de seguridad
// a nivel DB, no dependen de que este código se acuerde de no tocarlas.
// Guardias que se conservan tal cual (sin relación con el cambio de
// borrado→archivado):
// - **Solo usuarios inactivos** -- `_ultimaAsistenciaRealPorUsuario()`,
//   mismo criterio de 30 días que el ícono de borrar de Equipo.
// - **No autoeliminación** -- email de la fila objetivo vs. sesión admin.
// Nuevo: anula las invitaciones pendientes (`invite_tokens.usado=true`) --
// no tiene sentido un link de activación vivo para una cuenta archivada.
// `pin_hash` se CONSERVA a propósito (al revés que `eliminarCuenta()`) --
// si se restaura (`adminRestaurarUsuario()`, abajo) la cuenta vuelve a
// funcionar con el mismo PIN de antes, sin que la persona tenga que
// configurar uno nuevo.
async function adminEliminarUsuario(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const nombre = String(params.nombre ?? '').trim();
  if (!nombre) return { exito: false, error: 'Parámetros inválidos.' };

  const { data: fila } = await supabase.from('equipo').select('username, email, eliminado_en').eq('username', nombre).maybeSingle();
  if (!fila) return { exito: false, error: 'Usuario no encontrado.' };
  if (_estaArchivado(fila)) return { exito: false, error: 'Esta cuenta ya está eliminada.' };
  if (String(fila.email ?? '').toLowerCase() === adminEmail.toLowerCase()) {
    return { exito: false, error: 'No puedes eliminar tu propia cuenta.' };
  }

  const ultimaPorUsuario = await _ultimaAsistenciaRealPorUsuario();
  const ultima = _ultimaAsistenciaDe(ultimaPorUsuario, nombre);
  const dias = ultima ? Math.floor((Date.now() - new Date(ultima).getTime()) / 86400000) : Infinity;
    if (dias < 30) return { exito: false, error: 'Solo se pueden eliminar usuarios inactivos.' };

  // Sin reservas activas ni cuotas pendientes (Victor, 2026-11-07): primero se resuelven.
  const hoyIso = new Date().toISOString().substring(0, 10);
  const { data: activas } = await supabase.from('reservas').select('tipo, estado, id_evento, validez_hasta')
    .eq('nombre_usuario', nombre).in('estado', ['Pendiente', 'Confirmada', 'Reagendar']);
  const idsClase = (activas ?? []).filter((r: any) => r.tipo === 'clase' && r.id_evento).map((r: any) => r.id_evento);
  const { data: evFuturos } = idsClase.length
    ? await supabase.from('asistencias').select('id_evento').in('id_evento', idsClase).gte('fecha', hoyIso)
    : { data: [] as any[] };
  const futuros = new Set((evFuturos ?? []).map((e: any) => e.id_evento));
  const motivos: string[] = [];
  if ((activas ?? []).some((r: any) => r.tipo === 'clase' && (futuros.has(r.id_evento) || r.estado === 'Reagendar'))) motivos.push('tiene reservas de clase activas');
  if ((activas ?? []).some((r: any) => r.tipo === 'mensual' && r.estado === 'Pendiente')) motivos.push('tiene cuotas pendientes de revisión');
  if ((activas ?? []).some((r: any) => r.tipo === 'mensual' && r.estado === 'Confirmada' && (!r.validez_hasta || r.validez_hasta >= hoyIso))) motivos.push('tiene una cuota mensual vigente');
  if (motivos.length) return { exito: false, error: `No se puede archivar: ${motivos.join(' y ')}. Resuélvelo primero desde Mi Liga.`, motivos };

  const { error } = await supabase.from('equipo')
    .update({ eliminado_en: new Date().toISOString(), eliminado_por: 'admin' })
    .eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  await _liberarTareasDe(nombre);
  await supabase.from('sessions').delete().eq('username', nombre);
  await supabase.from('pin_attempts').delete().eq('username', nombre);
  await supabase.from('invite_tokens').update({ usado: true }).eq('username', nombre).eq('usado', false);
  return { exito: true };
}

// Restaura una cuenta archivada POR UN ADMIN -- pedido explícito, Mi Liga →
// Usuarios → botón "Restaurar cuenta". Solo si `eliminado_por==='admin'`:
// una cuenta que se archivó a sí misma (`eliminarCuenta()`, `eliminado_por:
// 'usuario'`) ya perdió sus datos personales/médicos/de contacto para
// siempre, "restaurarla" dejaría una cuenta a medio completar en vez de
// devolverla a la normalidad real -- se rechaza derecho, el frontend ni
// muestra el botón para ese caso pero esto es la validación autoritativa.
async function adminRestaurarUsuario(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const nombre = String(params.nombre ?? '').trim();
  if (!nombre) return { exito: false, error: 'Parámetros inválidos.' };
  const { data: fila } = await supabase.from('equipo').select('eliminado_en, eliminado_por').eq('username', nombre).maybeSingle();
  if (!fila) return { exito: false, error: 'Usuario no encontrado.' };
  if (!fila.eliminado_en) return { exito: false, error: 'Esta cuenta no está eliminada.' };
  if (fila.eliminado_por !== 'admin') return { exito: false, error: 'Esta cuenta fue eliminada por la propia persona -- no se puede restaurar.' };
  const { error } = await supabase.from('equipo').update({ eliminado_en: null, eliminado_por: null }).eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

// Borrar a una persona archivada (Victor, 2026-11-16): último recurso. Se
// borran sus datos personales, de salud, emergencia y contacto, su foto y
// su acceso; quedan su nombre, sus pagos y sus asistencias (las tablas con
// historial no se tocan). No se puede deshacer ni restaurar.
async function adminBorrarDatosPersona(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const nombre = String(params.nombre ?? '').trim();
  if (!nombre) return { exito: false, error: 'Parámetros inválidos.' };
  const { data: fila } = await supabase.from('equipo').select('eliminado_en, eliminado_por').eq('username', nombre).maybeSingle();
  if (!fila) return { exito: false, error: 'Usuario no encontrado.' };
  if (!fila.eliminado_en || fila.eliminado_por !== 'admin') return { exito: false, error: 'Primero hay que archivar a la persona.' };
  const { data, error } = await supabase.from('equipo').update({
    eliminado_por: 'borrado',
    email: '', prefijo: '', telefono: '',
    fecha_nacimiento: null, fecha_publica: null, edad_publica: null,
    tipo_documento: '', pais_expedicion: '', numero_documento: '',
    calle_principal: '', calle_secundaria: '', numeracion: '', sector: '', canton: '',
    emerg1_nombre: '', emerg1_relacion: '', emerg1_prefijo: '', emerg1_telefono: '',
    emerg2_nombre: '', emerg2_relacion: '', emerg2_prefijo: '', emerg2_telefono: '',
    enfermedad: '', alergias: '', alergias_desc: '', dieta: '', antecedentes: '',
    medicamentos: '', medicamentos_desc: '', atencion_medica: '', seguro: '', seguro_contacto: '',
    foto_perfil: '', pin_hash: null,
  }).eq('username', nombre).select('username');
  if (error) return { exito: false, error: error.message };
  if (!data?.length) return { exito: false, error: 'No se pudo borrar.' };
  await supabase.from('sessions').delete().eq('username', nombre);
  await supabase.from('pin_attempts').delete().eq('username', nombre);
  await supabase.from('invite_tokens').update({ usado: true }).eq('username', nombre).eq('usado', false);
  await supabase.storage.from('fotos-perfil').remove(['avatars/' + nombre + '.jpg']);
  return { exito: true };
}

/** Cupón manual a una persona: 10, 15, 25, 50 o 100 % para su próximo pago (0 = quitar). */
async function adminCuponDescuento(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const nombre = String(params.nombre ?? '');
  const pct = Number(params.pct) || 0;
  if (pct !== 0 && ![10, 15, 25, 50, 100].includes(pct)) return { exito: false, error: 'Descuento inválido.' };
  const { error } = await supabase.from('equipo').update({ cupon_descuento: pct || null }).eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  await _registrarAjuste('cuponDescuento', null, { nombre, pct }, email);
  if (pct) {
    await sendPush({
      tipo: 'solicitud_resuelta', include_external_user_ids: [nombre], headings: { es: 'Tienes un descuento' },
      contents: { es: pct === 100 ? 'Tu próximo pago es gratis. Se aplica solo al suscribirte.' : `Tienes ${pct} % de descuento en tu próximo pago. Se aplica solo al suscribirte.` }, url: APP_URL + '/',
    }).catch(() => {});
  }
  return { exito: true };
}

// ─── Planes de pago (Victor, 2026-11-16) ───────────────────────────────────
/** Plan activo que le corresponde a la persona (por equipo o por nombre). */
async function _planDe(id: string, username: string): Promise<any | null> {
  const [{ data: p }, { data: f }] = await Promise.all([
    supabase.from('planes').select('*').eq('id', id).eq('activo', true).maybeSingle(),
    supabase.from('equipo').select('categoria').eq('username', username).maybeSingle(),
  ]);
  return p && _planAplica(p, username, f?.categoria ?? null) ? p : null;
}
function _planAplica(p: any, username: string, categoria: string | null): boolean {
  const eqs: string[] = p.equipos ?? [], pers: string[] = p.personas ?? [];
  if (!eqs.length && !pers.length) return true;
  return (categoria != null && eqs.includes(categoria)) || pers.includes(username);
}
/** Usa una clase del plan que vence antes. */
async function _consumirCreditoPlan(username: string): Promise<any | null> {
  const { data } = await supabase.from('plan_creditos').select('*').eq('username', username).gte('vence', _hoyEcuadorISO()).order('vence');
  const c = (data ?? []).find((x: any) => Number(x.usadas) < Number(x.total));
  if (!c) return null;
  const { data: ok } = await supabase.from('plan_creditos').update({ usadas: Number(c.usadas) + 1 }).eq('id', c.id).eq('usadas', c.usadas).select('id');
  return ok?.length ? c : null;
}
async function _clasesDePlan(username: string): Promise<{ restantes: number; vence: string | null }> {
  const { data } = await supabase.from('plan_creditos').select('total, usadas, vence').eq('username', username).gte('vence', _hoyEcuadorISO()).order('vence');
  const l = (data ?? []).filter((x: any) => Number(x.usadas) < Number(x.total));
  return { restantes: l.reduce((s: number, x: any) => s + Number(x.total) - Number(x.usadas), 0), vence: l[0]?.vence ?? null };
}

/** Planes que puede comprar la persona y sus clases de plan vigentes. */
async function getMisPlanes(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const [{ data: planes }, { data: f }] = await Promise.all([
    supabase.from('planes').select('*').eq('activo', true).order('created_at'),
    supabase.from('equipo').select('categoria').eq('username', yo).maybeSingle(),
  ]);
  return {
    exito: true,
    planes: (planes ?? []).filter((p: any) => _planAplica(p, yo, f?.categoria ?? null))
      .map((p: any) => ({ id: p.id, nombre: p.nombre, tipo: p.tipo, cantidad: p.cantidad, precio: Number(p.precio), venceMeses: p.vence_meses })),
    clases: await _clasesDePlan(yo),
  };
}

/** Comprar un plan de clases: queda pendiente hasta que un Pivot apruebe el pago. */
async function comprarPlan(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const plan = await _planDe(String(params.planId ?? ''), yo);
  if (!plan || plan.tipo !== 'clases') return { exito: false, error: 'Ese plan ya no está disponible.' };
  const { data: nueva, error } = await supabase.from('reservas').insert({
    nombre_usuario: yo, tipo: 'plan', mes_texto: plan.nombre, estado: 'Pendiente', monto: Number(plan.precio),
    fecha_pago: _hoyEcuadorISO(), plan_id: plan.id,
    medio_pago: /^[a-z0-9_-]{1,40}$/.test(String(params.medio ?? '')) ? String(params.medio) : null,
    medio_nombre: String(params.medioNombre ?? '').trim().slice(0, 60) || null,
  }).select('id, monto').maybeSingle();
  if (error) return { exito: false, error: 'No se pudo guardar.' };
  return { exito: true, id: nueva?.id ?? null, monto: Number(nueva?.monto) || 0 };
}

/** Pivots: listar, guardar o borrar planes. */
async function adminPlanes(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const accion = String(params.accion ?? 'listar');
  if (accion === 'guardar') {
    let p: any = params.plan;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
    if (!p || typeof p !== 'object') return { exito: false, error: 'Plan inválido.' };
    const nombre = String(p.nombre ?? '').trim().slice(0, 50);
    const tipo = p.tipo === 'clases' ? 'clases' : 'meses';
    const cantidad = Math.round(Number(p.cantidad)), precio = _num2(Number(p.precio));
    if (!nombre) return { exito: false, error: 'Ponle un nombre.' };
    if (!(cantidad >= 1 && cantidad <= (tipo === 'meses' ? 12 : 100))) return { exito: false, error: 'Cantidad inválida.' };
    if (!(precio >= 0 && precio <= 100000)) return { exito: false, error: 'Precio inválido.' };
    const lista = (x: unknown) => (Array.isArray(x) ? x.map((y) => String(y).trim().slice(0, 60)).filter(Boolean).slice(0, 50) : []);
    const fila = {
      nombre, tipo, cantidad, precio, vence_meses: Math.min(24, Math.max(1, Math.round(Number(p.venceMeses) || 3))),
      equipos: lista(p.equipos), personas: lista(p.personas), activo: p.activo !== false,
    };
    const r = p.id ? await supabase.from('planes').update(fila).eq('id', String(p.id)) : await supabase.from('planes').insert(fila);
    if (r.error) return { exito: false, error: r.error.message };
    await _registrarAjuste('plan', null, fila, email);
  } else if (accion === 'borrar') {
    // Se desactiva: los ya comprados siguen valiendo.
    await supabase.from('planes').update({ activo: false }).eq('id', String(params.id ?? ''));
  }
  const { data } = await supabase.from('planes').select('*').order('created_at');
  return {
    exito: true,
    planes: (data ?? []).map((p: any) => ({
      id: p.id, nombre: p.nombre, tipo: p.tipo, cantidad: p.cantidad, precio: Number(p.precio), venceMeses: p.vence_meses,
      equipos: p.equipos ?? [], personas: p.personas ?? [], activo: p.activo,
    })),
  };
}

// ─── Cursos con try out (Victor, 2026-11-16) ───────────────────────────────
// Varias fechas (cada una es un evento "Curso" del calendario; la última es
// el try out), precio propio y cupo. La inscripción se paga como una reserva
// (tipo 'curso') y se confirma al aprobar el pago. En el try out el Pivot
// elige a qué equipo pasa cada persona.
function _cursoJson(c: any, inscritos: any[], yo?: string) {
  const activos = inscritos.filter((i: any) => i.curso_id === c.id && i.estado !== 'cancelada');
  const mia = yo ? activos.find((i: any) => i.username === yo) : null;
  return {
        id: c.id, tipo: c.tipo ?? 'curso', nombre: c.nombre, descripcion: c.descripcion ?? '', precio: Number(c.precio) || 0, cupo: c.cupo ?? null,
        fechas: Array.isArray(c.fechas) ? c.fechas : [], equipoDestino: c.equipo_destino ?? null, estado: c.estado,
        evaluacion: c.evaluacion ?? {}, cambiaEquipo: c.cambia_equipo === true,
    para: c.para ?? { tipo: 'todos' }, abierto: c.abierto === true, repite: c.repite ?? null, temas: c.temas ?? [],
    inscritos: activos.length, libres: c.cupo == null ? null : Math.max(0, Number(c.cupo) - activos.length),
    ...(mia ? { miInscripcion: { estado: mia.estado, resultado: mia.resultado ?? null } } : {}),
  };
}

/// Plantillas de la liga y, en roller derby, Freshmeat armado con las
/// habilidades básicas: una clase por grupo y la evaluación con todas.
async function _plantillasCursos(): Promise<any[]> {
  const { data } = await supabase.from('curso_plantillas').select('*').order('created_at', { ascending: false });
  const out: any[] = (data ?? []).map((p: any) => ({ id: p.id, nombre: p.nombre, tipo: p.tipo, descripcion: p.descripcion ?? '', clases: p.clases ?? [], evaluacion: p.evaluacion ?? {} }));
  const deporte = (await supabaseServicio.from('ligas').select('deporte').eq('id', _ligaEnCurso()).maybeSingle()).data?.deporte ?? 'roller_derby';
  if (deporte === 'roller_derby') {
    const { data: hab } = await supabase.from('coach_habilidades').select('categoria, nombre, orden, nivel').eq('activa', true).eq('nivel', (await _nivelesLiga())[0]?.clave ?? 'basica').neq('categoria', 'Temas de cursos').order('orden');
    const grupos: Record<string, string[]> = {};
    for (const h of hab ?? []) (grupos[h.categoria] ??= []).push(String(h.nombre).slice(0, 40));
    if (Object.keys(grupos).length) {
      out.unshift({
        id: 'freshmeat', nombre: 'Freshmeat', tipo: 'curso', sistema: true,
        descripcion: 'Curso para quienes empiezan: las habilidades mínimas para jugar roller derby (WFTDA), con evaluación al final.',
        clases: Object.entries(grupos).map(([, temas]) => ({ tipo: 'clase', temas })),
        evaluacion: { temas: Object.values(grupos).flat().map((n) => ({ nombre: n, minimo: 5 })) },
      });
    }
  }
  return out;
}

/// Nivel de cada persona del equipo (a mano o según lo logrado, como getCoach).
async function _nivelesDePersonas(): Promise<Record<string, string>> {
  const { data: gente } = await supabase.from('equipo').select('username, nivel_coach, estado_miembro').is('eliminado_en', null);
  const users = (gente ?? []).map((p: any) => p.username);
  if (!users.length) return {};
  const { data: evs } = await supabase.from('coach_evaluaciones').select('username, habilidad_id, nivel, creado_en').in('username', users).order('creado_en', { ascending: false }).limit(20000);
  const logradas: Record<string, Set<string>> = {};
  const vistas = new Set<string>();
  for (const e of evs ?? []) {
    const k = `${e.username}|${e.habilidad_id}`;
    if (vistas.has(k)) continue;
    vistas.add(k);
    if (e.nivel === 'logrado') (logradas[e.username] ??= new Set()).add(e.habilidad_id);
  }
  const habs = await _habilidades(), nivelesL = await _nivelesLiga();
  const out: Record<string, string> = {};
  for (const p of gente ?? []) out[p.username] = p.nivel_coach ? _claveNivel(p.nivel_coach) : _calcularNivel(habs, nivelesL, logradas[p.username] ?? new Set()).nivel;
  return out;
}

/// Nivel de Coach calculado de una persona (mismo criterio que getCoach).
async function _nivelDe(username: string): Promise<string> {
  return _calcularNivel(await _habilidades(), await _nivelesLiga(), await _logradasDe(username)).nivel;
}

/** Quiénes pueden tomar un curso según "para quién": toda la liga, equipos, un nivel o personas. */
async function _destinatariosCurso(para: any, emailAutor?: string): Promise<string[]> {
  const tipo = para?.tipo ?? 'todos', v: string[] = para?.valores ?? [];
  if (tipo === 'personas') return v;
  const { data } = await supabase.from('equipo').select('username, email, categoria, estado_miembro, nivel_coach').is('eliminado_en', null);
  const out: string[] = [];
  for (const p of data ?? []) {
    if (/archiv/i.test(String(p.estado_miembro ?? ''))) continue;
    if (emailAutor && String(p.email ?? '').toLowerCase() === emailAutor.toLowerCase()) continue;
    if (tipo === 'equipos' && !v.includes(p.categoria ?? '')) continue;
    if (tipo === 'nivel' && !v.map(_claveNivel).includes(p.nivel_coach ? _claveNivel(p.nivel_coach) : await _nivelDe(p.username))) continue;
    out.push(p.username);
  }
  return out;
}

async function getCursos(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const [{ data: cursos }, { data: ins }] = await Promise.all([
    supabase.from('cursos').select('*').in('estado', ['abierto', 'cerrado']).order('created_at'),
    supabase.from('curso_inscripciones').select('curso_id, username, estado, resultado'),
  ]);
    // Solo los cursos para mí: toda la liga, mi equipo, mi nivel o invitación (Victor, 2026-11-17).
  const { data: yoFila } = await supabase.from('equipo').select('categoria, nivel_coach').eq('username', yo).maybeSingle();
  let miNivel: string | null = yoFila?.nivel_coach ?? null;
  const paraMi = async (c: any) => {
    const p = c.para ?? { tipo: 'todos' }, v: string[] = p.valores ?? [];
    if (p.tipo === 'equipos') return v.includes(yoFila?.categoria ?? '');
    if (p.tipo === 'personas') return v.includes(yo);
    if (p.tipo === 'nivel') {
      miNivel ??= await _nivelDe(yo);
      return v.map(_claveNivel).includes(_claveNivel(miNivel));
    }
    return true;
  };
  const out: any[] = [];
  for (const c of cursos ?? []) {
    const j = _cursoJson(c, ins ?? [], yo);
    if (j.miInscripcion || (c.estado === 'abierto' && await paraMi(c))) out.push(j);
  }
  return { exito: true, cursos: out };
}

async function inscribirseCurso(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const { data: c } = await supabase.from('cursos').select('*').eq('id', String(params.cursoId ?? '')).eq('estado', 'abierto').maybeSingle();
  if (!c) return { exito: false, error: 'Las inscripciones de este curso están cerradas.' };
  const { data: ins } = await supabase.from('curso_inscripciones').select('username, estado').eq('curso_id', c.id).neq('estado', 'cancelada');
  if ((ins ?? []).some((i: any) => i.username === yo)) return { exito: false, error: 'Ya estás inscritx en este curso.' };
  if (c.cupo != null && (ins ?? []).length >= Number(c.cupo)) return { exito: false, error: 'El curso ya no tiene cupo.' };
  const gratis = !(Number(c.precio) > 0);
  const { data: r } = await supabase.from('reservas').insert({
    nombre_usuario: yo, tipo: 'curso', mes_texto: c.nombre, estado: gratis ? 'Confirmada' : 'Pendiente', monto: Number(c.precio) || 0,
    fecha_pago: _hoyEcuadorISO(), curso_id: c.id,
    medio_pago: /^[a-z0-9_-]{1,40}$/.test(String(params.medio ?? '')) ? String(params.medio) : null,
    medio_nombre: String(params.medioNombre ?? '').trim().slice(0, 60) || null,
    }).select('id').maybeSingle();
  if (!r) return { exito: false, error: 'No se pudo guardar.' };
  await supabase.from('curso_inscripciones').upsert({ curso_id: c.id, username: yo, estado: gratis ? 'confirmada' : 'pendiente', reserva_id: r?.id ?? null, resultado: null }, { onConflict: 'curso_id,username' });
  return { exito: true, id: gratis ? null : (r?.id ?? null), monto: Number(c.precio) || 0 };
}

async function adminCursos(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const accion = String(params.accion ?? 'listar');
  if (accion === 'guardar') {
    let c: any = params.curso;
    if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = null; } }
    if (!c || typeof c !== 'object') return { exito: false, error: 'Curso inválido.' };
    const nombre = String(c.nombre ?? '').trim().slice(0, 60);
    if (!nombre) return { exito: false, error: 'Ponle un nombre.' };
    const fechas = (Array.isArray(c.fechas) ? c.fechas : []).map((x: any) => ({
                        fecha: String(x?.fecha ?? '').slice(0, 10), hora: String(x?.hora ?? '').slice(0, 5), lugar: String(x?.lugar ?? '').slice(0, 80),
            tipo: ['clase', 'clinica', 'evaluacion'].includes(String(x?.tipo)) ? String(x.tipo) : 'clase',
      // Temas cortos de la clase (Victor, 2026-11-17): habilidades de la lista.
      ...(Array.isArray(x?.temas) && x.temas.length ? { temas: [...new Set(x.temas.map((t: any) => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 15) } : {}),
      ...(String(x?.titulo ?? '').trim() ? { titulo: String(x.titulo).trim().slice(0, 80) } : {}),
      ...(/^\d{2}:\d{2}$/.test(String(x?.termina ?? '')) ? { termina: String(x.termina) } : {}),
    } as any)).filter((x: any) => /^\d{4}-\d{2}-\d{2}$/.test(x.fecha)).sort((a: any, b: any) => a.fecha.localeCompare(b.fecha)).slice(0, 60);
        const abierto = c.abierto === true || c.abierto === 'true';
    if (!fechas.length && !abierto) return { exito: false, error: 'Agrega al menos una fecha.' };
        const fila: Record<string, any> = {
            nombre, tipo: c.tipo === 'clinica' ? 'clinica' : 'curso', descripcion: String(c.descripcion ?? '').trim().slice(0, 1000) || null, precio: Math.max(0, _num2(Number(c.precio) || 0)),
      cupo: c.cupo == null || c.cupo === '' ? null : Math.max(1, Math.round(Number(c.cupo))), fechas,
            equipo_destino: String(c.equipoDestino ?? '').trim().slice(0, 60) || null,
      cambia_equipo: c.cambiaEquipo === true || c.cambiaEquipo === 'true',
      // Evaluación: temas con su mínimo para aprobar (1 a 10, 5 por defecto).
      evaluacion: {
        temas: (Array.isArray(c.evaluacion?.temas) ? c.evaluacion.temas : []).map((t: any) => ({
          nombre: String(t?.nombre ?? '').trim().slice(0, 40), minimo: Math.max(1, Math.min(10, Math.round(Number(t?.minimo) || 5))),
        })).filter((t: any) => t.nombre).slice(0, 60),
      },
    };
    if (!fila.cambia_equipo) fila.equipo_destino = null;
    // Temas nuevos quedan en la lista de habilidades, para la ficha deportiva.
    const nombresTemas = new Set<string>([...fechas.flatMap((x: any) => x.temas ?? []), ...fila.evaluacion.temas.map((t: any) => t.nombre)]);
    if (nombresTemas.size) {
      const { data: hab } = await supabase.from('coach_habilidades').select('nombre');
      const ya = new Set((hab ?? []).map((h: any) => String(h.nombre).toLowerCase()));
      const nuevos = [...nombresTemas].filter((n) => !ya.has(n.toLowerCase()));
      if (nuevos.length) {
        const { data: mx } = await supabase.from('coach_habilidades').select('orden').order('orden', { ascending: false }).limit(1).maybeSingle();
        let o = (Number(mx?.orden) || 0) + 1;
        await supabase.from('coach_habilidades').insert(nuevos.map((n) => ({ categoria: 'Temas de cursos', nombre: n, activa: true, orden: o++ })));
      }
    }
        // Cada fecha es un evento "Curso" del calendario. Las fechas que no
    // cambian conservan su evento (y su asistencia); las quitadas se borran.
    const { data: antes } = c.id ? await supabase.from('cursos').select('fechas').eq('id', String(c.id)).maybeSingle() : { data: null };
        const clave = (x: any) => `${x.fecha}|${x.hora}|${x.lugar}|${x.termina ?? ''}|${x.titulo ?? ''}`;
    const previas = new Map<string, any>(((antes?.fechas as any[]) ?? []).map((x: any) => [clave(x), x.venueId]));
    const usados = new Set<string>();
    const { data: lugares } = await supabase.from('venues').select('lugar, google_maps, video_instructivo').not('google_maps', 'is', null);
    for (const x of fechas) {
      const previo = previas.get(clave(x));
      if (previo) { x.venueId = previo; usados.add(String(previo)); continue; }
      const ref = (lugares ?? []).find((l: any) => l.lugar === x.lugar);
      const { data: v } = await supabase.from('venues').insert({
        lugar: x.lugar || 'Por definir', google_maps: ref?.google_maps ?? null, video_instructivo: ref?.video_instructivo ?? null,
                tipo_icono: 'Curso', requiere_reserva: false, info_adicional: x.titulo ? `${nombre} · ${x.titulo}` : (x.tipo === 'evaluacion' ? `${nombre} · Evaluación final` : nombre),
        tipo: 'unico', fecha_referencia: x.fecha, inicia: x.hora || '09:00', ...(x.termina ? { finaliza: x.termina } : {}),
      }).select('id').maybeSingle();
      if (v?.id) x.venueId = v.id;
    }
        // Solo se borran fechas por venir: las pasadas guardan su asistencia.
    const hoyC = _hoyEcuadorISO();
    const quitados = ((antes?.fechas as any[]) ?? []).filter((x: any) => x.venueId && !usados.has(String(x.venueId)) && String(x.fecha) >= hoyC).map((x: any) => x.venueId);
    if (quitados.length) await supabase.from('venues').delete().in('id', quitados);
        // Para quién (Victor, 2026-11-17): toda la liga, equipos, un nivel o personas.
    const pTipo = ['todos', 'equipos', 'nivel', 'personas'].includes(String(c.para?.tipo)) ? String(c.para.tipo) : 'todos';
    fila.para = { tipo: pTipo, valores: pTipo === 'todos' ? [] : (Array.isArray(c.para?.valores) ? c.para.valores : []).map(String).slice(0, 100) };
    fila.temas = (Array.isArray(c.temas) ? c.temas : []).map((t: any) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 30);
    // Curso abierto: se repite cada semana hasta que se termina.
    fila.abierto = abierto;
    const { data: antesAb } = c.id ? await supabase.from('cursos').select('venue_repite').eq('id', String(c.id)).maybeSingle() : { data: null };
    if (abierto) {
      const diasOk = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const rep = c.repite ?? {};
      const dias = (Array.isArray(rep.dias) ? rep.dias : []).map(String).filter((d: string) => diasOk.includes(d));
      if (!dias.length) return { exito: false, error: 'Elige qué días se repite.' };
      fila.repite = {
        dias, hora: /^\d{2}:\d{2}$/.test(String(rep.hora)) ? rep.hora : '19:00', termina: /^\d{2}:\d{2}$/.test(String(rep.termina)) ? rep.termina : null,
        lugar: String(rep.lugar ?? '').trim().slice(0, 80),
      };
      const ref = (lugares ?? []).find((l: any) => l.lugar === fila.repite.lugar);
      const venue = {
        lugar: fila.repite.lugar || 'Por definir', dias: dias.join(', '), inicia: fila.repite.hora, ...(fila.repite.termina ? { finaliza: fila.repite.termina } : {}),
        tipo: 'Días de la semana', tipo_icono: 'Curso', requiere_reserva: false, info_adicional: nombre,
        google_maps: ref?.google_maps ?? null, video_instructivo: ref?.video_instructivo ?? null,
      };
      if (antesAb?.venue_repite) {
        await supabase.from('venues').update(venue).eq('id', antesAb.venue_repite);
        fila.venue_repite = antesAb.venue_repite;
      } else {
        const { data: v } = await supabase.from('venues').insert(venue).select('id').maybeSingle();
        fila.venue_repite = v?.id ?? null;
      }
    } else if (antesAb?.venue_repite) {
      await supabase.from('venues').delete().eq('id', antesAb.venue_repite);
      fila.venue_repite = null;
      fila.repite = null;
    }
    await supabase.rpc('regenerar_ventana_asistencias');
    const r = c.id ? await supabase.from('cursos').update(fila).eq('id', String(c.id)).select('id').single() : await supabase.from('cursos').insert(fila).select('id').single();
    if (r.error) return { exito: false, error: r.error.message };
    await _registrarAjuste('curso', null, fila, email);
        // Curso nuevo: aviso solo a quienes pueden tomarlo (Victor, 2026-11-17).
    // Para personas es una invitación; para el resto, "Curso nuevo".
    if (!c.id) {
      try {
        const destino = await _destinatariosCurso(fila.para, email);
        if (destino.length) {
          await sendPush({
            tipo: 'curso_nuevo', include_external_user_ids: destino,
            headings: { es: pTipo === 'personas' ? `Te invitaron a ${nombre}` : `Nuevo ${fila.tipo === 'clinica' ? 'clínica' : 'curso'}: ${nombre}` },
            contents: { es: 'Míralo en Calendario → Cursos y, si quieres, inscríbete.' }, url: APP_URL + '/?curso=' + r.data.id,
          });
        }
      } catch (e) { console.error('[cursos] aviso:', e); }
    }
      } else if (accion === 'guardarPlantilla') {
    // Plantilla: las clases (sin fechas) con sus temas y la evaluación (Victor, 2026-11-17).
    let pl: any = params.plantilla;
    if (typeof pl === 'string') { try { pl = JSON.parse(pl); } catch { pl = null; } }
    const nombre = String(pl?.nombre ?? '').trim().slice(0, 60);
    if (!nombre) return { exito: false, error: 'Ponle un nombre a la plantilla.' };
    const clases = (Array.isArray(pl?.clases) ? pl.clases : []).slice(0, 60).map((x: any) => ({
      tipo: x?.tipo === 'clinica' ? 'clinica' : 'clase',
      temas: (Array.isArray(x?.temas) ? x.temas : []).map((t: any) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 15),
    }));
    const evaluacion = { temas: (Array.isArray(pl?.evaluacion?.temas) ? pl.evaluacion.temas : []).map((t: any) => ({ nombre: String(t?.nombre ?? '').trim().slice(0, 40), minimo: Math.max(1, Math.min(10, Math.round(Number(t?.minimo) || 5))) })).filter((t: any) => t.nombre) };
    await supabase.from('curso_plantillas').insert({ nombre, tipo: pl?.tipo === 'clinica' ? 'clinica' : 'curso', descripcion: String(pl?.descripcion ?? '').trim().slice(0, 1000) || null, clases, evaluacion, creado_por: email });
  } else if (accion === 'borrarPlantilla') {
    await supabase.from('curso_plantillas').delete().eq('id', String(params.id ?? ''));
  } else if (accion === 'borrador') {
    // Curso a medio armar (Victor, 2026-11-27): uno por Pivot; sin datos se
    // descarta. Se ofrece «Reanudar» en Cursos y en Notificaciones.
    let datos: any = params.datos;
    if (typeof datos === 'string') { try { datos = datos ? JSON.parse(datos) : null; } catch { datos = null; } }
    if (!datos || typeof datos !== 'object') {
      await supabase.from('curso_borradores').delete().eq('creado_por', email);
    } else {
      const txt = JSON.stringify(datos);
      if (txt.length > 200000) return { exito: false, error: 'El borrador es demasiado grande.' };
      const username = (await supabase.from('equipo').select('username').ilike('email', email).maybeSingle()).data?.username ?? null;
      await supabase.from('curso_borradores').upsert({ creado_por: email, username, datos, actualizado_en: new Date().toISOString() }, { onConflict: 'liga_id,creado_por' });
    }
    return { exito: true };
  } else if (accion === 'evaluar') {
    // Evaluación por temas (Victor, 2026-11-17): aprueba si llega al mínimo
    // en cada tema. Cada tema queda en la ficha deportiva (logrado o en
    // proceso). Solo cambia de equipo si el curso lo dice.
    const { data: i } = await supabase.from('curso_inscripciones').select('*').eq('id', String(params.inscripcionId ?? '')).maybeSingle();
    if (!i) return { exito: false, error: 'Inscripción no encontrada.' };
    const { data: cu } = await supabase.from('cursos').select('nombre, evaluacion, cambia_equipo, equipo_destino').eq('id', i.curso_id).maybeSingle();
    let notas: Record<string, number> = {};
    try { notas = typeof params.notas === 'object' ? params.notas : JSON.parse(String(params.notas ?? '{}')); } catch { notas = {}; }
    const temas: any[] = cu?.evaluacion?.temas ?? [];
    const limpias: Record<string, number> = {};
    for (const t of temas) { const n = Math.round(Number(notas[t.nombre])); if (n >= 1 && n <= 10) limpias[t.nombre] = n; }
    if (!Object.keys(limpias).length) return { exito: false, error: 'Pon al menos una nota.' };
    const aprobado = temas.length > 0 && temas.every((t: any) => (limpias[t.nombre] ?? 0) >= (Number(t.minimo) || 5));
    await supabase.from('curso_inscripciones').update({ notas: limpias, resultado: aprobado ? 'aprobado' : 'no_aprobado', equipo_final: aprobado && cu?.cambia_equipo ? cu?.equipo_destino ?? null : null }).eq('id', i.id);
    const { data: hab } = await supabase.from('coach_habilidades').select('id, nombre');
    const quienEvalua = (await supabase.from('equipo').select('username').ilike('email', email).maybeSingle()).data?.username ?? email;
    const logrosAntes = await _completosDe(i.username);
    for (const t of temas) {
      const h = (hab ?? []).find((x: any) => String(x.nombre).toLowerCase() === String(t.nombre).toLowerCase());
      if (!h || limpias[t.nombre] == null) continue;
      await supabase.from('coach_evaluaciones').insert({ username: i.username, habilidad_id: h.id, nivel: limpias[t.nombre] >= (Number(t.minimo) || 5) ? 'logrado' : 'proceso', coach: quienEvalua });
    }
    await _avisarLogros(i.username, logrosAntes);
    if (aprobado && cu?.cambia_equipo && cu?.equipo_destino) {
      const { data: f } = await supabase.from('equipo').select('categoria').eq('username', i.username).maybeSingle();
      if (f && f.categoria !== cu.equipo_destino) {
        await supabase.from('equipo').update({ categoria: cu.equipo_destino }).eq('username', i.username);
        await supabase.from('historial_tier').upsert({ username: i.username, mes: _hoyEcuadorISO().slice(0, 7), tier_nombre: cu.equipo_destino }, { onConflict: 'username,mes' });
        await _avisarCambioEquipo(i.username, f.categoria, cu.equipo_destino);
      }
    }
    await sendPush({
      tipo: 'solicitud_resuelta', include_external_user_ids: [i.username],
      headings: { es: aprobado ? `¡Aprobaste ${cu?.nombre ?? 'el curso'}!` : `Resultado de ${cu?.nombre ?? 'tu curso'}` },
      contents: { es: aprobado ? 'Tus habilidades quedaron en tu ficha deportiva.' : 'Mira en tu ficha deportiva qué temas quedaron en proceso.' }, url: APP_URL + '/',
    }).catch(() => {});
    } else if (accion === 'estado') {
    const estado = ['abierto', 'cerrado', 'terminado'].includes(String(params.estado)) ? String(params.estado) : 'cerrado';
    // Terminar un curso abierto: deja de repetirse.
    if (estado === 'terminado') {
      const { data: cu } = await supabase.from('cursos').select('venue_repite').eq('id', String(params.id ?? '')).maybeSingle();
      if (cu?.venue_repite) {
        await supabase.from('venues').delete().eq('id', cu.venue_repite);
        await supabase.from('cursos').update({ venue_repite: null }).eq('id', String(params.id ?? ''));
        await supabase.rpc('regenerar_ventana_asistencias');
      }
    }
    await supabase.from('cursos').update({ estado }).eq('id', String(params.id ?? ''));
  } else if (accion === 'resultado') {
    // Try out: aprobado pasa al equipo elegido (queda en su historial y le llega la ventana de celebración).
    const { data: i } = await supabase.from('curso_inscripciones').select('*').eq('id', String(params.inscripcionId ?? '')).maybeSingle();
    if (!i) return { exito: false, error: 'Inscripción no encontrada.' };
    const aprobado = params.aprobado === true || params.aprobado === 'true';
    const equipo = String(params.equipo ?? '').trim();
    await supabase.from('curso_inscripciones').update({ resultado: aprobado ? 'aprobado' : 'no_aprobado', equipo_final: aprobado ? equipo || null : null }).eq('id', i.id);
    if (aprobado && equipo) {
      const { data: f } = await supabase.from('equipo').select('categoria').eq('username', i.username).maybeSingle();
      if (f && f.categoria !== equipo) {
        await supabase.from('equipo').update({ categoria: equipo }).eq('username', i.username);
        await supabase.from('historial_tier').upsert({ username: i.username, mes: _hoyEcuadorISO().slice(0, 7), tier_nombre: equipo }, { onConflict: 'username,mes' });
        await _avisarCambioEquipo(i.username, f.categoria, equipo);
      }
    }
    await sendPush({
      tipo: 'solicitud_resuelta', include_external_user_ids: [i.username], headings: { es: aprobado ? '¡Aprobaste la evaluación final!' : 'Resultado de la evaluación final' },
      contents: { es: aprobado ? (equipo ? `Desde ahora estás en ${equipo}. ¡Bienvenidx!` : '¡Felicitaciones!') : 'Esta vez no fue. Un Pivot te contará cómo seguir.' }, url: APP_URL + '/',
    }).catch(() => {});
  }
  const [{ data: cursos }, { data: ins }, { data: borr }] = await Promise.all([
    supabase.from('cursos').select('*').order('created_at', { ascending: false }),
    supabase.from('curso_inscripciones').select('*'),
    supabase.from('curso_borradores').select('datos, actualizado_en').eq('creado_por', email).maybeSingle(),
  ]);
  const quien = await _mapaEquipoPorNombre();
  return {
    exito: true,
    borrador: borr ? { datos: borr.datos, actualizado: borr.actualizado_en } : null,
    // Nivel de cada persona activa (Victor, 2026-11-27): para ver quiénes
    // están en un nivel al elegir a quién va dirigido un curso.
    nivelPersonas: await _nivelesDePersonas(),
    cursos: (cursos ?? []).map((c: any) => ({
      ..._cursoJson(c, ins ?? []),
      personas: (ins ?? []).filter((i: any) => i.curso_id === c.id && i.estado !== 'cancelada').map((i: any) => {
        const e = quien[String(i.username).trim().toUpperCase()] ?? {};
                return { id: i.id, nombre: i.username, nombreMostrar: e.nombreDerby || i.username, foto: e.fotoPerfil ?? '', estado: i.estado, resultado: i.resultado ?? null, equipo: i.equipo_final ?? null, notas: i.notas ?? null };
      }),
    })),
        // Lista de habilidades para elegir los temas de cada clase.
    habilidades: ((await supabase.from('coach_habilidades').select('id, categoria, nombre, nivel').eq('activa', true).order('orden')).data ?? []),
    plantillas: await _plantillasCursos(),
  };
}

async function adminGetAdmins(): Promise<any[]> {
  const { data } = await supabase.from('admins').select('email, invitado_por, fecha').order('email');
  const out: any[] = [{ email: ADMIN_PRINCIPAL, principal: true }];
  (data ?? []).forEach((r: any) => {
    if (r.email.toLowerCase() !== ADMIN_PRINCIPAL.toLowerCase()) {
      out.push({ email: r.email, principal: false, invitadoPor: r.invitado_por ?? '', fecha: r.fecha ?? '' });
    }
  });
  return out;
}

async function adminAgregarAdmin(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  // Bug real corregido -- "could not find 'fecha' column of 'admins' in
  // the schema cache": la tabla real (verificado contra Supabase) tiene
  // `email`/`invited_by`/`created_at` (con default propio) -- ni `fecha`
  // existe ni la columna de auditoría se llama `invitado_por`.
  const { error } = await supabase.from('admins').insert({ email: params.email.toLowerCase(), invited_by: adminEmail });
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

async function adminQuitarAdmin(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
    if (params.email.toLowerCase() === ADMIN_PRINCIPAL.toLowerCase()) return { exito: false, error: 'No se puede quitar al admin principal.' };
  if ((await _administradorxs()).length <= 1) return { exito: false, error: 'La liga no puede quedarse sin Pivots.' };
  await supabase.from('admins').delete().ilike('email', params.email);
  return { exito: true };
}

/**
 * Pivots y permisos (Mi Liga, 2026-11-13). Acciones:
 * - listar: Pivots con sus áreas (+ misAreas). Cualquier Pivot.
 * - misAreas: solo las áreas de quien pregunta.
 * - guardar {username, areas}: nombra o cambia áreas (requiere área 'liga').
 * - quitar {username}: nunca el principal, ni a sí mismx, ni al último Pivot.
 */
async function adminPivots(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const misAreas = await _areasDe(email);
  const accion = String(params.accion ?? 'listar');
  if (accion === 'misAreas') return { exito: true, misAreas, areas: AREAS_PIVOT };
  if (accion === 'listar') {
    const [pivots, filas] = await Promise.all([_administradorxs(), supabase.from('admins').select('email, areas')]);
    const areasPor: Record<string, string[] | null> = {};
    (filas.data ?? []).forEach((r: any) => { areasPor[String(r.email).toLowerCase()] = Array.isArray(r.areas) ? r.areas : null; });
    return {
      exito: true, misAreas, areas: AREAS_PIVOT,
      pivots: pivots.map((p) => ({
        username: p.username, nombre: p.nombre, foto: p.foto,
        principal: p.email === ADMIN_PRINCIPAL.toLowerCase(), yo: p.email === email.toLowerCase(),
        areas: p.email === ADMIN_PRINCIPAL.toLowerCase() ? AREAS_PIVOT : (areasPor[p.email] ?? AREAS_PIVOT),
      })),
    };
  }
  if (!misAreas.includes('liga')) return { exito: false, error: 'Necesitas el área "Liga y Pivots" para cambiar permisos.' };
  const { data: persona } = await supabase.from('equipo').select('username, email, nombre_derby').eq('username', String(params.username ?? '')).maybeSingle();
  if (!persona?.email) return { exito: false, error: 'Esa persona no tiene correo; sin correo no puede ser Pivot.' };
  const pe = String(persona.email).toLowerCase();
  if (accion === 'guardar') {
    if (pe === ADMIN_PRINCIPAL.toLowerCase()) return { exito: false, error: 'El Pivot principal tiene todas las áreas.' };
    let areas: string[] = [];
    try { areas = (Array.isArray(params.areas) ? params.areas : JSON.parse(String(params.areas ?? '[]'))).filter((a: string) => AREAS_PIVOT.includes(a)); } catch { areas = []; }
    if (!areas.length) return { exito: false, error: 'Elige al menos un área.' };
    const valor = areas.length === AREAS_PIVOT.length ? null : areas;
    const { data: ya } = await supabase.from('admins').select('email').ilike('email', pe).maybeSingle();
    const { error } = ya
      ? await supabase.from('admins').update({ areas: valor }).ilike('email', pe)
      : await supabase.from('admins').insert({ email: pe, invited_by: email, areas: valor });
    if (error) return { exito: false, error: error.message };
    if (!ya) {
      await sendPush({
        tipo: 'avisos_admin', include_external_user_ids: [persona.username],
        headings: { es: 'Ahora eres Pivot' }, contents: { es: 'Ya puedes ver y gestionar tus áreas en la app.' }, url: APP_URL,
      }).catch(() => {});
    }
    return { exito: true };
  }
  if (accion === 'quitar') {
    if (pe === ADMIN_PRINCIPAL.toLowerCase()) return { exito: false, error: 'No se puede quitar al Pivot principal.' };
    if (pe === email.toLowerCase()) return { exito: false, error: 'No puedes quitarte a ti mismx. Pídeselo a otro Pivot.' };
    if ((await _administradorxs()).length <= 1) return { exito: false, error: 'La liga no puede quedarse sin Pivots.' };
    await supabase.from('admins').delete().ilike('email', pe);
    return { exito: true };
  }
  return { exito: false, error: 'Acción desconocida.' };
}

async function adminGetCandidatosAdmin(): Promise<any[]> {
  const { data: equipo } = await supabase.from('equipo').select('username, email').is('eliminado_en', null).order('username');
  const { data: admins } = await supabase.from('admins').select('email');
  const adminEmails = new Set([(ADMIN_PRINCIPAL.toLowerCase()), ...(admins ?? []).map((a: any) => a.email.toLowerCase())]);
  return (equipo ?? []).filter((r: any) => {
    if (adminEmails.has((r.email ?? '').toLowerCase())) return false;
    return true;
  }).map((r: any) => ({ nombre: r.username, email: r.email }));
}

async function adminGetRosterEquipo(): Promise<Record<string, any>> {
  const { data } = await supabase.from('equipo').select('username, nombre_derby, foto_perfil').is('eliminado_en', null).order('username');
  const personas = (data ?? []).map((r: any) => ({ nombre: r.username, nombreDerby: r.nombre_derby ?? '', fotoPerfil: r.foto_perfil ?? '' }));
  if (!personas.length) return { personas };
  // `ultimaAsistencia` (bug real "usuarios inactivos siguen en la lista de
  // toma de asistencia", ver MANIFEST.md) vía `_ultimaAsistenciaRealPorUsuario()`
  // (helper compartido con getEquipo()/adminBuscarPersonasParaEvento(), ver
  // ese comentario arriba en este archivo -- cuenta `'Admin'` Y `'Externa'`,
  // normaliza nombres, nunca RSVP). `_evEsInactivo()`/js/eventos.js filtra
  // el roster de "Marcar asistencia" con este campo, mismo criterio de 30
  // días que `_eqEstadoEfectivo()`/js/equipo.js.
  const ultimaPorUsuario = await _ultimaAsistenciaRealPorUsuario();
  personas.forEach((p: any) => { const u = _ultimaAsistenciaDe(ultimaPorUsuario, p.nombre); p.ultimaAsistencia = u ? u.slice(0, 10) : null; });
  return { personas };
}

// ─── Acciones: Equipo (Cambio 55, roster real -- ver MANIFEST.md "Auditoría
// previa" para el detalle completo de qué columnas existen/faltaban) ───────────
// Sin token requerido -- mismo criterio que getNombres()/getProximosEntrenamientos()
// (arriba): la sección Equipo es un directorio visible para cualquier cuenta
// logueada, no admin-only, y esta app no valida sesión en la mayoría de sus
// acciones de solo-lectura.
async function getEquipo(params: Record<string, any> = {}): Promise<Record<string, any>> {
  // Campos confidenciales, SOLO con `adminToken` válido (ver MANIFEST.md --
  // "campos restringidos a admin"): `exentaCuota` (dato de cuota, sensible),
  // `esAdminMiembro` y `solicitudLesionPendiente`. Cualquier otra sesión
  // (token de usuarix, o sin token) recibe el roster SIN esas claves.
  const vistaAdmin = params.adminToken ? !!(await _validarAdminToken(String(params.adminToken))) : false;
  const { data: filas } = await supabase.from('equipo')
        .select('username, nombre_derby, numero_derby, foto_perfil, categoria, pronombres, prefijo, telefono, email, estado_miembro, solicitud_lesion_pendiente, tier_modo, exenta_cuota, personal_liga, horas_ano, asistencias_ano, total_eventos_ano, termometro_pct, fecha_ingreso, necesita_patines, necesita_protecciones, puntos_anteriores, racha_actual, tier_riesgo_desde, tier_riesgo_hasta, tier_riesgo_objetivo, viaje_desde, viaje_hasta, roles, fecha_nacimiento, fecha_publica, cupon_disponible, cupon_descuento, avisos')
    .is('eliminado_en', null)
    .order('username');
  const personas = filas ?? [];
  if (!personas.length) return { personas: [] };

  const usernames = personas.map((p: any) => p.username);

  // Última asistencia REAL (no solicitada/rectificada por el usuario) --
  // `_ultimaAsistenciaRealPorUsuario()` (helper compartido, ver ese
  // comentario arriba en este archivo): cuenta origen 'Admin' (rollcall
  // real) Y 'Externa' (asistencia real a un evento fuera del calendario del
  // equipo -- bug real corregido, ver MANIFEST.md -- "Victor/Tormento
  // aparecen inactivos pese a asistir a eventos externos recientes"),
  // estado != 'Ninguno' (no ausente), nunca RSVP.
  const ultimaPorUsuario = await _ultimaAsistenciaRealPorUsuario();

  // Puntos mensuales (Bug/feature "exponer puntos en getEquipo()", ver
  // MANIFEST.md/CHANGELOG.md) -- `js/equipo.js` ya tenía las stat cards
  // "Puntos por tareas"/"Puntos por asistencia" armadas (`p.puntosTareas`/
  // `p.puntosAsistencia`) mostrando "—" porque este endpoint nunca las
  // devolvía. `puntos_total` es columna GENERATED (suma de las otras 4,
  // Postgres la calcula solo -- nunca escribirla a mano).
  //
  // Período de puntaje (feat nueva, "Filtros" en Equipo, ver MANIFEST.md/
  // CHANGELOG.md) -- `puntosAsistencia`/`puntosTareas`/`puntosTotal` ahora
  // reflejan el período pedido (afecta tanto las stat cards de la lista
  // como el perfil de detalle, que leen los mismos 3 campos), en vez de
  // estar fijos al mes actual. Prioridad si se manda más de un modo a la
  // vez: histórico > rango > mes específico > default (mes/año actuales,
  // comportamiento de siempre si no se manda ningún parámetro).
  // `puntosAnio` NO cambia con este filtro -- sigue siendo el acumulado del
  // año calendario real, sin usarse hoy en ningún render (campo defensivo
  // agregado para cuando haga falta), así que no hay razón para
  // complicarlo con el mismo período que los otros 3.
  const hoy = new Date();
  const anioActual = hoy.getUTCFullYear();
  const mesActual = hoy.getUTCMonth() + 1;
  let desdePeriodo: string; let hastaPeriodo: string;
  const esHistorico = params.historico === true || params.historico === 'true';
  const primerDiaSiguiente = function(anio: number, mes: number): string {
    const a = mes === 12 ? anio + 1 : anio;
    const m = mes === 12 ? 1 : mes + 1;
    return a + '-' + String(m).padStart(2, '0') + '-01';
  };
  if (esHistorico) {
    desdePeriodo = '1900-01-01';
    hastaPeriodo = '2999-01-01';
  } else if (params.mesDesde && params.mesHasta && params.anioDesde && params.anioHasta) {
    const anioDesde = Number(params.anioDesde), mesDesde = Number(params.mesDesde);
    const anioHasta = Number(params.anioHasta), mesHasta = Number(params.mesHasta);
    desdePeriodo = anioDesde + '-' + String(mesDesde).padStart(2, '0') + '-01';
    hastaPeriodo = primerDiaSiguiente(anioHasta, mesHasta);
  } else if (params.mes && params.anio) {
    const m = Number(params.mes), a = Number(params.anio);
    desdePeriodo = a + '-' + String(m).padStart(2, '0') + '-01';
    hastaPeriodo = primerDiaSiguiente(a, m);
  } else {
    desdePeriodo = anioActual + '-' + String(mesActual).padStart(2, '0') + '-01';
    hastaPeriodo = primerDiaSiguiente(anioActual, mesActual);
  }
  // Sin `.eq('anio', ...)` a nivel de query -- un rango o el histórico
  // pueden cruzar años, así que el filtro real de período se aplica abajo
  // comparando fechas de calendario completas (`anio-mes-01`), no por año
  // suelto.
  const { data: puntosData } = await supabase.from('puntos_mensuales')
    .select('nombre_usuario, anio, mes, puntos_asistencia, puntos_tareas, puntos_bonificacion, puntos_extra, puntos_total')
    .in('nombre_usuario', usernames);
  // `racha` = `puntos_bonificacion` + `puntos_extra` combinados (feat
  // nueva, ver MANIFEST.md/CHANGELOG.md -- "el total no cierra con el
  // desglose mostrado, falta una línea de puntos por racha") -- 2 columnas
  // reales para el MISMO concepto (bonus de racha de asistencias
  // consecutivas), de 2 sistemas distintos en el tiempo: `puntos_bonificacion`
  // es el bonus de racha que escribía el backend legado (Code.gs, sin
  // ningún escritor en ESTE repo, pero con datos reales de antes de la
  // migración -- confirmado contra la DB real, Ene-Ago 2026) y `puntos_extra`
  // es el mismo concepto desde que la racha se migró a este backend
  // (`_acreditarPuntosExtra()`/`_reconstruirRachasHistoricas()`, ver
  // "Racha de asistencias" más abajo) -- Ago 2026 tiene datos en AMBAS
  // columnas a la vez (mes de transición), confirmado contra la DB real.
  // Ninguna de las 2 se exponía suelta hasta ahora -- solo entraban
  // mezcladas, sin desglosar, dentro de `puntos_total` (columna GENERATED,
  // suma de las 4), así que cualquier UI que armara "Asistencia + Tareas"
  // como desglose del total nunca cerraba para alguien con racha activa.
  const puntosPeriodoPorUsuario: Record<string, { asistencia: number; tareas: number; racha: number; total: number }> = {};
  const puntosAnioPorUsuario: Record<string, number> = {};
  (puntosData ?? []).forEach((p: any) => {
    if (Number(p.anio) === anioActual) {
      puntosAnioPorUsuario[p.nombre_usuario] = (puntosAnioPorUsuario[p.nombre_usuario] || 0) + (Number(p.puntos_total) || 0);
    }
    const fechaFila = p.anio + '-' + String(p.mes).padStart(2, '0') + '-01';
    if (fechaFila >= desdePeriodo && fechaFila < hastaPeriodo) {
      if (!puntosPeriodoPorUsuario[p.nombre_usuario]) puntosPeriodoPorUsuario[p.nombre_usuario] = { asistencia: 0, tareas: 0, racha: 0, total: 0 };
      puntosPeriodoPorUsuario[p.nombre_usuario].asistencia += Number(p.puntos_asistencia) || 0;
      puntosPeriodoPorUsuario[p.nombre_usuario].tareas += Number(p.puntos_tareas) || 0;
      puntosPeriodoPorUsuario[p.nombre_usuario].racha += (Number(p.puntos_bonificacion) || 0) + (Number(p.puntos_extra) || 0);
      puntosPeriodoPorUsuario[p.nombre_usuario].total += Number(p.puntos_total) || 0;
    }
  });

  // Puntos por asistencia -- LIVE desde `log_asistencias`, NO el agregado
  // guardado en `puntos_mensuales.puntos_asistencia` (bug real corregido,
  // ver MANIFEST.md -- "card 'Asistencia' de Mis estadísticas muestra 1,
  // el detalle 'Puntos por asistencia' muestra 2"): esa columna SOLO se
  // escribe por `recalcularPuntosAsistencia()` (acción manual "Recalcular
  // ahora") -- a diferencia de `puntos_extra`/`racha_actual` (arriba en
  // este archivo, `adminMarcarAsistencia()`), que SÍ se acreditan en vivo
  // en cada marca real, `puntos_asistencia` queda desactualizada apenas se
  // marca/corrige una asistencia DESPUÉS del último recálculo manual --
  // mientras tanto, `getDesglosePuntos()` (el detalle, más abajo en este
  // archivo) siempre recalcula en vivo desde `log_asistencias`, así que los
  // 2 números se desalinean. Mismo criterio EXACTO de de-duplicación
  // (última marca real por evento+persona, por `marca_temporal`) que
  // `getDesglosePuntos()`/concepto `'asistencia'`, para que coincidan
  // siempre -- sin `.in()` (mismo motivo ya documentado en este archivo
  // para `log_asistencias`, evita el truncado por el límite de 1000 filas
  // de PostgREST). Solo toca `puntosAsistencia` -- `puntosTareas`/
  // `puntosRacha`/`puntosTotal` siguen leyendo el agregado guardado, sin
  // cambios (no reportados como desalineados).
  const { data: logsAsistenciaPeriodo } = await supabase.from('log_asistencias')
    .select('nombre_usuario, id_evento, estado, fecha_entrenamiento, marca_temporal')
    .in('origen', ['Admin', 'Externa']) // mismo criterio que recalcularPuntosAsistencia()
    .gte('fecha_entrenamiento', desdePeriodo).lt('fecha_entrenamiento', hastaPeriodo);
  const ultimaPorClaveAsistencia: Record<string, { estado: string; nombre_usuario: string; marca: number; fecha: string }> = {};
  (logsAsistenciaPeriodo ?? []).forEach((l: any) => {
    const u = String(l.nombre_usuario ?? '').trim();
    if (!u) return;
    const clave = l.id_evento + '|' + u;
    const marca = l.marca_temporal ? new Date(l.marca_temporal).getTime() : 0;
    const actual = ultimaPorClaveAsistencia[clave];
    if (!actual || marca >= actual.marca) ultimaPorClaveAsistencia[clave] = { estado: l.estado, nombre_usuario: u, marca, fecha: String(l.fecha_entrenamiento ?? '').slice(0, 10) };
  });
      // Presentes hoy (botón de emergencia, Victor 2026-11-07): última marca de
  // hoy (hora de Ecuador) "A tiempo" o "Tarde" en algún evento.
  const hoyEcuador = new Date(Date.now() - 5 * 3600 * 1000).toISOString().substring(0, 10);
  const { data: logsHoy } = await supabase.from('log_asistencias')
    .select('nombre_usuario, id_evento, estado, marca_temporal')
    .in('origen', ['Admin', 'Externa']).eq('fecha_entrenamiento', hoyEcuador);
  const ultimaHoy: Record<string, { estado: string; marca: number }> = {};
  (logsHoy ?? []).forEach((l: any) => {
    const u = String(l.nombre_usuario ?? '').trim();
    if (!u) return;
    const clave = l.id_evento + '|' + u;
    const marca = l.marca_temporal ? new Date(l.marca_temporal).getTime() : 0;
    if (!ultimaHoy[clave] || marca >= ultimaHoy[clave].marca) ultimaHoy[clave] = { estado: l.estado, marca };
  });
  const presentesHoy = new Set(Object.keys(ultimaHoy).filter((k) => ultimaHoy[k].estado === 'A tiempo' || ultimaHoy[k].estado === 'Tarde').map((k) => k.split('|').slice(1).join('|')));
  const puntosAsistenciaLivePorUsuario: Record<string, number> = {};
    const versionesLive = await _versionesPuntos();
  const eqLive = await _equipoEnMes(versionesLive);
  // Asistencia del período (app, dato de la fila de Equipo, 2026-11-07):
  // veces que vino (a tiempo o tarde) sobre los eventos con asistencia tomada.
  const asistenciasPeriodoPorUsuario: Record<string, number> = {};
  const eventosConAsistencia = new Set((logsAsistenciaPeriodo ?? []).map((l: any) => String(l.id_evento)));
  Object.keys(ultimaPorClaveAsistencia).forEach((clave) => {
    const l = ultimaPorClaveAsistencia[clave];
    if (l.estado === 'A tiempo' || l.estado === 'Tarde') asistenciasPeriodoPorUsuario[l.nombre_usuario] = (asistenciasPeriodoPorUsuario[l.nombre_usuario] || 0) + 1;
        const vm = _valorMarca(l.estado, l.fecha, versionesLive, eqLive(l.nombre_usuario, l.fecha));
    if (vm) puntosAsistenciaLivePorUsuario[l.nombre_usuario] = (puntosAsistenciaLivePorUsuario[l.nombre_usuario] || 0) + vm;
  });

  // Tendencia de termómetro, hoy vs. hace 1 mes (feat re-hecha, ver
  // MANIFEST.md -- la 1ra versión comparaba puntosAsistencia+puntosTareas
  // del mes actual/anterior; pedido explícito de reemplazarla por "el mismo
  // valor que usa el termómetro", NO los puntos del mes). El termómetro real
  // (`equipo.termometro_pct`, poblado por `calcularTermometroPct()` en
  // `recalcular-categorias/index.ts`) es un snapshot que se pisa cada vez
  // que corre ese recálculo -- no existe ninguna columna con el valor de
  // hace un mes para comparar. En vez de sumar una columna/migración nueva
  // para guardar historial, esta función RE-EJECUTA la misma fórmula
  // (puerto 1:1 de `calcularTermometroPct()`/`contarClases()`/
  // `sumarPuntos()`, mismo archivo de arriba) 2 veces con una fecha de
  // referencia distinta ("hoy" y "hace 1 mes") -- da el valor real que el
  // termómetro tendría en cada momento, sin depender de si
  // "Recalcular ahora" corrió recientemente. Sin período/filtro de la UI
  // (a diferencia de puntosAsistencia/puntosTareas/puntosTotal arriba): el
  // termómetro nunca dependió del filtro de período de puntaje, así que su
  // tendencia tampoco -- se calcula siempre, en cualquier modo (mes/rango/
  // histórico).
  const fechaISO = (d: Date): string => d.toISOString().slice(0, 10);
  // "n meses atrás desde una fecha de referencia" -- puerto directo de
  // primerDiaMesesAtras()/recalcular-categorias/index.ts, parametrizado por
  // `refDate` (ahí siempre era "hoy") para poder pedir la ventana del
  // termómetro tanto desde "hoy" como desde una fecha de referencia distinta
  // (`contarClases()`/`calcularTermometroPctAsOf()`, más abajo) -- sin
  // duplicar la aritmética de fin-de-mes.
  const primerDiaMesesAtras = (refDate: Date, n: number): Date => {
    const year = refDate.getUTCFullYear();
    const month = refDate.getUTCMonth() - n;
    const dia = Math.min(refDate.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
    return new Date(Date.UTC(year, month, dia));
  };
  const nombresDe = (s: string | null | undefined): string[] =>
    String(s ?? '').split(',').map((n: string) => n.trim().toUpperCase()).filter(Boolean);
  const { data: tiersData } = await supabase.from('config_tiers').select('*').order('orden', { ascending: true });
  const tiers = tiersData ?? [];
  // Puntos efectivos (Parte 6, ver MANIFEST.md) -- mapa nombre de tier ->
  // ¿divide los puntos a la mitad en display/ranking? Reusa este MISMO
  // fetch de `config_tiers` (ya se pedía acá para el termómetro/tendencia,
  // arriba) en vez de una consulta aparte.
  const dividirMitadPorTier: Record<string, boolean> = {};
  tiers.forEach((t: any) => { dividirMitadPorTier[t.nombre] = t.dividir_puntos_mitad === true; });
  // Fondos de viaje (Parte 7) -- 1 sola consulta a `historial_tier` para
  // TODO el roster (`_calificaFondosViajePorUsuarios()`, cerca de
  // getFondosViajeConfig() más arriba en este archivo), no una por persona.
  const calificaFondosViajePorUsuario = await _calificaFondosViajePorUsuarios(usernames);
  const tierDefaultTermometro = tiers.find((t: any) => t.es_default === true);
  const tiersNoDefaultTermometro = tierDefaultTermometro
    ? tiers.filter((t: any) => t.id !== tierDefaultTermometro.id).sort((a: any, b: any) => a.orden - b.orden)
    : [];
  // "Tier techo" -- mismo criterio que calcularTermometroPct()/
  // recalcular-categorias/index.ts: 'Quindes' por nombre si existe, si no
  // el primero de los no-default (ya ordenados por `orden`).
  const tierTecho = tiersNoDefaultTermometro.find((t: any) => t.nombre === 'Quindes') ?? tiersNoDefaultTermometro[0] ?? null;
  const ventanaMesesTecho = tierTecho ? (Number(tierTecho.ventana_meses) || 0) : 0;
  // Ventana ancha (`ventanaMesesTecho + 1` meses atrás desde HOY) para cubrir
  // en un solo fetch tanto la ventana de "hoy" ([hoy−ventana, hoy)) como la
  // de "hace 7 días" ([haceSieteDías−ventana, haceSieteDías)), apenas más
  // angosta -- contarClases()/huboClaseUltimos7Dias() de abajo filtran la
  // porción exacta de cada una sobre este mismo array, sin pedirle a la DB
  // 2 veces.
  const { data: asistDataTermometro } = await supabase.from('asistencias')
    .select('fecha, a_horario, tarde')
    .not('estado', 'in', '("Evento Cancelado","No se entrena","Eliminado")')
    .gte('fecha', fechaISO(primerDiaMesesAtras(hoy, ventanaMesesTecho + 1)))
    .lt('fecha', fechaISO(hoy));
  const contarClases = (username: string, asOf: Date): number => {
    const desde = fechaISO(primerDiaMesesAtras(asOf, ventanaMesesTecho));
    const hasta = fechaISO(asOf);
    const u = username.trim().toUpperCase();
    let n = 0;
    for (const fila of asistDataTermometro ?? []) {
      if (!fila.fecha || fila.fecha < desde || fila.fecha >= hasta) continue;
      if (nombresDe(fila.a_horario).includes(u) || nombresDe(fila.tarde).includes(u)) n++;
    }
    return n;
  };
  // `puntos_total` (no `puntos_asistencia+puntos_tareas`) -- mismo campo
  // que usa sumarPuntos()/recalcular-categorias/index.ts para el
  // termómetro real, a propósito distinto del criterio que usa
  // `puntosPeriodoPorUsuario` de arriba (esa sí es solo asistencia+tareas,
  // por pedido explícito de esa feature -- 2 cálculos distintos, cada uno
  // fiel a su propia fuente real).
  const sumarPuntosTermometro = (username: string, asOfIdx: number): number => {
    let total = 0;
    for (const fila of puntosData ?? []) {
      if (fila.nombre_usuario !== username) continue;
      const idxFila = Number(fila.anio) * 12 + (Number(fila.mes) - 1);
      const diff = asOfIdx - idxFila;
      if (diff < 0 || diff > ventanaMesesTecho) continue;
      total += Number(fila.puntos_total) || 0;
    }
    return total;
  };
  const calcularTermometroPctAsOf = (username: string, asOf: Date, asOfIdx: number): number => {
    if (!tierTecho) return 0;
    const clases = contarClases(username, asOf);
    const puntos = sumarPuntosTermometro(username, asOfIdx);
    const minClases = Number(tierTecho.min_clases) || 0;
    const minPuntos = Number(tierTecho.min_puntos) || 0;
    const ratios: number[] = [];
    if (minClases > 0) ratios.push(clases / minClases);
    if (minPuntos > 0) ratios.push(puntos / minPuntos);
    if (!ratios.length) return 0;
    const combinado = tierTecho.logica === 'Y' ? Math.min(...ratios) : Math.max(...ratios);
    return Math.min(100, Math.max(0, combinado * 100));
  };
  // `tendencia` por persona ('sube'/ausente = no subió o sin datos recientes)
  // -- calculada acá, aparte, en vez de inline en `personasOut` más abajo
  // (mismo criterio que `puntosPeriodoPorUsuario`/`puntosAnioPorUsuario`: un
  // objeto de una sola expresión por persona).
  //
  // Re-hecho (bug real, ver MANIFEST.md -- "chevron de ascenso para alguien
  // que no entrena hace 2 semanas"): la versión anterior comparaba el
  // termómetro de "hoy" contra "hace 1 mes", ambos con ventana móvil de
  // `ventanaMesesTecho` (1 mes) -- alguien que dejó de venir podía seguir
  // viendo 'sube' semanas después de su última asistencia real, porque sus
  // marcas viejas se iban "acomodando" distinto dentro de las 2 ventanas
  // comparadas sin que hubiera pasado nada nuevo (caso real confirmado
  // contra producción). Pedido explícito: el chevron debe reflejar
  // actividad de la ÚLTIMA SEMANA, no una tendencia de mes contra mes.
  // Nueva regla: 'sube' solo si (a) hubo al menos una clase real en los
  // últimos 7 días (`huboClaseUltimos7Dias()`, abajo) Y (b) el termómetro
  // "hoy" es estrictamente mayor que el termómetro "hace 7 días" (mismas
  // `calcularTermometroPctAsOf()`/`contarClases()` de arriba, evaluadas con
  // `asOf` de 7 días atrás en vez de 1 mes atrás). Sin datos en los últimos
  // 7 días, o termómetro igual/menor -- sin chevron (ya no existe un estado
  // 'baja': nunca se muestra en la UI desde el commit que lo sacó, ver
  // js/equipo.js/_eqTendenciaBadgeHtml(), así que ni vale la pena
  // calcularlo acá).
  const idxDeFecha = (d: Date): number => d.getUTCFullYear() * 12 + d.getUTCMonth();
  const haceSieteDias = new Date(hoy);
  haceSieteDias.setUTCDate(haceSieteDias.getUTCDate() - 7);
  const huboClaseUltimos7Dias = (username: string): boolean => {
    const desde = fechaISO(haceSieteDias);
    const hasta = fechaISO(hoy);
    const u = username.trim().toUpperCase();
    for (const fila of asistDataTermometro ?? []) {
      if (!fila.fecha || fila.fecha < desde || fila.fecha >= hasta) continue;
      if (nombresDe(fila.a_horario).includes(u) || nombresDe(fila.tarde).includes(u)) return true;
    }
    return false;
  };
  const tendenciaPorUsuario: Record<string, 'sube'> = {};
  if (tierTecho) {
    usernames.forEach((u: string) => {
      if (!huboClaseUltimos7Dias(u)) return; // sin actividad en la última semana -- sin chevron, sin importar el histórico
      const actualPct = calcularTermometroPctAsOf(u, hoy, idxDeFecha(hoy));
      const pctHaceSieteDias = calcularTermometroPctAsOf(u, haceSieteDias, idxDeFecha(haceSieteDias));
      if (actualPct > pctHaceSieteDias) tendenciaPorUsuario[u] = 'sube';
      // Igual o menor -- queda sin entrada, `personasOut` la traduce a `null` (mismo criterio de siempre).
    });
  }

  // "Es admin de miembro" -- no existe ningún flag por miembro en `equipo`;
  // el admin real de esta app vive en la tabla `admins` + ADMIN_PRINCIPAL,
  // mismo criterio ya usado por adminGetCandidatosAdmin() (arriba).
  const { data: adminsData } = await supabase.from('admins').select('email');
  const adminEmails = new Set([ADMIN_PRINCIPAL.toLowerCase(), ...(adminsData ?? []).map((a: any) => a.email.toLowerCase())]);

  // horas_ano/asistencias_ano/total_eventos_ano: columnas reales desde el
  // Cambio 58 (migración 20260829_stats_equipo.sql), pobladas por
  // recalcularStatsEquipo() (arriba) -- se devuelven tal cual (snake_case,
  // mismo criterio que `estado_miembro` en getDatosCompletos()/Cambio 54: el
  // frontend las consume así de directo, sin traducir a camelCase, ver
  // _datosRenderStatsHtml()/js/perfil.js y _eqPerfilContenidoHtml()/js/equipo.js).
  // `termometro_pct` (Cambio 59, migración 20260829_termometro.sql): real
  // desde entonces, poblada por calcularTermometroPct()/
  // recalcular-categorias/index.ts junto con `categoria` en el mismo
  // UPDATE -- reemplaza el `rankPct: 0` fijo del Cambio 55. Mismo criterio
  // snake_case que horas_ano/asistencias_ano/total_eventos_ano (arriba): el
  // frontend la consume tal cual, sin traducir a camelCase.
  // `prefijo`/`fechaIngreso` (Cambio 61): faltaban en el shape de esta
  // función -- `prefijo` es el campo real con el código de país (formato
  // "🇦🇷 +54 (Argentina)", ver inscripcion.js), sin el cual el botón de
  // WhatsApp del perfil de Equipo (`_eqWhatsappUrl()`/js/equipo.js) arma un
  // link sin código de país para cualquier cuenta real. `fechaIngreso` ya
  // viajaba para la cuenta propia (getDatosCompletos()) pero no para el
  // resto del roster.
  // Diagnóstico temporal (bug real "puntosTotal histórico no sumaba
  // puntos_anteriores en el frontend pese a que la lógica de abajo ya la
  // suma"): la causa real terminó siendo que el Edge Function desplegado
  // en Supabase quedaba desactualizado tras cada `git push` -- este repo
  // NO tiene CI que redeploye funciones (confirmado: no hay `.github/`),
  // el deploy es manual (`supabase functions deploy api --project-ref
  // uusbnreitoobqssizbfq`, ver MANIFEST.md sección 8) y quedaba pendiente.
  // Este log confirma en los logs reales del Edge Function (`supabase
  // functions logs api`) qué valor de `puntos_anteriores` llegó de la DB
  // y con qué queda `puntosTotal`, para poder verificar post-deploy sin
  // adivinar. Sacar si ya no hace falta seguir confirmando esto.
  if (esHistorico) {
    console.log('[getEquipo][historico] equipo.puntos_anteriores por persona:',
      JSON.stringify(personas.map((r: any) => ({ username: r.username, puntos_anteriores_raw: r.puntos_anteriores, puntos_anteriores_num: Number(r.puntos_anteriores) || 0 }))));
  }

  // Ruptura automática de racha (feat nueva, ver MANIFEST.md/CHANGELOG.md --
  // "racha congelada para quien dejó de venir"): `equipo.racha_actual` solo
  // se resetea a 0 cuando un admin marca 'Ninguno' A MANO -- si la persona
  // simplemente dejó de venir y nadie volvió a tomarle lista (ni con
  // 'Ninguno'), el contador queda congelado en su último valor PARA SIEMPRE
  // (caso real confirmado contra producción: "Gringa la Vikinga", racha=4
  // casi 2 semanas después de su última asistencia real, sin un solo
  // 'Ninguno' de por medio). Corrección: antes de exponer `rachaActual`, se
  // verifica si hubo algún entrenamiento real DISPONIBLE (no cancelado, ya
  // ocurrido) después de la última asistencia real de la persona
  // (`ultimaPorUsuario`, ya calculado arriba para otro fin) -- si lo hubo,
  // esa persona faltó a un entrenamiento sin que quedara registrado como
  // tal, así que la racha real es 0 sin importar lo que diga la columna.
  // `fechaUltimoEventoDisponible` = fecha del entrenamiento real más
  // reciente ya ocurrido -- reusa `asistDataTermometro` (ya filtrado a
  // no-cancelados/no-"No se entrena", ya fetcheado arriba para el
  // termómetro/chevron, sin pedir la DB de nuevo): si esa fecha es
  // POSTERIOR a la última asistencia real de la persona, hay un hueco sin
  // marcar. Esto solo corrige lo que se MUESTRA en este endpoint -- el
  // valor persistido en `equipo.racha_actual` se corrige aparte, de forma
  // consistente, en `_reconstruirRachasHistoricas()` (ver ese comentario,
  // más abajo en este archivo), que sí lo sobreescribe.
  let fechaUltimoEventoDisponible: string | null = null;
  (asistDataTermometro ?? []).forEach((fila: any) => {
    if (!fila.fecha) return;
    if (!fechaUltimoEventoDisponible || fila.fecha > fechaUltimoEventoDisponible) fechaUltimoEventoDisponible = fila.fecha;
  });
  const rachaEfectiva = (username: string, rachaCruda: number): number => {
    if (!rachaCruda || !fechaUltimoEventoDisponible) return rachaCruda;
    const ultima = ultimaPorUsuario[username];
    if (!ultima) return 0; // nunca tuvo una asistencia real -- no debería tener racha > 0, pero por las dudas
    return ultima.slice(0, 10) < (fechaUltimoEventoDisponible as string) ? 0 : rachaCruda;
  };

  // Coaches aprobadxs (Victor, 2026-11-22): Liga → Gente → Coaches.
  const { data: coachesRows } = await supabase.from('coaches').select('username').eq('estado', 'aprobado');
  const coachesSet = new Set((coachesRows ?? []).map((c: any) => String(c.username)));
  const personasOut = personas.map((r: any) => ({
    id: r.username, nombre: r.username, username: r.username,
    esCoach: coachesSet.has(String(r.username)),
    nombreDerby: r.nombre_derby ?? '', numeroDerby: r.numero_derby ?? '',
    fotoPerfil: r.foto_perfil ?? '', rol: r.categoria ?? 'Mirlxs',
    pronombres: r.pronombres ?? '', prefijo: r.prefijo ?? '', telefono: r.telefono ?? '', email: r.email ?? '',
    fechaIngreso: r.fecha_ingreso ?? null,
    estado: r.estado_miembro ?? 'Activx',
    viajeDesde: r.viaje_desde ?? null, viajeHasta: r.viaje_hasta ?? null,
    tierModo: r.tier_modo ?? 'auto',
    personalLiga: r.personal_liga === true,
    ...(vistaAdmin ? {
      solicitudLesionPendiente: r.solicitud_lesion_pendiente === true,
            exentaCuota: r.exenta_cuota === true,
      cuponDisponible: r.cupon_disponible === true,
      cuponDescuento: r.cupon_descuento ?? null,
            esAdminMiembro: adminEmails.has(String(r.email ?? '').toLowerCase()),
      // Notificaciones apagadas (lo informa la app al abrirse).
      avisosApagados: r.avisos != null && r.avisos !== 'activos',
    } : {}),
        // Roles en el equipo y cumpleaños (solo "mm-dd" y solo si es público).
    roles: Array.isArray(r.roles) ? r.roles : [],
    cumple: r.fecha_publica === 'Sí' && r.fecha_nacimiento ? String(r.fecha_nacimiento).substring(5, 10) : null,
        asistenciasPeriodo: asistenciasPeriodoPorUsuario[r.username] || 0,
    presenteHoy: presentesHoy.has(r.username),
    eventosPeriodo: eventosConAsistencia.size,
    horas_ano: Number(r.horas_ano) || 0,
    asistencias_ano: Number(r.asistencias_ano) || 0,
    total_eventos_ano: Number(r.total_eventos_ano) || 0,
    termometro_pct: Number(r.termometro_pct) || 0,
    ultimaAsistencia: (function() { const u = _ultimaAsistenciaDe(ultimaPorUsuario, r.username); return u ? u.slice(0, 10) : null; })(),
    puntosAsistencia: puntosAsistenciaLivePorUsuario[r.username] || 0,
    puntosTareas: puntosPeriodoPorUsuario[r.username] ? puntosPeriodoPorUsuario[r.username].tareas : 0,
    // `puntos_bonificacion` + `puntos_extra` combinados -- ver comentario
    // grande junto a `puntosPeriodoPorUsuario` más arriba en esta función.
    puntosRacha: puntosPeriodoPorUsuario[r.username] ? puntosPeriodoPorUsuario[r.username].racha : 0,
    // `equipo.racha_actual` (pedido explícito, ver MANIFEST.md -- "Mis
    // estadísticas muestra sin racha pese a que la racha real es 14"):
    // contador real de asistencias consecutivas (`adminMarcarAsistencia()`,
    // arriba en este archivo), independiente del período de puntaje
    // elegido -- a diferencia de `puntosRacha` (arriba), que son los PUNTOS
    // bonus ganados por hitos de racha (cada 3ra consecutiva) DENTRO del
    // período seleccionado, y puede dar 0 aunque la racha real siga viva si
    // no hubo un hito nuevo en ese período puntual. Esta columna nunca se
    // había expuesto acá -- solo se escribía (nunca se leía de vuelta) hasta
    // este pedido. `rachaEfectiva()` (arriba en esta función) la corrige a 0
    // si detecta un entrenamiento real disponible sin marcar después de la
    // última asistencia real -- ver ese comentario ("ruptura automática de
    // racha").
    rachaActual: rachaEfectiva(r.username, Number(r.racha_actual) || 0),
    // `equipo.puntos_anteriores` es el arrastre de puntos previos a la
    // existencia de `puntos_mensuales` (importado a mano al migrar el
    // sistema de puntos) -- solo tiene sentido sumarlo al total histórico,
    // nunca a un mes/rango puntual, así que solo entra cuando `esHistorico`.
    // Se expone también suelto (`puntosAnteriores`) para que el frontend
    // pueda desglosarlo en vez de mezclarlo ciego dentro de `puntosTotal`.
    puntosAnteriores: esHistorico ? (Number(r.puntos_anteriores) || 0) : 0,
    puntosTotal: (puntosPeriodoPorUsuario[r.username] ? puntosPeriodoPorUsuario[r.username].total : 0)
      + (esHistorico ? (Number(r.puntos_anteriores) || 0) : 0),
    puntosAnio: Number(puntosAnioPorUsuario[r.username]) || 0,
    // Tendencia de termómetro, hoy vs. hace 1 mes (ver el bloque
    // `calcularTermometroPctAsOf()` más arriba en esta función) --
    // 'sube'/'baja' calculadas ahí (`tendenciaPorUsuario`), `null` si el
    // termómetro dio el mismo valor en ambos momentos o si no hay ningún
    // tier no-default configurado (`tierTecho` null, termómetro sin sentido
    // posible). El frontend (`_eqStatsInlineHtml()`/js/equipo.js) solo
    // pinta el círculo de tendencia si esto NO es `null`.
    tendencia: tendenciaPorUsuario[r.username] || null,
    // Bug real "termómetro visible aunque la persona necesite equipo del
    // club" (ver MANIFEST.md): `equipo.necesita_patines`/`necesita_protecciones`
    // (columnas reales, ver actualizarEquipamientoPersona() arriba en este
    // archivo) son el equivalente real al "necesita_equipo_club" del pedido
    // -- no existe un flag único combinado en el modelo, así que el
    // frontend (`_eqPerfilContenidoHtml()`, js/equipo.js) los combina con OR.
    //
    // Bug real #2 (Bug 4, persistía pese al fix anterior): ambas columnas
    // son `text` en la DB (confirmado contra el schema real), NUNCA
    // `boolean` -- `necesita_patines` guarda literalmente 'Sí'/'No';
    // `necesita_protecciones` guarda 'Sí'/'No' O una lista libre de lo que
    // falta (ej. "Muñequeras, Coderas", "Solamente tengo casco, me falta
    // el resto"). `r.necesita_patines === true` comparaba ese texto contra
    // el booleano `true` -- en JS eso da `false` SIEMPRE sin importar el
    // valor real, así que `necesitaPatines`/`necesitaProtecciones` le
    // llegaban al frontend ya rotos en `false` para todo el mundo, y el
    // fix anterior (la condición `!!(p.necesitaPatines || ...)` en
    // `_eqPerfilContenidoHtml()`/js/equipo.js y en `perfil.js`) nunca tuvo
    // chance de aplicar sobre un dato real. Mismo criterio de
    // interpretación de texto ya usado en `adminGetQueLlevar()` (más abajo
    // en este archivo) y en `js/home.js`/`js/perfil.js`
    // (`d.necesitaPatines.toLowerCase() !== 'no'`): truthy y distinto de
    // 'no' (case-insensitive) cuenta como "sí necesita" -- cubre tanto
    // 'Sí' como cualquier texto libre de protecciones faltantes; string
    // vacío o 'No' cuentan como "no necesita".
    necesitaPatines: !!r.necesita_patines && String(r.necesita_patines).toLowerCase() !== 'no',
    necesitaProtecciones: !!r.necesita_protecciones && String(r.necesita_protecciones).toLowerCase() !== 'no',
    // Fase 2 completa del sistema de tiers (Parte 5, ver MANIFEST.md) --
    // mismo shape/criterio que `getDatosCompletos()` (`null`, no `''`, ver
    // ese comentario) para que el perfil de detalle de Equipo (admin) pueda
    // mostrar el mismo aviso que ve la propia persona en su banner.
    tierRiesgoDesde: r.tier_riesgo_desde ?? null,
    tierRiesgoHasta: r.tier_riesgo_hasta ?? null,
    tierRiesgoObjetivo: r.tier_riesgo_objetivo ?? null,
  })).map((p: any) => {
    // Puntos efectivos (Parte 6) -- ×0.5 si el tier ACTUAL de la persona
    // (`p.rol`) tiene `dividir_puntos_mitad=true` (mapa armado más arriba en
    // esta función, reusando el mismo fetch de `config_tiers` del
    // termómetro/tendencia). Al ascender/descender de tier, esto se
    // recalcula solo en la siguiente carga -- no hace falta ninguna
    // migración de datos, `puntosTotal` real nunca cambia, solo cambia qué
    // multiplicador se le aplica en este display.
    return {
      ...p,
      // "Puntos a la mitad" se quitó (Victor, 2026-11-14): no entraba en los
      // requisitos para subir; ahora siempre es el total.
      puntosEfectivos: p.puntosTotal,
      // Fondos de viaje (Parte 7) -- mapa armado arriba con 1 sola consulta
      // para todo el roster (`_calificaFondosViajePorUsuarios()`).
      calificaFondosViaje: calificaFondosViajePorUsuario[p.username] === true,
    };
  });

    // Privacidad (Mi Liga → Reglas): sin ranking visible, quien no es Pivot
  // solo recibe sus propios puntos.
  if (!vistaAdmin && (await _reglasLiga()).rankingVisible === false) {
    const yo = await _validarToken(String(params.token ?? ''));
    for (const p of personasOut as any[]) {
      if (p.username === yo) continue;
      for (const k of ['puntosTotal', 'puntosAsistencia', 'puntosTareas', 'puntosRacha', 'puntosEfectivos', 'puntosAnteriores']) if (k in p) p[k] = 0;
    }
  }
  return { personas: personasOut };
}

// Mismo cálculo de período que `getEquipo()` (mes/rango/histórico/default),
// extraído acá como función propia -- `getEquipo()` sigue con el suyo
// inline, sin tocarlo, para no arriesgar una regresión en una función ya
// verificada contra producción varias veces esta sesión; esta versión
// nueva es la única consumidora, pensada para no duplicarse una 3ra vez si
// aparece un futuro endpoint con el mismo período seleccionable.
function _periodoDesdeParams(params: Record<string, any>, hoy: Date): { desde: string; hasta: string } {
  const anioActual = hoy.getUTCFullYear();
  const mesActual = hoy.getUTCMonth() + 1;
  const primerDiaSiguiente = (anio: number, mes: number): string => {
    const a = mes === 12 ? anio + 1 : anio;
    const m = mes === 12 ? 1 : mes + 1;
    return a + '-' + String(m).padStart(2, '0') + '-01';
  };
  const esHistorico = params.historico === true || params.historico === 'true';
  if (esHistorico) return { desde: '1900-01-01', hasta: '2999-01-01' };
  if (params.mesDesde && params.mesHasta && params.anioDesde && params.anioHasta) {
    const anioDesde = Number(params.anioDesde), mesDesde = Number(params.mesDesde);
    const anioHasta = Number(params.anioHasta), mesHasta = Number(params.mesHasta);
    return { desde: anioDesde + '-' + String(mesDesde).padStart(2, '0') + '-01', hasta: primerDiaSiguiente(anioHasta, mesHasta) };
  }
  if (params.mes && params.anio) {
    const m = Number(params.mes), a = Number(params.anio);
    return { desde: a + '-' + String(m).padStart(2, '0') + '-01', hasta: primerDiaSiguiente(a, m) };
  }
  return { desde: anioActual + '-' + String(mesActual).padStart(2, '0') + '-01', hasta: primerDiaSiguiente(anioActual, mesActual) };
}

// Desglose línea por línea de un concepto de puntos (feat nueva, ver
// MANIFEST.md/CHANGELOG.md -- "subpantalla de desglose de puntos por
// concepto") -- `getEquipo()` ya expone los 4 totales por persona/período
// (`puntosAsistencia`/`puntosTareas`/`puntosRacha`/`puntosTotal`) pero
// nunca el detalle de QUÉ los compone; esta acción es la contraparte
// "detalle" de esos mismos 4 números, un `concepto` a la vez. Gateada con
// `_validarToken()` (cualquier sesión de usuario válida, no
// necesariamente la de `nombreUsuario`) -- mismo criterio de visibilidad
// que ya tiene el roster completo de `getEquipo()` (sin auth propia,
// cualquier sesión ve los puntos de cualquier persona) -- FIN nuevo sí
// pide al menos una sesión válida, `getEquipo()` en los hechos no exige
// ninguna.
// ─── Estadísticas de una persona (Victor, 2026-11-13) ─────────────────────
// Todo lo que muestra la pantalla "Estadísticas" (Mi perfil y la ficha de
// Equipo): cada evento con asistencia tomada del año elegido y cómo le fue a
// la persona (así la app calcula meses, comparaciones "del 1 al 13" y
// porcentajes), sus puntos por mes, los años con datos y su progreso de
// categoría con la MISMA cuenta que recalcular-categorias (clases y puntos
// en la ventana de cada categoría). Cualquier sesión del equipo puede verlo
// (igual que getEquipo); no hay datos sensibles.
/** Período de un Equipo (igual que recalcular-categorias.periodoTier).
 * cerrado: meses calendario ya terminados; en curso: el mes actual (y los
 * anteriores si el período es de varios meses). Con días/semanas/años es
 * hacia atrás desde hoy en ambos casos. */
function _periodoTier(tier: any, enCurso: boolean): { desde: string; hasta: string; mesDesde: number; mesHasta: number } {
  const n = Math.max(1, Number(tier.ventana_meses) || 1);
  const u = String(tier.periodo_unidad ?? 'mes');
  const hoy = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const idx = hoy.getUTCFullYear() * 12 + hoy.getUTCMonth();
  if (u === 'mes') {
    const corr = enCurso ? 1 : 0;
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - n + corr, 1));
    const h = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + corr, 1));
    return { desde: iso(d), hasta: iso(h), mesDesde: idx - n + corr, mesHasta: idx - 1 + corr };
  }
  const dias = u === 'dia' ? n : u === 'semana' ? n * 7 : n * 365;
  const d = new Date(Date.parse(iso(hoy)) - dias * 86400000);
  return { desde: iso(d), hasta: iso(new Date(Date.parse(iso(hoy)) + 86400000)), mesDesde: d.getUTCFullYear() * 12 + d.getUTCMonth(), mesHasta: idx };
}

async function _paginado(armar: (desde: number, hasta: number) => any, tam = 1000): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < 100; i++) {
    const { data, error } = await armar(i * tam, i * tam + tam - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < tam) break;
  }
  return out;
}

async function getEstadisticasPersona(params: Record<string, any>): Promise<Record<string, any>> {
  const quien = params.adminToken ? await _validarAdminToken(String(params.adminToken)) : null;
  const yo = quien ? null : await _validarToken(String(params.token ?? ''));
  if (!quien && !yo) return { exito: false, error: 'Sesión inválida.' };
  const username = String(params.nombreUsuario ?? yo ?? '').trim();
  if (!username) return { exito: false, error: 'Falta la persona.' };
  const hoy = new Date();
  const anio = Number(params.anio) || hoy.getUTCFullYear();
  const desde = `${anio}-01-01`, hasta = `${anio + 1}-01-01`;
    const U = username.toUpperCase();
  // Privacidad (Mi Liga): sin ranking visible, los puntos de otras personas no se envían.
  const ocultarPuntos = !quien && username !== yo && (await _reglasLiga()).rankingVisible === false;

  const [logs, { data: puntos }, { data: anios }, { data: fila }, { data: tiersData }] = await Promise.all([
    _paginado((a, b) => supabase.from('log_asistencias')
      .select('nombre_usuario, id_evento, estado, fecha_entrenamiento, marca_temporal')
      .in('origen', ['Admin', 'Externa'])
      .gte('fecha_entrenamiento', desde).lt('fecha_entrenamiento', hasta)
      .order('id', { ascending: true }).range(a, b)),
    supabase.from('puntos_mensuales').select('mes, puntos_asistencia, puntos_tareas, puntos_bonificacion, puntos_extra, puntos_total')
      .eq('nombre_usuario', username).eq('anio', anio),
    supabase.from('puntos_mensuales').select('anio').eq('nombre_usuario', username),
        supabase.from('equipo').select('categoria, tier_modo, estado_miembro, pronombres, necesita_patines, necesita_protecciones, equipo_liga, meses_consecutivos_cumplidos, tier_riesgo_hasta, tier_riesgo_objetivo, fecha_ingreso')
      .eq('username', username).maybeSingle(),
    supabase.from('config_tiers').select('*').order('orden', { ascending: true }),
  ]);
  if (!fila) return { exito: false, error: 'No encontramos a esa persona.' };

  // Última marca por evento+persona (mismo criterio que getEquipo/getDesglosePuntos).
  const ultima: Record<string, { estado: string; u: string; fecha: string; marca: number }> = {};
  const fechaEvento: Record<string, string> = {};
  for (const l of logs) {
    const u = String(l.nombre_usuario ?? '').trim();
    const ev = String(l.id_evento);
    const f = String(l.fecha_entrenamiento ?? '').slice(0, 10);
    if (f) fechaEvento[ev] = f;
    if (!u) continue;
    const marca = l.marca_temporal ? new Date(l.marca_temporal).getTime() : 0;
    const k = ev + '|' + u.toUpperCase();
    if (!ultima[k] || marca >= ultima[k].marca) ultima[k] = { estado: l.estado, u, fecha: f, marca };
  }
  const eventos = Object.keys(fechaEvento).map((ev) => {
    const m = ultima[ev + '|' + U];
    const est = m && (m.estado === 'A tiempo' || m.estado === 'Tarde') ? m.estado : null;
    return { fecha: fechaEvento[ev], estado: est, externa: ev.startsWith('ext_') };
  })
    // Las externas son solo de quien las registró: no cuentan como evento del equipo para el resto.
    .filter((e) => !e.externa || e.estado)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Progreso de Equipo: misma cuenta que recalcular-categorias (período
  // cerrado) y además el período en curso ("vas 1 de 3 este mes").
  const tiers = tiersData ?? [];
  const hoyISO = hoy.toISOString().slice(0, 10);
  const periodos = tiers.map((t: any) => ({ cerrado: _periodoTier(t, false), curso: _periodoTier(t, true) }));
  const inicio = periodos.reduce((m: string, p: any) => (p.cerrado.desde < m ? p.cerrado.desde : m), hoyISO);
  const [asis, { data: ext }, { data: pts }] = await Promise.all([
        _paginado((a, b) => supabase.from('asistencias').select('fecha, a_horario, tarde, tipo_evento')
      .not('estado', 'in', '("Evento Cancelado","No se entrena")').gte('fecha', inicio).lt('fecha', hoyISO)
      .order('fecha', { ascending: true }).range(a, b)),
    supabase.from('log_asistencias').select('fecha_entrenamiento').eq('origen', 'Externa').eq('nombre_usuario', username)
      .gte('fecha_entrenamiento', inicio).lt('fecha_entrenamiento', hoyISO),
    supabase.from('puntos_mensuales').select('anio, mes, puntos_total, puntos_tareas').eq('nombre_usuario', username).gte('anio', Number(inicio.slice(0, 4))),
  ]);
  const esta = (s: unknown) => String(s ?? '').split(',').map((n) => n.trim().toUpperCase()).includes(U);
    // Con la regla de "qué cuenta como clase" de cada equipo (2026-11-16),
  // igual que recalcular-categorias.
  const reglasClase = await _reglasLiga();
  const clasesEn = (p: { desde: string; hasta: string }, equipo?: string) => {
    const r0 = _reglaClase(reglasClase, equipo);
    const cuenta = (t: unknown) => !r0.tipos || r0.tipos.includes(String(t || 'Entrenamiento'));
    return asis.filter((r: any) => r.fecha >= p.desde && r.fecha < p.hasta && cuenta(r.tipo_evento) && (esta(r.a_horario) || (r0.tarde && esta(r.tarde)))).length
      + (!r0.tipos || r0.tipos.includes('Externa') ? (ext ?? []).filter((r: any) => { const f = String(r.fecha_entrenamiento).slice(0, 10); return f >= p.desde && f < p.hasta; }).length : 0);
  };
  const puntosEn = (p: { mesDesde: number; mesHasta: number }, soloTareas: boolean) => (pts ?? []).reduce((s: number, r: any) => {
    const i = Number(r.anio) * 12 + Number(r.mes) - 1;
    return i >= p.mesDesde && i <= p.mesHasta ? s + (Number(soloTareas ? r.puntos_tareas : r.puntos_total) || 0) : s;
  }, 0);
    const usa = (v: unknown) => { const t = String(v ?? '').trim().toLowerCase(); return t !== '' && t !== 'no'; };
  // Con permiso vigente para usar equipamiento del equipo, no cuenta (2026-11-13).
  const { data: permiso } = await supabase.from('inventario_prestamos').select('id').eq('username', username)
    .eq('tipo', 'uso').eq('estado', 'activo').gte('hasta', hoyISO).limit(1);

  return {
    exito: true,
    anio,
    anios: [...new Set([...(anios ?? []).map((r: any) => Number(r.anio)), hoy.getUTCFullYear()])].sort((a, b) => b - a),
    eventos,
        puntos: (ocultarPuntos ? [] : puntos ?? []).map((r: any) => ({
      mes: Number(r.mes),
      asistencia: Number(r.puntos_asistencia) || 0,
      tareas: Number(r.puntos_tareas) || 0,
      racha: (Number(r.puntos_bonificacion) || 0) + (Number(r.puntos_extra) || 0),
      total: Number(r.puntos_total) || 0,
    })),
    progreso: {
      categoria: fila.categoria ?? null,
      modo: fila.tier_modo ?? 'auto',
            estado: fila.estado_miembro ?? null,
      pronombres: fila.pronombres ?? null,

                        usaEquipo: !permiso?.length && (usa(fila.necesita_patines) || usa(fila.necesita_protecciones) || Object.keys(fila.equipo_liga ?? {}).length > 0),
      mesesSeguidos: Number(fila.meses_consecutivos_cumplidos) || 0,
      riesgoHasta: fila.tier_riesgo_hasta ?? null,
      riesgoObjetivo: fila.tier_riesgo_objetivo ?? null,
      tiers: tiers.map((t: any, i: number) => {
        const soloTareas = (t.puntos_fuente ?? 'tareas') === 'tareas';
        const minC = Number(t.min_clases) || 0, minP = Number(t.min_puntos) || 0;
        const ok = (c: number, p: number) => t.logica === 'Y' ? c >= minC && p >= minP : c >= minC || p >= minP;
                const c1 = clasesEn(periodos[i].curso, t.nombre), p1 = puntosEn(periodos[i].curso, soloTareas);
        const c0 = clasesEn(periodos[i].cerrado, t.nombre), p0 = puntosEn(periodos[i].cerrado, soloTareas);
        return {
          nombre: t.nombre, logo: t.logo ?? null, orden: t.orden, esDefault: !!t.es_default, minClases: minC, minPuntos: minP, logica: t.logica === 'Y' ? 'Y' : 'O',
          ventana: Number(t.ventana_meses) || 1, unidad: t.periodo_unidad ?? 'mes', puntosFuente: soloTareas ? 'tareas' : 'todos',
          desde: periodos[i].curso.desde, mesesAscenso: Number(t.meses_consecutivos_ascenso) || 3,
          gracia: Number(t.meses_gracia_demotion) || 0, graciaUnidad: t.gracia_unidad ?? 'mes',
          // En curso (lo que se muestra) y cerrado (lo que decide hoy).
          clases: c1, puntos: ocultarPuntos ? null : Math.round(p1 * 10) / 10, cumple: ok(c1, p1),
          clasesCerrado: c0, puntosCerrado: ocultarPuntos ? null : Math.round(p0 * 10) / 10, cumpleCerrado: ok(c0, p0),
        };
      }),
    },
  };
}

// ─── Simulador de Categorías/Equipos (Victor, 2026-11-13) ──────────────────
// Para editar lo que pide cada Categoría/Equipo con ejemplos reales: por
// cada persona activa, sus clases y puntos contados igual que
// recalcular-categorias para cada período posible (1 a 12 meses). La app
// calcula al instante quién cumpliría con cada cambio.
async function adminDatosCategorias(params: Record<string, any>): Promise<Record<string, any>> {
  if (!(await _validarAdminToken(String(params.adminToken ?? '')))) return { exito: false, error: 'Sesión de Pivot inválida.' };
  // Por mes calendario (2026-11-13, misma cuenta que recalcular-categorias):
  // índice 0 = mes en curso, 1 = último mes cerrado… hasta 12.
  const hoyISO = _hoyEcuadorISO();
  const y = Number(hoyISO.slice(0, 4)), mo = Number(hoyISO.slice(5, 7)) - 1;
  const idxHoy = y * 12 + mo;
  const inicio = new Date(Date.UTC(y, mo - 12, 1)).toISOString().slice(0, 10);
    const reglas = await _reglasLiga();
  const [{ data: gente }, asis, { data: ext }, { data: pts }, { data: cursosAprobadosData }] = await Promise.all([
        supabase.from('equipo').select('username, nombre_derby, foto_perfil, categoria, tier_modo, estado_miembro, necesita_patines, necesita_protecciones, equipo_liga, meses_consecutivos_cumplidos')
      .is('eliminado_en', null),
    _paginado((a, b) => supabase.from('asistencias').select('fecha, a_horario, tarde, tipo_evento')
      .not('estado', 'in', '("Evento Cancelado","No se entrena")').gte('fecha', inicio).lt('fecha', hoyISO)
      .order('fecha', { ascending: true }).range(a, b)),
    supabase.from('log_asistencias').select('nombre_usuario, fecha_entrenamiento').eq('origen', 'Externa')
      .gte('fecha_entrenamiento', inicio).lt('fecha_entrenamiento', hoyISO).limit(100000),
    supabase.from('puntos_mensuales').select('nombre_usuario, anio, mes, puntos_total, puntos_tareas').gte('anio', y - 1),
    supabase.from('curso_inscripciones').select('username, curso_id').eq('resultado', 'aprobado'),
  ]);
  const idxDe = (f: string) => idxHoy - (Number(f.slice(0, 4)) * 12 + Number(f.slice(5, 7)) - 1);
    const tareas: Record<string, number[]> = {}, total: Record<string, number[]> = {};
  // Clases contadas con una regla de "qué cuenta como clase" (la general o la
  // de un equipo, Victor 2026-11-16).
  const contar = (regla: { tipos: string[] | null; tarde: boolean }) => {
    const clases: Record<string, number[]> = {};
    const cuentaTipo = (t: unknown) => !regla.tipos || regla.tipos.includes(String(t || 'Entrenamiento'));
    const sumarClase = (u: string, f: string) => {
      const i = idxDe(f);
      if (i < 0 || i > 12) return;
      (clases[u.trim().toUpperCase()] ??= Array(13).fill(0))[i]++;
    };
    for (const r of asis) {
      if (!cuentaTipo(r.tipo_evento)) continue;
      const nombres = new Set([...String(r.a_horario ?? '').split(','), ...(regla.tarde ? String(r.tarde ?? '').split(',') : [])].map((n) => n.trim()).filter(Boolean));
      for (const n of nombres) sumarClase(n, r.fecha);
    }
    if (!regla.tipos || regla.tipos.includes('Externa')) for (const e of ext ?? []) sumarClase(String(e.nombre_usuario ?? ''), String(e.fecha_entrenamiento).slice(0, 10));
    return clases;
  };
  const clases = contar(_reglaClase(reglas));
  const clasesEquipos: Record<string, Record<string, number[]>> = {};
  for (const eq of Object.keys(reglas.queCuentaEquipos ?? {})) clasesEquipos[eq] = contar(_reglaClase(reglas, eq));
  for (const r of pts ?? []) {
    const i = idxHoy - (Number(r.anio) * 12 + Number(r.mes) - 1);
    if (i < 0 || i > 12) continue;
    (tareas[r.nombre_usuario] ??= Array(13).fill(0))[i] += Number(r.puntos_tareas) || 0;
    (total[r.nombre_usuario] ??= Array(13).fill(0))[i] += Number(r.puntos_total) || 0;
  }
  const cursosAprobadosMap: Record<string, string[]> = {};
  for (const ci of (cursosAprobadosData ?? [])) {
    (cursosAprobadosMap[String(ci.username ?? '').trim().toUpperCase()] ??= []).push(String(ci.curso_id));
  }
  const usa = (v: unknown) => { const t = String(v ?? '').trim().toLowerCase(); return t !== '' && t !== 'no'; };
  const r1 = (l: number[]) => l.map((x) => Math.round(x * 10) / 10);
  const personas = (gente ?? []).filter((p: any) => p.username).map((p: any) => ({
    nombre: p.username, nombreMostrar: p.nombre_derby || p.username, foto: p.foto_perfil || '',
    categoria: p.categoria ?? null, modo: p.tier_modo ?? 'auto', estado: p.estado_miembro ?? null,
        usaEquipo: usa(p.necesita_patines) || usa(p.necesita_protecciones) || Object.keys(p.equipo_liga ?? {}).length > 0, mesesSeguidos: Number(p.meses_consecutivos_cumplidos) || 0,
        clasesMes: clases[String(p.username).trim().toUpperCase()] ?? Array(13).fill(0),
    // Con regla propia de un equipo: sus clases contadas con esa regla.
    clasesEquipos: Object.fromEntries(Object.entries(clasesEquipos).map(([eq, c]) => [eq, c[String(p.username).trim().toUpperCase()] ?? Array(13).fill(0)])),
    tareasMes: r1(tareas[p.username] ?? Array(13).fill(0)),
    puntosMes: r1(total[p.username] ?? Array(13).fill(0)),
    cursosAprobados: cursosAprobadosMap[String(p.username).trim().toUpperCase()] ?? [],
  }));
  return { exito: true, personas, corte: await _corteEquipos() };
}

// ─── Bandeja de cada persona (Victor, 2026-11-13) ───────────────────────
// Sus pedidos de los últimos 60 días y cómo quedaron (pendiente, aprobado,
// rechazado), y ajustes que la app recomienda completar. `fecha` es el
// último cambio: la app compara con la última vez que abrió la Bandeja para
// mostrar la campana.
async function getMiBandeja(params: Record<string, any>): Promise<Record<string, any>> {
  const yo = await _validarToken(String(params.token ?? ''));
  if (!yo) return { exito: false, error: 'Sesión inválida.' };
  const desde = new Date(Date.now() - 60 * 86400000).toISOString();
  try { await _descartarSinComprobante(); } catch (e) { console.error('[miBandeja] descartar:', e); }
  const [res, rect, exc, prest, asig, { data: fila }] = await Promise.all([
                supabase.from('reservas').select('id, id_evento, tipo, mes_texto, estado, monto, created_at, motivo_rechazo, comprobante_subido_en, comprobante_limite').eq('nombre_usuario', yo).gte('created_at', desde),
    supabase.from('rectificaciones_asistencia').select('id, fecha_evento, estado_solicitado, decision, created_at').eq('nombre', yo).gte('created_at', desde),
        supabase.from('solicitudes_excepcion').select('id, tipo, datos, estado, mes_aplicacion, nota_admin, created_at, vigente_hasta, indefinida, efecto').eq('nombre', yo).gte('created_at', desde),
    supabase.from('inventario_prestamos').select('id, detalle, motivo, estado, tipo, hasta, created_at, desde, devuelto_en').eq('username', yo).gte('created_at', desde),
    supabase.from('asignaciones_tareas').select('id, tarea_id, estado, nota_rechazo, fecha_envio, fecha_revision').eq('nombre_usuario', yo).not('fecha_envio', 'is', null).gte('fecha_envio', desde),
    supabase.from('equipo').select('foto_perfil, fecha_nacimiento, emerg1_nombre, emerg1_telefono, necesita_patines, necesita_protecciones, push_notificaciones_activas, solicitud_lesion_pendiente, solicitud_estado, solicitud_estado_en').eq('username', yo).maybeSingle(),
  ]);
  const idsEv = [...new Set((res.data ?? []).map((r: any) => r.id_evento).filter(Boolean))];
  const idsT = [...new Set((asig.data ?? []).map((a: any) => a.tarea_id))];
  const [{ data: evs }, { data: tareas }] = await Promise.all([
    idsEv.length ? supabase.from('asistencias').select('id_evento, fecha, inicia, tipo_evento').in('id_evento', idsEv) : Promise.resolve({ data: [] as any[] }),
    idsT.length ? supabase.from('tareas').select('id, titulo').in('id', idsT) : Promise.resolve({ data: [] as any[] }),
  ]);
  const ev: Record<string, any> = {}; (evs ?? []).forEach((e: any) => { ev[e.id_evento] = e; });
  const ta: Record<string, string> = {}; (tareas ?? []).forEach((t: any) => { ta[t.id] = t.titulo; });
  const dia = (f: string) => { const d = new Date(f + 'T12:00:00Z'); return `${d.getUTCDate()} de ${['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][d.getUTCMonth()]}`; };
  const items: any[] = [];
    const CANCELADA_POR_TI = 'Cancelada por la persona';
  for (const r of res.data ?? []) {
    const e = ev[r.id_evento];
    if (r.motivo_rechazo === CANCELADA_POR_TI) {
      items.push({ tipo: 'reserva', id: r.id, titulo: r.tipo === 'mensual' ? `Mensualidad ${r.mes_texto ?? ''}`.trim() : `${e?.tipo_evento || 'Clase'}${e?.fecha ? ' del ' + dia(e.fecha) : ''}`, detalle: 'La cancelaste.', estado: 'cancelada', fecha: r.created_at });
      continue;
    }
    items.push({
      tipo: 'reserva', id: r.id,
      titulo: r.tipo === 'mensual' ? `Mensualidad ${r.mes_texto ?? ''}`.trim() : `${e?.tipo_evento || 'Clase'}${e?.fecha ? ' del ' + dia(e.fecha) : ''}`,
                                                faltaComprobante: r.estado === 'Pendiente' && Number(r.monto) > 0 && !r.comprobante_subido_en,
      // "Esperando comprobante" (Victor, 2026-11-19): un Pivot dio 24 h para adjuntarlo.
      comprobanteLimite: r.estado === 'Pendiente' && !r.comprobante_subido_en ? r.comprobante_limite ?? null : null,
      editable: r.estado === 'Pendiente' && r.tipo === 'clase' ? 'clase' : null,
            detalle: r.estado === 'Pendiente' ? (Number(r.monto) > 0 && !r.comprobante_subido_en ? (r.comprobante_limite ? `Esperando comprobante: adjúntalo en las próximas 24 h; si no, la solicitud se descarta y tendrás que volver a ${r.tipo === 'mensual' ? 'suscribirte' : 'reservar'}.` : 'Falta el comprobante: súbelo para que un Pivot confirme tu pago.') : 'Un Pivot confirmará tu pago.') : r.estado === 'Confirmada' ? 'Pago confirmado.' : (r.motivo_rechazo === 'Pasó a deuda' ? 'No se confirmó el pago: quedó como deuda y la pagarás con tu próxima reserva.' : r.motivo_rechazo === SIN_COMPROBANTE_A_TIEMPO ? `Se descartó: no llegó el comprobante en 24 h. Puedes volver a ${r.tipo === 'mensual' ? 'suscribirte' : 'reservar'}.` : r.motivo_rechazo ? `Rechazada: ${r.motivo_rechazo}` : 'Reserva cancelada.'),
      estado: r.estado === 'Pendiente' ? 'pendiente' : r.estado === 'Confirmada' ? 'aprobada' : 'rechazada', fecha: r.created_at,
    });
  }
  for (const r of rect.data ?? []) {
    const d = r.decision;
    items.push({
      tipo: 'rectificacion', id: r.id, titulo: `Corregir tu asistencia del ${r.fecha_evento ? dia(String(r.fecha_evento).slice(0, 10)) : ''}`.trim(),
            detalle: d === 'Aprobada' ? 'Se corrigió.' : d === 'Rechazada' ? 'Quedó como estaba.' : d === 'Descartada' ? 'Nadie la revisó a tiempo; puedes pedirla de nuevo.' : d === 'Cancelada' ? 'La cancelaste.' : 'Un Pivot la revisará.',
      estado: d === 'Aprobada' ? 'aprobada' : d === 'Rechazada' ? 'rechazada' : d === 'Descartada' ? 'vencida' : d === 'Cancelada' ? 'cancelada' : 'pendiente', fecha: r.created_at,
    });
  }
    for (const r of exc.data ?? []) {
    if (r.estado === 'rechazada' && r.nota_admin === CANCELADA_POR_TI) {
      items.push({ tipo: 'excepcion', id: r.id, titulo: r.tipo === 'ausencias' ? 'Excepción de cuota por ausencias' : 'Excepción de cuota por dificultad económica', detalle: 'La cancelaste.', estado: 'cancelada', fecha: r.created_at });
      continue;
    }
    items.push({
      tipo: 'excepcion', id: r.id, titulo: r.tipo === 'ausencias' ? 'Excepción de cuota por ausencias' : 'Excepción de cuota por dificultad económica',
      editable: r.estado === 'pendiente' ? 'motivo' : null,
      motivo: String((r.tipo === 'ausencias' ? r.datos?.motivo : r.datos?.situacionEconomica) ?? ''),
      detalle: r.estado === 'aprobada' ? (r.indefinida ? 'Aprobada, sin fecha de fin.' : r.vigente_hasta ? `Aprobada hasta ${r.vigente_hasta}.` : 'Aprobada.') : r.estado === 'rechazada' ? (r.nota_admin ? `No se aprobó: ${r.nota_admin}` : 'No se aprobó.') : 'Un Pivot la revisará.',
      estado: r.estado === 'aprobada' ? 'aprobada' : r.estado === 'rechazada' ? 'rechazada' : 'pendiente', fecha: r.created_at,
    });
  }
  for (const p of prest.data ?? []) {
    items.push({
            tipo: 'prestamo', id: p.id, titulo: `${p.tipo === 'uso' ? 'Usar' : 'Te llevaste'} ${p.detalle ?? 'equipamiento del equipo'}`,
      editable: p.estado === 'pendiente' ? 'motivo' : null, motivo: String(p.motivo ?? ''),
            detalle: p.estado === 'pendiente' ? 'Un Pivot lo revisará.' : p.estado === 'activo' ? (p.hasta ? `Aprobado hasta el ${dia(p.hasta)}.` : 'Aprobado.') : p.estado === 'devuelto' ? 'Devuelto.' : p.estado === 'cancelado' ? 'Lo cancelaste.' : 'No se aprobó.',
      estado: p.estado === 'pendiente' ? 'pendiente' : p.estado === 'rechazado' ? 'rechazada' : p.estado === 'cancelado' ? 'cancelada' : 'aprobada', fecha: p.devuelto_en ?? p.desde ?? p.created_at,
    });
  }
  for (const a of asig.data ?? []) {
    items.push({
      tipo: 'tarea', id: a.id, titulo: ta[a.tarea_id] ?? 'Tarea',
      detalle: a.estado === 'aprobada' ? 'Tarea aprobada; sumaste sus puntos.' : a.estado === 'rechazada' ? (a.nota_rechazo ? `Hay que corregirla: ${a.nota_rechazo}` : 'Hay que corregirla.') : 'Un Pivot la revisará.',
      estado: a.estado === 'aprobada' ? 'aprobada' : a.estado === 'rechazada' ? 'rechazada' : 'pendiente', fecha: a.fecha_revision ?? a.fecha_envio,
    });
  }
    if (fila?.solicitud_lesion_pendiente || fila?.solicitud_estado) {
    items.push({ tipo: 'lesion', id: 'lesion', titulo: `Pasar a ${fila.solicitud_estado ?? 'Lesionadx'}`, detalle: 'Un Pivot lo revisará.', estado: 'pendiente', fecha: fila.solicitud_estado_en ?? new Date().toISOString() });
  }
    items.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  // Lo resuelto (aprobado, rechazado, cancelado…) desaparece a los 3 días
  // para que no se acumule (Victor, 2026-11-17).
  const hace3 = new Date(Date.now() - 3 * 86400000).toISOString();
  const visibles = items.filter((x) => x.estado === 'pendiente' || String(x.fecha) >= hace3);

  const novedades = await _novedadesEquipo(yo).catch(() => []);

  const recomendaciones = [
    ...(!fila?.emerg1_nombre || !fila?.emerg1_telefono ? [{ clave: 'contacto', titulo: 'Agrega un contacto de emergencia', texto: 'Si te pasa algo en un entrenamiento, el equipo sabrá a quién llamar.' }] : []),
    ...(!fila?.foto_perfil ? [{ clave: 'foto', titulo: 'Agrega tu foto', texto: 'Así el equipo te reconoce en las listas.' }] : []),
    ...(!fila?.fecha_nacimiento ? [{ clave: 'identidad', titulo: 'Agrega tu fecha de nacimiento', texto: 'Para tu ficha y, si quieres, para saludarte en tu cumpleaños.' }] : []),
    ...(fila && fila.necesita_patines == null && fila.necesita_protecciones == null ? [{ clave: 'equipamiento', titulo: 'Cuéntanos tu equipamiento', texto: 'Si tienes el tuyo o necesitas el del equipo.' }] : []),
    ...(fila && fila.push_notificaciones_activas === false ? [{ clave: 'notificaciones', titulo: 'Activa las notificaciones', texto: 'Para enterarte de entrenamientos, cambios y respuestas a tus pedidos.' }] : []),
    // Suscripción a medias (Victor, 2026-11-27): se ve al volver a la app.
    ...(await (async () => {
      const { data: f } = await supabase.from('reservas_en_curso').select('detalle, pantalla, pago_en, creado_en').eq('nombre', yo).maybeSingle();
      if (!f || (!f.pago_en && Date.parse(f.creado_en) > Date.now() - 15 * 60000)) return [];
      const anotadx = await _anotadxDe(yo);
      return [{
        clave: 'suscripcion_sin_terminar', pantalla: f.pantalla ?? 'pagos',
        titulo: f.pago_en ? `Todavía no estás ${anotadx}: falta tu comprobante` : 'Tu suscripción aún no se completó',
        texto: f.pago_en ? 'Toca para subir la foto del pago y terminar.' : (f.detalle ? `Toca para terminar tu suscripción a ${f.detalle}.` : 'Toca para terminarla.'),
      }];
    })().catch(() => [])),
    // Curso a medio armar (Victor, 2026-11-27).
    ...(await (async () => {
      const { data: b } = await supabase.from('curso_borradores').select('datos').eq('username', yo).maybeSingle();
      if (!b) return [];
      const n = String(b.datos?.curso?.nombre ?? '').trim();
      return [{ clave: 'curso_borrador', titulo: 'Curso a medio armar', texto: n ? `«${n}»: toca para seguir armándolo.` : 'Toca para seguir armándolo donde lo dejaste.' }];
    })().catch(() => [])),
  ];
    return { exito: true, solicitudes: visibles, recomendaciones, novedades };
}

/// Novedades del equipo para la campana (Victor, 2026-11-17): cambios de
/// asistencia de los eventos de hoy y mañana que todavía no terminan (uno por
/// persona, el último; se van solos al terminar el evento), cumpleaños de hoy
/// y comunicados de los últimos 3 días.
async function _novedadesEquipo(yo: string): Promise<any[]> {
  const out: any[] = [];
  const hoy = _hoyEcuadorISO();
  const manana = new Date(new Date(hoy + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
  const { data: yoFila } = await supabase.from('equipo').select('email').eq('username', yo).maybeSingle();
  const esPivotAsistencia = !!yoFila?.email && (await _adminDestinatariosPush(undefined, 'asistencia')).includes(yo);
  const { data: evs } = await supabase.from('asistencias').select('id_evento, fecha, inicia, termina, tipo_evento, estado').gte('fecha', hoy).lte('fecha', manana);
  const ahora = Date.now();
  const enHorario = (evs ?? []).filter((e: any) => {
    if (['Cancelado', 'Sin entrenamiento'].includes(String(e.estado))) return false;
    const fin = new Date(`${String(e.fecha).slice(0, 10)}T${String(e.termina || e.inicia || '23:59').slice(0, 5)}:00-05:00`).getTime();
    return isFinite(fin) && fin > ahora;
  });
  // Asistencia solo de eventos de mis equipos (mismo alcance que los avisos, Victor 2026-11-20).
  const equiposPorEvento = await _equiposDeEventos(enHorario.map((e: any) => String(e.id_evento)));
  const vigentes: any[] = [];
  for (const e of enHorario) {
    const equipos = equiposPorEvento[String(e.id_evento)] ?? [];
    if (!equipos.length || (await _filtrarDestinatariosEvento({ equipos }, [yo], { soloEquipos: true })).length) vigentes.push(e);
  }
  if (vigentes.length) {
    const ids = vigentes.map((e: any) => e.id_evento);
    const { data: rs } = await supabase.from('log_asistencias').select('id_evento, nombre_usuario, estado, marca_temporal')
      .in('id_evento', ids).in('origen', ['Usuario', 'AsistenciaAnticipada']).gte('marca_temporal', new Date(ahora - 36 * 3600000).toISOString()).order('marca_temporal');
    const ultimo = new Map<string, any>();
    for (const r of rs ?? []) if (r.nombre_usuario !== yo) ultimo.set(`${r.id_evento}|${r.nombre_usuario}`, r);
    const quien = ultimo.size ? await _mapaEquipoPorNombre() : {};
    for (const r of ultimo.values()) {
      // El equipo ve quién ya no viene; los Pivots de asistencia, todo.
      if (!esPivotAsistencia && r.estado !== 'No asistiré') continue;
      const ev = vigentes.find((e: any) => e.id_evento === r.id_evento);
      const nombre = quien[String(r.nombre_usuario).toUpperCase()]?.nombreDerby || r.nombre_usuario;
      out.push({
        tipo: 'asistencia', idEvento: r.id_evento, fecha: r.marca_temporal,
        ...(ev?.tipo_evento === 'Social'
          // Una sola frase (Victor, 2026-11-22): "Tormento asistirá al evento Naviquinde del próximo 10 de diciembre".
          ? await (async () => {
            const frase = await _eventoFraseAviso(String(r.id_evento), ev?.tipo_evento, ev?.fecha);
            return {
              titulo: r.estado === 'No asistiré' ? `${nombre} no asistirá al ${frase}` : r.estado === 'Asistiré' ? `${nombre} asistirá al ${frase}` : `${nombre}: ${r.estado} en el ${frase}`,
              detalle: '',
            };
          })()
          : {
            titulo: r.estado === 'No asistiré' ? `${nombre} no asistirá` : r.estado === 'Asistiré' ? `${nombre} asistirá` : `${nombre}: ${r.estado}`,
            detalle: _eventoFrase(ev?.tipo_evento, ev?.fecha),
          }),
      });
    }
  }
  // Cumpleaños de hoy (solo quien deja ver su fecha).
  const md = hoy.slice(5);
  const { data: gente } = await supabase.from('equipo').select('username, nombre_derby, fecha_nacimiento, fecha_publica, estado_miembro').is('eliminado_en', null).not('fecha_nacimiento', 'is', null);
  for (const g of gente ?? []) {
    if (g.username === yo || g.fecha_publica !== 'Sí' || String(g.fecha_nacimiento).slice(5, 10) !== md) continue;
    out.push({ tipo: 'cumple', usuario: g.username, fecha: hoy + 'T05:00:00Z', titulo: `¡Hoy cumple años ${g.nombre_derby || g.username}!`, detalle: 'Escríbele un saludo.' });
  }
    // Comunicados a todo el equipo o a ti: hasta la fecha que eligió el Pivot
  // o, sin fecha, 3 días desde que se envió (Victor, 2026-11-17).
  const { data: comTodos } = await supabase.from('avisos_programados').select('id, titulo, mensaje, destino, enviado_en, vence_en')
    .not('enviado_en', 'is', null).is('cancelado_en', null).gte('enviado_en', new Date(ahora - 31 * 86400000).toISOString()).order('enviado_en', { ascending: false }).limit(40);
  const com = (comTodos ?? []).filter((c: any) => (c.vence_en ? Date.parse(c.vence_en) : Date.parse(c.enviado_en) + 3 * 86400000) > ahora).slice(0, 10);
  for (const c of com) {
    const d = c.destino;
    const paraMi = !d || d === 'todos' || (Array.isArray(d) && (d.includes('todos') || d.includes(yo))) || String(d) === yo;
    if (paraMi) out.push({ tipo: 'comunicado', id: c.id, fecha: c.enviado_en, titulo: c.titulo, detalle: c.mensaje });
  }
  return out.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

async function getDesglosePuntos(params: Record<string, any>): Promise<Record<string, any>> {
  const solicitante = await _validarToken(params.token);
  if (!solicitante) return { exito: false, error: 'Sesión inválida.' };
    const nombreUsuario = String(params.nombreUsuario || '').trim();
  if (!nombreUsuario) return { exito: false, error: 'Falta nombreUsuario.' };
  if (nombreUsuario !== solicitante && (await _reglasLiga()).rankingVisible === false
    && !(params.adminToken && await _validarAdminToken(String(params.adminToken)))) {
    return { exito: false, error: 'La liga no muestra los puntos de otras personas.' };
  }
  const concepto = String(params.concepto || '');
  const periodo = _periodoDesdeParams(params, new Date());

  if (concepto === 'asistencia') {
    // Mismo criterio EXACTO que `recalcularPuntosAsistencia()` (más abajo
    // en este archivo, `puntos_asistencia`) -- incluida la de-duplicación
    // por (evento, persona) (bug real corregido, ver MANIFEST.md/CHANGELOG.md
    // -- "puntos de asistencia inflados por re-marcados"): sin ella, este
    // desglose volvería a desalinearse del total de la card apenas esa otra
    // función se corrigió para de-duplicar -- mismo motivo por el que antes
    // (a propósito) NO de-duplicaba acá, para calzar con el total viejo
    // (ya inflado). Ahora los 2 coinciden de nuevo, ambos de-duplicados.
    const { data: logs } = await supabase.from('log_asistencias')
      .select('id_evento, origen, estado, fecha_entrenamiento, marca_temporal, lugar_externo')
      .eq('nombre_usuario', nombreUsuario).in('origen', ['Admin', 'Externa']) // mismo criterio que recalcularPuntosAsistencia()
      .gte('fecha_entrenamiento', periodo.desde).lt('fecha_entrenamiento', periodo.hasta);
    const ultimaPorEventoDesglose: Record<string, { estado: string; fecha: string; marca: number; externa: boolean; lugar: string }> = {};
    (logs ?? []).forEach((l: any) => {
      const marca = l.marca_temporal ? new Date(l.marca_temporal).getTime() : 0;
      const actual = ultimaPorEventoDesglose[l.id_evento];
      if (!actual || marca >= actual.marca) ultimaPorEventoDesglose[l.id_evento] = { estado: l.estado, fecha: l.fecha_entrenamiento, marca, externa: l.origen === 'Externa', lugar: l.lugar_externo ?? '' };
    });
        const versionesDesglose = await _versionesPuntos();
    const eqDesglose = await _equipoEnMes(versionesDesglose, [nombreUsuario]);
    const filas = Object.keys(ultimaPorEventoDesglose)
      .map((idEvento) => ultimaPorEventoDesglose[idEvento])
      .filter((f) => f.estado === 'A tiempo' || f.estado === 'Tarde')
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
      .map((l: any) => ({
        fecha: String(l.fecha).slice(0, 10),
        estado: l.estado,
                puntos: _valorMarca(l.estado, String(l.fecha).slice(0, 10), versionesDesglose, eqDesglose(nombreUsuario, String(l.fecha).slice(0, 10))),
        // Asistencia externa (adminRegistrarAsistenciaExterna()) -- el
        // frontend la distingue con un badge "Externa" + el lugar, si hay.
        ...(l.externa ? { externa: true, lugar: l.lugar } : {}),
      }));
    const total = filas.reduce((s: number, f: any) => s + f.puntos, 0);
    return { exito: true, concepto, filas, total };
  }

  if (concepto === 'tareas') {
    // Mismo criterio que `puntos_mensuales.puntos_tareas`: el mes/año que
    // recibe el crédito es el de `fecha_revision` (momento de la
    // aprobación, `adminValidarTarea()`), no `fecha_asignacion` ni
    // `fecha_envio`. Los puntos reales por fila se reconstruyen con
    // `_puntosTareaCreditados()` (arriba en este archivo, misma fórmula
    // que usó `adminValidarTarea()` al aprobar -- el valor exacto
    // acreditado nunca queda persistido por separado, solo el agregado
    // mensual).
    const { data: asignaciones } = await supabase.from('asignaciones_tareas')
      .select('tarea_id, fecha_revision, fecha_envio, fecha_vencimiento_personal')
      .eq('nombre_usuario', nombreUsuario).eq('estado', 'aprobada')
      .gte('fecha_revision', periodo.desde).lt('fecha_revision', periodo.hasta)
      .order('fecha_revision', { ascending: false });
    const tareaIds = Array.from(new Set((asignaciones ?? []).map((a: any) => a.tarea_id)));
    const { data: tareasData } = tareaIds.length
      ? await supabase.from('tareas').select('id, titulo, puntos').in('id', tareaIds)
      : { data: [] as any[] };
    const tareaPorId: Record<string, any> = {};
    (tareasData ?? []).forEach((t: any) => { tareaPorId[t.id] = t; });
    const filas: Array<{ titulo: string; fecha: string; puntos: number; reconciliacion?: boolean }> = (asignaciones ?? []).map((a: any) => {
      const t = tareaPorId[a.tarea_id];
      const puntosOriginales = Number(t?.puntos) || 0;
      return {
        titulo: t?.titulo || '(tarea eliminada)',
        fecha: String(a.fecha_revision).slice(0, 10),
        puntos: _puntosTareaCreditados(puntosOriginales, a.fecha_vencimiento_personal, a.fecha_envio),
      };
    });

    // Reconciliación por mes (feat nueva, ver MANIFEST.md/CHANGELOG.md --
    // "hueco de datos en puntos_tareas sin asignaciones_tareas trazables")
    // -- a diferencia de `puntos_asistencia` (arriba en este archivo, ahora
    // recalculable desde cero y 100% trazable tras el fix de-dup),
    // `puntos_tareas` NUNCA tiene una función de recálculo completo -- es
    // un ledger puramente incremental (`_acreditarPuntosTarea()`/
    // `_restarPuntosTarea()`, solo en aprobar/revertir/eliminar), así que
    // cualquier hueco histórico (confirmado contra producción: 9
    // combinaciones usuario+mes reales con `puntos_tareas>0` y CERO
    // asignaciones aprobadas con `fecha_revision` ese mes -- típicamente
    // una importación histórica que solo trajo el total mensual, sin el
    // detalle de tarea por tarea, mismo patrón que `puntos_bonificacion`
    // en racha, ver concepto `'racha'` más abajo, pero sin una columna
    // separada que lo distinga acá) NUNCA se resuelve solo, ni con
    // "Recalcular ahora" (esa acción no existe para tareas). Sin esta
    // reconciliación, el desglose de alguien con un hueco así muestra
    // MENOS que la card de arriba, indistinguible de un bug real. Compara,
    // mes por mes dentro del período pedido, el total TRAZABLE armado
    // arriba contra el agregado real guardado en
    // `puntos_mensuales.puntos_tareas` -- si el real es mayor, agrega UNA
    // fila por ese mes con la diferencia, `fecha` = primer día del mes
    // (sin detalle más preciso posible) y `reconciliacion:true` (el
    // frontend la etiqueta "Otros" en vez de un título de tarea real,
    // `_eqDesgloseFilaHtml()`/js/equipo.js). Nunca al revés -- si el
    // trazable diera MÁS que el real guardado, eso sería un bug distinto
    // (¿un mes ya recalculado con datos más nuevos que el agregado
    // guardado?), no se inventa una fila negativa para taparlo.
    const trazablePorMes: Record<string, number> = {};
    filas.forEach((f) => {
      const claveMes = f.fecha.slice(0, 7);
      trazablePorMes[claveMes] = (trazablePorMes[claveMes] || 0) + f.puntos;
    });
    const { data: puntosStoredData } = await supabase.from('puntos_mensuales')
      .select('anio, mes, puntos_tareas')
      .eq('nombre_usuario', nombreUsuario);
    (puntosStoredData ?? []).forEach((p: any) => {
      const fechaFila = p.anio + '-' + String(p.mes).padStart(2, '0') + '-01';
      if (fechaFila < periodo.desde || fechaFila >= periodo.hasta) return;
      const claveMes = p.anio + '-' + String(p.mes).padStart(2, '0');
      const diferencia = Math.round(((Number(p.puntos_tareas) || 0) - (trazablePorMes[claveMes] || 0)) * 100) / 100;
      if (diferencia > 0.001) {
        filas.push({ titulo: 'Otros (sin detalle disponible)', fecha: fechaFila, puntos: diferencia, reconciliacion: true });
      }
    });
    filas.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

    const total = filas.reduce((s: number, f: any) => s + f.puntos, 0);
    return { exito: true, concepto, filas, total };
  }

  if (concepto === 'racha') {
    // Puerto acotado a UN usuario de la misma caminata cronológica que
    // `_reconstruirRachasHistoricas()` (más abajo en este archivo) --
    // deliberadamente NO reusa esa función ni comparte código con ella
    // (aunque el algoritmo es el mismo): esta necesita devolver una FILA
    // por bonus individual con su fecha real, esa otra un mapa acumulado
    // por mes -- forzarlas a compartir implementación arriesgaba una
    // regresión en una función ya verificada varias veces contra
    // producción esta sesión, por una ganancia de reuso chica. `puntos_extra`
    // es la ÚNICA de las 2 fuentes de `puntosRacha` (ver `getEquipo()`,
    // más arriba) con trazabilidad evento por evento en este repo --
    // `puntos_bonificacion` (sistema legado, Code.gs, sin escritor en este
    // repo) es un agregado mensual opaco, sin ningún dato de origen por
    // evento disponible en esta base -- sus meses con datos entran acá
    // como UNA fila por mes (`fecha` = primer día de ese mes, `legado:true`)
    // en vez de inventar una fecha de evento que no existe.
    //
    // CAMBIO 1 + CAMBIO 4 (ver MANIFEST.md, mismo criterio EXACTO que
    // `_reconstruirRachasHistoricas()`, más abajo en este archivo -- sin
    // compartir código por el mismo motivo de arriba, pero manteniendo el
    // MISMO algoritmo a mano para que este desglose no se desalinee del
    // total real de `puntos_extra` que ya corrigió esa función): solo
    // eventos YA ocurridos (`fecha < hoy`), un evento sin marca para esta
    // persona (después de su primera marca real) cuenta como 'Ninguno'
    // implícito, y un evento cancelado nunca suma ni corta -- salvo que
    // tenga un 'Ninguno' explícito, que sí se respeta.
    const hoyISO = new Date().toISOString().slice(0, 10);
    const { data: eventosTodos } = await supabase.from('asistencias')
      .select('id_evento, fecha, inicia, estado')
      .order('fecha', { ascending: true })
      .order('inicia', { ascending: true, nullsFirst: false });
    const eventos = (eventosTodos ?? []).filter((ev: any) => String(ev.fecha) < hoyISO);
    const ordenPorEvento: Record<string, number> = {};
    const fechaPorEvento: Record<string, string> = {};
    const canceladoPorEvento: Record<string, boolean> = {};
    eventos.forEach((ev: any, i: number) => {
      ordenPorEvento[ev.id_evento] = i;
      fechaPorEvento[ev.id_evento] = ev.fecha;
      canceladoPorEvento[ev.id_evento] = ev.estado === 'Evento Cancelado' || ev.estado === 'No se entrena' || ev.estado === 'Eliminado';
    });

    const { data: logsTodos } = await supabase.from('log_asistencias')
      .select('id_evento, estado, marca_temporal')
      .eq('origen', 'Admin').eq('nombre_usuario', nombreUsuario);
    const ultimaPorEvento: Record<string, { estado: string; marca: number }> = {};
    (logsTodos ?? []).forEach((l: any) => {
      if (!Object.prototype.hasOwnProperty.call(ordenPorEvento, l.id_evento)) return;
      const marca = l.marca_temporal ? new Date(l.marca_temporal).getTime() : 0;
      const actual = ultimaPorEvento[l.id_evento];
      if (!actual || marca >= actual.marca) ultimaPorEvento[l.id_evento] = { estado: l.estado, marca };
    });
    let racha = 0;
    let empezo = false;
    const filasExtra: Array<{ fecha: string; puntos: number; legado: boolean }> = [];
    eventos.forEach((ev: any) => {
      const marcaInfo = ultimaPorEvento[ev.id_evento];
      if (!empezo) {
        if (!marcaInfo) return;
        empezo = true;
      }
      if (canceladoPorEvento[ev.id_evento]) {
        if (marcaInfo && marcaInfo.estado === 'Ninguno') racha = 0;
        return;
      }
      const estado = marcaInfo ? marcaInfo.estado : 'Ninguno';
      if (estado === 'A tiempo' || estado === 'Tarde') {
        racha++;
        if (racha % 3 === 0) filasExtra.push({ fecha: String(fechaPorEvento[ev.id_evento]).slice(0, 10), puntos: 2, legado: false });
      } else {
        racha = 0;
      }
    });
    const filasExtraEnPeriodo = filasExtra.filter((f) => f.fecha >= periodo.desde && f.fecha < periodo.hasta);

    const { data: bonifData } = await supabase.from('puntos_mensuales')
      .select('anio, mes, puntos_bonificacion')
      .eq('nombre_usuario', nombreUsuario).neq('puntos_bonificacion', 0);
    const filasBonif = (bonifData ?? [])
      .map((b: any) => ({ anio: Number(b.anio), mes: Number(b.mes), puntos: Number(b.puntos_bonificacion) || 0 }))
      .filter((b: any) => {
        const fechaFila = b.anio + '-' + String(b.mes).padStart(2, '0') + '-01';
        return fechaFila >= periodo.desde && fechaFila < periodo.hasta;
      })
      .map((b: any) => ({ fecha: b.anio + '-' + String(b.mes).padStart(2, '0') + '-01', puntos: b.puntos, legado: true }));

    const filas = filasExtraEnPeriodo.concat(filasBonif)
      .sort((x, y) => (x.fecha < y.fecha ? 1 : x.fecha > y.fecha ? -1 : 0));
    const total = filas.reduce((s: number, f: any) => s + f.puntos, 0);
    return { exito: true, concepto, filas, total };
  }

  return { exito: false, error: 'Concepto inválido.' };
}

async function adminGetQueLlevar(): Promise<any[]> {
  const hoyISO = new Date().toISOString().substring(0, 10);
  const { data: reservas } = await supabase.from('reservas').select('nombre_usuario, id_evento, talla, protecciones, estado').in('estado', ['Confirmada', 'Pendiente']).eq('tipo', 'clase');
  const pendientes = (reservas ?? []).filter((r: any) => (r.talla && r.talla !== 'No') || (r.protecciones && r.protecciones !== 'No'));
  if (!pendientes.length) return [];
  const ids = [...new Set(pendientes.map((r: any) => r.id_evento).filter(Boolean))];
  const { data: eventos } = ids.length ? await supabase.from('asistencias').select('id_evento, fecha, donde').in('id_evento', ids).gte('fecha', hoyISO) : { data: [] };
  const eventosPorId: Record<string, any> = {};
  (eventos ?? []).forEach((e: any) => { eventosPorId[e.id_evento] = e; });

    const usuarios = [...new Set(pendientes.map((r: any) => r.nombre_usuario).filter(Boolean))];
  const { data: equipo } = await supabase.from('equipo').select('username, pronombres, prefijo, telefono').in('username', usuarios).is('eliminado_en', null);
  const pronMap: Record<string, string> = {}, waMap: Record<string, string> = {};
  (equipo ?? []).forEach((r: any) => {
    pronMap[r.username] = r.pronombres ?? '';
    const matchP = (r.prefijo ?? '').match(/\+(\d+)/);
    if (matchP && r.telefono) {
      let telLimpio = r.telefono.replace(/\D/g, '');
      if (telLimpio.startsWith('0')) telLimpio = telLimpio.slice(1);
      waMap[r.username] = 'https://wa.me/' + matchP[1] + telLimpio;
    }
  });

  const out: any[] = [];
  for (const r of pendientes) {
    const ev = eventosPorId[r.id_evento];
    if (!ev) continue;
        out.push({ idEvento: r.id_evento, nombre: r.nombre_usuario, patines: r.talla ?? '', protecciones: r.protecciones ?? '', fecha: ev.fecha + (ev.donde ? ' - ' + ev.donde : ''), pronombres: pronMap[r.nombre_usuario] ?? '', waLink: waMap[r.nombre_usuario] ?? '' });
  }
  return out;
}

// ─── Acciones: push ───────────────────────────────────────────────────────────

// ─── Catálogo único de tipos de notificación (pedido explícito, ver
// MANIFEST.md sección push) ─────────────────────────────────────────────────
// Fuente de verdad ÚNICA de qué notificaciones existen -- ni el frontend
// (Ajustes → Notificaciones, generado 100% desde `getCatalogoNotificaciones`,
// nunca una lista hardcodeada en JS) ni ningún `sendPush()` de este archivo
// pueden mandar un tipo que no esté acá: `sendPush()` lo valida contra
// `CATALOGO_CLAVES` y rechaza (con `console.error`, sin tumbar la acción que
// lo disparó) cualquier `tipo` no registrado. Agregar una notificación nueva
// SIEMPRE empieza por una entrada acá -- de ahí sale sola en Ajustes,
// agrupada por `categoria`, sin tocar ningún HTML/JS del frontend.
// `soloAdmin:true` -- categoría que solo tiene efecto real para cuentas
// admin (el frontend la oculta para el resto, pero el toggle igual se
// guarda si alguien llega a tocarlo, sin efecto práctico).
// `fijo:true` -- no se puede apagar ni aparece en Ajustes (saludos de fin de año, Victor 2026-11-27).
type CatalogoNotifEntry = { clave: string; nombre: string; descripcion: string; categoria: string; soloAdmin?: boolean; soloCoach?: boolean; fijo?: boolean };
const CATALOGO_NOTIFICACIONES: CatalogoNotifEntry[] = [
  { clave: 'recordatorio_1h', nombre: 'Recordatorio 1 hora antes', descripcion: 'Si marcaste "Asistiré", te avisamos cuando falta 1 hora.', categoria: 'Entrenamientos' },
  { clave: 'recordatorio_1dia', nombre: 'Recordatorio del día anterior', descripcion: 'Te preguntamos si vas, si todavía no respondiste.', categoria: 'Entrenamientos' },
  { clave: 'entrenamiento_hoy', nombre: 'Entrenamiento de hoy', descripcion: 'Aviso general la mañana de un entrenamiento o evento.', categoria: 'Entrenamientos' },
  { clave: 'evento_creado', nombre: 'Nuevo evento', descripcion: 'Cuando se crea un entrenamiento o evento nuevo.', categoria: 'Entrenamientos' },
  { clave: 'evento_editado', nombre: 'Cambios en un evento', descripcion: 'Cuando cambia la fecha, hora o lugar de un evento futuro.', categoria: 'Entrenamientos' },
  { clave: 'evento_cancelado', nombre: 'Evento cancelado', descripcion: 'Cuando se cancela un entrenamiento o evento.', categoria: 'Entrenamientos' },
  { clave: 'descanso_programado', nombre: 'Período de descanso', descripcion: 'Cuando se programa una temporada sin entrenamientos.', categoria: 'Entrenamientos' },
  { clave: 'cambios_asistencia', nombre: 'Cambios de asistencia', descripcion: 'Cuando alguien del equipo cambia su respuesta de asistencia a un evento.', categoria: 'Entrenamientos' },
  { clave: 'cumpleanos', nombre: 'Cumpleaños del equipo', descripcion: 'Un aviso el día antes y otro el mismo día del cumpleaños de alguien del equipo (si lo hizo público).', categoria: 'Equipo' },
  { clave: 'cumpleanos_propio', nombre: 'Tu cumpleaños', descripcion: 'Un saludo del equipo el día de tu cumpleaños.', categoria: 'Equipo' },
  { clave: 'aniversario', nombre: 'Tu aniversario en el equipo', descripcion: 'El día en que cumples otro año en el equipo.', categoria: 'Equipo' },
  { clave: 'cambio_estado_miembro', nombre: 'Cambios de estado del equipo', descripcion: 'Cuando alguien queda de viaje, lesionadx o ausente por un tiempo.', categoria: 'Equipo' },
  { clave: 'integrante_nuevo', nombre: 'Nuevo integrante', descripcion: 'Cuando alguien se une al equipo.', categoria: 'Equipo' },
        { clave: 'comprobante_pendiente', nombre: 'Comprobante pendiente', descripcion: 'Si hiciste una reserva y falta subir el comprobante de pago.', categoria: 'Cuenta' },
    { clave: 'cuota_pendiente', nombre: 'Recordatorios de cuota', descripcion: 'El día 1, el día antes de la fecha límite, el día después y después de tu clase de gracia, solo si aún no pagaste. No llegan si ya pagaste o tu pago está en revisión.', categoria: 'Cuenta' },
    { clave: 'cambio_categoria', nombre: 'Cambio de categoría', descripcion: 'Cuando cambia tu categoría (Mirlxs/Quindes).', categoria: 'Cuenta' },
      { clave: 'reserva_sin_terminar', nombre: 'Suscripción sin terminar', descripcion: 'Si dejaste a medias una suscripción a una clase o mensualidad, te avisamos una vez para completarla.', categoria: 'Cuenta' },
  { clave: 'solicitud_resuelta', nombre: 'Respuesta a tus solicitudes', descripcion: 'Cuando aprueban o rechazan tus pagos, reservas o excepciones de cuota.', categoria: 'Cuenta' },
  // Notificaciones de entrenador (Victor, 2026-11-26).
  { clave: 'aviso_entrenador', nombre: 'Avisos del equipo técnico', descripcion: 'Mensajes que te manda el equipo técnico.', categoria: 'Entrenamientos' },
  { clave: 'logro_nivel', nombre: 'Logros de nivel', descripcion: 'Cuando completas un nivel de habilidades.', categoria: 'Entrenamientos' },
  { clave: 'novedades_progreso', nombre: 'Novedades en tu progreso', descripcion: 'Los lunes, si el equipo técnico dejó notas o resultados nuevos.', categoria: 'Entrenamientos' },
  { clave: 'coach_por_evaluar', nombre: 'Entrenamientos por evaluar', descripcion: 'El día siguiente a un entrenamiento, si falta evaluar a quienes vinieron.', categoria: 'Entrenamientos', soloCoach: true },
  { clave: 'coach_pedido_plan', nombre: 'Entrenamiento sin plan', descripcion: 'El día antes de un entrenamiento de tus equipos que todavía no tiene plan.', categoria: 'Entrenamientos', soloCoach: true },
            { clave: 'curso_nuevo', nombre: 'Cursos nuevos', descripcion: 'Cuando se abre un curso o una clínica que puedes tomar.', categoria: 'Entrenamientos' },
      { clave: 'tarea_nueva', nombre: 'Tareas nuevas', descripcion: 'Cuando se publica una tarea que puedes tomar.', categoria: 'Tareas' },
  { clave: 'tarea_vence', nombre: 'Tareas por vencer', descripcion: 'Un día antes de que venza una tarea que tomaste.', categoria: 'Tareas' },
  { clave: 'tarea_revisada', nombre: 'Revisión de tus tareas', descripcion: 'Cuando admins aprueban o devuelven una tarea que enviaste.', categoria: 'Tareas' },
    { clave: 'aviso_pivots', nombre: 'Avisos de los Pivots', descripcion: 'Mensajes que los Pivots envían al equipo.', categoria: 'Equipo' },
  { clave: 'social', nombre: 'Sociales y fiestas', descripcion: 'Amigo secreto listo, lo que te falta completar, tu evento aprobado o con cambios y mensajes para ti.', categoria: 'Equipo' },
  { clave: 'saludo_fin_anio', nombre: 'Saludos de fin de año', descripcion: 'Feliz Navidad en el último entrenamiento antes del 25 y las gracias al terminar el año.', categoria: 'Equipo', fijo: true },
  { clave: 'avisos_admin', nombre: 'Avisos para admins', descripcion: 'Resumen antes del entrenamiento, bajas de última hora, solicitudes pendientes y cambios de reservas.', categoria: 'Administración', soloAdmin: true },
];
const CATALOGO_CLAVES = new Set(CATALOGO_NOTIFICACIONES.map((c) => c.clave));
const CLAVES_FIJAS = new Set(CATALOGO_NOTIFICACIONES.filter((c) => c.fijo).map((c) => c.clave));

async function getCatalogoNotificaciones(): Promise<Record<string, any>> {
  return { exito: true, tipos: CATALOGO_NOTIFICACIONES.filter((c) => !c.fijo) };
}

// ─── Preferencias de notificación por persona (migración
// 20261103_push_preferencias.sql) ───────────────────────────────────────────
// `push_notificaciones_activas` (boolean, default true) -- interruptor
// general, gana sobre cualquier preferencia puntual. `push_preferencias`
// (jsonb, default '{}') -- mapa clave→boolean; una clave AUSENTE significa
// "activada" (default on, pedido explícito) -- así una notificación nueva
// agregada al catálogo no deja a nadie afuera retroactivamente, nadie tiene
// que "activarla" a mano.
function _personaQuierePush(row: { push_notificaciones_activas?: boolean | null; push_preferencias?: Record<string, boolean> | null; estado_miembro?: string | null } | null | undefined, tipo: string): boolean {
  // Inactivxs no reciben avisos de la app (Victor, 2026-11-28), salvo el de
  // su cambio de estado (por ejemplo, cuando vuelven a estar activxs).
  if (row?.estado_miembro === 'Inactivx' && tipo !== 'cambio_estado_miembro') return false;
  if (CLAVES_FIJAS.has(tipo)) return true;
  if (!row) return true; // sin fila en `equipo` (ej. admin puro) -- no hay dónde guardar una preferencia, se manda igual
  if (row.push_notificaciones_activas === false) return false;
  const prefs = row.push_preferencias || {};
  return prefs[tipo] !== false;
}

async function getPreferenciasPush(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const { data, error } = await supabase.from('equipo').select('push_notificaciones_activas, push_preferencias').eq('username', username).maybeSingle();
  if (error || !data) return { exito: false, error: error?.message ?? 'No encontrado.' };
  return { exito: true, activas: data.push_notificaciones_activas !== false, preferencias: data.push_preferencias || {} };
}

// Guarda el interruptor general (`activas`) y/o 1 preferencia puntual
// (`clave`+`valor`) -- ambos opcionales, se puede mandar cualquiera de los
// 2 o los 2 juntos en la misma llamada (el interruptor general del frontend
// solo manda `activas`, cada toggle individual solo manda `clave`+`valor`).
async function guardarPreferenciasPush(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const update: Record<string, any> = {};
  if (params.activas !== undefined) update.push_notificaciones_activas = (params.activas === 'true' || params.activas === true);
  // Cuántas horas antes llega el resumen del evento a un Pivot (1, 2 o 3).
  if (params.clave === 'resumenHoras') {
    const h = Number(params.valor);
    if (![1, 2, 3].includes(h)) return { exito: false, error: 'Elige 1, 2 o 3 horas.' };
    const { data: fila } = await supabase.from('equipo').select('push_preferencias').eq('username', username).maybeSingle();
    const { error } = await supabase.from('equipo').update({ push_preferencias: { ...((fila?.push_preferencias as Record<string, unknown>) ?? {}), resumenHoras: h } }).eq('username', username);
    return error ? { exito: false, error: error.message } : { exito: true };
  }
  if (params.clave !== undefined) {
    const clave = String(params.clave);
        // Avisos de Pivot por área (pivot_<area>, 2026-11-13).
    const esAreaPivot = /^pivot_[a-z]+(_[a-z]+)?$/.test(clave) && AREAS_PIVOT.includes(clave.slice(6).split('_')[0]);
    if (!CATALOGO_CLAVES.has(clave) && !esAreaPivot) return { exito: false, error: 'Tipo de notificación inválido.' };
    const { data: fila } = await supabase.from('equipo').select('push_preferencias').eq('username', username).maybeSingle();
    const prefs: Record<string, boolean> = (fila?.push_preferencias as Record<string, boolean>) || {};
    prefs[clave] = (params.valor === 'true' || params.valor === true);
    update.push_preferencias = prefs;
  }
  if (!Object.keys(update).length) return { exito: false, error: 'Nada para guardar.' };
  const { error } = await supabase.from('equipo').update(update).eq('username', username);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

// Destinatarios reales de un aviso "para todos los admins" -- bug real
// corregido (ver MANIFEST.md sección push): antes era una lista de alias
// 'admin_'+email que dejó de coincidir con el external_id real de un admin
// con fila propia en `equipo` (ahora su username, ver js/pwa.js/js/auth.js),
// y DESPUÉS un filtro de OneSignal por tag `es_admin` (sin forma de
// respetar la preferencia por persona, ya que `filters` no se puede
// combinar con una lista de destinatarios). Esta versión resuelve la
// identidad real de cada admin (username si tiene fila en `equipo`, si no
// 'admin_'+email) Y filtra por su preferencia de `avisos_admin` antes de
// devolver la lista -- pensada para pasar directo a `sendPush({
// include_external_user_ids: ... })`. `excluirEmail` -- quien disparó el
// cambio que motiva el aviso, para no notificarle de su propia acción (si
// además es admin).
async function _adminDestinatariosPush(excluirEmail?: string, area?: string, sub?: string): Promise<string[]> {
  const { data: adminsRows } = await supabase.from('admins').select('email, areas');
  const emails = new Set([ADMIN_PRINCIPAL.toLowerCase(), ...(adminsRows ?? []).map((a: any) => String(a.email).toLowerCase())]);
  if (excluirEmail) emails.delete(excluirEmail.toLowerCase());
  // Avisos de Pivot por área (2026-11-13): solo quien tiene el área y no
  // apagó ese aviso (push_preferencias.pivot_<area>, encendido por defecto).
  if (area) {
    (adminsRows ?? []).forEach((a: any) => {
      if (Array.isArray(a.areas) && !a.areas.includes(area)) emails.delete(String(a.email).toLowerCase());
    });
  }
  // Sin filtrar `eliminado_en` en el `.select()` a propósito -- mismo
  // motivo que en `sendPush()` (ver ese comentario): si se filtrara acá, un
  // admin archivado perdería su fila de `porEmail` y caería al fallback
  // "sin fila = admin puro, mandar a 'admin_'+email" de más abajo, cuando
  // en realidad hay que excluirlo del todo (archivado es archivado, sea
  // admin o no). `_estaArchivado()` lo excluye explícito ANTES de llegar a
  // ese fallback.
  const { data: equipoRows } = await supabase.from('equipo').select('username, email, push_notificaciones_activas, push_preferencias, eliminado_en');
  const porEmail: Record<string, any> = {};
  (equipoRows ?? []).forEach((r: any) => { if (r.email) porEmail[String(r.email).toLowerCase()] = r; });
  const out: string[] = [];
  emails.forEach((email) => {
    const fila = porEmail[email];
    if (_estaArchivado(fila)) return;
        if (!_personaQuierePush(fila, 'avisos_admin')) return;
        if (area && !_personaQuierePush(fila, 'pivot_' + area)) return;
    // Aviso puntual dentro del área (Notificaciones → Avisos de Pivot → Personalizar).
    if (area && sub && !_personaQuierePush(fila, `pivot_${area}_${sub}`)) return;
    out.push(fila ? fila.username : 'admin_' + email);
  });
  // Nunca se pierde un aviso: si nadie con esa área lo tiene encendido, va a
  // todos los Pivots que reciben avisos.
  if (area && !out.length) return _adminDestinatariosPush(excluirEmail);
  return out;
}

// ─── Push nativo: Firebase Cloud Messaging (app Android, 2026-11-06) ────────
// FCM_SERVICE_ACCOUNT = JSON de una cuenta de servicio del proyecto Firebase
// "pivot-d65f4" (secret de Supabase, nunca en el repo). Se firma un JWT
// RS256 y se cambia por un access token OAuth2 (cacheado ~55 min por
// instancia). Mensajes SOLO de datos (sin bloque `notification`): la app
// arma la notificación con sus botones (app/lib/push/push.dart), incluso
// con la app cerrada. Tokens inválidos (UNREGISTERED) se borran solos.
const FCM_SERVICE_ACCOUNT = Deno.env.get('FCM_SERVICE_ACCOUNT') ?? '';
let _fcmAcceso: { token: string; vence: number; proyecto: string } | null = null;

function _b64urlTexto(texto: string): string {
  return _b64urlEncode(new TextEncoder().encode(texto));
}

async function _fcmAccessToken(): Promise<{ token: string; proyecto: string } | null> {
  if (_fcmAcceso && _fcmAcceso.vence > Date.now() + 60_000) return _fcmAcceso;
  let cuenta: any;
  try { cuenta = JSON.parse(FCM_SERVICE_ACCOUNT); } catch { console.error('FCM: FCM_SERVICE_ACCOUNT no es JSON válido'); return null; }
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = _b64urlTexto(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = _b64urlTexto(JSON.stringify({
    iss: cuenta.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahora,
    exp: ahora + 3600,
  }));
  const pem = String(cuenta.private_key ?? '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const llave = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', llave, new TextEncoder().encode(cabecera + '.' + cuerpo));
  const jwt = cabecera + '.' + cuerpo + '.' + _b64urlEncode(new Uint8Array(firma));
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt,
  });
  if (!resp.ok) { console.error('FCM: no se obtuvo access token', resp.status, await resp.text().catch(() => '')); return null; }
  const out = await resp.json();
  _fcmAcceso = { token: out.access_token, vence: Date.now() + (Number(out.expires_in) || 3600) * 1000, proyecto: cuenta.project_id };
  return _fcmAcceso;
}

async function _tokensFcmDe(usernames: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  if (!usernames.length) return mapa;
  const { data, error } = await supabase.from('dispositivos_push').select('token, username').in('username', usernames);
  if (error) { console.error('dispositivos_push (lectura):', error.message); return mapa; }
  (data ?? []).forEach((r: any) => {
    const lista = mapa.get(r.username) ?? [];
    lista.push(r.token);
    mapa.set(r.username, lista);
  });
  return mapa;
}

async function _enviarFcm(tokens: string[], payload: {
  tipo: string; headings: { es: string }; contents: { es: string }; url?: string; pantalla?: string;
  web_buttons?: { id: string; text: string; url: string }[]; data?: Record<string, any>;
}): Promise<void> {
  const acceso = await _fcmAccessToken();
  if (!acceso) return;
  const datos: Record<string, string> = {
    tipo: payload.tipo,
    titulo: payload.headings.es,
    cuerpo: payload.contents.es,
  };
  if (payload.url) datos.url = payload.url;
    if (payload.data?.evento_id) datos.evento_id = String(payload.data.evento_id);
  if (payload.pantalla) datos.pantalla = payload.pantalla;
  if (payload.data?.token) datos.token_accion = String(payload.data.token);
  if (payload.web_buttons?.length) {
    datos.botones = JSON.stringify(payload.web_buttons.map((b) => ({ id: b.id, texto: b.text })));
  }
  const fin = 'https://fcm.googleapis.com/v1/projects/' + acceso.proyecto + '/messages:send';
  await Promise.allSettled(tokens.map(async (token) => {
    const resp = await fetch(fin, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + acceso.token },
      body: JSON.stringify({ message: { token, data: datos, android: { priority: 'HIGH', ttl: '86400s' } } }),
    });
    if (resp.ok) return;
    const texto = await resp.text().catch(() => '');
    if (resp.status === 404 || texto.includes('UNREGISTERED') || texto.includes('registration-token-not-registered')) {
      await supabase.from('dispositivos_push').delete().eq('token', token);
      return;
    }
    console.error('FCM: envío falló', resp.status, texto.substring(0, 300), 'tipo:', payload.tipo);
  }));
}

// La app registra/borra su token de FCM (identidad SIEMPRE del token de sesión).
async function registrarDispositivoPush(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const fcmToken = String(params.fcmToken ?? '').trim();
  if (fcmToken.length < 20 || fcmToken.length > 4096) return { exito: false, error: 'Token de dispositivo inválido.' };
  const { error } = await supabase.from('dispositivos_push').upsert(
        { token: fcmToken, username, plataforma: params.plataforma === 'web' ? 'web' : 'android', actualizado_en: new Date().toISOString() },
    { onConflict: 'token' },
  );
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

/** La app informa si la persona tiene las notificaciones activas (Victor, 2026-11-18). */
async function estadoAvisos(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const estado = String(params.estado ?? '');
  if (!['activos', 'pendiente', 'bloqueados', 'instalar', 'sin_soporte'].includes(estado)) return { exito: false, error: 'Estado inválido.' };
  await supabase.from('equipo').update({ avisos: estado, avisos_en: new Date().toISOString() }).eq('username', username);
  return { exito: true };
}

async function eliminarDispositivoPush(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  await supabase.from('dispositivos_push').delete().eq('token', String(params.fcmToken ?? '')).eq('username', username);
  return { exito: true };
}

// Helper genérico de push (sendPush(), más abajo): manda por Firebase Cloud
// Messaging a los dispositivos de `dispositivos_push` (app Android y web
// Flutter). Best-effort: un push que falla nunca tumba la acción real que
// lo disparó. `tipo` es OBLIGATORIO y se valida contra
// `CATALOGO_NOTIFICACIONES`. `broadcastEquipo:true` resuelve todo
// `equipo.username` y filtra por preferencia del `tipo`
// (`_personaQuierePush()`); `excluirUsernames` saca a quien no debe recibir
// su propio aviso. Con `include_external_user_ids` (nombre heredado: lista
// de usernames) armado por quien llama, igual se filtra por preferencia.
// ─── Palabras según pronombres (Victor, 2026-11-16) ──────────────────────
// Solo Ella → a ("Lesionada"); solo Él → o; solo Elle → e; varios o ninguno
// → x. Solo en textos para o sobre una persona. Misma lista que la app
// (core/pronombres.dart).
function _generoDe(pronombres: any): 'a' | 'o' | 'e' | 'x' {
  const s = String(pronombres ?? '').toLowerCase();
  const ella = /\bella\b/.test(s);
  const el = /(^|[^a-záéíóúñ])(él|el)([^a-záéíóúñ]|$)/.test(s);
  const elle = /\belle\b/.test(s);
  if ([ella, el, elle].filter(Boolean).length !== 1) return 'x';
  return ella ? 'a' : el ? 'o' : 'e';
}
const _IRREGULARES_X: Record<string, [string, string, string]> = {
  unx: ['una', 'un', 'une'],
  administradorx: ['administradora', 'administrador', 'administradore'],
};
const _REGULARES_X = new Set(['lesionadx', 'inactivx', 'activx', 'nuevx', 'marcadx', 'inscritx', 'archivadx', 'bienvenidx', 'hermanx', 'listx', 'invitadx',
  'aprobadx', 'pausadx', 'anotadx', 'elegidx', 'seleccionadx', 'confirmadx', 'retiradx', 'cansadx', 'ausentadx']);
function _conPronombres(texto: string, pronombres: any): string {
  const g = _generoDe(pronombres);
  if (g === 'x' || !texto) return texto;
  const i = g === 'a' ? 0 : g === 'o' ? 1 : 2;
  return texto.replace(/[A-Za-zÁÉÍÓÚáéíóúÑñ]+x\b/g, (w) => {
    const b = w.toLowerCase();
    const nueva = _IRREGULARES_X[b]?.[i] ?? (_REGULARES_X.has(b) ? b.slice(0, -1) + 'aoe'[i] : null);
    if (!nueva) return w;
    return w[0] === w[0].toUpperCase() ? nueva[0].toUpperCase() + nueva.slice(1) : nueva;
  });
}

async function sendPush(payload: {
  tipo: string;
  include_external_user_ids?: string[];
  broadcastEquipo?: boolean;
  excluirUsernames?: string[];
  headings: { es: string; en?: string };
  contents: { es: string; en?: string };
  url?: string;
  web_buttons?: { id: string; text: string; url: string }[];
  data?: Record<string, any>;
  // Evento del aviso: aplica el alcance (`_filtrarDestinatariosEvento`).
  // Sin esto, los tipos de TIPOS_PUSH_EVENTO lo toman de `data.evento_id`
  // o de `?evento=` en la url.
  evento?: AlcanceEvento | null;
    // Aviso personal con un tipo de evento (ej. curso movido, clase a favor):
  // no se filtra por estado ni por equipo.
  personal?: boolean;
  // Pantalla que abre al tocarla (Victor, 2026-11-22). Sin esto se usa la
  // del tipo (PANTALLA_POR_TIPO); con un evento, abre el evento.
  pantalla?: string;
}): Promise<void> {
    if (!CATALOGO_CLAVES.has(payload.tipo)) {
    console.error('sendPush: tipo no registrado en el catálogo, no se envía:', payload.tipo);
    return;
  }
  // Cada notificación lleva a su pantalla (Victor, 2026-11-22): el evento si
  // tiene uno (también en Android, que antes solo lo leía de data.evento_id) o
  // la pantalla de su tipo.
  {
    const enUrl = /[?&]evento=([^&#]+)/.exec(payload.url ?? '')?.[1];
    const evId = payload.data?.evento_id ?? payload.evento?.idEvento ?? (enUrl ? decodeURIComponent(enUrl) : null);
    if (evId) payload = { ...payload, data: { ...(payload.data ?? {}), evento_id: evId } };
    else {
      const pantalla = payload.pantalla ?? PANTALLA_POR_TIPO[payload.tipo];
      const sinDestino = !payload.url || payload.url.replace(/\/+$/, '') === APP_URL.replace(/\/+$/, '');
      if (pantalla && sinDestino) payload = { ...payload, pantalla, url: `${APP_URL.replace(/\/+$/, '')}/?abrir=${encodeURIComponent(pantalla)}` };
    }
  }
  const aplicaAlcance = !payload.personal && (TIPOS_PUSH_EVENTO.has(payload.tipo) || !!payload.evento);
  let destinatarios: string[];
  if (payload.broadcastEquipo) {
    const { data: filas } = await supabase.from('equipo').select('username, push_notificaciones_activas, push_preferencias, estado_miembro' + (aplicaAlcance ? ', ' + COLS_ALCANCE : '')).is('eliminado_en', null);
    const excluir = new Set(payload.excluirUsernames ?? []);
    destinatarios = (filas ?? [])
      .filter((r: any) => r.username && !excluir.has(r.username) && _personaQuierePush(r, payload.tipo))
      .map((r: any) => r.username);
    if (aplicaAlcance) {
      const porUsername: Record<string, any> = {};
      (filas ?? []).forEach((r: any) => { porUsername[r.username] = r; });
      destinatarios = await _filtrarDestinatariosEvento(_alcanceDePush(payload), destinatarios, { filas: porUsername });
    }
  } else {
    const usernames = payload.include_external_user_ids ?? [];
    if (!usernames.length) return;
    // Trae `eliminado_en` SIN filtrar por él en el `.select()` (a
    // diferencia del `broadcastEquipo` de arriba) -- un alias 'admin_'+email
    // de un admin sin fila (ver `_adminDestinatariosPush()`) no tiene fila
    // en absoluto, y `_personaQuierePush(undefined, ...)` lo manda igual
    // por default (correcto, sin relación con archivado); una persona
    // archivada SÍ tiene fila, así que se excluye explícito con
    // `_estaArchivado()` -- si en cambio se filtrara en el `.select()`, su
    // fila directamente no volvería y `porUsername[u]` quedaría
    // `undefined`, cayendo al MISMO default "sin fila = mandar igual" que
    // un alias admin -- justo lo que no se quiere acá.
        const { data: filas } = await supabase.from('equipo').select('username, push_notificaciones_activas, push_preferencias, eliminado_en, pronombres, estado_miembro' + (aplicaAlcance ? ', ' + COLS_ALCANCE : '')).in('username', usernames);
    const porUsername: Record<string, any> = {};
    (filas ?? []).forEach((r: any) => { porUsername[r.username] = r; });
        destinatarios = usernames.filter((u) => !_estaArchivado(porUsername[u]) && _personaQuierePush(porUsername[u], payload.tipo));
    if (aplicaAlcance) destinatarios = await _filtrarDestinatariosEvento(_alcanceDePush(payload), destinatarios, { filas: porUsername });
    // Un aviso para una sola persona habla según sus pronombres (Victor, 2026-11-16).
    if (destinatarios.length === 1) {
      const pr = porUsername[destinatarios[0]]?.pronombres;
      payload = {
        ...payload,
        headings: { ...payload.headings, es: _conPronombres(payload.headings.es, pr) },
        contents: { ...payload.contents, es: _conPronombres(payload.contents.es, pr) },
      };
    }
  }
  if (!destinatarios.length) return;

  // Todos los avisos van por Firebase Cloud Messaging (app Android y web
  // Flutter, tokens en `dispositivos_push`). OneSignal se dio de baja el
  // 2026-11-27: quien no tiene token no recibe push hasta aceptar los avisos.
  if (!FCM_SERVICE_ACCOUNT) return;
  const tokensPorUsuario = await _tokensFcmDe(destinatarios);
  const conApp = destinatarios.filter((u) => tokensPorUsuario.has(u));
  if (conApp.length) await _enviarFcm(conApp.flatMap((u) => tokensPorUsuario.get(u)!), payload);
}

const DIAS_ES  = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// 'YYYY-MM-DD' -> "lunes 3 de marzo". new Date(y,m-1,d) (componentes, no el
// string ISO directo) a propósito -- new Date('YYYY-MM-DD') parsea como UTC
// medianoche, que en cualquier huso negativo (Ecuador, UTC-5) cae al día
// ANTERIOR al mostrarse en hora local -- mismo tipo de bug ya evitado en el
// resto de este archivo con fechas de `asistencias`/`equipo`.
function _fechaEs(fechaIso: string): string {
  const [y, m, d] = String(fechaIso).split('-').map((n) => Number(n));
  if (!y || !m || !d) return String(fechaIso ?? '');
  const dt = new Date(y, m - 1, d);
  return DIAS_ES[dt.getDay()] + ' ' + d + ' de ' + MESES_ES[m - 1];
}

// 'HH:MM(:SS)' -> "6:00 p.m."
function _horaEs(horaStr: string | null): string {
  if (!horaStr) return '';
  const partes = String(horaStr).split(':');
  const hh = Number(partes[0]), mm = Number(partes[1] ?? 0);
  if (Number.isNaN(hh)) return '';
  const ampm = hh >= 12 ? 'p.m.' : 'a.m.';
  let h12 = hh % 12; if (h12 === 0) h12 = 12;
  return h12 + (mm ? ':' + String(mm).padStart(2, '0') : '') + ' ' + ampm;
}

// Fecha de hoy en hora de pared de Ecuador (UTC-5 fijo, sin DST -- mismo
// criterio ya documentado en supabase/migrations/20260831000000_cron_eventos_finalizados.sql),
// como string 'YYYY-MM-DD'.
function _hoyEcuadorISO(): string {
  const ecu = new Date(Date.now() - 5 * 3600 * 1000);
  return ecu.toISOString().substring(0, 10);
}

// 'YYYY-MM-DD' de hoy (hora de pared Ecuador) + `n` días -- usado por los
// crons de recordatorio de abajo para acotar el `.in('fecha', [...])` a un
// puñado de días candidatos antes de filtrar por instante real
// (_instanteEventoUTC) -- evita traer TODA la tabla `asistencias`.
function _fechaEcuadorMasDias(n: number): string {
  const hoy = _hoyEcuadorISO();
  return new Date(new Date(hoy + 'T00:00:00Z').getTime() + n * 24 * 3600 * 1000).toISOString().substring(0, 10);
}

// Instante real (epoch ms, UTC) de un evento a partir de `fecha`+`inicia` --
// esas 2 columnas son componentes de hora de PARED de Ecuador, sin
// timezone propia (mismo criterio que _hoyEcuadorISO()/_fechaEs() arriba),
// así que el instante UTC real es la hora de pared + 5h (UTC-5 fijo, sin
// DST). `null` si falta cualquiera de los 2 componentes (evento sin hora
// fijada todavía, ej. offseason) -- nunca entra en ninguna ventana de los
// crons de abajo.
function _instanteEventoUTC(fecha: string | null, hora: string | null): number | null {
  if (!fecha || !hora) return null;
  const [y, m, d] = String(fecha).split('-').map(Number);
  const [hh, mm] = String(hora).split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh)) return null;
  return Date.UTC(y, m - 1, d, hh + 5, mm || 0, 0);
}

// ─── Crons: recordatorios de eventos + resumen admin (feat nueva) ─────────────
// Mismo mecanismo que cronDiario (arriba): gateados por header x-cron-secret
// en el router (Deno.serve), disparados por pg_net desde pg_cron -- ver
// supabase/migrations/*_push_cron_recordatorios.sql. `equipo` "activo" =
// `estado_miembro` distinto de 'Lesionadx'/'Ausente' (mismo criterio que
// recalcular-categorias/index.ts salta Lesionadx del recálculo de tier --
// alguien marcado como no-entrenando-ahora no debería recibir "¿vas
// mañana?"/el resumen de asistentes de admin lo cuenta igual si de hecho
// marcó 'Asistiré', eso no cambia).
const EQUIPO_ACTIVO_FILTRO = (r: { estado_miembro?: string | null }) =>
  r.estado_miembro !== 'Lesionadx' && r.estado_miembro !== 'Ausente' && r.estado_miembro !== 'De viaje';

// ─── Alcance de los avisos de eventos (Victor, 2026-11-20) ────────────────
// Avisos de eventos y de asistencia (evento nuevo, cambios, cancelación,
// recordatorios, confirmaciones y cambios de asistencia de otras personas):
//  1. Solo a personas Activx (`estado_miembro` vacío o 'Activx'); nunca a
//     archivadxs. Inactivx (Ausente), Lesionadx, De viaje, Enfermedad, etc.
//     no los reciben. Una cuenta admin sin fila en `equipo` recibe igual.
//  2. Evento con `asistencias.equipos` no vacío: solo personas de esos
//     equipos (`equipo.categoria`), coaches aprobadxs de esos equipos o de
//     toda la liga (`coaches.equipos` vacío) y Pivots (`admins` no tiene
//     equipo: todo Pivot es de toda la liga). Vacío = toda la liga.
// Pagos, cuotas, comprobantes, cursos y avisos personales no pasan por acá.
// `sendPush()` lo aplica solo a los tipos de TIPOS_PUSH_EVENTO (salvo
// `personal: true`) y a cualquier envío con `evento` (ej. avisos_admin de
// un evento). La bandeja "Del equipo" usa el mismo filtro (`soloEquipos`).
const TIPOS_PUSH_EVENTO = new Set(['recordatorio_1h', 'recordatorio_1dia', 'entrenamiento_hoy', 'evento_creado', 'evento_editado', 'evento_cancelado', 'descanso_programado', 'cambios_asistencia']);
const COLS_ALCANCE = 'email, estado_miembro, categoria, eliminado_en';
type AlcanceEvento = { idEvento?: string | null; equipos?: string[] | null };

/// Pantalla de la app que abre cada tipo de notificación sin evento (Victor, 2026-11-22).
const PANTALLA_POR_TIPO: Record<string, string> = {
  comprobante_pendiente: 'pagos', cuota_pendiente: 'pagos', solicitud_resuelta: 'pagos', reserva_sin_terminar: 'pagos',
  tarea_nueva: 'tareas', tarea_vence: 'tareas', tarea_revisada: 'tareas',
  curso_nuevo: 'cursos',
  aviso_entrenador: 'entrenamiento', novedades_progreso: 'progreso', logro_nivel: 'progreso', coach_por_evaluar: 'entrenamiento', coach_pedido_plan: 'entrenamiento',
  avisos_admin: 'novedades', aviso_pivots: 'novedades', cumpleanos: 'novedades', cumpleanos_propio: 'novedades', aniversario: 'novedades', social: 'novedades',
  integrante_nuevo: 'equipo', cambio_estado_miembro: 'equipo', cambio_categoria: 'equipo',
};

function _esActivx(row: { estado_miembro?: string | null } | null | undefined): boolean {
  const e = String(row?.estado_miembro ?? '').trim();
  return !e || e === 'Activx';
}

/// Lista de equipos de un parámetro (array o texto separado por comas).
function _listaEquipos(v: unknown): string[] {
  const l = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  return [...new Set(l.map((x) => String(x ?? '').trim()).filter(Boolean))];
}

/// `asistencias.equipos` por evento. Sin la columna (migración
/// 20261120030000 sin aplicar) o si la lectura falla: toda la liga.
async function _equiposDeEventos(ids: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const unicos = [...new Set(ids.map(String).filter(Boolean))];
  if (!unicos.length) return out;
  const { data, error } = await supabase.from('asistencias').select('id_evento, equipos').in('id_evento', unicos);
  if (error) return out;
  (data ?? []).forEach((r: any) => { out[String(r.id_evento)] = _listaEquipos(r.equipos); });
  return out;
}

/// Evento de un envío: `evento`, o `data.evento_id`, o `?evento=` de la url.
function _alcanceDePush(p: { evento?: AlcanceEvento | null; data?: Record<string, any>; url?: string }): AlcanceEvento | null {
  if (p.evento) return p.evento;
  const id = p.data?.evento_id ?? /[?&]evento=([^&#]+)/.exec(String(p.url ?? ''))?.[1];
  if (!id) return null;
  try { return { idEvento: decodeURIComponent(String(id)) }; } catch { return { idEvento: String(id) }; }
}

/// Filtro central: de `usernames`, deja solo a quien le corresponde un aviso
/// del `evento` (reglas arriba). Mantiene el orden. `filas`: filas de
/// `equipo` ya leídas (con COLS_ALCANCE); si no, las lee. `soloEquipos`: no
/// mira el estado de la persona (bandeja "Del equipo").
async function _filtrarDestinatariosEvento(evento: AlcanceEvento | null, usernames: string[], opts: { filas?: Record<string, any>; soloEquipos?: boolean } = {}): Promise<string[]> {
  if (!usernames.length) return [];
  let filas = opts.filas;
  if (!filas) {
    const mapa: Record<string, any> = {};
    const { data } = await supabase.from('equipo').select('username, ' + COLS_ALCANCE).in('username', [...new Set(usernames)]);
    (data ?? []).forEach((r: any) => { mapa[r.username] = r; });
    filas = mapa;
  }
  const equipos = !evento ? [] : evento.equipos != null ? _listaEquipos(evento.equipos)
    : evento.idEvento ? ((await _equiposDeEventos([String(evento.idEvento)]))[String(evento.idEvento)] ?? []) : [];
  // Social o fiesta (social.ts): sin aprobar no le llega a nadie; publicado,
  // solo a quienes están invitadxs (su equipo, varios, toda la liga o personas).
  let social: Awaited<ReturnType<typeof alcanceSocial>> = null;
  try { social = evento?.idEvento ? await alcanceSocial(supabase, String(evento.idEvento)) : null; } catch { social = null; }
  if (social && !social.publicado) return [];
  const coaches: Record<string, string[]> = {};
  const pivots = new Set<string>();
  if (equipos.length) {
    const [{ data: cs }, { data: ads }] = await Promise.all([
      supabase.from('coaches').select('username, equipos').eq('estado', 'aprobado'),
      supabase.from('admins').select('email'),
    ]);
    (cs ?? []).forEach((c: any) => { coaches[c.username] = _listaEquipos(c.equipos); });
    [ADMIN_PRINCIPAL, ...(ads ?? []).map((a: any) => a.email)].forEach((e) => { if (e) pivots.add(String(e).toLowerCase()); });
  }
  return usernames.filter((u) => {
    const f = filas![u];
    if (!f) return true; // cuenta admin sin fila ('admin_'+email): Pivot de toda la liga
    if (_estaArchivado(f)) return false;
    if (!opts.soloEquipos && !_esActivx(f)) return false;
    if (social) return social.invitadx(u, f.categoria ?? null);
    if (!equipos.length) return true;
    if (equipos.includes(String(f.categoria ?? ''))) return true;
    if (f.email && pivots.has(String(f.email).toLowerCase())) return true;
    const ce = coaches[u];
    return !!ce && (!ce.length || ce.some((e) => equipos.includes(e)));
  });
}

// ─── Cómo nombrar un evento en el texto de una push (2026-11-06) ──────────
// Pedido explícito: "este sábado" si es esta semana (lunes a domingo),
// "el próximo sábado" si es la semana siguiente, la fecha (1/1/2027) si es
// más adelante. Se agregan "hoy"/"mañana" (se leen más naturales). Todo en
// hora de pared de Ecuador (_hoyEcuadorISO()).
const _DIAS_SEMANA_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function _diasEntreISO(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
function _lunesDeISO(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const desdeLunes = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - desdeLunes * 86400000).toISOString().substring(0, 10);
}
// Complemento con su preposición: 'de hoy' | 'de mañana' | 'de este sábado' |
// 'del próximo sábado' | 'del 1/1/2027'.
function _cuandoEvento(fechaIso: string): string {
  const hoy = _hoyEcuadorISO();
  const f = String(fechaIso ?? '').substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return '';
  const dif = _diasEntreISO(hoy, f);
  if (dif === 0) return 'de hoy';
  if (dif === 1) return 'de mañana';
  const dia = _DIAS_SEMANA_ES[new Date(f + 'T00:00:00Z').getUTCDay()];
  const semanas = _diasEntreISO(_lunesDeISO(hoy), _lunesDeISO(f)) / 7;
  if (dif > 0 && semanas === 0) return `de este ${dia}`;
  if (dif > 0 && semanas === 1) return `del próximo ${dia}`;
  const [y, m, d] = f.split('-').map(Number);
  return `del ${d}/${m}/${y}`;
}
function _tipoEventoMin(tipo?: string | null): string {
  const t = String(tipo ?? '').trim();
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : 'entrenamiento';
}
// 'entrenamiento de este sábado' (para "al ..." / "del ...").
function _eventoFrase(tipo: string | null | undefined, fecha: string): string {
  return `${_tipoEventoMin(tipo)} ${_cuandoEvento(fecha)}`.trim();
}
/** Fiestas y sociales (Victor, 2026-11-22): "evento Naviquinde del próximo
 *  10 de diciembre" en vez de "social de…". Con sorpresa, el nombre neutro
 *  (el aviso lo puede leer quien no debe enterarse). El resto, como siempre. */
async function _eventoFraseAviso(idEvento: string, tipo: string | null | undefined, fecha: string): Promise<string> {
  if (String(tipo ?? '') !== 'Social') return _eventoFrase(tipo, fecha);
  const { data: cfg } = await supabase.from('social_eventos').select('nombre, nombre_neutro, sorpresa').eq('id_evento', idEvento).maybeSingle();
  const neutro = String(cfg?.nombre_neutro ?? '').trim();
  const nombre = cfg?.sorpresa ? neutro : (String(cfg?.nombre ?? '').trim() || neutro);
  const f = String(fecha ?? '').substring(0, 10);
  let cuando = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(f)) {
    const dif = _diasEntreISO(_hoyEcuadorISO(), f);
    const [, m, d] = f.split('-').map(Number);
    cuando = dif === 0 ? 'de hoy' : dif === 1 ? 'de mañana' : `${dif > 0 ? 'del próximo' : 'del'} ${d} de ${MESES_ES[m - 1]}`;
  }
  return `evento ${nombre || 'social'} ${cuando}`.trim();
}
function _listaNombresEs(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join('');
  return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
}
function _urlEvento(idEvento: string, extra = ''): string {
  return APP_URL + '/?evento=' + encodeURIComponent(idEvento) + extra;
}
async function _nombresMostrarPorUsername(usernames: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  usernames.forEach((u) => { out[u] = u; });
  if (!usernames.length) return out;
  const { data } = await supabase.from('equipo').select('username, nombre_derby').in('username', usernames);
  (data ?? []).forEach((r: any) => { out[r.username] = _nombreMostrar(r); });
  return out;
}
// Anti-duplicado de push por persona+evento (tabla `push_enviados`,
// migración 20261106201736) -- para recordatorios con ventana ancha que
// corren cada hora y deben salir UNA sola vez.
// Devuelve `null` si la lectura falla -- quien llama NO debe enviar nada en
// ese caso (bug real 2026-11-06: sin GRANT para service_role la lectura
// fallaba en silencio, el set quedaba vacío y se reenviaban recordatorios).
async function _pushYaEnviados(tipo: string, idsEvento: string[]): Promise<Set<string> | null> {
  const out = new Set<string>();
  if (!idsEvento.length) return out;
  const { data, error } = await supabase.from('push_enviados').select('id_evento, username').eq('tipo', tipo).in('id_evento', idsEvento);
  if (error) { console.error('push_enviados (lectura):', error.message); return null; }
  (data ?? []).forEach((r: any) => out.add(r.id_evento + '|' + r.username));
  return out;
}
// Marca ANTES de enviar: si la marca falla, no se envía (mejor un aviso
// perdido que uno repetido cada hora).
async function _marcarPushEnviado(tipo: string, idEvento: string, username: string): Promise<boolean> {
  const { error } = await supabase.from('push_enviados').upsert({ tipo, id_evento: idEvento, username }, { onConflict: 'tipo,id_evento,username', ignoreDuplicates: true });
  if (error) { console.error('push_enviados (escritura):', error.message); return false; }
  return true;
}
async function _eventosEnVentana(desdeMs: number, hastaMs: number, diasCandidatos: number[]): Promise<any[]> {
  const { data: eventos } = await supabase.from('asistencias')
    .select('id_evento, fecha, inicia, donde, tipo_evento')
    .in('fecha', diasCandidatos.map(_fechaEcuadorMasDias))
    .not('estado', 'in', '("Evento Cancelado","No se entrena","Eliminado")');
  return (eventos ?? []).filter((e: any) => {
    const t = _instanteEventoUTC(e.fecha, e.inicia);
    return t !== null && t >= desdeMs && t <= hastaMs;
  });
}
// Solo cuentan respuestas de personas que siguen en el equipo (Victor,
// 2026-11-12: el número salía inflado por asistencias anticipadas de
// personas archivadas o eliminadas).
async function _soloEnEquipo(usernames: string[]): Promise<string[]> {
  if (!usernames.length) return [];
  const { data } = await supabase.from('equipo').select('username').in('username', [...new Set(usernames)]).is('eliminado_en', null);
  const vigentes = new Set((data ?? []).map((r: any) => r.username));
  return usernames.filter((u) => vigentes.has(u));
}
const _textoAsistiran = (n: number) => (n === 0 ? 'Todavía nadie confirmó que asistirá.' : n === 1 ? '1 persona asistirá hoy.' : `${n} personas asistirán hoy.`);
const _BTN_ASISTIRE = { id: 'asistire', text: 'Asistiré', url: '_osp=do_not_open' };
const _BTN_NO_ASISTIRE = { id: 'no-asistire', text: 'No asistiré', url: '_osp=do_not_open' };

// Aviso 1 hora antes (2026-11-06, reemplaza al "¡Tu entrenamiento es en 1
// hora!" anterior). Ventana 55-65min (1 tick del cron cada 10min).
//   - Quien marcó 'Asistiré' o 'No jugador' (y NO es admin): lista de quiénes
//     asisten + botón "No asistiré" (RSVP en background, ver
//     OneSignalSDKWorker.js / record-attendance).
//   - Admins: lo reciben en cronAdminEvento() (abajo) con el botón "Cancelar
//     entrenamiento" en vez de "No asistiré" -- se excluyen acá para que no
//     les lleguen 2 avisos del mismo evento.
async function cronRecordatorioEvento(): Promise<Record<string, any>> {
  const ahora = Date.now();
    try { await _enviarAvisosProgramados(); } catch (e) { console.error('[avisos] programados:', e); }
  try { await _avisarReservasSinTerminar(); } catch (e) { console.error('[reservas] sin terminar:', e); }
  const enVentana = await _eventosEnVentana(ahora + 55 * 60 * 1000, ahora + 65 * 60 * 1000, [0, 1]);
  if (!enVentana.length) return { exito: true, eventos: 0, enviados: 0 };

  const asistPorEvento = await _ultimaAsistenciaPorPersonaTodas(enVentana.map((e: any) => e.id_evento));
  const admins = new Set(await _adminDestinatariosPush());
  let enviados = 0;
  for (const ev of enVentana) {
        const filas = asistPorEvento[ev.id_evento] ?? [];
    const asisten: string[] = await _soloEnEquipo(filas.filter((a: any) => a.estado === 'Asistiré').map((a: any) => a.nombre));
    const noJugador: string[] = await _soloEnEquipo(filas.filter((a: any) => a.estado === 'No jugador').map((a: any) => a.nombre));
    const destinatarios = [...asisten, ...noJugador].filter((u) => !admins.has(u));
    if (!destinatarios.length) continue;
    const tipo = _tipoEventoMin(ev.tipo_evento);
    // Sin nombres (Victor, 2026-11-12): solo cuántas personas van.
    const cuerpo = _textoAsistiran(asisten.length) + ' ¿Ya no puedes ir? Cambia tu estado:';
    const url = _urlEvento(String(ev.id_evento));
    await Promise.allSettled(destinatarios.map(async (username: string) => {
      const token = await _firmarTokenAccion(username, String(ev.id_evento));
      if (!token) return;
      await sendPush({
        tipo: 'recordatorio_1h',
        include_external_user_ids: [username],
        headings: { es: `El ${tipo} ${_cuandoEvento(ev.fecha)} empieza en 1 hora` },
        contents: { es: cuerpo },
        url,
        data: { token, evento_id: String(ev.id_evento), url },
        web_buttons: [_BTN_NO_ASISTIRE],
      });
      enviados++;
    }));
  }
  return { exito: true, eventos: enVentana.length, enviados };
}

// Recordatorio "no pusiste tu asistencia" (2026-11-06) -- a quien NO tiene
// ninguna fila en log_asistencias para un evento que empieza en las
// próximas 24h (y en más de 90min). Corre cada hora; `push_enviados` evita
// repetirlo, así que un evento creado con menos de 24h de anticipación
// también avisa en el siguiente tick (antes solo salía en la ventana
// 23-25h y esos eventos nunca avisaban). Botones Asistiré/No asistiré en
// background; tocar la notificación abre el detalle del evento.
async function cronRecordatorio1Dia(): Promise<Record<string, any>> {
  const ahora = Date.now();
    try { await _recordarComprobantes(ahora); } catch (e) { console.error('[comprobantes] recordatorios:', e); }
  try { await _cerrarReservasVencidas(ahora); } catch (e) { console.error('[reservas] cerrar vencidas:', e); }
  const enVentana = await _eventosEnVentana(ahora + 90 * 60 * 1000, ahora + 24 * 3600 * 1000 + 5 * 60 * 1000, [0, 1, 2]);
  // Limpieza de registros viejos del anti-duplicado (best-effort).
  await supabase.from('push_enviados').delete().lt('enviado_en', new Date(ahora - 30 * 24 * 3600 * 1000).toISOString());
  if (!enVentana.length) return { exito: true, eventos: 0, enviados: 0 };

  // Quién recibe: alcance de cada evento (_filtrarDestinatariosEvento, Victor 2026-11-20).
  const { data: equipoRows } = await supabase.from('equipo').select('username, ' + COLS_ALCANCE).is('eliminado_en', null);
  const filasEquipo: Record<string, any> = {};
  (equipoRows ?? []).forEach((r: any) => { if (r.username) filasEquipo[r.username] = r; });
  const todos = Object.keys(filasEquipo);

  const ids = enVentana.map((e: any) => String(e.id_evento));
  const [asistPorEvento, yaEnviados, equiposPorEvento] = await Promise.all([_ultimaAsistenciaPorPersonaTodas(ids), _pushYaEnviados('recordatorio_1dia', ids), _equiposDeEventos(ids)]);
  if (!yaEnviados) return { exito: false, error: 'No se pudo leer push_enviados; no se envió nada.' };
  let enviados = 0;
  for (const ev of enVentana) {
    const idEv = String(ev.id_evento);
    const respondieron = new Set((asistPorEvento[ev.id_evento] ?? []).map((a: any) => a.nombre));
    const pendientes = await _filtrarDestinatariosEvento({ idEvento: idEv, equipos: equiposPorEvento[idEv] ?? [] },
      todos.filter((u) => !respondieron.has(u) && !yaEnviados.has(idEv + '|' + u)), { filas: filasEquipo });
    const evento = await _eventoFraseAviso(idEv, ev.tipo_evento, ev.fecha);
    const detalle = [_horaEs(ev.inicia), ev.donde].filter(Boolean).join(' · ');
    const url = _urlEvento(idEv);
    await Promise.allSettled(pendientes.map(async (username) => {
      const token = await _firmarTokenAccion(username, idEv);
      if (!token) return;
      if (!(await _marcarPushEnviado('recordatorio_1dia', idEv, username))) return;
      await sendPush({
        tipo: 'recordatorio_1dia',
        include_external_user_ids: [username],
        headings: { es: `¿Vas al ${evento}?` },
        contents: { es: `Aún no has puesto tu asistencia${detalle ? ' (' + detalle + ')' : ''}. Avisa al equipo:` },
        url,
        data: { token, evento_id: idEv, url },
        web_buttons: [_BTN_ASISTIRE, _BTN_NO_ASISTIRE],
        evento: { idEvento: idEv, equipos: equiposPorEvento[idEv] ?? [] },
      });
      enviados++;
    }));
  }
  return { exito: true, eventos: enVentana.length, enviados };
}

// Resumen para admins 1h antes (2026-11-06) -- quiénes vienen +
// equipamiento a prestar + botón "Cancelar entrenamiento" (abre la app en
// el detalle del evento con la confirmación de cancelar, nunca cancela en
// background: un toque accidental cancelaría para todo el equipo). Ahora
// sale también si nadie confirmó (es justo cuando más sentido tiene
// cancelar). 1 sola llamada para todos los admins.
async function cronAdminEvento(): Promise<Record<string, any>> {
  // Recordatorios de feedback a lxs coaches (Victor, 2026-11-16).
    // Sin recordatorio al coach después de cada clase (Victor, 2026-11-17): lo
  // pendiente se ve al abrir Coach. A las personas, aviso semanal (cronDiario).
  // Cada Pivot elige 1, 2 o 3 horas antes (Victor, 2026-11-22; por defecto 1):
  // `push_preferencias.resumenHoras`.
  const todos = await _adminDestinatariosPush(undefined, 'asistencia', 'resumen');
  if (!todos.length) return { exito: true, eventos: 0, enviados: 0 };
  const { data: prefs } = await supabase.from('equipo').select('username, push_preferencias').in('username', todos);
  const horasDe: Record<string, number> = {};
  (prefs ?? []).forEach((r: any) => { horasDe[r.username] = Number(r.push_preferencias?.resumenHoras) || 1; });
  let eventos = 0, enviados = 0;
  for (const h of [1, 2, 3]) {
    const dest = todos.filter((u) => (horasDe[u] ?? 1) === h);
    if (!dest.length) continue;
    const r = await _resumenAdminEvento(h, dest);
    eventos += r.eventos;
    enviados += r.enviados;
  }
  return { exito: true, eventos, enviados };
}

async function _resumenAdminEvento(horas: number, adminDestinatarios: string[]): Promise<{ eventos: number; enviados: number }> {
  const ahora = Date.now();
  const enVentana = await _eventosEnVentana(ahora + (horas * 60 - 5) * 60 * 1000, ahora + (horas * 60 + 5) * 60 * 1000, [0, 1]);
  if (!enVentana.length) return { eventos: 0, enviados: 0 };

  const asistPorEvento = await _ultimaAsistenciaPorPersonaTodas(enVentana.map((e: any) => e.id_evento));
  // Mínimo de personas para sugerir cancelar (Mi Liga → reglas, por defecto 5).
  const minPersonas = Number((await _reglasLiga()).eventosMinPersonas) || 0;
  let enviados = 0;
  for (const ev of enVentana) {
        const filas = asistPorEvento[ev.id_evento] ?? [];
    const asisten: string[] = await _soloEnEquipo(filas.filter((a: any) => a.estado === 'Asistiré').map((a: any) => a.nombre));

    const { data: equipoRows } = asisten.length ? await supabase.from('equipo')
      .select('username, nombre_derby, necesita_patines, necesita_protecciones, talla')
      .in('username', asisten).is('eliminado_en', null) : { data: [] as any[] };
    const porUsername: Record<string, any> = {};
    (equipoRows ?? []).forEach((r: any) => { porUsername[r.username] = r; });
        // Resumen corto (Victor, 2026-11-12): cuántas personas y qué llevar; el
    // detalle con tallas está en el evento.
    let patines = 0, protecciones = 0;
    asisten.forEach((u) => {
      const r = porUsername[u];
      if (r?.necesita_patines === 'Sí') patines++;
      if (r?.necesita_protecciones === 'Sí') protecciones++;
    });
    const llevar = [patines ? `${patines} ${patines === 1 ? 'patín' : 'patines'}` : '', protecciones ? `${protecciones} ${protecciones === 1 ? 'protección' : 'protecciones'}` : ''].filter(Boolean);

    const tipo = _tipoEventoMin(ev.tipo_evento);
    const n = asisten.length;
    const partes = [_textoAsistiran(n)];
    if (llevar.length) partes.push(`Equipamiento a llevar hoy: ${llevar.join(' y ')}.`);
    // "Cancelar" solo con menos de 5 personas; si no, el admin que asiste ve
    // "No asistiré". Cualquiera de los dos abre la app para confirmar.
    const pocos = n < minPersonas;
    if (pocos) partes.push('Son pocas personas: puedes cancelarlo.');

    const url = _urlEvento(String(ev.id_evento));
    const titulo = `El ${tipo} ${_cuandoEvento(ev.fecha)} empieza en ${horas === 1 ? '1 hora' : `${horas} horas`}`;
    if (pocos) {
      await sendPush({
        tipo: 'avisos_admin',
        include_external_user_ids: adminDestinatarios,
        headings: { es: titulo },
        contents: { es: partes.join(' ') },
        url,
        data: { url, evento_id: String(ev.id_evento) },
        web_buttons: [{ id: 'cancelar', text: `Cancelar ${tipo}`, url: _urlEvento(String(ev.id_evento), '&accion=cancelar') }],
        evento: { idEvento: String(ev.id_evento) },
      });
    } else {
      await Promise.allSettled(adminDestinatarios.map(async (admin: string) => {
        const va = asisten.includes(admin);
        const token = va ? await _firmarTokenAccion(admin, String(ev.id_evento)) : null;
        await sendPush({
          tipo: 'avisos_admin',
          include_external_user_ids: [admin],
          headings: { es: titulo },
          contents: { es: partes.join(' ') },
          url,
          data: token ? { url, token, evento_id: String(ev.id_evento) } : { url, evento_id: String(ev.id_evento) },
          web_buttons: token ? [_BTN_NO_ASISTIRE] : undefined,
          evento: { idEvento: String(ev.id_evento) },
        });
      }));
    }
    enviados++;
  }
  return { eventos: enVentana.length, enviados };
}

// ─── Push: cambio de asistencia + solicitud pendiente (feat nueva) ────────────

// Llamada por el frontend cuando alguien CAMBIA una respuesta ya existente
// (no cuando marca por primera vez -- ver `estado_anterior`, TAREA 7 en
// js/eventos.js). Identidad SIEMPRE server-side vía `_validarToken(token)`
// -- nunca se confía en un `usuario_id`/nombre que mande el body (spoofing
// trivial si no), mismo criterio que el resto de acciones gateadas por
// token de este archivo.
async function pushAsistenciaCambio(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const idEvento = params.evento_id;
  const estadoNuevo = params.estado_nuevo;
  const estadoAnterior = params.estado_anterior;
  if (!estadoAnterior) return { exito: true, omitido: true };
  if (!idEvento || !estadoNuevo) return { exito: false, error: 'Parámetros inválidos.' };

  const { data: equipoRows } = await supabase.from('equipo').select('username, nombre_derby, estado_miembro').is('eliminado_en', null);
  const propio = (equipoRows ?? []).find((r: any) => r.username === username);
  const nombreMostrar = propio?.nombre_derby || username;
  // Estado y equipos: los filtra sendPush() con el alcance del evento.
  const destinatarios: string[] = (equipoRows ?? [])
    .filter((r: any) => r.username && r.username !== username)
    .map((r: any) => r.username);
  if (!destinatarios.length) return { exito: true };

  const urlEventos = APP_URL + '/?tab=eventos';
  await sendPush({
    tipo: 'cambios_asistencia',
    include_external_user_ids: destinatarios,
    headings: { es: 'Cambio de asistencia' },
    contents: { es: `${nombreMostrar} cambió su asistencia a ${estadoNuevo}` },
    url: urlEventos,
    data: { url: urlEventos },
    evento: { idEvento: String(idEvento) },
  });
  return { exito: true };
}

// Llamada por el frontend al crear una solicitud nueva (reserva, lesión,
// excepción de cuota, etc.) -- avisa a todos los admins. Fuera de alcance
// por ahora: un trigger de DB como caller alternativo (mencionado en el
// pedido original) necesitaría su propio mecanismo de auth (esta acción
// exige `token` de sesión real, un trigger de Postgres no tiene uno) --
// solo se conectó el camino desde el frontend.
async function pushSolicitudPendiente(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const tipoSolicitud = params.tipo_solicitud ?? '';
  const descripcionBreve = params.descripcion_breve;
  const urlSeccion = params.url_seccion;
  if (!descripcionBreve) return { exito: false, error: 'Falta descripcion_breve.' };

  const urlFinal = urlSeccion
    ? (String(urlSeccion).startsWith('http') ? String(urlSeccion) : APP_URL + urlSeccion)
    : APP_URL;
  await sendPush({
    tipo: 'avisos_admin',
    include_external_user_ids: await _adminDestinatariosPush(undefined, ...((({ reserva: ['finanzas', 'reservas'], pago: ['finanzas', 'pagos'], excepcion: ['finanzas', 'excepciones'], lesion: ['salud', 'lesiones'], tarea: ['tareas', 'validar'], rectificacion: ['asistencia', 'rectificaciones'] } as Record<string, [string, string]>)[String(tipoSolicitud)]) ?? []) as [string?, string?]),
    headings: { es: 'Nueva solicitud pendiente' },
    contents: { es: String(descripcionBreve) },
    url: urlFinal,
    data: { url: urlFinal, tipo_solicitud: tipoSolicitud },
  });
  return { exito: true };
}

// Estado de push de todo el equipo activo, para la sección "Notificaciones
// del equipo" de Mi Liga -- admin-only. `EQUIPO_ACTIVO_FILTRO` (arriba, ya
// usado por cronRecordatorio1Dia()/pushAsistenciaCambio()) excluye
// Lesionadx/Ausente/De viaje -- mismo universo de "a quién le debería
// llegar un push" que ya usa el resto de este archivo.
async function adminGetEstadoPush(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { data, error } = await supabase.from('equipo')
    .select('username, nombre_derby, foto_perfil, estado_miembro')
    .is('eliminado_en', null)
    .order('username');
    if (error) return { exito: false, error: error.message };
  const activos = (data ?? []).filter((r: any) => EQUIPO_ACTIVO_FILTRO(r));
  // Recibe avisos: tiene al menos un dispositivo registrado (FCM, app o web).
  const conApp = await _tokensFcmDe(activos.map((r: any) => r.username));
  const personas = activos
    .map((r: any) => ({
      username: r.username,
      nombreDerby: r.nombre_derby || r.username,
      fotoPerfil: r.foto_perfil || '',
      app: conApp.has(r.username),
    }));
  return { exito: true, personas };
}

// ─── Avisos de los Pivots (Victor, 2026-11-14) ──────────────────────────────
// Avisos de Pivots: llegan por Firebase (app y web) vía sendPush. `destino` = 'todos' o lista de usernames.
// Con `enviarEn` futuro queda en `avisos_programados` y lo manda el cron de
// cada 10 minutos (`_enviarAvisosProgramados`).
async function _mandarAviso(titulo: string, mensaje: string, destino: unknown): Promise<void> {
  const todos = destino === 'todos' || !Array.isArray(destino) || !destino.length;
  await sendPush({
    tipo: 'aviso_pivots', ...(todos ? { broadcastEquipo: true } : { include_external_user_ids: (destino as any[]).map(String) }),
    headings: { es: titulo }, contents: { es: mensaje }, url: APP_URL,
  });
}

async function adminEnviarAviso(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const titulo = String(params.titulo ?? '').trim().slice(0, 80), mensaje = String(params.mensaje ?? '').trim().slice(0, 500);
  if (!titulo || !mensaje) return { exito: false, error: 'Escribe el título y el mensaje.' };
  let destino: any = 'todos';
  try { const d = JSON.parse(String(params.destino ?? '"todos"')); if (Array.isArray(d) && d.length) destino = d.map(String); } catch { /* todos */ }
    const enviarEn = params.enviarEn ? Date.parse(String(params.enviarEn)) : NaN;
  // Hasta cuándo se ve en Notificaciones (máximo 30 días; sin fecha, 3 días).
  const venceMs = params.venceEn ? Date.parse(String(params.venceEn)) : NaN;
  const sale = Number.isFinite(enviarEn) ? enviarEn : Date.now();
  const vence_en = Number.isFinite(venceMs) && venceMs > sale ? new Date(Math.min(venceMs, sale + 30 * 86400000)).toISOString() : null;
  if (Number.isFinite(enviarEn) && enviarEn > Date.now() + 60 * 1000) {
    const { error } = await supabase.from('avisos_programados').insert({ titulo, mensaje, destino, enviar_en: new Date(enviarEn).toISOString(), creado_por: email, vence_en });
    if (error) return { exito: false, error: 'No se pudo programar.' };
    return { exito: true, programado: true };
  }
  await _mandarAviso(titulo, mensaje, destino);
    await supabase.from('avisos_programados').insert({ titulo, mensaje, destino, enviar_en: new Date().toISOString(), enviado_en: new Date().toISOString(), creado_por: email, vence_en });
  return { exito: true, programado: false };
}

/** accion: listar (próximos y últimos 20 enviados) | cancelar (id). */
async function adminAvisosProgramados(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  if (params.accion === 'cancelar') {
    const { data } = await supabase.from('avisos_programados').update({ cancelado_en: new Date().toISOString() })
      .eq('id', String(params.id ?? '')).is('enviado_en', null).is('cancelado_en', null).select('id');
    return data?.length ? { exito: true } : { exito: false, error: 'Ese aviso ya se envió o se canceló.' };
  }
  const [{ data: prox }, { data: env }] = await Promise.all([
    supabase.from('avisos_programados').select('id, titulo, mensaje, destino, enviar_en').is('enviado_en', null).is('cancelado_en', null).order('enviar_en'),
    supabase.from('avisos_programados').select('id, titulo, mensaje, destino, enviado_en').not('enviado_en', 'is', null).order('enviado_en', { ascending: false }).limit(20),
  ]);
  return { exito: true, programados: prox ?? [], enviados: env ?? [] };
}

async function _enviarAvisosProgramados(): Promise<void> {
  const { data } = await supabase.from('avisos_programados').select('id, titulo, mensaje, destino')
    .is('enviado_en', null).is('cancelado_en', null).lte('enviar_en', new Date().toISOString()).limit(20);
  for (const a of data ?? []) {
    // Marca primero: si el cron se solapa, no se manda dos veces.
    const { data: tomado } = await supabase.from('avisos_programados').update({ enviado_en: new Date().toISOString() }).eq('id', a.id).is('enviado_en', null).select('id');
    if (tomado?.length) await _mandarAviso(a.titulo, a.mensaje, a.destino);
  }
}

// Aviso de un cambio de asistencia de un usuario -- complementa a
// pushAsistenciaCambio() (arriba), que en cambio avisa solo al EQUIPO ACTIVO
// (alias por username, tabla `equipo`, excluyendo a quien cambió, filtrado
// por EQUIPO_ACTIVO_FILTRO). Llamada desde js/eventos.js
// (_evMarcarAsistencia(), mismo call site que ya dispara pushAsistenciaCambio)
// justo después de que marcarAsistenciaUsuario() confirma éxito.
async function notificarCambioAsistencia(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false };
  return await _notificarCambioAsistenciaCore(username, params.idEvento, params.estadoNuevo, params.estadoAnterior);
}

// Texto (pedido explícito 2026-11-06): siempre empieza por el nombre derby
// (o el username si no tiene), sin "null → ..." cuando no había estado
// previo, y con la fecha dicha como "de hoy"/"de mañana"/"de este sábado"/
// "del próximo sábado"/"del 1/1/2027" (_cuandoEvento()). Destinatarios sin
// cambios: admins siempre (menos quien cambió); el resto del equipo solo
// cuando alguien pasa de 'Asistiré' a 'No asistiré'. Lo usan
// notificarCambioAsistencia (app, identidad del token) y
// notificarCambioAsistenciaInterno (record-attendance, botones de la push,
// gateado por x-cron-secret en el router).
function _estadoAsistenciaVacio(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return !s || s === 'null' || s === 'undefined' || s === 'sin respuesta';
}
async function _notificarCambioAsistenciaCore(username: string, idEventoRaw: unknown, estadoNuevoRaw: unknown, estadoAnteriorRaw: unknown): Promise<Record<string, any>> {
  const idEvento = String(idEventoRaw ?? '').trim();
  const estadoNuevo = String(estadoNuevoRaw ?? '').trim();
  const estadoAnterior = _estadoAsistenciaVacio(estadoAnteriorRaw) ? '' : String(estadoAnteriorRaw).trim();
  if (!idEvento || _estadoAsistenciaVacio(estadoNuevo)) return { exito: false };
  if (estadoAnterior === estadoNuevo) return { exito: true };
  const [{ data: ev }, { data: quien }] = await Promise.all([
    supabase.from('asistencias').select('fecha, tipo_evento').eq('id_evento', idEvento).maybeSingle(),
    supabase.from('equipo').select('username, nombre_derby, email').eq('username', username).maybeSingle(),
  ]);
  if (!ev) return { exito: false };
  const nombre = _nombreMostrar(quien ?? { username });
  const evento = await _eventoFraseAviso(idEvento, ev.tipo_evento, ev.fecha);
  let texto: string;
  if (!estadoAnterior) {
    texto = estadoNuevo === 'Asistiré' ? `${nombre} confirmó que asistirá al ${evento}.`
      : estadoNuevo === 'No asistiré' ? `${nombre} avisó que no asistirá al ${evento}.`
      : estadoNuevo === 'No jugador' ? `${nombre} irá como no jugador al ${evento}.`
      : `${nombre} marcó "${estadoNuevo}" en el ${evento}.`;
  } else {
    texto = `${nombre} cambió su asistencia del ${evento} a ${estadoNuevo}.`;
  }
  const url = _urlEvento(idEvento);
  await sendPush({
    tipo: 'avisos_admin',
    include_external_user_ids: await _adminDestinatariosPush(quien?.email, 'asistencia', 'cambios'),
    headings: { es: estadoAnterior ? 'Cambio de asistencia' : 'Nueva asistencia' },
    contents: { es: texto },
    url,
    data: { url },
    evento: { idEvento },
  });
  if (estadoAnterior === 'Asistiré' && estadoNuevo === 'No asistiré') {
    // Estado y equipos: los filtra sendPush() con el alcance del evento.
    const { data: miembros } = await supabase.from('equipo').select('username').is('eliminado_en', null);
    const destinatarios = (miembros ?? [])
      .map((m: any) => m.username)
      .filter((u: string) => u && u !== username);
    if (destinatarios.length > 0) {
      await sendPush({
        tipo: 'cambios_asistencia',
        include_external_user_ids: destinatarios,
        headings: { es: 'Cambio de asistencia' },
        contents: { es: texto },
        url,
        data: { url },
        evento: { idEvento },
      });
    }
  }
  return { exito: true };
}

// Notificaciones puntuales de eventos/offseason -- llamadas desde el
// FRONTEND (js/eventos.js) justo después de que el fetch() directo a
// PostgREST (crear/editar evento, crear temporada de descanso) ya resolvió
// con éxito -- esa parte del flujo nunca pasó por esta Edge Function (ver
// MANIFEST.md, "Eventos -- creación/edición vía REST directo"), así que no
// hay ningún insert/update propio de acá del que enganchar el push: estas
// 4 acciones son wrappers finos sobre sendPush(), gateadas por adminToken
// (cualquier cuenta con sesión admin válida puede dispararlas, mismo
// criterio que el resto de acciones `admin*` de este archivo), que reciben
// los datos YA CONOCIDOS por el frontend en vez de volver a leerlos de la
// base. `adminCancelarEvento` también dispara `pushEventoCancelado` desde el
// mismo call site del frontend.
// ─── Token firmado para RSVP-desde-push en background (sin abrir la app) ──────
// Payload `{ u: username, e: idEvento, exp: epoch ms }`, HMAC-SHA256 con
// PUSH_TOKEN_SECRET (arriba), formato `base64url(payload).base64url(firma)`.
// No es un JWT estándar (sin header/alg negociable, a propósito -- superficie
// mínima para un token de un solo uso/propósito) pero mismo principio:
// firmado + con expiración, verificado server-side antes de confiar en
// `u`/`e`. Verificación en supabase/functions/record-attendance/index.ts
// (mismo PUSH_TOKEN_SECRET, función standalone -- no puede importar de acá).
function _b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function _firmarTokenAccion(username: string, idEvento: string): Promise<string | null> {
  if (!PUSH_TOKEN_SECRET) return null;
  const payload = JSON.stringify({ u: username, e: idEvento, exp: Date.now() + 21 * 24 * 3600 * 1000 });
  const payloadB64 = _b64urlEncode(new TextEncoder().encode(payload));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(PUSH_TOKEN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const firma = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return payloadB64 + '.' + _b64urlEncode(new Uint8Array(firma));
}

/// Alcance de un aviso pedido por la app: `equipos` (si lo manda) o el del
/// evento `idEvento`. Sin ninguno, toda la liga (igual filtra por estado).
async function _alcanceDeParams(params: Record<string, any>): Promise<AlcanceEvento | null> {
  const idEvento = params.idEvento != null && String(params.idEvento).trim() ? String(params.idEvento).trim() : null;
  if (params.equipos != null) return { idEvento, equipos: _listaEquipos(params.equipos) };
  return idEvento ? { idEvento, equipos: (await _equiposDeEventos([idEvento]))[idEvento] ?? [] } : null;
}

async function pushEventoCreado(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { tipo, fecha, hora, lugar, idEvento } = params;
  const headings = { es: `Nuevo ${tipo || 'evento'}: ${_fechaEs(fecha)}` };
  const contents = { es: `${_horaEs(hora)} · ${lugar || ''}` };
  const alcance = await _alcanceDeParams(params);

  // Con idEvento -- RSVP directo desde los 2 botones de acción del aviso
  // (record-attendance, sin abrir la app) con un token firmado POR PERSONA
  // (_firmarTokenAccion arriba): por eso un sendPush() por persona, cada
  // uno con su `data`. Best-effort (Promise.allSettled); cada envío filtra
  // por preferencia, así que quien desactivó `evento_creado` no lo recibe.
  if (idEvento && PUSH_TOKEN_SECRET) {
    const { data: equipoRows } = await supabase.from('equipo').select('username').is('eliminado_en', null);
    // Solo a quien le corresponde el evento (sin firmar tokens de más).
    const usernames: string[] = await _filtrarDestinatariosEvento(alcance, (equipoRows ?? []).map((r: any) => r.username).filter(Boolean));
    await Promise.allSettled(usernames.map(async (username) => {
      const token = await _firmarTokenAccion(username, String(idEvento));
      if (!token) return;
      await sendPush({
        tipo: 'evento_creado',
        include_external_user_ids: [username],
        headings, contents,
        url: APP_URL + '/?tab=eventos',
        data: { token, evento_id: String(idEvento) },
        web_buttons: [
          { id: 'asistire', text: 'Asistiré', url: '_osp=do_not_open' },
          { id: 'no-asistire', text: 'No asistiré', url: '_osp=do_not_open' },
        ],
        evento: alcance,
      });
    }));
    return { exito: true };
  }

  // Sin idEvento, o sin PUSH_TOKEN_SECRET configurado todavía -- broadcast
  // simple sin botones de acción (comportamiento previo, sin cambios).
  await sendPush({ tipo: 'evento_creado', broadcastEquipo: true, headings, contents, url: APP_URL + '/?tab=eventos', evento: alcance });
  return { exito: true };
}

async function pushEventoCancelado(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { tipo, fecha, hora, lugar } = params;
  await sendPush({
    tipo: 'evento_cancelado',
    broadcastEquipo: true,
    headings: { es: 'Evento cancelado' },
    contents: { es: `${tipo || 'Evento'} del ${_fechaEs(fecha)} · ${lugar || ''} · ${_horaEs(hora)}` },
    url: APP_URL + '/?tab=eventos',
    evento: await _alcanceDeParams(params),
  });
  return { exito: true };
}

// Diff real antes/después, en vez de depender de un texto "cambios" armado
// en el frontend (bug real corregido, ver MANIFEST.md sección push) -- el
// PATCH de la edición ya ocurrió (REST directo desde js/eventos.js, ver
// comentario de arriba), así que este backend compara el snapshot PREVIO
// (`antesLugar`/`antesHoraInicio`/`antesHoraFin`, mandados por el frontend
// -- los tenía en memoria de ANTES de editar, `_evEditarOriginal`) contra la
// fila YA ACTUALIZADA en `asistencias` (el "después" real). Si ninguno de
// los 3 campos cambió de verdad (ej. el admin confirmó un campo con el
// mismo valor que ya tenía), no manda nada. Solo eventos FUTUROS (pedido
// explícito) -- un evento pasado no le importa a nadie que le avisen.
async function pushEventoEditado(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const idEvento = String(params.idEvento ?? '').trim();
  if (!idEvento) return { exito: true, omitido: true };
  const { data: ev } = await supabase.from('asistencias').select('fecha, donde, inicia, termina').eq('id_evento', idEvento).maybeSingle();
  if (!ev) return { exito: true, omitido: true };
  if (ev.fecha < _hoyEcuadorISO()) return { exito: true, omitido: true };

  const SIN_DEFINIR = 'sin definir';
  const diffs: string[] = [];
  if (params.antesLugar !== undefined) {
    const antes = String(params.antesLugar || '');
    const despues = String(ev.donde || '');
    if (antes !== despues) diffs.push(`Cambió el lugar: ${antes || SIN_DEFINIR} → ${despues || SIN_DEFINIR}`);
  }
  if (params.antesHoraInicio !== undefined) {
    const antes = String(params.antesHoraInicio || '');
    const despues = ev.inicia ? String(ev.inicia).substring(0, 5) : '';
    if (antes !== despues) diffs.push(`Cambió la hora de inicio: ${antes ? _horaEs(antes) : SIN_DEFINIR} → ${despues ? _horaEs(despues) : SIN_DEFINIR}`);
  }
  if (params.antesHoraFin !== undefined) {
    const antes = String(params.antesHoraFin || '');
    const despues = ev.termina ? String(ev.termina).substring(0, 5) : '';
    if (antes !== despues) diffs.push(`Cambió la hora de fin: ${antes ? _horaEs(antes) : SIN_DEFINIR} → ${despues ? _horaEs(despues) : SIN_DEFINIR}`);
  }
  if (!diffs.length) return { exito: true, omitido: true };

  await sendPush({
    tipo: 'evento_editado',
    broadcastEquipo: true,
    headings: { es: `Evento actualizado: ${_fechaEs(ev.fecha)}` },
    contents: { es: diffs.join(' · ') },
    url: APP_URL + '/?tab=eventos',
    evento: { idEvento },
  });
  return { exito: true };
}

async function pushOffseasonCreado(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { desde, hasta } = params;
  await sendPush({
    tipo: 'descanso_programado',
    broadcastEquipo: true,
    headings: { es: 'Período de descanso programado' },
    contents: { es: `Sin entrenamientos del ${_fechaEs(desde)} al ${_fechaEs(hasta)}.` },
    url: APP_URL + '/?tab=eventos',
  });
  return { exito: true };
}

// ─── Temporadas de descanso (2026-11-06, pedido explícito) ────────────────────
// Crear (o editar) una temporada ELIMINA los eventos de esas fechas (desde hoy
// en adelante; lo que ya pasó no se toca), con el mismo soft-delete de
// adminBorrarEvento() (estado 'Eliminado' + es_excepcion, así el cron de
// regeneración no los revive) y marcados con la temporada que los eliminó
// (`eliminado_por_descanso`) + su estado previo, para devolverlos tal cual si
// la temporada se borra o se acorta. Mientras exista, la regeneración tampoco
// crea eventos nuevos en esas fechas (ya lo hacía, ver 20260828).
const _COLS_DESCANSO = 'id_evento, estado, es_excepcion, tipo_evento, fecha, inicia, donde';
// Un descanso nunca toca fiestas ni festividades (Victor, 2026-11-20).
const _TIPOS_FUERA_DE_DESCANSO = new Set(['Social', 'Evento social']);

/** Eventos que un descanso eliminaría (desde hoy, sin fiestas). */
async function _eventosParaDescanso(desde: string, hasta: string): Promise<any[]> {
  const inicio = desde > _hoyEcuadorISO() ? desde : _hoyEcuadorISO();
  if (inicio > hasta) return [];
  const { data } = await supabase.from('asistencias').select(_COLS_DESCANSO)
    .gte('fecha', inicio).lte('fecha', hasta).neq('estado', 'Eliminado').order('fecha').order('inicia');
  return ((data ?? []) as any[]).filter((r) => !_TIPOS_FUERA_DE_DESCANSO.has(String(r.tipo_evento ?? '')));
}

async function _restaurarEventosDescanso(idTemporada: string, soloFuera?: { desde: string; hasta: string }): Promise<number> {
  const { data } = await supabase.from('asistencias')
    .select('id_evento, fecha, estado_antes_descanso, excepcion_antes_descanso')
    .eq('eliminado_por_descanso', idTemporada);
  let n = 0;
  for (const r of (data ?? []) as any[]) {
    if (soloFuera && r.fecha >= soloFuera.desde && r.fecha <= soloFuera.hasta) continue;
    const { error } = await supabase.from('asistencias').update({
      estado: r.estado_antes_descanso ?? 'Próximo',
      es_excepcion: r.excepcion_antes_descanso ?? false,
      eliminado_por_descanso: null,
      estado_antes_descanso: null,
      excepcion_antes_descanso: null,
    }).eq('id_evento', r.id_evento);
    if (!error) n++;
  }
  return n;
}

async function _eliminarEventosDescanso(idTemporada: string, desde: string, hasta: string, conservar: string[] = []): Promise<number> {
  let n = 0;
  const quedan = new Set(conservar);
  for (const r of await _eventosParaDescanso(desde, hasta)) {
    if (quedan.has(r.id_evento)) continue;
    const { error } = await supabase.from('asistencias').update({
      estado: 'Eliminado',
      es_excepcion: true,
      eliminado_por_descanso: idTemporada,
      estado_antes_descanso: r.estado,
      excepcion_antes_descanso: r.es_excepcion ?? false,
    }).eq('id_evento', r.id_evento);
    if (!error) n++;
  }
  return n;
}

async function adminGuardarTemporadaDescanso(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const nombre = String(params.nombre ?? '').trim() || 'Temporada de descanso';
  const desde = String(params.desde ?? '').slice(0, 10);
  const hasta = String(params.hasta ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || hasta < desde) {
    return { exito: false, error: 'Fechas inválidas.' };
  }
        let id = params.id ? String(params.id) : '';
  const si = (v: unknown) => v === true || v === 'true';
  // Antes de crear o editar: qué eventos se eliminarían (Victor, 2026-11-20).
    if (si(params.soloContar)) {
    const evs = await _eventosParaDescanso(desde, hasta);
    const antes = id ? (await supabase.from('temporadas_descanso').select('reglas').eq('id', id).maybeSingle()).data?.reglas : null;
    const quedan = new Set<string>(Array.isArray(antes?.conservar) ? antes.conservar : []);
    return {
      exito: true,
      eventos: evs.map((r) => ({ id: r.id_evento, fecha: r.fecha, tipo: r.tipo_evento ?? '', inicia: r.inicia ?? '', lugar: r.donde ?? '', conservado: quedan.has(r.id_evento) })),
    };
  }
  const reglas: Record<string, any> = { congela: si(params.congela), sinCuota: si(params.sinCuota) };
  // "Cuota durante el descanso" (Victor, 2026-11-19): solo descansos nuevos (o
  // que ya la tenían). Los de antes siguen con `sinCuota` tal cual.
  const cuota = ['entera', 'proporcional', 'no'].includes(String(params.cuota)) ? String(params.cuota) : '';
  const previa = id ? (await supabase.from('temporadas_descanso').select('reglas').eq('id', id).maybeSingle()).data?.reglas : null;
    if (cuota && (!id || previa?.cuota)) { reglas.cuota = cuota; reglas.sinCuota = cuota === 'no'; }
  // Eventos que quien crea el descanso eligió conservar (Victor, 2026-11-20).
  let conservar: string[] = Array.isArray(previa?.conservar) ? previa.conservar : [];
  if (params.conservar !== undefined) {
    try {
      const v = typeof params.conservar === 'string' ? JSON.parse(params.conservar) : params.conservar;
            if (Array.isArray(v)) conservar = [...new Set(v.map((x: unknown) => String(x)).filter(Boolean))].slice(0, 500);
    } catch { /* sin cambios */ }
  }
  if (conservar.length) reglas.conservar = conservar;
  else if (id && previa?.cuota) { reglas.cuota = previa.cuota; reglas.sinCuota = previa.cuota === 'no'; }
  if (id) {
    const { error } = await supabase.from('temporadas_descanso').update({ nombre, fecha_inicio: desde, fecha_fin: hasta, reglas }).eq('id', id);
    if (error) return { exito: false, error: error.message };
    // Lo que quedó fuera del rango nuevo vuelve a estar como antes.
    await _restaurarEventosDescanso(id, { desde, hasta });
  } else {
        const { data, error } = await supabase.from('temporadas_descanso').insert({ nombre, fecha_inicio: desde, fecha_fin: hasta, reglas }).select('id').single();
    if (error || !data) return { exito: false, error: error?.message ?? 'No se pudo crear la temporada.' };
    id = (data as any).id;
  }
        const eliminados = await _eliminarEventosDescanso(id, desde, hasta, conservar);
  const cursosMovidos = await _posponerCursos(desde, hasta);
  if (!params.id && hasta >= _hoyEcuadorISO()) {
    await sendPush({
      tipo: 'descanso_programado',
      broadcastEquipo: true,
      headings: { es: 'Período de descanso programado' },
      contents: { es: `${nombre}: sin entrenamientos del ${_fechaEs(desde)} al ${_fechaEs(hasta)}.` },
      url: APP_URL + '/?tab=eventos',
    }).catch(() => {});
  }
    return { exito: true, id, eliminados, cursosMovidos };
}

/// Cursos con clases dentro de un descanso (Victor, 2026-11-17): se pausan y
/// siguen después. Desde la primera clase afectada, todas se corren las
/// semanas justas para quedar después del descanso (mismo día de la semana).
async function _posponerCursos(desde: string, hasta: string): Promise<number> {
  const hoy = _hoyEcuadorISO();
  const { data: cursos } = await supabase.from('cursos').select('id, nombre, fechas').in('estado', ['abierto', 'cerrado']);
  const dia = (s: string) => Date.parse(s + 'T12:00:00Z');
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  let movidos = 0;
  for (const c of cursos ?? []) {
    const fechas = ((c.fechas as any[]) ?? []).slice().sort((a: any, b: any) => String(a.fecha).localeCompare(String(b.fecha)));
    const i = fechas.findIndex((x: any) => x.fecha >= hoy && x.fecha >= desde && x.fecha <= hasta);
    if (i < 0) continue;
    const semanas = Math.ceil((Math.round((dia(hasta) - dia(fechas[i].fecha)) / 86400000) + 1) / 7);
    for (let j = i; j < fechas.length; j++) {
      const nueva = iso(dia(fechas[j].fecha) + semanas * 7 * 86400000);
      fechas[j] = { ...fechas[j], fecha: nueva };
      if (fechas[j].venueId) await supabase.from('venues').update({ fecha_referencia: nueva }).eq('id', fechas[j].venueId);
    }
    await supabase.from('cursos').update({ fechas }).eq('id', c.id);
    movidos++;
    const { data: ins } = await supabase.from('curso_inscripciones').select('username').eq('curso_id', c.id).neq('estado', 'cancelada');
    const quienes = (ins ?? []).map((x: any) => x.username);
    if (quienes.length) {
      await sendPush({
        tipo: 'descanso_programado', include_external_user_ids: quienes, personal: true, // curso en el que está inscritx
        headings: { es: `${c.nombre}: clases movidas` },
        contents: { es: `Por el descanso, el curso sigue desde el ${_fechaEs(fechas[i].fecha)}. Revisa las fechas nuevas en el calendario.` },
        url: APP_URL + '/?tab=eventos',
      }).catch(() => {});
    }
  }
  if (movidos) await supabase.rpc('regenerar_ventana_asistencias');
  return movidos;
}

async function adminEliminarTemporadaDescanso(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const id = String(params.id ?? '');
  if (!id) return { exito: false, error: 'Falta la temporada.' };
  const { error } = await supabase.from('temporadas_descanso').delete().eq('id', id);
  if (error) return { exito: false, error: error.message };
  const restaurados = await _restaurarEventosDescanso(id);
  // Fechas del período sin eventos generados (por la temporada) se completan ahora.
  await supabase.rpc('regenerar_ventana_asistencias');
  return { exito: true, restaurados };
}

// ─── Acciones: cron diario de notificaciones ──────────────────────────────────
// Disparado por pg_cron todos los días a las 8am hora de Ecuador (ver
// supabase/migrations/*_cron_notificaciones_diarias.sql) vía net.http_post
// con el header `x-cron-secret` -- validado en el router (Deno.serve), no
// acá, porque necesita leer `req.headers`, no `params`.
// Saludos de fin de año (Victor, QA 2026-11-27), no se pueden apagar:
// - El día del último entrenamiento antes del 25 de diciembre: Feliz Navidad.
// - El día después del último entrenamiento del año: las gracias.
// Una sola vez por año (push_enviados con id 'navidad-AAAA' / 'gracias-AAAA').
async function _saludosFinDeAnio(): Promise<void> {
  const hoy = _hoyEcuadorISO(), ayer = _fechaEcuadorMasDias(-1);
  const hayEntreno = async (desde: string, hasta: string) => {
    const { data } = await supabase.from('asistencias').select('id_evento').eq('tipo_evento', 'Entrenamiento')
      .gte('fecha', desde).lte('fecha', hasta)
      .not('estado', 'in', '("Evento Cancelado","No se entrena","Eliminado")').limit(1);
    return (data ?? []).length > 0;
  };
  const enviar = async (id: string, titulo: string, texto: string) => {
    if (!(await _marcarPushEnviado('saludo_fin_anio', id, '*'))) return;
    await sendPush({ tipo: 'saludo_fin_anio', broadcastEquipo: true, headings: { es: titulo }, contents: { es: texto }, url: APP_URL + '/?tab=eventos' });
  };
  const anio = hoy.slice(0, 4);
  if (hoy.slice(5, 7) === '12' && hoy <= `${anio}-12-24` && (await hayEntreno(hoy, hoy)) && !(await hayEntreno(_fechaEcuadorMasDias(1), `${anio}-12-24`))) {
    await enviar(`navidad-${anio}`, '🎄 ¡Feliz Navidad!', 'Hoy es el último entrenamiento antes de Navidad. Que pases unas fiestas lindas junto a quienes quieres.');
  }
  const anioAyer = ayer.slice(0, 4);
  if (['11', '12'].includes(ayer.slice(5, 7)) && (await hayEntreno(ayer, ayer)) && !(await hayEntreno(hoy, `${anioAyer}-12-31`))) {
    await enviar(`gracias-${anioAyer}`, '💛 ¡Gracias por este año!', `Fue un gusto entrenar contigo en ${anioAyer}. Descansa, recarga energía y nos vemos el próximo año.`);
  }
}

// 1 de enero: a los Pivots de Finanzas, que cierren las cuentas del año anterior.
async function _recordarCierreAnual(): Promise<void> {
  const hoy = _hoyEcuadorISO();
  if (hoy.slice(5) !== '01-01') return;
  const anio = Number(hoy.slice(0, 4)) - 1;
  if ((await _aniosCerrados()).has(anio)) return;
  if (!(await _marcarPushEnviado('avisos_admin', `cierre-${anio}`, '*'))) return;
  await sendPush({
    tipo: 'avisos_admin', include_external_user_ids: await _adminDestinatariosPush(undefined, 'finanzas'),
    headings: { es: '🎉 ¡Feliz año!' }, contents: { es: `Recuerda cerrar las cuentas de ${anio} en Finanzas. Tienes todo enero para hacerlo.` }, url: APP_URL + '/',
  });
}

async function cronDiario(): Promise<Record<string, any>> {
  // Evento social: aviso del día antes (amigo secreto / regalo robado).
    try { await cronSocialRecordatorios(_depsSocial()); } catch (e) { console.error('[social] recordatorio:', e); }
  try { await cronSocialPendientes(_depsSocial()); } catch (e) { console.error('[social] pendientes:', e); }
    try { await _extenderExcepcionesIndefinidas(); } catch (e) { console.error('[excepciones] extender:', e); }
  try { await _avisarNovedadesFicha(); } catch (e) { console.error('[coach] novedades:', e); }
  try { await _avisosEntrenadorxs(); } catch (e) { console.error('[coach] recordatorios:', e); }
  // Puntos de asistencia del mes actual y el anterior (bug 2026-11-13: antes solo con botón manual).
  try {
    const h = _hoyEcuadorISO();
    const a = Number(h.slice(0, 4)), m = Number(h.slice(5, 7));
    await recalcularPuntosAsistencia(m === 1 ? 12 : m - 1, m === 1 ? a - 1 : a);
    await recalcularPuntosAsistencia(m, a);
  } catch (e) { console.error('[puntos] cron:', e); }
        try { await _avisarPrestamosLargos(); } catch (e) { console.error('[inventario] avisos:', e); }
  // Cobros del banco programados (Victor, 2026-11-26).
  try { await _generarCobrosProgramados(); } catch (e) { console.error('[tesoreria] cobros programados:', e); }
  // Pago a coaches de los meses cerrados (Victor, 2026-11-26); en enero también el año anterior.
  try {
    const h = _hoyEcuadorISO(), a = Number(h.slice(0, 4));
    if (h.slice(5, 7) === '01') await _guardarPagoCoaches(a - 1);
    await _guardarPagoCoaches(a);
  } catch (e) { console.error('[coaches] pago:', e); }
    try { await _cronCorteEquipos(); } catch (e) { console.error('[equipos] corte:', e); }
  try { await _saludosFinDeAnio(); } catch (e) { console.error('[fin de año] saludos:', e); }
  try { await _recordarCierreAnual(); } catch (e) { console.error('[cierre] recordatorio:', e); }
  try { await _cronReglamento(); } catch (e) { console.error('[reglamento] cron:', e); }
  // Avisos del equipo ya enviados o cancelados: se borran a los 30 días para
  // no ocupar la base (Victor, 2026-11-16). Los programados no se tocan.
  try {
    const hace30 = new Date(Date.now() - 30 * 86400000).toISOString();
    await supabase.from('avisos_programados').delete().lt('enviado_en', hace30);
    await supabase.from('avisos_programados').delete().lt('cancelado_en', hace30);
  } catch (e) { console.error('[avisos] limpiar:', e); }
  const hoyIso = _hoyEcuadorISO();
  const diaMes = hoyIso.substring(5);              // 'MM-DD'
  const diaDelMes = Number(hoyIso.substring(8, 10));
  const anio = Number(hoyIso.substring(0, 4));

  // 1) Recordatorio de entrenamientos/eventos de hoy -- mismas 2 etiquetas de
  // estado "no cuenta" que ya usa el resto de este archivo (getEventosRango
  // y compañía) para excluir cancelados/sin entrenamiento.
  const { data: eventosHoy } = await supabase.from('asistencias')
    .select('id_evento, inicia, donde, tipo_evento')
    .eq('fecha', hoyIso)
    .not('estado', 'in', '("Evento Cancelado","No se entrena","Eliminado")');
  const idsHoy = (eventosHoy ?? []).map((e: any) => e.id_evento);
  const asistPorEvento = await _ultimaAsistenciaPorPersonaTodas(idsHoy);
  for (const ev of (eventosHoy ?? [])) {
        const asistentes = (await _soloEnEquipo((asistPorEvento[ev.id_evento] ?? []).filter((a: any) => a.estado === 'Asistiré').map((a: any) => a.nombre))).length;
    await sendPush({
      tipo: 'entrenamiento_hoy',
      broadcastEquipo: true,
      headings: { es: `${ev.tipo_evento || 'Entrenamiento'} hoy a las ${_horaEs(ev.inicia)}` },
      contents: { es: `${asistentes} ${asistentes === 1 ? 'persona asistirá' : 'personas asistirán'} · ${ev.donde || ''}` },
      url: APP_URL + '/?tab=eventos',
      evento: { idEvento: String(ev.id_evento) },
    });
  }

  // 2) Cumpleaños (pedido explícito 2026-11-06: se quita el aviso de 10
  // días antes) -- 3 avisos, todos desde `fecha_nacimiento` (`date`):
  //   a) el día antes, a todo el equipo menos quien cumple   (tipo 'cumpleanos')
  //   b) el mismo día, a todo el equipo menos quien cumple   (tipo 'cumpleanos')
  //   c) el mismo día, un saludo SOLO a quien cumple         (tipo 'cumpleanos_propio')
  // a/b exigen `fecha_publica='Sí'` (mismo criterio que getCumpleañosRango());
  // c no (saludar a alguien por su propio cumpleaños no expone nada). Edad
  // solo con `edad_publica='Sí'`. 29 de febrero -> 28 en años no bisiestos.
  const mananaIso = _fechaEcuadorMasDias(1);
  const anioManana = Number(mananaIso.substring(0, 4));
  const { data: cumpleaneros } = await supabase.from('equipo')
    .select('username, nombre_derby, fecha_nacimiento, fecha_publica, edad_publica')
    .not('fecha_nacimiento', 'is', null)
    .is('eliminado_en', null);
  for (const p of (cumpleaneros ?? [])) {
    const fnac = String(p.fecha_nacimiento ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fnac)) continue;
    const anioNac = Number(fnac.substring(0, 4));
    const nombre = _nombreMostrar(p);
    const fechaPub = _esPublico(p.fecha_publica);
    const edadPub = fechaPub && _esPublico(p.edad_publica);
    if (_mesDiaCumple(fnac, anio) === diaMes && anio > anioNac) {
      const edad = anio - anioNac;
      if (fechaPub) {
        await sendPush({
          tipo: 'cumpleanos',
          broadcastEquipo: true,
          excluirUsernames: [p.username],
          headings: { es: `🎉 ¡Hoy es el cumpleaños de ${nombre}!` },
          contents: { es: edadPub ? `Cumple ${edad} años. Escríbele y celébralo con el equipo.` : 'Escríbele y celébralo con el equipo.' },
          url: APP_URL + '/?tab=equipo',
        });
      }
      await sendPush({
        tipo: 'cumpleanos_propio',
        include_external_user_ids: [p.username],
        headings: { es: `🎉 ¡Feliz cumpleaños, ${nombre}!` },
        contents: { es: 'Todo el equipo te desea un gran día. ¡A celebrar!' },
        url: APP_URL + '/?tab=eventos',
      });
    } else if (fechaPub && _mesDiaCumple(fnac, anioManana) === mananaIso.substring(5) && anioManana > anioNac) {
      const edad = anioManana - anioNac;
      await sendPush({
        tipo: 'cumpleanos',
        broadcastEquipo: true,
        excluirUsernames: [p.username],
        headings: { es: `🎂 Mañana es el cumpleaños de ${nombre}` },
        contents: { es: edadPub ? `Cumple ${edad} años. ¡Prepara tu saludo!` : '¡Prepara tu saludo!' },
        url: APP_URL + '/?tab=equipo',
      });
    }
  }

  // 3) Aniversario en el equipo (fecha_ingreso, solo a la propia persona).
  const { data: miembros } = await supabase.from('equipo')
    .select('username, fecha_ingreso')
    .not('fecha_ingreso', 'is', null)
    .is('eliminado_en', null);
  for (const p of (miembros ?? [])) {
    if (String(p.fecha_ingreso).substring(5) !== diaMes) continue;
    const anios = anio - Number(String(p.fecha_ingreso).substring(0, 4));
    if (anios <= 0) continue;
    await sendPush({
      tipo: 'aniversario',
      include_external_user_ids: [p.username],
      headings: { es: '¡Feliz aniversario!' },
      contents: { es: `Hoy cumples ${anios} ${anios === 1 ? 'año' : 'años'} en el equipo. ¡Gracias por estar!` },
      url: APP_URL + '/?tab=ajustes',
    });
  }

  // 4) Recordatorios de cuota (Victor, octubre y 2026-11-13: "tienen que
  // andar ya"). Día 1, día 14 (último día para el punto extra), día 16 y el
  // día después de la primera asistencia confirmada del mes (clase de
  // gracia usada). Solo a quien paga cuota (`paga_cuota` 'Sí'), Activx, sin
  // `exenta_cuota`, y solo si el mes está en 'debe' según `_estadoCuotaMes`
  // (nunca a quien ya pagó o tiene el pago en revisión).
    try { await _recordatoriosCuota(hoyIso); } catch (e) { console.error('[cuota] recordatorios:', e); }

  // 5) Recompensas automáticas del mes que cerró (los primeros días del mes;
  // la tabla evita dar dos veces lo mismo).
  if (diaDelMes <= 3) {
    const [y0, m0] = hoyIso.slice(0, 7).split('-').map(Number);
    try { await _recompensasMes(_mesClave(y0, m0 - 1)); } catch (e) { console.error('[recompensas] mes:', e); }
  }

  return { exito: true };
}

// ─── Cuota proporcional por descanso (Victor, 2026-11-19) ────────────────────
// Un descanso nuevo elige "Cuota durante el descanso": entera, proporcional o
// no se cobra (`reglas.cuota`). Los descansos de antes no tienen `cuota` y
// siguen con `sinCuota` (los meses completos dentro no se cobran).
// Proporcional: precio mensual × (entrenamientos que sí hay en el mes ÷ los
// que habría sin el descanso). Los que el descanso quitó quedan como
// 'Eliminado' con `eliminado_por_descanso` (la ventana se genera a 365 días).
// ─── Meses y periodos sin cobro (Victor, 2026-11-20) ─────────────────────────
// `reglas_liga.periodosSinCobro` (Mi Liga → Reglas de la liga), para toda la
// liga (`equipos` vacío) o algunos equipos:
// - tipo 'mes' (`meses: ['aaaa-mm']`): ese mes no se cobra la cuota mensual ni
//   las clases sueltas, y se marca Asistiré sin suscripción.
// - tipo 'periodo' (`desde`/`hasta` aaaa-mm-dd): las clases sueltas de esas
//   fechas valen `clasesPct` % (0 = no se cobran). Con `cuota: 'proporcional'`
//   cada entrenamiento del mes dentro del periodo pesa `clasesPct` % en la
//   cuota (como el descanso proporcional); 'entera' = la cuota no cambia.
// Rige desde que se crea: las reservas, pagos y cargos ya hechos no cambian.
function _periodosSinCobro(reglas: Record<string, any>, equipo?: string | null): any[] {
  const eq = String(equipo ?? '');
  const l = Array.isArray(reglas.periodosSinCobro) ? reglas.periodosSinCobro : [];
  return l.filter((p: any) => p && (!Array.isArray(p.equipos) || !p.equipos.length || p.equipos.includes(eq)));
}
function _mesSinCobro(reglas: Record<string, any>, equipo: string | null | undefined, mes: string): boolean {
  return _periodosSinCobro(reglas, equipo).some((p: any) => p.tipo === 'mes' && Array.isArray(p.meses) && p.meses.includes(mes));
}
const _pctPeriodo = (p: any) => Math.max(0, Math.min(100, Number(p?.clasesPct) || 0));
/** % que se cobra de una clase suelta de esa fecha (100 = precio normal). */
function _pctClaseEn(reglas: Record<string, any>, equipo: string | null | undefined, fecha: string): number {
  const f = String(fecha ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return 100;
  if (_mesSinCobro(reglas, equipo, f.slice(0, 7))) return 0;
  let pct = 100;
  for (const p of _periodosSinCobro(reglas, equipo)) if (p.tipo === 'periodo' && String(p.desde) <= f && f <= String(p.hasta)) pct = Math.min(pct, _pctPeriodo(p));
  return pct;
}
/** Valida la lista que manda la app. Lo que ya terminó se conserva tal cual (es
 *  historial de cobros); lo nuevo no puede quedar en el pasado. */
function _validarPeriodosSinCobro(v: unknown, antesV: unknown, hoy: string): any[] | string {
  if (!Array.isArray(v)) return 'La lista de meses y periodos sin cobro no es válida.';
  const antes: any[] = Array.isArray(antesV) ? antesV.filter((p: any) => p && typeof p === 'object') : [];
  const mesHoy = hoy.slice(0, 7);
  const terminado = (p: any) => p.tipo === 'mes' ? (p.meses ?? []).every((m: string) => m < mesHoy) : String(p.hasta) < hoy;
  const previo = new Map(antes.map((p: any) => [String(p.id), p]));
  const out: any[] = antes.filter(terminado);
  const fecha = (x: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(x ?? '')) ? String(x) : null;
  for (const x of v.slice(0, 40) as any[]) {
    if (!x || typeof x !== 'object') continue;
    const id = String(x.id ?? '').trim().slice(0, 40) || crypto.randomUUID();
    const ant = previo.get(id);
    if (ant && terminado(ant)) continue; // ya está en `out`
    const equipos = Array.isArray(x.equipos) ? [...new Set(x.equipos.map((e: unknown) => String(e ?? '').trim().slice(0, 60)).filter(Boolean))].slice(0, 30) : [];
    let p: Record<string, any>;
    if (x.tipo === 'mes') {
      const meses = [...new Set((Array.isArray(x.meses) ? x.meses : []).map(String).filter((m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)))].sort().slice(0, 24) as string[];
      if (!meses.length) return 'Elige al menos un mes.';
      const antMeses: string[] = ant?.tipo === 'mes' ? (ant.meses ?? []) : [];
      if (meses.some((m) => m < mesHoy && !antMeses.includes(m))) return 'Solo puedes elegir el mes actual o los que vienen.';
      // Un mes que ya pasó no se quita: cambiaría lo que se debía.
      for (const m of antMeses) if (m < mesHoy && !meses.includes(m)) meses.push(m);
      p = { id, tipo: 'mes', meses: meses.sort(), equipos };
    } else if (x.tipo === 'periodo') {
      const desde = fecha(x.desde), hasta = fecha(x.hasta);
      if (!desde || !hasta || desde > hasta) return 'Revisa las fechas del periodo: el inicio va antes del final.';
      if (Date.parse(hasta) - Date.parse(desde) > 366 * 86400000) return 'Un periodo dura como máximo un año.';
      if (hasta < hoy) return 'El periodo tiene que terminar hoy o después.';
      const pct = Math.round(Number(x.clasesPct));
      p = { id, tipo: 'periodo', desde, hasta, clasesPct: Number.isFinite(pct) ? Math.max(0, Math.min(99, pct)) : 0, cuota: x.cuota === 'entera' ? 'entera' : 'proporcional', equipos };
    } else continue;
    p.creado = ant?.creado ?? hoy;
    out.push(p);
  }
  return out;
}

/** null = ese mes se cobra entero. Con `equipo`, suma sus meses y periodos sin
 *  cobro (sin `equipo`, solo los de toda la liga). `sinCobro` = el mes no se cobra. */
async function _factorCuotaMes(mes: string, equipo?: string | null, reglasDadas?: Record<string, any>): Promise<{ factor: number; hay: number; normales: number; sinCobro?: boolean; periodo?: boolean } | null> {
  const reglas = reglasDadas ?? await _reglasLiga();
  if (_mesSinCobro(reglas, equipo, mes)) return { factor: 0, hay: 0, normales: 0, sinCobro: true };
  const [y, m] = mes.split('-').map(Number);
  const desde = `${mes}-01`, ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const periodos = _periodosSinCobro(reglas, equipo)
    .filter((p: any) => p.tipo === 'periodo' && p.cuota !== 'entera' && String(p.desde) <= ultimo && String(p.hasta) >= desde);
  const { data: ts } = await supabase.from('temporadas_descanso').select('id, reglas').lte('fecha_inicio', ultimo).gte('fecha_fin', desde);
  const prop = new Set((ts ?? []).filter((t: any) => t.reglas?.cuota === 'proporcional').map((t: any) => String(t.id)));
  if (!prop.size && !periodos.length) return null;
  const { data: evs } = await supabase.from('asistencias').select('fecha, estado, eliminado_por_descanso')
    .eq('tipo_evento', 'Entrenamiento').gte('fecha', desde).lte('fecha', ultimo);
  let hay = 0, quitados = 0, pesos = 0;
  for (const e of evs ?? []) {
    if (e.estado === 'Eliminado') { if (prop.has(String(e.eliminado_por_descanso ?? ''))) quitados++; continue; }
    if (e.estado === 'Evento Cancelado' || e.estado === 'No se entrena') continue;
    hay++;
    // Entrenamiento dentro de un periodo sin cobro: pesa lo que vale la clase ese día.
    const f = String(e.fecha).slice(0, 10);
    let w = 1;
    for (const p of periodos) if (String(p.desde) <= f && f <= String(p.hasta)) w = Math.min(w, _pctPeriodo(p) / 100);
    pesos += w;
  }
  const normales = hay + quitados;
  if (!normales || (!quitados && pesos >= hay)) return null;
  return { factor: pesos / normales, hay, normales, ...(pesos < hay ? { periodo: true } : {}) };
}

/** Precio de la cuota de `mes` para un equipo, ya proporcional si corresponde (sin recargo). */
async function _precioCuotaMes(equipo: string | null | undefined, mes: string, factor?: { factor: number } | null): Promise<number> {
  const base = Number((await getPreciosClases({}, equipo ?? null)).precioMensual) || 0;
  const f = factor === undefined ? await _factorCuotaMes(mes, equipo) : factor;
  return f ? _num2(base * f.factor) : base;
}

/** Meses (desde el actual, 12 adelante) con cuota proporcional o sin cobro
 *  para ese equipo: {aaaa-mm: {factor, hay, normales}} (factor 0 = no se cobra). */
async function _mesesProporcionales(equipo?: string | null): Promise<Record<string, { factor: number; hay: number; normales: number }>> {
  const hoy = _hoyEcuadorISO();
  const { data: ts } = await supabase.from('temporadas_descanso').select('fecha_inicio, fecha_fin, reglas').gte('fecha_fin', `${hoy.slice(0, 7)}-01`);
  const out: Record<string, { factor: number; hay: number; normales: number }> = {};
  const [y0, m0] = hoy.slice(0, 7).split('-').map(Number);
  const meses = new Set<string>();
  for (const t of ts ?? []) {
    if (t.reglas?.cuota !== 'proporcional') continue;
    for (let i = 0; i <= 12; i++) {
      const k = _mesClave(y0, m0 + i);
      if (`${k}-31` >= String(t.fecha_inicio) && `${k}-01` <= String(t.fecha_fin)) meses.add(k);
    }
  }
  // Meses y periodos sin cobro (Victor, 2026-11-20).
  const reglas = await _reglasLiga();
  for (const p of _periodosSinCobro(reglas, equipo)) {
    for (let i = 0; i <= 12; i++) {
      const k = _mesClave(y0, m0 + i);
      if (p.tipo === 'mes' ? (p.meses ?? []).includes(k) : p.cuota !== 'entera' && `${k}-31` >= String(p.desde) && `${k}-01` <= String(p.hasta)) meses.add(k);
    }
  }
  for (const k of meses) { const f = await _factorCuotaMes(k, equipo, reglas); if (f) out[k] = f; }
  return out;
}

// ─── Quién debe la cuota del mes (Victor, 2026-11-19) ─────────────────────────
// Rige desde noviembre 2026 (retroactiva a ese mes: la regla vieja era un bug).
// (a) Mes futuro: nadie debe. (b) Solo equipos que pagan por mes
// (`_cobroEquipo` modo 'mes'). (c) Debe quien vino a más Entrenamientos del
// mes (a_horario/tarde, sin cancelados) que sus clases de gracia
// (`graciaClases[equipo]`, la misma cuenta que el aviso "Ya usaste tu clase de
// gracia"); el resto queda en "No vino / dentro de la gracia". (d) `monto` =
// precio del mes (proporcional si hay descanso) + recargo de `_recargoCuota`.
// No mira pagos: eso lo cruza quien la llama.
const CUOTA_POR_ASISTENCIA_DESDE = '2026-11';
async function _debeCuotaMes(gente: any[], mes: string): Promise<Record<string, { debe: boolean; monto: number; motivo: string; sinCobro?: boolean }>> {
  const out: Record<string, { debe: boolean; monto: number; motivo: string; sinCobro?: boolean }> = {};
  const hoy = _hoyEcuadorISO();
  if (mes > hoy.slice(0, 7)) return out;
  const reglas = await _reglasLiga();
  const gracia: Record<string, number> = reglas.graciaClases ?? {};
  const porMes = (gente ?? []).filter((p: any) => _cobroEquipo(reglas, p.categoria).modo === 'mes');
  if (!porMes.length) return out;
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const { data: evs } = await supabase.from('asistencias').select('a_horario, tarde')
    .eq('tipo_evento', 'Entrenamiento').not('estado', 'in', '("Evento Cancelado","No se entrena","Eliminado")')
    .gte('fecha', `${mes}-01`).lte('fecha', ultimo < hoy ? ultimo : hoy);
  const nombres = (v: unknown) => String(v ?? '').split(',').map((n) => n.trim().toUpperCase()).filter(Boolean);
  const vino: Record<string, number> = {};
  for (const e of evs ?? []) for (const n of new Set([...nombres(e.a_horario), ...nombres(e.tarde)])) vino[n] = (vino[n] ?? 0) + 1;
  // Factor por equipo: descanso proporcional y meses o periodos sin cobro (Victor, 2026-11-20).
  const factorEq: Record<string, Awaited<ReturnType<typeof _factorCuotaMes>>> = {};
  const precioEq: Record<string, number> = {};
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`;
  const nombreMes = _MESES_ES[m - 1].charAt(0).toUpperCase() + _MESES_ES[m - 1].slice(1);
  for (const p of porMes) {
    const eq = String(p.categoria ?? '');
    const factor = eq in factorEq ? factorEq[eq] : (factorEq[eq] = await _factorCuotaMes(mes, eq, reglas));
    if (factor?.sinCobro) { out[p.username] = { debe: false, monto: 0, motivo: `${nombreMes} no se cobra`, sinCobro: true }; continue; }
    const n = vino[String(p.username).toUpperCase()] ?? 0;
    const g = Math.max(0, Number(gracia[eq]) || 0);
    const precio = precioEq[eq] ??= await _precioCuotaMes(eq, mes, factor);
    const recargo = _recargoCuota(mes, hoy, await _reglasDeEquipo(eq), precio);
    const vinoTxt = n === 0 ? 'No vino a entrenamientos' : `Vino ${plural(n, 'entrenamiento')}`;
    const partes = [vinoTxt, `tiene ${g} de gracia`];
    if (factor?.periodo) partes.push(`cuota proporcional: ${Math.round(factor.factor * 100)} % del mes por un periodo sin cobro`);
    else if (factor) partes.push(`cuota proporcional: ${factor.hay} de ${factor.normales} entrenamientos por el descanso`);
    const debe = n > g;
    if (debe && recargo > 0) partes.push(`incluye recargo de ${_monedaLiga}${recargo}`);
    out[p.username] = { debe, monto: _num2(precio + (debe ? recargo : 0)), motivo: partes.join('; ') };
  }
  return out;
}

// ─── Cuota: fuente única de "¿pagó el mes?" (2026-11-13) ─────────────────────
// 'al_dia': reserva mensual Confirmada que cubre el mes, excepción de cuota
// del mes o registro en `pagos` (monto > 0 o exoneradx). 'en_revision':
// reserva mensual Pendiente de ese mes. Si no, 'debe'. `mes` = 'aaaa-mm'.
async function _estadosCuotaMes(usernames: string[], mes: string): Promise<Record<string, 'al_dia' | 'en_revision' | 'debe'>> {
  const out: Record<string, 'al_dia' | 'en_revision' | 'debe'> = {};
  if (!usernames.length) return out;
  const [y, m] = mes.split('-').map(Number);
  const desde = `${mes}-01`, hasta = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const hastaHolgura = new Date(Date.parse(hasta) + 40 * 86400000).toISOString().slice(0, 10);
    // Temporada de descanso "sin cuota" que cubre el mes completo: nadie debe ese mes.
  const ultimoDia = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const { data: tSin } = await supabase.from('temporadas_descanso').select('reglas').lte('fecha_inicio', desde).gte('fecha_fin', ultimoDia);
  if ((tSin ?? []).some((t: any) => t.reglas?.sinCuota === true) || (await _factorCuotaMes(mes))?.factor === 0) {
    usernames.forEach((u) => { out[u] = 'al_dia'; });
    return out;
  }
  const [{ data: resTodas }, { data: exc }, { data: pag }] = await Promise.all([
    supabase.from('reservas').select('nombre_usuario, estado, mes_texto, validez_hasta').eq('tipo', 'mensual').in('estado', ['Confirmada', 'Pendiente'])
      .in('nombre_usuario', usernames).gte('validez_hasta', desde).lt('validez_hasta', hastaHolgura),
    supabase.from('cuota_excepcion').select('id_miembro').eq('mes', mes).in('id_miembro', usernames),
    supabase.from('pagos').select('nombre_usuario, monto, exoneradx').eq('mes', m).eq('anio', y).eq('anulado', false).in('nombre_usuario', usernames),
  ]);
    const res = (resTodas ?? []).filter((r: any) => _mesDeReserva(r) === mes);
  usernames.forEach((u) => { out[u] = 'debe'; });
  (res ?? []).forEach((r: any) => { if (r.estado === 'Pendiente' && out[r.nombre_usuario] === 'debe') out[r.nombre_usuario] = 'en_revision'; });
  (res ?? []).forEach((r: any) => { if (r.estado === 'Confirmada') out[r.nombre_usuario] = 'al_dia'; });
  (exc ?? []).forEach((r: any) => { out[r.id_miembro] = 'al_dia'; });
  (pag ?? []).forEach((r: any) => { if (r.exoneradx || Number(r.monto) > 0) out[r.nombre_usuario] = 'al_dia'; });
  // Mes sin cobro (o con cuota 0 por un periodo) para su equipo (Victor, 2026-11-20): está al día.
  const reglasL = await _reglasLiga();
  if (Array.isArray(reglasL.periodosSinCobro) && reglasL.periodosSinCobro.length) {
    const { data: cats } = await supabase.from('equipo').select('username, categoria').in('username', usernames);
    const libre: Record<string, boolean> = {};
    for (const c of cats ?? []) {
      const eq = String(c.categoria ?? '');
      if (!(eq in libre)) libre[eq] = (await _factorCuotaMes(mes, eq, reglasL))?.factor === 0;
      if (libre[eq]) out[c.username] = 'al_dia';
    }
  }
  return out;
}

/** Día hasta el que pagar la cuota da 1 punto extra (incluido): la fecha
 *  límite de la liga (`cuotaVenceDia`); sin fecha límite, el 15 (Victor,
 *  2026-11-15: el punto extra va hasta el vencimiento). */
async function _recompensaPago(equipo?: string | null): Promise<{ activa: boolean; puntos: number; claseGratis: boolean; saldo: number }> {
  const x = (await _reglasDeEquipo(equipo)).recompensaPago ?? {};
  const puntos = Math.max(0, Number(x.puntos) || 0), saldo = Math.max(0, Number(x.saldo) || 0), claseGratis = x.claseGratis === true;
  return { activa: x.activa !== false && (puntos > 0 || claseGratis || saldo > 0), puntos, claseGratis, saldo };
}

/** "un punto extra", "2 puntos extra y una clase gratis", etc. */
function _textoRecompensa(x: { puntos: number; claseGratis: boolean; saldo: number; mensualidadGratis?: boolean }): string {
  const partes = [
    ...(x.mensualidadGratis ? ['tu próxima mensualidad gratis'] : []),
    ...(x.puntos > 0 ? [x.puntos === 1 ? 'un punto extra' : `${x.puntos} puntos extra`] : []),
    ...(x.claseGratis ? ['una clase gratis'] : []),
        ...(x.saldo > 0 ? [`${_monedaLiga}${x.saldo % 1 === 0 ? x.saldo : x.saldo.toFixed(2)} de saldo a favor`] : []),
  ];
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : (partes[0] ?? '');
}

// ─── Recompensas automáticas (Victor, 2026-11-15) ───────────────────────────
// Reglas que arma un Pivot: condición de asistencia → premio, para toda la
// liga o un equipo. Se otorgan solas con aviso. Rigen desde `desde` (nunca
// hacia atrás) y cada premio queda en `recompensas_otorgadas` (una vez por
// regla, persona y período). Borrar o cambiar una regla no toca lo ya dado.
const TIPOS_RECOMPENSA = ['racha', 'asistencias_mes', 'porcentaje_mes'];
function _limpiarPremio(x: any): Record<string, any> {
  const si = (v: unknown) => v === true || v === 'true';
  const pts = Math.round(Number(x?.puntos)), sal = Math.round(Number(x?.saldo) * 100) / 100;
  return {
    puntos: Number.isFinite(pts) ? Math.min(20, Math.max(0, pts)) : 0,
    claseGratis: si(x?.claseGratis),
    saldo: Number.isFinite(sal) ? Math.min(1000, Math.max(0, sal)) : 0,
    mensualidadGratis: si(x?.mensualidadGratis),
  };
}
function _textoCondicion(c: any): string {
  const n = Number(c?.valor) || 0;
  if (c?.tipo === 'racha') return `asistir ${n} veces seguidas`;
  if (c?.tipo === 'asistencias_mes') return `asistir ${n} ${n === 1 ? 'vez' : 'veces'} en el mes`;
  return `asistir al ${n} % de los entrenamientos del mes`;
}

async function adminRecompensas(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(String(params.adminToken ?? ''));
  if (!email) return { exito: false, error: 'Sesión de Pivot inválida.' };
  const op = String(params.op ?? 'listar');
  const leer = (v: unknown) => { if (v == null || v === '') return null; if (typeof v === 'object') return v as Record<string, any>; try { return JSON.parse(String(v)); } catch { return null; } };
  if (op === 'guardar') {
    const r = leer(params.regla);
    if (!r) return { exito: false, error: 'Faltan datos.' };
    const tipo = String(r.condicion?.tipo ?? '');
    if (!TIPOS_RECOMPENSA.includes(tipo)) return { exito: false, error: 'Condición inválida.' };
    const valor = Math.round(Number(r.condicion?.valor));
    const max = tipo === 'porcentaje_mes' ? 100 : 60;
    if (!Number.isFinite(valor) || valor < 1 || valor > max) return { exito: false, error: 'Valor inválido.' };
    const premio = _limpiarPremio(r.premio);
    if (!_textoRecompensa(premio)) return { exito: false, error: 'Elige al menos un premio.' };
    const fila = {
      nombre: String(r.nombre ?? '').trim().slice(0, 80) || 'Recompensa',
      activa: r.activa !== false && r.activa !== 'false',
      equipo: String(r.equipo ?? '').trim().slice(0, 60) || null,
      condicion: { tipo, valor }, premio,
    };
    if (r.id) {
      const { error } = await supabase.from('reglas_recompensa').update(fila).eq('id', String(r.id)).is('eliminada_en', null);
      if (error) return { exito: false, error: error.message };
      await _registrarAjuste('recompensa', null, { id: r.id, ...fila }, email);
    } else {
      const { error } = await supabase.from('reglas_recompensa').insert({ ...fila, desde: _hoyEcuadorISO(), creada_por: email });
      if (error) return { exito: false, error: error.message };
      await _registrarAjuste('recompensa', null, fila, email);
    }
  } else if (op === 'eliminar') {
    await supabase.from('reglas_recompensa').update({ eliminada_en: new Date().toISOString(), activa: false }).eq('id', String(params.id ?? ''));
    await _registrarAjuste('recompensa', { id: params.id }, null, email);
  }
  const { data: reglas } = await supabase.from('reglas_recompensa').select('id, nombre, activa, equipo, condicion, premio, desde, creada_en')
    .is('eliminada_en', null).order('creada_en', { ascending: true });
  const ids = (reglas ?? []).map((r: any) => r.id);
  const { data: dadas } = ids.length ? await supabase.from('recompensas_otorgadas').select('regla_id').in('regla_id', ids) : { data: [] as any[] };
  const cuenta: Record<string, number> = {};
  (dadas ?? []).forEach((d: any) => { cuenta[d.regla_id] = (cuenta[d.regla_id] ?? 0) + 1; });
  return { exito: true, reglas: (reglas ?? []).map((r: any) => ({ ...r, otorgadas: cuenta[r.id] ?? 0, condicionTexto: _textoCondicion(r.condicion), premioTexto: _textoRecompensa(r.premio) })) };
}

/** Da el premio de una regla a una persona (una sola vez por período) y le avisa. */
async function _otorgarRecompensa(regla: any, u: string, periodo: string, mesPuntos: string): Promise<boolean> {
  const { data: fila, error } = await supabase.from('recompensas_otorgadas').insert({ regla_id: regla.id, username: u, periodo }).select('id').maybeSingle();
  if (error || !fila) return false; // ya la tenía
  const p = _limpiarPremio(regla.premio), dado: Record<string, any> = { puntos: 0, claseGratis: false, saldo: 0, mensualidadGratis: false };
  if (p.puntos > 0) {
    await _acreditarPuntosExtra(u, Number(mesPuntos.slice(0, 4)), Number(mesPuntos.slice(5, 7)), p.puntos);
    dado.puntos = p.puntos;
  }
  if (p.claseGratis) {
    const { data: eq } = await supabase.from('equipo').select('cupon_disponible').eq('username', u).maybeSingle();
    if (eq && !eq.cupon_disponible) { await supabase.from('equipo').update({ cupon_disponible: true }).eq('username', u); dado.claseGratis = true; }
  }
  let saldo = p.saldo;
  if (p.mensualidadGratis) {
    // La mensualidad del mes siguiente; si ya la pagó o no le toca, va como saldo a favor.
    const [y, m] = _hoyEcuadorISO().slice(0, 7).split('-').map(Number);
    const sig = _mesClave(y, m + 1);
    const { data: ex } = await supabase.from('cuota_excepcion').select('id').eq('id_miembro', u).eq('mes', sig).maybeSingle();
    if (!ex && (await _estadosCuotaMes([u], sig))[u] === 'debe') {
      await supabase.from('cuota_excepcion').insert({ id_miembro: u, mes: sig, tipo: 'exenta', monto: null, notas: `Recompensa: ${regla.nombre}` });
      dado.mensualidadGratis = sig;
    } else {
            saldo += Number((await getPreciosClases({}, (await supabase.from('equipo').select('categoria').eq('username', u).maybeSingle()).data?.categoria ?? null)).precioMensual) || 0;
    }
  }
  if (saldo > 0) {
    const { data: mov } = await supabase.from('saldos_movimientos').insert({
      username: u, persona_nombre: await _nombrePersona(u), fecha: _hoyEcuadorISO(), monto: _num2(saldo), tipo: 'abono', aplicar: 'aparte',
      concepto: `Recompensa: ${regla.nombre}`, por: 'automático',
    }).select('id').maybeSingle();
    dado.saldo = _num2(saldo); dado.saldoMov = mov?.id ?? null;
  }
  await supabase.from('recompensas_otorgadas').update({ premio: dado }).eq('id', fila.id);
  const texto = _textoRecompensa({ puntos: dado.puntos, claseGratis: dado.claseGratis, saldo: dado.saldo, mensualidadGratis: !!dado.mensualidadGratis });
  if (texto) {
    await sendPush({ tipo: 'solicitud_resuelta', include_external_user_ids: [u], headings: { es: '¡Ganaste una recompensa!' },
      contents: { es: `Por ${_textoCondicion(regla.condicion)} recibes ${texto}.` }, url: APP_URL }).catch(() => {});
  }
  return true;
}

async function _reglasRecompensaActivas(tipos: string[]): Promise<any[]> {
  const { data } = await supabase.from('reglas_recompensa').select('id, nombre, equipo, condicion, premio, desde')
    .eq('activa', true).is('eliminada_en', null);
  return (data ?? []).filter((r: any) => tipos.includes(r.condicion?.tipo));
}

/** Racha: al marcar presente, si la racha llega a un múltiplo de N. */
async function _recompensasRacha(u: string, racha: number, idEvento: string, fechaEvento: string): Promise<void> {
  const reglas = await _reglasRecompensaActivas(['racha']);
  if (!reglas.length || racha < 1) return;
  const { data: p } = await supabase.from('equipo').select('categoria, estado_miembro').eq('username', u).maybeSingle();
  if (!p || p.estado_miembro === 'Técnico') return;
  for (const r of reglas) {
    const n = Number(r.condicion?.valor) || 0;
    if (n < 1 || racha % n !== 0 || String(fechaEvento) < String(r.desde)) continue;
    if (r.equipo && r.equipo !== p.categoria) continue;
    await _otorgarRecompensa(r, u, `racha:${idEvento}`, String(fechaEvento).slice(0, 7));
  }
}

/** Mes cerrado: asistencias (a horario o tarde) a Entrenamientos y su porcentaje. */
async function _recompensasMes(mes: string): Promise<void> {
  const reglas = (await _reglasRecompensaActivas(['asistencias_mes', 'porcentaje_mes']))
    .filter((r: any) => String(r.desde) <= `${mes}-01`); // rige para meses completos desde que se creó
  if (!reglas.length) return;
  const [y, m] = mes.split('-').map(Number);
  const hasta = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const { data: evs } = await supabase.from('asistencias').select('fecha, a_horario, tarde')
    .eq('tipo_evento', 'Entrenamiento').not('estado', 'in', '("Evento Cancelado","No se entrena","Eliminado")')
    .gte('fecha', `${mes}-01`).lte('fecha', hasta);
  const total = (evs ?? []).length;
  if (!total) return;
  const veces: Record<string, number> = {};
  const nombres = (v: unknown) => String(v ?? '').split(',').map((n) => n.trim().toUpperCase()).filter(Boolean);
  for (const e of evs ?? []) for (const n of new Set([...nombres(e.a_horario), ...nombres(e.tarde)])) veces[n] = (veces[n] ?? 0) + 1;
  const { data: gente } = await supabase.from('equipo').select('username, categoria, estado_miembro').is('eliminado_en', null);
  for (const r of reglas) {
    const n = Number(r.condicion?.valor) || 0;
    for (const p of gente ?? []) {
      if (p.estado_miembro === 'Técnico' || (r.equipo && r.equipo !== p.categoria)) continue;
      const v = veces[String(p.username).toUpperCase()] ?? 0;
      const cumple = r.condicion?.tipo === 'asistencias_mes' ? v >= n : (v * 100) / total >= n;
      if (cumple && v > 0) await _otorgarRecompensa(r, p.username, mes, mes);
    }
  }
}

async function _diaPuntoExtra(equipo?: string | null): Promise<number> {
  const d = Number((await _reglasDeEquipo(equipo)).cuotaVenceDia) || 0;
  return d >= 1 && d <= 28 ? d : 15;
}

/** Mes 'aaaa-mm' que paga una reserva mensual: el de `mes_texto`; el año sale de
 *  `validez_hasta` (reservas viejas vencían días después del fin de mes). */
function _mesDeReserva(r: { mes_texto?: string | null; validez_hasta?: string | null }): string {
  const v = String(r.validez_hasta ?? '').slice(0, 10);
  const i = _MESES_ES.indexOf(String(r.mes_texto ?? '').trim().toLowerCase());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  if (i < 0) return v.slice(0, 7);
  let y = Number(v.slice(0, 4));
  if (i + 1 > Number(v.slice(5, 7))) y -= 1;
  return `${y}-${String(i + 1).padStart(2, '0')}`;
}

async function _recordatoriosCuota(hoyIso: string): Promise<void> {
  const dia = Number(hoyIso.slice(8, 10));
  const mes = hoyIso.slice(0, 7);
  const nombreMes = _MESES_ES[Number(hoyIso.slice(5, 7)) - 1];
  const { data: gente } = await supabase.from('equipo').select('username, categoria, paga_cuota, exenta_cuota, estado_miembro')
    .is('eliminado_en', null).eq('estado_miembro', 'Activx');
  const pagan = (gente ?? []).filter((p: any) => /^s[ií]$/i.test(String(p.paga_cuota ?? '').trim()) && p.exenta_cuota !== true).map((p: any) => p.username);
  if (!pagan.length) return;
  const estados = await _estadosCuotaMes(pagan, mes);
  const deben = pagan.filter((u) => estados[u] === 'debe');
  const enviar = (usuarios: string[], titulo: string, texto: string) => usuarios.length ? sendPush({
    tipo: 'cuota_pendiente', include_external_user_ids: usuarios, headings: { es: titulo }, contents: { es: texto }, url: APP_URL + '/?tab=ajustes',
  }) : Promise.resolve();

          // Cada equipo puede tener su propia fecha límite y recompensa (Victor, 2026-11-17).
  const equipoDeU: Record<string, string> = Object.fromEntries((gente ?? []).map((p: any) => [p.username, p.categoria]));
  for (const eq of [...new Set(deben.map((u) => equipoDeU[u] ?? ''))]) {
    const delEquipo = deben.filter((u) => (equipoDeU[u] ?? '') === eq);
    const DIA_PUNTO_EXTRA = await _diaPuntoExtra(eq);
    const rec = await _recompensaPago(eq), premio = rec.activa ? _textoRecompensa(rec) : '';
    if (dia === 1) await enviar(delEquipo, `Cuota de ${nombreMes}`, premio
      ? `Ya puedes pagar tu cuota de ${nombreMes}. Si pagas hasta el ${DIA_PUNTO_EXTRA}, recibes ${premio}.`
      : `Ya puedes pagar tu cuota de ${nombreMes}. La fecha límite es el ${DIA_PUNTO_EXTRA}.`);
    if (DIA_PUNTO_EXTRA > 2 && dia === DIA_PUNTO_EXTRA - 1) await enviar(delEquipo, premio ? 'Último día para tu recompensa' : 'Mañana es la fecha límite', premio
      ? `Mañana es el último día para pagar tu cuota de ${nombreMes} y recibir ${premio}.`
      : `Mañana es el último día para pagar tu cuota de ${nombreMes} a tiempo.`);
    if (dia === DIA_PUNTO_EXTRA + 1) await enviar(delEquipo, `Aún no pagas ${nombreMes}`, `Aún no has pagado tu cuota de ${nombreMes}. Recuerda hacer tu pago.`);
  }

    // Clases de gracia usadas (Mi Liga → Cobros, por equipo): ayer fue su
  // asistencia confirmada número N del mes en un Entrenamiento y sigue
  // debiendo. Una vez por mes.
  const ayer = new Date(Date.parse(hoyIso) - 86400000).toISOString().slice(0, 10);
  const mesAyer = ayer.slice(0, 7);
  const graciaPor: Record<string, number> = (await _reglasLiga()).graciaClases ?? {};
  const equipoDe: Record<string, string> = Object.fromEntries((gente ?? []).map((p: any) => [p.username, p.categoria]));
  const candidatos = pagan.filter((u) => Number(graciaPor[equipoDe[u]]) > 0);
  if (!candidatos.length) return;
  const { data: evs } = await supabase.from('asistencias').select('fecha, a_horario, tarde')
    .eq('tipo_evento', 'Entrenamiento').not('estado', 'in', '("Evento Cancelado","No se entrena","Eliminado")')
    .gte('fecha', `${mesAyer}-01`).lte('fecha', ayer);
  const nombres = (v: unknown) => String(v ?? '').split(',').map((n) => n.trim().toUpperCase()).filter(Boolean);
    const fechas: Record<string, string[]> = {};
  for (const e of evs ?? []) {
    for (const n of [...nombres(e.a_horario), ...nombres(e.tarde)]) (fechas[n] ??= []).push(e.fecha);
  }
  // Fecha en que usó su última clase de gracia (la N del mes).
  const primera: Record<string, string> = {};
  for (const u of candidatos) {
    const l = (fechas[u.toUpperCase()] ?? []).sort();
    const n = Number(graciaPor[equipoDe[u]]);
    if (l.length >= n) primera[u.toUpperCase()] = l[n - 1];
  }
  const estadosAyer = mesAyer === mes ? estados : await _estadosCuotaMes(candidatos, mesAyer);
  const nombreMesAyer = _MESES_ES[Number(mesAyer.slice(5, 7)) - 1];
  const gracia = candidatos.filter((u) => primera[u.toUpperCase()] === ayer && estadosAyer[u] === 'debe');
  await enviar(gracia, 'Ya usaste tu clase de gracia', `Ya usaste tu clase de gracia de ${nombreMesAyer}. Recuerda pagar tu cuota para seguir entrenando.`);
}

// ─── Acciones: reservas admin ─────────────────────────────────────────────────

async function adminGetReservas(params: Record<string, any>): Promise<any[]> {
  // Pagos con nombres y montos: solo Pivots (antes no pedía sesión, arreglo 2026-11-12).
  if (!await _validarAdminToken(params.adminToken)) return [];
  const { data: reservas } = await supabase.from('reservas').select('*').order('fecha_pago', { ascending: false });
  if (!reservas?.length) return [];
  const ids = reservas.filter((r: any) => r.id_evento).map((r: any) => r.id_evento);
  const { data: eventos } = ids.length
    ? await supabase.from('asistencias').select('id_evento, fecha, donde, inicia').in('id_evento', ids)
    : { data: [] };
  const evPorId: Record<string, any> = {};
  (eventos ?? []).forEach((e: any) => { evPorId[e.id_evento] = e; });
  // Marca "Cuenta eliminada" (pedido explícito -- el historial de reservas
  // de una cuenta archivada sigue apareciendo acá, con el monto, pero
  // identificable) -- sin filtrar por `eliminado_en`, a propósito: esta
  // pantalla es historial, no un roster de personas activas.
  const usernames = [...new Set(reservas.map((r: any) => r.nombre_usuario).filter(Boolean))];
  const { data: filasEquipo } = usernames.length
    ? await supabase.from('equipo').select('username, eliminado_en').in('username', usernames)
    : { data: [] };
  const eliminadoPorUsername: Record<string, boolean> = {};
  (filasEquipo ?? []).forEach((f: any) => { eliminadoPorUsername[f.username] = !!f.eliminado_en; });
  return reservas.map((r: any) => {
    const ev = evPorId[r.id_evento];
    return {
      ...r, fechaEvento: ev?.fecha ?? null, donde: ev?.donde ?? null, horaInicio: ev?.inicia?.substring(0, 5) ?? null,
      cuentaEliminada: !!eliminadoPorUsername[r.nombre_usuario],
    };
  });
}

async function adminSetEstadoReserva(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const id = params.id ?? params.fila;
  const { estado } = params;
  if (!id || !estado) return { exito: false, error: 'Parámetros inválidos.' };
                                const { data: reservaAntes } = await supabase.from('reservas').select('nombre_usuario, id_evento, tipo, monto, medio_pago, medio_nombre, mes_texto, uso_cupon, saldo_aplicado, saldo_movimiento_id, fecha_pago, validez_hasta, punto_extra_en, recompensa, estado, plan_id').eq('id', id).maybeSingle();
    // Rechazo con motivo (Victor, 2026-11-13): se guarda y se le avisa de inmediato.
  const motivo = String(params.motivo ?? '').trim().slice(0, 120);
  const mensaje = String(params.mensaje ?? '').trim().slice(0, 400);
  const cambios: Record<string, any> = { estado };
  if (estado === 'Cancelada' && motivo) cambios.motivo_rechazo = motivo;
  const { error } = await supabase.from('reservas').update(cambios).eq('id', id);
  if (error) return { exito: false, error: error.message };
  if (estado === 'Cancelada' && motivo && reservaAntes?.nombre_usuario) {
    const que = reservaAntes.tipo === 'mensual' ? `tu mensualidad${reservaAntes.mes_texto ? ' de ' + reservaAntes.mes_texto : ''}` : 'tu reserva';
    await sendPush({
      tipo: 'solicitud_resuelta', include_external_user_ids: [reservaAntes.nombre_usuario],
      headings: { es: `Se rechazó ${que}` },
      contents: { es: mensaje || `Motivo: ${motivo}. Puedes suscribirte de nuevo cuando lo tengas listo.` },
      url: APP_URL,
    }).catch(() => {});
  }
  // Tesorería: al confirmar, el ingreso entra a la cuenta que confirma el Pivot
  // (o la del medio que declaró la persona). Al cancelar, se anula.
  if (estado === 'Confirmada' && reservaAntes && Number(reservaAntes.monto) > 0 && !reservaAntes.uso_cupon) {
    const cuenta = String(params.cuentaId ?? '') || await _cuentaPorMedio(String(reservaAntes.medio_pago ?? ''));
    if (cuenta) {
      await _registrarMovimiento({
                tipo: 'ingreso', monto: Number(reservaAntes.monto), cuenta_id: cuenta, categoria: reservaAntes.tipo === 'mensual' ? 'cuota' : 'clase',
        descripcion: reservaAntes.tipo === 'mensual' ? `Mensualidad ${reservaAntes.mes_texto ?? ''}`.trim() : (reservaAntes.tipo === 'plan' ? `Plan ${reservaAntes.mes_texto ?? ''}`.trim() : reservaAntes.tipo === 'curso' ? `Curso ${reservaAntes.mes_texto ?? ''}`.trim() : 'Clase'), persona: reservaAntes.nombre_usuario,
                origen: 'reserva', origen_id: String(id), registrado_por: adminEmail, medio_nombre: reservaAntes.medio_nombre ?? null,
        ...(() => { const mm = reservaAntes.tipo === 'mensual' ? _mesDeReserva(reservaAntes) : ''; return /^\d{4}-\d{2}$/.test(mm) ? { periodo_mes: Number(mm.slice(5, 7)), periodo_anio: Number(mm.slice(0, 4)) } : {}; })(),
      });
    }
    } else if (estado === 'Cancelada') {
    await supabase.from('tesoreria_movimientos').update({ anulado: true, anulado_por: adminEmail, anulado_en: new Date().toISOString(), motivo_anulacion: 'Reserva cancelada' })
      .eq('origen', 'reserva').eq('origen_id', String(id)).eq('anulado', false);
  }
    // Punto extra por pronto pago (Victor, octubre): al aprobar una cuota
  // mensual cuya solicitud se ENVIÓ hasta el día 15 del mes que paga
  // (`fecha_pago`, nunca la fecha de aprobación). Una sola vez por reserva
  // (`punto_extra_en`); si después se cancela, se descuenta. Solo aplica a
  // aprobaciones desde ahora: nada cambia hacia atrás.
    // Recompensas por pagar a tiempo (Victor, 2026-11-15): lo que diga
  // `recompensaPago` al aprobar (puntos, clase gratis, saldo a favor). Lo que
  // se dio queda en `reservas.recompensa` para deshacer exactamente eso.
  let premio = '';
    const mesCuota = reservaAntes ? _mesDeReserva(reservaAntes) : '';
  if (estado === 'Confirmada' && reservaAntes?.tipo === 'mensual' && reservaAntes.estado === 'Pendiente' && !reservaAntes.punto_extra_en && /^\d{4}-\d{2}$/.test(mesCuota)) {
                const eqPago = (await supabase.from('equipo').select('categoria').eq('username', reservaAntes.nombre_usuario).maybeSingle()).data?.categoria ?? null;
    const limite = `${mesCuota}-${String(await _diaPuntoExtra(eqPago)).padStart(2, '0')}`;
    const rec = await _recompensaPago(eqPago);
    if (rec.activa && String(reservaAntes.fecha_pago ?? '').slice(0, 10) && String(reservaAntes.fecha_pago).slice(0, 10) <= limite) {
      const u = reservaAntes.nombre_usuario, dado: Record<string, any> = { puntos: 0, clase: false, saldo: 0, saldoMov: null };
      if (rec.puntos > 0) {
        await _acreditarPuntosExtra(u, Number(mesCuota.slice(0, 4)), Number(mesCuota.slice(5, 7)), rec.puntos);
        dado.puntos = rec.puntos;
      }
      if (rec.claseGratis) {
        // Una sola a la vez: si ya tiene una sin usar, no se acumula.
        const { data: eq } = await supabase.from('equipo').select('cupon_disponible').eq('username', u).maybeSingle();
        if (eq && !eq.cupon_disponible) {
          await supabase.from('equipo').update({ cupon_disponible: true }).eq('username', u);
          dado.clase = true;
        }
      }
      if (rec.saldo > 0) {
        const { data: mov } = await supabase.from('saldos_movimientos').insert({
          username: u, persona_nombre: await _nombrePersona(u), fecha: _hoyEcuadorISO(), monto: _num2(rec.saldo), tipo: 'abono', aplicar: 'aparte',
          concepto: `Recompensa por pagar a tiempo${reservaAntes.mes_texto ? ` (${reservaAntes.mes_texto})` : ''}`, por: adminEmail,
        }).select('id').maybeSingle();
        if (mov?.id) { dado.saldo = rec.saldo; dado.saldoMov = mov.id; }
      }
      await supabase.from('reservas').update({ punto_extra_en: new Date().toISOString(), recompensa: dado }).eq('id', id);
      premio = _textoRecompensa({ puntos: dado.puntos, claseGratis: dado.clase, saldo: dado.saldo });
    }
  } else if (estado === 'Cancelada' && reservaAntes?.punto_extra_en && /^\d{4}-\d{2}$/.test(mesCuota)) {
    // Sin `recompensa` guardada (aprobada antes del 2026-11-15) fue 1 punto.
    const dado = reservaAntes.recompensa ?? { puntos: 1 };
    const u = reservaAntes.nombre_usuario;
    if (Number(dado.puntos) > 0) await _acreditarPuntosExtra(u, Number(mesCuota.slice(0, 4)), Number(mesCuota.slice(5, 7)), -Number(dado.puntos));
    if (dado.clase) await supabase.from('equipo').update({ cupon_disponible: false }).eq('username', u).eq('cupon_disponible', true);
    if (dado.saldoMov) await supabase.from('saldos_movimientos').update({ anulado: true, anulado_por: adminEmail }).eq('id', dado.saldoMov);
    await supabase.from('reservas').update({ punto_extra_en: null, recompensa: null }).eq('id', id);
  }
      // Curso: al aprobar el pago queda inscritx; al cancelar, se libera el cupo.
  if (reservaAntes?.tipo === 'curso') {
    if (estado === 'Confirmada') await supabase.from('curso_inscripciones').update({ estado: 'confirmada' }).eq('reserva_id', id);
    else if (estado === 'Cancelada') await supabase.from('curso_inscripciones').update({ estado: 'cancelada' }).eq('reserva_id', id);
  }
  // Plan de clases: al aprobar el pago se dan sus clases; al cancelar se
  // quitan las que no se usaron (Victor, 2026-11-16).
  if (reservaAntes?.tipo === 'plan') {
    if (estado === 'Confirmada' && reservaAntes.estado === 'Pendiente') {
      const { data: plan } = await supabase.from('planes').select('nombre, cantidad, vence_meses').eq('id', reservaAntes.plan_id).maybeSingle();
      const h = _hoyEcuadorISO();
      const v = new Date(Date.UTC(Number(h.slice(0, 4)), Number(h.slice(5, 7)) - 1 + (Number(plan?.vence_meses) || 3), Number(h.slice(8, 10))));
      await supabase.from('plan_creditos').insert({
        username: reservaAntes.nombre_usuario, plan_id: reservaAntes.plan_id, reserva_id: id, nombre: plan?.nombre ?? reservaAntes.mes_texto ?? '',
        total: Number(plan?.cantidad) || 1, vence: v.toISOString().slice(0, 10),
      });
    } else if (estado === 'Cancelada') {
      const { data: pcs } = await supabase.from('plan_creditos').select('id, usadas').eq('reserva_id', id);
      for (const pc of pcs ?? []) await supabase.from('plan_creditos').update({ total: Number(pc.usadas) }).eq('id', pc.id);
    }
  }
  // Aviso de pago aprobado (rechazo: arriba, con motivo).
  if (estado === 'Confirmada' && reservaAntes?.estado === 'Pendiente' && reservaAntes.nombre_usuario) {
    const mesTxt = mesCuota ? _MESES_ES[Number(mesCuota.slice(5, 7)) - 1] : String(reservaAntes.mes_texto ?? '').toLowerCase();
        const texto = reservaAntes.tipo === 'mensual'
      ? `Recibimos tu pago de ${mesTxt}, ¡gracias!${premio ? ` Por pagar a tiempo recibes ${premio}.` : ''}`
      : reservaAntes.tipo === 'plan'
            ? `Tu plan ${reservaAntes.mes_texto ?? ''} está activo. Ya puedes suscribirte a tus clases sin pagar cada una.`
      : reservaAntes.tipo === 'curso'
      ? `Ya estás inscritx en ${reservaAntes.mes_texto ?? 'el curso'}. Las fechas están en tu calendario.`

      : 'Tu suscripción a la clase quedó confirmada. ¡Nos vemos!';
    await sendPush({ tipo: 'solicitud_resuelta', include_external_user_ids: [reservaAntes.nombre_usuario], headings: { es: reservaAntes.tipo === 'mensual' ? 'Pago confirmado' : 'Suscripción confirmada' }, contents: { es: texto }, url: APP_URL }).catch(() => {});
  }
  // Saldo usado o pagado junto con la cuota: se registra al confirmar y se
  // anula si la reserva se cancela después.
  const aplicado = Number(reservaAntes?.saldo_aplicado) || 0;
  if (estado === 'Confirmada' && aplicado !== 0 && !reservaAntes?.saldo_movimiento_id) {
    const mes = reservaAntes?.mes_texto ? ` de ${reservaAntes.mes_texto}` : '';
    const { data: mov } = await supabase.from('saldos_movimientos').insert({
      username: reservaAntes!.nombre_usuario, persona_nombre: await _nombrePersona(reservaAntes!.nombre_usuario), fecha: _hoyEcuadorISO(),
            // La deuda pagada con la reserva baja primero lo que pasó a deuda ('con_cuota').
      monto: _num2(-aplicado), tipo: aplicado > 0 ? 'cargo' : 'abono', aplicar: aplicado > 0 ? 'aparte' : 'con_cuota', por: adminEmail,
      concepto: aplicado > 0 ? `Saldo a favor usado en la cuota${mes}` : `Pagado junto con la cuota${mes}`,
    }).select('id').maybeSingle();
    if (mov?.id) await supabase.from('reservas').update({ saldo_movimiento_id: mov.id }).eq('id', id);
  } else if (estado === 'Cancelada' && reservaAntes?.saldo_movimiento_id) {
    await supabase.from('saldos_movimientos').update({ anulado: true, anulado_por: adminEmail }).eq('id', reservaAntes.saldo_movimiento_id);
    await supabase.from('reservas').update({ saldo_movimiento_id: null }).eq('id', id);
  }


  // Auto-marcar "Asistiré" al aprobar una reserva de Mirlxs (feat nueva,
  // pedido explícito -- ver MANIFEST.md). Solo reservas "por clase"
  // (`tipo:'clase'`, `id_evento` real -- las mensuales guardan
  // `id_evento:null`, sin un evento puntual al que asistir, ver
  // `guardarReserva()`) y solo cuentas `categoria='Mirlxs'` (Quindes no pasa
  // por este flujo de aprobación admin). Mismo criterio que
  // `marcarAsistenciaUsuario()` con click manual: borra RSVPs previos
  // (`Usuario`/`AsistenciaAnticipada`) e inserta la fila nueva
  // `origen:'Usuario'` -- indistinguible de un RSVP manual para el resto de
  // la app (`getEventosRango()`, el termómetro de racha, etc.).
  // Verificado 2026-11-22 (Victor): vale para cualquier equipo de cualquier
  // liga, no solo "Mirlxs" (era un nombre fijo).
  if (estado === 'Confirmada' && reservaAntes?.tipo === 'clase' && reservaAntes?.id_evento) {
    await _asistireAlConfirmar(reservaAntes.id_evento, reservaAntes.nombre_usuario);
  }

    // "Clase a favor" (Mi Liga, 2026-11-07): avisar a la persona que su
  // próxima clase reservada no tendrá costo.
  if (estado === 'Reagendar' && reservaAntes?.nombre_usuario) {
    await sendPush({
      tipo: 'evento_cancelado',
      include_external_user_ids: [reservaAntes.nombre_usuario],
      headings: { es: 'Tienes una clase a favor' },
      personal: true, // aviso de pago, no del evento
      contents: { es: 'Tu próxima suscripción a una clase no tendrá costo: se descuenta sola al suscribirte.' },
      url: APP_URL + '/?tab=eventos',
    });
  }

  return { exito: true };
}

// Ficha de emergencia (botón de emergencia, solo admins, Victor 2026-11-07):
// datos sensibles de UNA persona, pedidos cada vez y nunca guardados en el
// teléfono. Sin registro de accesos ni aviso, por decisión explícita.
async function adminFichaEmergencia(params: Record<string, any>): Promise<Record<string, any>> {
  if (!(await _validarAdminToken(String(params.adminToken ?? '')))) return { exito: false, error: 'Solo admins.' };
  const { data: r } = await supabase.from('equipo')
    .select('username, nombre_derby, numero_derby, foto_perfil, fecha_nacimiento, tipo_documento, pais_expedicion, numero_documento, nombre_legal, calle_principal, calle_secundaria, numeracion, sector, canton, emerg1_nombre, emerg1_relacion, emerg1_prefijo, emerg1_telefono, emerg2_nombre, emerg2_relacion, emerg2_prefijo, emerg2_telefono, enfermedad, alergias, dieta, alergias_desc, antecedentes, medicamentos, medicamentos_desc, atencion_medica, seguro, seguro_contacto')
    .eq('username', String(params.username ?? '')).is('eliminado_en', null).maybeSingle();
  if (!r) return { exito: false, error: 'Persona no encontrada.' };
  const { data: pais } = await supabase.from('config_app').select('value').eq('key', 'pais_equipo').maybeSingle();
  return { exito: true, paisEquipo: pais?.value ?? 'EC', ficha: r };
}

// ─── Parser de parámetros ─────────────────────────────────────────────────────

async function parseParams(req: Request): Promise<Record<string, any>> {
  if (req.method === 'GET') return Object.fromEntries(new URL(req.url).searchParams.entries());
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) { try { return await req.json(); } catch { return {}; } }
  const text = await req.text();
  try { return Object.fromEntries(new URLSearchParams(text).entries()); } catch { return {}; }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  let params: Record<string, any>;
  try {
    params = await parseParams(req);
  } catch {
    params = {};
  }
  if (!PIVOT_JWT_SECRET || !SUPABASE_ANON_KEY_LIGAS) return _rutear(req, params);
  try {
    // Tareas programadas: corren una vez por cada liga.
    if (String(params.action ?? '').startsWith('cron')) {
      const { data: ligas } = await supabaseServicio.from('ligas').select('id');
      let ultima: Response = json({ exito: true });
      for (const l of ligas ?? [{ id: LIGA_QUINDES }]) {
        const cliente = await _clienteDeLiga(l.id);
        ultima = await _alsLiga.run({ cliente, ligaId: l.id }, () => _rutear(req, params));
      }
      return ultima;
    }
    const ligaId = await _ligaDelPedido(params);
    const cliente = await _clienteDeLiga(ligaId);
    return await _alsLiga.run({ cliente, ligaId }, () => _rutear(req, params));
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Error interno.' }, 500);
  }
});

async function _rutear(req: Request, paramsPre: Record<string, any>): Promise<Response> {
  try {
    const params = paramsPre;
        const action = params.action;

    // Acciones de Pivots que antes no pedían sesión (revisión 2026-11-12):
    // sin un adminToken válido no se ejecutan. La web y la app siempre lo mandan.
        if (ACCIONES_SOLO_PIVOTS.has(String(action)) && !(await _validarAdminToken(String(params.adminToken ?? '')))) {
      return json({ exito: false, error: 'Sesión admin inválida.' });
    }
    // Permisos por área: un Pivot sin esa área no puede usar la acción.
    const areaAccion = AREA_DE_ACCION[String(action)];
    if (areaAccion && params.adminToken) {
      const em = await _validarAdminToken(String(params.adminToken));
      if (em && !(await _areasDe(em)).includes(areaAccion)) {
        return json({ exito: false, error: 'No tienes permiso para esta área. Otro Pivot te la puede dar en Mi Liga → Pivots y permisos.' });
      }
    }

        // Pivot solo de fiestas y eventos sociales: ninguna otra herramienta de Pivot
    // (Victor, 2026-11-20). Puede leer sus propias áreas.
    const esHerramientaPivot = String(action).startsWith('admin') || ACCIONES_SOLO_PIVOTS.has(String(action)) || !!areaAccion;
    if (esHerramientaPivot && params.adminToken && !(action === 'adminPivots' && params.accion === 'misAreas')) {
      const em = await _validarAdminToken(String(params.adminToken));
      if (em && _soloSociales(await _areasDe(em))) {
        return json({ exito: false, error: 'Tu rol de Pivot es de fiestas y eventos sociales; esta herramienta es de otras áreas.' });
      }
    }

    // Evento social (Naviquinde): ver social.ts.
    if (ACCIONES_SOCIAL.has(String(action))) {
      return json(await accionSocial(String(action), params, _depsSocial()));
    }

    switch (action) {
      // Auth
      case 'loginGoogle':                     return json(await loginGoogle(params));
      case 'adminLogin':                      return json(await adminLogin(params));
            case 'validarPin':                      return json(await validarPin(params));
            case 'cambiarPassword':                 return json(await cambiarPassword(params));
            case 'cambiarUsuario':                  return json(await cambiarUsuario(params));
      case 'crearTareaPropia':                return json(await crearTareaPropia(params));
      case 'getAdministradorxs':              return json(await getAdministradorxs(params));
            case 'getConfigEquipo':                 return json(await getConfigEquipo(params));
                  case 'getConfigLiga':                   return json(await getConfigLiga(params));
      case 'getMiBandeja':                    return json(await getMiBandeja(params));
      case 'adminDatosCategorias':            return json(await adminDatosCategorias(params));
      case 'adminGuardarConfigLiga':          return json(await adminGuardarConfigLiga(params));
      case 'restaurarSesion':                 return json(await restaurarSesion(params));
      case 'cerrarSesion':                    return json(await cerrarSesion(params));
      case 'resolverNombre':                  return json(await resolverNombre(params));
      case 'inscribirPersona':                return json(await inscribirPersona(params));
      case 'inscribirPersonaExpress':          return json(await inscribirPersonaExpress(params));
      case 'eliminarCuenta':                  return json(await eliminarCuenta(params));
      // Perfil
      case 'getDatosCompletos':               return json(await getDatosCompletosAction(params));
      case 'getDatosPersona':                 return json(await getDatosPersona(params));
      case 'actualizarDatosPersona':          return json(await actualizarDatosPersona(params));
            case 'actualizarEquipamientoPersona':   return json(await actualizarEquipamientoPersona(params));
      case 'getMiEquipoLiga':                 return json(await getMiEquipoLiga(params));
      case 'guardarMiEquipoLiga':             return json(await guardarMiEquipoLiga(params));
      case 'actualizarPin':                   return json(await actualizarPin(params));
      case 'actualizarPerfilGoogle':          return json(await actualizarPerfilGoogle(params));
      case 'getCuponDisponible':              return json(await getCuponDisponible(params));
      case 'marcarCuponUsado':                return json(await marcarCuponUsado(params));
            case 'getNombres':                      return json(await getNombres());
      // Diagnóstico de varias ligas (sin datos personales).
      case 'estadoLigas':                     return json({ exito: true, porLiga: !!PIVOT_JWT_SECRET && !!SUPABASE_ANON_KEY_LIGAS, secreto: !!PIVOT_JWT_SECRET, anon: !!SUPABASE_ANON_KEY_LIGAS, liga: _ligaEnCurso(), pedida: await _ligaDelPedido(params), claves: Object.keys(params) });
      case 'verificarEmailDisponible':        return json(await verificarEmailDisponible(params));
      case 'verificarNombreDisponible':       return json(await verificarNombreDisponible(params));
      case 'verificarGoogle':                 return json(await verificarGoogle(params));
      case 'validarInviteToken':              return json(await validarInviteToken(params));
      case 'activarCuenta':                   return json(await activarCuenta(params));
      case 'completarActivacion':             return json(await completarActivacion(params));
      case 'generarInviteToken':              return json(await generarInviteToken(params));
      // Config
            case 'getPreciosClases': {
              // Meses con cuota proporcional por un descanso (factor; la app multiplica la mensualidad).
              const pr = await getPreciosClases(params);
              const mp = await _mesesProporcionales(pr.equipoCobro);
              return json({ ...pr, factorPorMes: Object.fromEntries(Object.entries(mp).map(([k, v]) => [k, v.factor])) });
            }
      case 'adminSetPreciosClases':           return json(await adminSetPreciosClases(params));
      // Venues
      case 'adminGetVenues':                  return json(await adminGetVenues());
      case 'adminCrearVenue':                 return json(await adminCrearVenue(params));
      case 'adminEditarVenue':                return json(await adminEditarVenue(params));
      case 'adminEliminarVenue':              return json(await adminEliminarVenue(params));
      // Equipamiento
      case 'getTallasDisponibles':            return json(await getTallasDisponibles());
      case 'adminGetEquipamiento':            return json(await adminGetEquipamiento());
      case 'adminGuardarEquipamiento':        return json(await adminGuardarEquipamiento(params));
      // Tareas
            case 'getTareasApp':                    return json(await getTareasApp(params));
      case 'adminGetTareasRecurrentes':       return json(await adminGetTareasRecurrentes(params));
      case 'adminEditarTareaRecurrente':      return json(await adminEditarTareaRecurrente(params));
            case 'adminEstadoTareaRecurrente':      return json(await adminEstadoTareaRecurrente(params));
                        case 'adminBandeja':                    return json(await adminBandeja(params));
                        case 'adminPivots':                     return json(await adminPivots(params));
            case 'getReglasLiga':                   return json(await getReglasLiga(params));
                        case 'adminReglasLiga':                 return json(await adminReglasLiga(params));
      case 'adminRecompensas':                return json(await adminRecompensas(params));
                                                case 'adminCambiosEquipo':              return json(await adminCambiosEquipo(params));
            case 'adminResolverRevisionEquipo':     return json(await adminResolverRevisionEquipo(params));
            case 'adminCuponDescuento':             return json(await adminCuponDescuento(params));
      case 'adminPlanes':                     return json(await adminPlanes(params));
      case 'getMisPlanes':                    return json(await getMisPlanes(params));
            case 'comprarPlan':                     return json(await comprarPlan(params));
      case 'getCursos':                       return json(await getCursos(params));
      case 'inscribirseCurso':                return json(await inscribirseCurso(params));
      case 'adminCursos':                     return json(await adminCursos(params));
      case 'responderCambioEquipo':           return json(await responderCambioEquipo(params));
                                    case 'adminSubirLogo':                  return json(await adminSubirLogo(params));
            case 'adminHistorialAjustes':           return json(await adminHistorialAjustes(params));
                        case 'adminPersonalLiga':              return json(await adminPersonalLiga(params));
      case 'adminTesoreria':                  return json(await adminTesoreria(params));
      case 'adminPagoCoaches':                return json(await adminPagoCoaches(params));
      case 'getMiPagoCoach':                  return json(await getMiPagoCoach(params));
      case 'getMiDeuda':                      return json(await getMiDeuda(params));
            case 'getOpcionesLogin':                return json(await getOpcionesLogin());
                                                                        case 'getMiSaldo':                      return json(await getMiSaldo(params));
      case 'reservaEnCurso':                  return json(await reservaEnCurso(params));
                                                case 'cancelarMiSolicitud':             return json(await cancelarMiSolicitud(params));
      case 'editarMiSolicitud':               return json(await editarMiSolicitud(params));
            case 'subirComprobante':                return json(await subirComprobante(params));
            case 'enviarCodigoCorreo':              return json(await enviarCodigoCorreo(params));
            case 'verificarCodigoCorreo':           return json(await verificarCodigoCorreo(params));
            case 'getTransparencia':                return json(await getTransparencia(params));
                  case 'adminGetExcepcionesVigentes':     return json(await adminGetExcepcionesVigentes(params));
      case 'adminCancelarExcepcion':          return json(await adminCancelarExcepcion(params));
      case 'getMisRectificaciones':           return json(await getMisRectificaciones(params));
      case 'escrituraDirecta':                return json(await escrituraDirecta(params));
      case 'getInventario':                   return json(await getInventario(params));
      case 'pedirPrestamo':                   return json(await pedirPrestamo(params));
      case 'adminPrestamo':                   return json(await adminPrestamo(params));
      case 'responderPrestamo':               return json(await responderPrestamo(params));
            case 'adminInventarioLista':            return json(await adminInventarioLista(params));
      case 'getReglasPrestamo':               return json(await getReglasPrestamo(params));
      case 'adminReglaPrestamo':              return json(await adminReglaPrestamo(params));
      case 'registrarUsoInventario':          return json(await registrarUsoInventario(params));
      case 'getComunidad':                    return json(await getComunidad(params));
      case 'adminGuardarComunidad':           return json(await adminGuardarComunidad(params));
      case 'getRolesEquipo':                  return json(await getRolesEquipo());
      case 'adminRolesEquipo':                return json(await adminRolesEquipo(params));
      case 'cronRecordatorioTareas': {
        const secretHeader = req.headers.get('x-cron-secret') ?? '';
        if (!CRON_SECRET || secretHeader !== CRON_SECRET) return json({ error: 'No autorizado.' }, 401);
        return json(await cronRecordatorioTareas());
      }
      case 'getConfigTareas':                 return json(await getConfigTareas());
      case 'getTareasDisponibles':            return json(await getTareasDisponibles());
      case 'getMisTareas':                    return json(await getMisTareas(params));
      // Bug de seguridad real corregido (pedido explícito de Victor): las 4
      // acciones de abajo (tomarTarea/soltarTarea/rescatarTarea/
      // enviarRevisionTarea) recibían `nombre` directo de `params`, tal
      // cual lo mandaba el cliente, sin validarlo contra el token de
      // sesión -- cualquiera que conociera el `username` real de un
      // compañero podía tomar/soltar/rescatar/enviar a revisión tareas EN
      // SU NOMBRE (incluida la aprobación automática de admin de
      // `enviarRevisionTarea`, que depende de ese mismo `nombre`). Fix,
      // mismo patrón ya usado para las acciones admin-gated de este router
      // (ver `case 'getTiers'`, más abajo): se valida `params.token` ACÁ,
      // en el router, y se pisa `params.nombre` con el username real que
      // devuelve `_validarToken()` antes de llamar a la función -- las 4
      // funciones de abajo no cambiaron nada por dentro (ya usaban
      // `params.nombre` correctamente, el problema era que ese valor venía
      // sin validar). Token inválido/ausente → 401, nunca se llega a
      // ejecutar la acción.
      case 'tomarTarea': {
        const nombreSesion = await _validarToken(params.token);
        if (!nombreSesion) return json({ exito: false, error: 'Sesión inválida.' }, 401);
        params.nombre = nombreSesion;
        return json(await tomarTarea(params));
      }
      case 'soltarTarea': {
        const nombreSesion = await _validarToken(params.token);
        if (!nombreSesion) return json({ exito: false, error: 'Sesión inválida.' }, 401);
        params.nombre = nombreSesion;
        return json(await soltarTarea(params));
      }
      case 'rescatarTarea': {
        const nombreSesion = await _validarToken(params.token);
        if (!nombreSesion) return json({ exito: false, error: 'Sesión inválida.' }, 401);
        params.nombre = nombreSesion;
        return json(await rescatarTarea(params));
      }
      case 'enviarRevisionTarea': {
        const nombreSesion = await _validarToken(params.token);
        if (!nombreSesion) return json({ exito: false, error: 'Sesión inválida.' }, 401);
        params.nombre = nombreSesion;
        return json(await enviarRevisionTarea(params));
      }
      case 'adminValidarTarea':               return json(await adminValidarTarea(params));
      case 'adminDesvalidarTarea':            return json(await adminDesvalidarTarea(params));
      case 'adminGetTareasActivas':           return json(await adminGetTareasActivas());
      case 'getTareasArchivadas':             return json(await getTareasArchivadas());
      case 'adminEliminarTareaArchivada':     return json(await adminEliminarTareaArchivada(params));
      case 'adminArchivarTarea':              return json(await adminArchivarTarea(params));
      case 'adminCrearTarea':                 return json(await adminCrearTarea(params));
      case 'adminEditarTarea':                return json(await adminEditarTarea(params));
      case 'adminEditarAsignacionesTarea':    return json(await adminEditarAsignacionesTarea(params));
      case 'adminCrearTareaRecurrente':       return json(await adminCrearTareaRecurrente(params));
      case 'adminAplicarTareaRecurrenteHistorico': return json(await adminAplicarTareaRecurrenteHistorico(params));
      case 'cronGenerarTareasRecurrentes': {
        const secretHeader = req.headers.get('x-cron-secret') ?? '';
        if (!CRON_SECRET || secretHeader !== CRON_SECRET) return json({ error: 'No autorizado.' }, 401);
        return json(await cronGenerarTareasRecurrentes());
      }
      case 'adminEliminarTarea':              return json(await adminEliminarTarea(params));
      case 'getTareasPendientesValidacion':        return json(await getTareasPendientesValidacion());
      case 'adminGetTareasPendientesValidacion':   return json(await getTareasPendientesValidacion());
      // Eventos / asistencias
      case 'debug': {
        const { data: d, error: e } = await supabase.from('asistencias').select('id_evento, fecha').limit(3);
        const { count } = await supabase.from('asistencias').select('*', { count: 'exact', head: true });
        return json({ rows: d, error: e?.message ?? null, count, urlSet: !!SUPABASE_URL, keySet: !!SUPABASE_SERVICE_KEY, keyLen: SUPABASE_SERVICE_KEY?.length ?? 0 });
      }
      case 'getEventosRango':                 return json(await getEventosRango(params));
      case 'getCumpleañosRango':              return json(await getCumpleañosRango(params));
      case 'guardarFechaNacimiento':          return json(await guardarFechaNacimiento(params));
      case 'registrarDispositivoPush':        return json(await registrarDispositivoPush(params));
            case 'eliminarDispositivoPush':         return json(await eliminarDispositivoPush(params));
      case 'estadoAvisos':                    return json(await estadoAvisos(params));
      case 'getEventosFiltrados':             return json(await getEventosFiltrados(params));
      case 'marcarAsistenciaUsuario':         return json(await marcarAsistenciaUsuario(params));
                  case 'adminSugeridosAsistencia':        return json(await adminSugeridosAsistencia(params));
      case 'adminCambiarRespuesta':           return json(await adminCambiarRespuesta(params));
            case 'adminMarcarAsistencia':           return json(await adminMarcarAsistencia(params));
            case 'pedirCoach':                      return json(await pedirCoach(params));
      case 'dejarDeSerCoach':                 return json(await dejarDeSerCoach(params));
      case 'verificarNombreLiga':             return json(await verificarNombreLiga(params));
      case 'crearLiga':                       return json(await crearLiga(params));
      case 'getDirectorioLigas':              return json(await getDirectorioLigas(params));
      case 'adminMiLigaDirectorio':           return json(await adminMiLigaDirectorio(params));
      case 'superLigas':                      return json(await superLigas(params));
      case 'esDuenxPivot':                    return json(await esDuenxPivot(params));
      case 'getReglamento':                   return json(await getReglamento(params));
      case 'superReglamento':                 return json(await superReglamento(params));
      case 'getMiCoach':                      return json(await getMiCoach(params));
      case 'adminCoaches':                    return json(await adminCoaches(params));
            case 'getCoach':                        return json(await getCoach(params));
      case 'moverPlanesEvento':               return json(await moverPlanesEvento(params));
      case 'getFichaDeportiva':               return json(await getFichaDeportiva(params));
      case 'coachGuardar':                    return json(await coachGuardar(params));
      case 'getHabilidades':                  return json(await getHabilidades(params));
      case 'getPlanEvento':                   return json(await getPlanEvento(params));
            case 'coachMarcarAsistencia':           return json(await coachMarcarAsistencia(params));
      case 'coachPruebas':                    return json(await coachPruebas(params));
      case 'coachFeedbackEvento':             return json(await coachFeedbackEvento(params));
      case 'adminActualizarEstadoViaje':      return json(await adminActualizarEstadoViaje(params));
      case 'adminCancelarViaje':              return json(await adminCancelarViaje(params));
      case 'adminRegistrarAsistenciaExterna': return json(await adminRegistrarAsistenciaExterna(params));
      case 'adminGetAsistenciasExternas':     return json(await adminGetAsistenciasExternas(params));
      case 'adminEliminarAsistenciaExterna':  return json(await adminEliminarAsistenciaExterna(params));
      case 'adminBuscarPersonasParaEvento':   return json(await adminBuscarPersonasParaEvento(params));
      case 'solicitarRectificacionAsistencia': return json(await solicitarRectificacionAsistencia(params));
      case 'adminGetRectificaciones':          return json(await adminGetRectificaciones(params));
      case 'adminSetEstadoRectificacion':      return json(await adminSetEstadoRectificacion(params));
            case 'getMisExcepciones':                return json(await getMisExcepciones(params));
      case 'solicitarExcepcion':               return json(await solicitarExcepcion(params));
      case 'adminGetExcepciones':              return json(await adminGetExcepciones(params));
      case 'adminSetEstadoExcepcion':          return json(await adminSetEstadoExcepcion(params));
      // Reservas
      case 'getProximosEntrenamientos':       return json(await getProximosEntrenamientos());
      case 'getFechasDisponibles':            return json(await getFechasDisponibles(params));
                  case 'guardarReserva':                  return json(await guardarReserva(params));
      case 'adminCancelarEvento':             return json(await adminCancelarEvento(params));
      case 'adminReactivarEvento':            return json(await adminReactivarEvento(params));
      case 'actualizarProtecReserva':         return json(await actualizarProtecReserva(params));
      case 'avisarPagoPendiente':             return json(await avisarPagoPendiente(params));
      case 'getReservasPersona':              return json(await getReservasPersona(params));
      case 'cancelarReserva':                 return json(await cancelarReserva(params));
      case 'reagendarReserva':                return json(await reagendarReserva(params));
      case 'getTallasDisponiblesParaFecha':   return json(await getTallasDisponiblesParaFecha(params));
      case 'actualizarTallaReserva':          return json(await actualizarTallaReserva(params));
      case 'actualizarEquipoReserva':         return json(await actualizarEquipoReserva(params));
      case 'usarCreditos':                    return json(await usarCreditos(params));
      // Pagos
            case 'adminRegistrarPago':              return json(await adminRegistrarPago(params));
            case 'adminClasesParaPago':             return json(await adminClasesParaPago(params));
      case 'adminMesesCuota':                 return json(await adminMesesCuota(params));
      case 'adminRegistrarIngreso':           return json(await adminRegistrarIngreso(params));
      case 'adminRegistrarEgreso':            return json(await adminRegistrarEgreso(params));
      case 'adminGetEstadoPagosMes':          return json(await adminGetEstadoPagosMes(params));
      case 'adminGetPagosAnual':              return json(await adminGetPagosAnual(params));
      case 'adminGetBalanceFinanciero':       return json(await adminGetBalanceFinanciero());
      case 'crearSolicitudPago':              return json(await crearSolicitudPago(params));
            case 'adminGetSolicitudesPago':         return json(await adminGetSolicitudesPago(params));
      case 'adminResolverSolicitudPago':      return json(await adminResolverSolicitudPago(params));
      // Usuarios / admins
      case 'adminGetUsuarios':               return json(await adminGetUsuarios());
      case 'adminToggleCupon':               return json(await adminToggleCupon(params));
      case 'adminSetEstadoMiembro':          return json(await adminSetEstadoMiembro(params));
      case 'adminSetTierModo':               return json(await adminSetTierModo(params));
      case 'adminSetExentaCuota':            return json(await adminSetExentaCuota(params));
      case 'listarExcepcionesCuota':         return json(await listarExcepcionesCuota(params));
      case 'guardarExcepcionCuota':          return json(await guardarExcepcionCuota(params));
      case 'recalcularStatsEquipo':          return json(await recalcularStatsEquipo(params));
      case 'adminRecalcularStats':           return json(await adminRecalcularStats(params));
      case 'adminRecalcularPuntosAsistencia': return json(await adminRecalcularPuntosAsistencia(params));
      case 'solicitarLesion':                return json(await solicitarLesion(params));
      case 'cancelarSolicitudLesion':         return json(await cancelarSolicitudLesion(params));
      case 'recuperarseLesion':              return json(await recuperarseLesion(params));
      case 'autodeclararEstado':             return json(await autodeclararEstado(params));
      case 'terminarMiViaje':                return json(await terminarMiViaje(params));
      case 'adminGetSolicitudesLesion':      return json(await adminGetSolicitudesLesion(params));
      case 'adminAprobarLesion':             return json(await adminAprobarLesion(params));
      case 'adminRechazarLesion':            return json(await adminRechazarLesion(params));
      case 'adminEliminarUsuario':           return json(await adminEliminarUsuario(params));
            case 'adminRestaurarUsuario':          return json(await adminRestaurarUsuario(params));
      case 'adminBorrarDatosPersona':        return json(await adminBorrarDatosPersona(params));
      case 'adminGetAdmins':                 return json(await adminGetAdmins());
      case 'adminAgregarAdmin':              return json(await adminAgregarAdmin(params));
      case 'adminQuitarAdmin':               return json(await adminQuitarAdmin(params));
      case 'adminGetCandidatosAdmin':        return json(await adminGetCandidatosAdmin());
      case 'adminGetRosterEquipo':           return json(await adminGetRosterEquipo());
            case 'getEquipo':                      return json(await getEquipo(params));
      case 'adminFichaEmergencia':           return json(await adminFichaEmergencia(params));
            case 'getDesglosePuntos':              return json(await getDesglosePuntos(params));
      case 'getEstadisticasPersona':         return json(await getEstadisticasPersona(params));
      case 'adminGetQueLlevar':              return json(await adminGetQueLlevar());
      // Push
      case 'adminEnviarAviso':              return json(await adminEnviarAviso(params));
      case 'adminAvisosProgramados':        return json(await adminAvisosProgramados(params));
      case 'notificarCambioAsistenciaInterno': {
        const secretHeader = req.headers.get('x-cron-secret') ?? '';
        if (!CRON_SECRET || secretHeader !== CRON_SECRET) return json({ error: 'No autorizado.' }, 401);
        if (!params.username) return json({ exito: false });
        return json(await _notificarCambioAsistenciaCore(String(params.username), params.idEvento, params.estadoNuevo, params.estadoAnterior));
      }
      case 'notificarCambioAsistencia':     return json(await notificarCambioAsistencia(params));
      case 'pushEventoCreado':              return json(await pushEventoCreado(params));
      case 'pushEventoCancelado':           return json(await pushEventoCancelado(params));
      case 'pushEventoEditado':             return json(await pushEventoEditado(params));
            case 'pushOffseasonCreado':           return json(await pushOffseasonCreado(params));
      case 'adminGuardarTemporadaDescanso': return json(await adminGuardarTemporadaDescanso(params));
      case 'adminEliminarTemporadaDescanso': return json(await adminEliminarTemporadaDescanso(params));
      case 'cronDiario': {
        const secretHeader = req.headers.get('x-cron-secret') ?? '';
        if (!CRON_SECRET || secretHeader !== CRON_SECRET) return json({ error: 'No autorizado.' }, 401);
        return json(await cronDiario());
      }
      // Crons de recordatorios/resumen admin (ver supabase/migrations/*_push_cron_recordatorios.sql)
      // -- mismo gate x-cron-secret que cronDiario arriba.
      case 'cronRecordatorioEvento': {
        const secretHeader = req.headers.get('x-cron-secret') ?? '';
        if (!CRON_SECRET || secretHeader !== CRON_SECRET) return json({ error: 'No autorizado.' }, 401);
        return json(await cronRecordatorioEvento());
      }
      case 'cronRecordatorio1Dia': {
        const secretHeader = req.headers.get('x-cron-secret') ?? '';
        if (!CRON_SECRET || secretHeader !== CRON_SECRET) return json({ error: 'No autorizado.' }, 401);
        return json(await cronRecordatorio1Dia());
      }
      case 'cronAdminEvento': {
        const secretHeader = req.headers.get('x-cron-secret') ?? '';
        if (!CRON_SECRET || secretHeader !== CRON_SECRET) return json({ error: 'No autorizado.' }, 401);
        return json(await cronAdminEvento());
      }
      // Push disparados por el frontend (gateados por _validarToken, no admin)
      case 'pushAsistenciaCambio':          return json(await pushAsistenciaCambio(params));
      case 'pushSolicitudPendiente':        return json(await pushSolicitudPendiente(params));
      case 'adminGetEstadoPush':            return json(await adminGetEstadoPush(params));
      case 'getCatalogoNotificaciones':      return json(await getCatalogoNotificaciones());
      case 'getPreferenciasPush':           return json(await getPreferenciasPush(params));
      case 'guardarPreferenciasPush':       return json(await guardarPreferenciasPush(params));
      // Reservas admin / sesión admin
      case 'adminGetReservas':              return json(await adminGetReservas(params));
            case 'adminSetEstadoReserva':         return json(await adminSetEstadoReserva(params));
            case 'adminPedirComprobante':         return json(await adminPedirComprobante(params));
      case 'adminDeudaReserva':             return json(await adminDeudaReserva(params));
      case 'adminCerrarSesion':             { if (params.adminToken) await supabase.from('admin_sessions').delete().eq('token', params.adminToken); return json({ exito: true }); }
      case 'adminBorrarEvento':             return json(await adminBorrarEvento(params));
      case 'subirFotoPerfil':        return json(await subirFotoPerfil(params));
      case 'subirFotoInscripcion':   return json(await subirFotoInscripcion(params));
      // Mi Liga — config de tiers (categorías de equipo)
            // Reglas de los equipos para cualquiera de la liga, solo para leer
      // (Victor, 2026-11-22), sin el código de invitación.
      case 'getEquipoPublico': {
        const yo = await _validarToken(String(params.token ?? ''));
        if (!yo) return json({ error: 'Sesión inválida.' }, 401);
        const { data } = await supabase.from('config_tiers').select('*').order('orden');
        const le = await _listasEntrenar();
        return json({
          tiers: (data ?? []).map((t: any) => {
            const { codigo_invitacion: _c, ...resto } = t;
            return { ...resto, propioNombres: le.filter((l) => _propioDe(t.requisitos ?? {}, le).includes(l.id)).map((l) => l.nombre) };
          }),
        });
      }
      // Recompensas por asistencia que aplican a un equipo, para explicarlas
      // dentro del equipo (Victor, 2026-11-27). Solo nombre y textos.
      case 'getRecompensasEquipo': {
        const yo = await _validarToken(String(params.token ?? ''));
        if (!yo) return json({ error: 'Sesión inválida.' }, 401);
        const equipo = String(params.equipo ?? '');
        const { data: reglas } = await supabase.from('reglas_recompensa').select('nombre, activa, equipo, condicion, premio')
          .is('eliminada_en', null).eq('activa', true).order('creada_en', { ascending: true });
        return json({
          exito: true,
          reglas: (reglas ?? []).filter((r: any) => !r.equipo || r.equipo === equipo)
            .map((r: any) => ({ nombre: r.nombre, condicionTexto: _textoCondicion(r.condicion), premioTexto: _textoRecompensa(r.premio), deLaLiga: !r.equipo })),
        });
      }
      case 'getTiers': {
        const adminEmail = await _validarAdminToken(params.adminToken);
        if (!adminEmail) return json({ error: 'Sesión admin inválida.' }, 401);
                const { data, error } = await supabase.from('config_tiers').select('*').order('orden');
        if (error) return json({ error: error.message }, 500);
        // Listas para entrenar y, por equipo, los nombres de lo que pide propio (Victor, 2026-11-17).
        const le = await _listasEntrenar();
        return json({
          tiers: (data ?? []).map((t: any) => ({ ...t, propioNombres: le.filter((l) => _propioDe(t.requisitos ?? {}, le).includes(l.id)).map((l) => l.nombre) })),
          listasEntrenar: le.map((l) => ({ id: l.id, nombre: l.nombre })),
        });
      }
      case 'upsertTier': {
        const adminEmail = await _validarAdminToken(params.adminToken);
        if (!adminEmail) return json({ error: 'Sesión admin inválida.' }, 401);
        const {
          id, orden, nombre, min_clases, min_puntos, ventana_meses, logica, es_default,
          meses_consecutivos_ascenso, meses_gracia_demotion, dividir_puntos_mitad, califica_fondos_viaje,
        } = params;
        // Fase 2 completa del sistema de tiers (ver MANIFEST.md) -- 4 campos
        // nuevos. Mismos criterios ya usados por `es_default` en esta misma
        // función para los 2 booleanos nuevos (`!!x`, el frontend manda `''`
        // o `'true'`, nunca el string `'false'` -- ver el comentario de
        // `_mlGuardarTier()`/js/admin.js sobre por qué `!!'false'` daría
        // `true`); los 2 enteros nuevos viajan tal cual, como ya hacen
        // `min_clases`/`min_puntos`/`ventana_meses` (PostgREST coerciona el
        // string a `integer` solo con el `default`/tipo de columna).
                const row: Record<string, any> = {
          orden, nombre, min_clases, min_puntos, ventana_meses, logica, es_default: !!es_default,
          meses_consecutivos_ascenso, meses_gracia_demotion,
          dividir_puntos_mitad: !!dividir_puntos_mitad, califica_fondos_viaje: !!califica_fondos_viaje,
        };
        // Campos de la app (2026-11-13): solo se tocan si vienen (la web vieja no los manda).
        const unidades = ['dia', 'semana', 'mes', 'anio'];
        if (params.puntos_fuente != null) row.puntos_fuente = params.puntos_fuente === 'todos' ? 'todos' : 'tareas';
        if (params.periodo_unidad != null && unidades.includes(String(params.periodo_unidad))) row.periodo_unidad = String(params.periodo_unidad);
        if (params.gracia_unidad != null && unidades.includes(String(params.gracia_unidad))) row.gracia_unidad = String(params.gracia_unidad);
        if (params.requisitos != null) {
                    try { row.requisitos = typeof params.requisitos === 'object' ? params.requisitos : JSON.parse(String(params.requisitos)); } catch { /* sin cambio */ }
          // Listas que pide propias (Victor, 2026-11-17); las banderas viejas se derivan.
          if (row.requisitos && Array.isArray(row.requisitos.propio)) {
            const le = await _listasEntrenar();
            row.requisitos.propio = row.requisitos.propio.map(String).filter((x: string) => le.some((l) => l.id === x));
            row.requisitos.patinesPropios = le.some((l) => l.sistema === 'patines' && row.requisitos.propio.includes(l.id));
            row.requisitos.proteccionesPropias = le.some((l) => l.sistema === 'protecciones' && row.requisitos.propio.includes(l.id));
          }
        }
        if (!String(nombre ?? '').trim()) return json({ error: 'Falta el nombre del equipo.' }, 400);
        const { data: antesTier } = id ? await supabase.from('config_tiers').select('*').eq('id', id).maybeSingle() : { data: null };
        if (!id) row.codigo_invitacion = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
        const { data, error } = id
          ? await supabase.from('config_tiers').update(row).eq('id', id).select().single()
          : await supabase.from('config_tiers').insert(row).select().single();
                if (error) return json({ error: error.message }, 500);
        // Si cambia el nombre, las personas de ese equipo lo siguen.
                if (antesTier && antesTier.nombre !== data.nombre) {
          await supabase.from('equipo').update({ categoria: data.nombre }).eq('categoria', antesTier.nombre);
          await _renombrarEquipoEnReglas(String(antesTier.nombre), String(data.nombre));
        }
        await _registrarAjuste('equipo', antesTier, data, adminEmail);
        return json({ tier: data });
      }
      case 'deleteTier': {
        const adminEmail = await _validarAdminToken(params.adminToken);
        if (!adminEmail) return json({ error: 'Sesión admin inválida.' }, 401);
        const { data: tier } = await supabase.from('config_tiers').select('es_default').eq('id', params.id).single();
        if (!tier || tier.es_default) return json({ error: 'No se puede eliminar el tier por defecto' }, 400);
                // Quien estaba en ese equipo pasa al inicial (nunca queda sin equipo).
        const { data: borrado } = await supabase.from('config_tiers').select('*').eq('id', params.id).maybeSingle();
        const { data: inicial } = await supabase.from('config_tiers').select('nombre').eq('es_default', true).maybeSingle();
        if (borrado && inicial) await supabase.from('equipo').update({ categoria: inicial.nombre }).eq('categoria', borrado.nombre);
        const { error } = await supabase.from('config_tiers').delete().eq('id', params.id);
        if (error) return json({ error: error.message }, 500);
        await _registrarAjuste('equipo', borrado, null, adminEmail);
        return json({ ok: true });
      }
      // Fase 2 completa del sistema de tiers -- config global de fondos de
      // viaje (Parte 2/8 del pedido, ver MANIFEST.md). `getFondosViajeConfig`
      // sin gate de admin a propósito (mismo criterio que getEquipo()) --
      // cualquier cuenta logueada puede necesitar saber el valor, no solo Mi
      // Liga.
      case 'getFondosViajeConfig':    return json(await getFondosViajeConfig());
      case 'adminSetFondosViajeConfig': return json(await adminSetFondosViajeConfig(params));
      case 'adminBackfillHistorialTier': return json(await adminBackfillHistorialTier(params));
      // Mi Liga — roster con categoría actual (adminGetRosterEquipo ya existente no trae `categoria`, sin tocarla)
      case 'adminGetCategorias': {
        const adminEmail = await _validarAdminToken(params.adminToken);
        if (!adminEmail) return json({ error: 'Sesión admin inválida.' }, 401);
        const { data, error } = await supabase.from('equipo').select('username, categoria, estado_miembro').is('eliminado_en', null).order('username');
        if (error) return json({ error: error.message }, 500);
        return json({ personas: data });
      }
      // Cambia equipo.categoria (admin, cualquier cuenta) -- distinto de
      // actualizarDatosPersona (self-service, exige token propio de la
      // misma cuenta, ver más abajo en este archivo).
      case 'adminSetCategoria': {
        const adminEmail = await _validarAdminToken(params.adminToken);
        if (!adminEmail) return json({ exito: false, error: 'Sesión admin inválida.' }, 401);
        const { data: filaPrevia } = await supabase.from('equipo').select('categoria').eq('username', params.nombre).maybeSingle();
        const { error } = await supabase.from('equipo').update({ categoria: params.categoria }).eq('username', params.nombre);
        if (error) return json({ exito: false, error: error.message });
        if (filaPrevia && filaPrevia.categoria !== params.categoria) {
          const subio = filaPrevia.categoria === 'Mirlxs' && params.categoria === 'Quindes';
          await sendPush({
            tipo: 'cambio_categoria',
            include_external_user_ids: [params.nombre],
            headings: { es: subio ? '¡Subiste de categoría!' : 'Cambio de categoría' },
            contents: { es: subio ? '¡Ahora eres Quindes! Felicitaciones.' : `Pasaste a ${params.categoria}.` },
            url: APP_URL + '/?tab=ajustes',
          });
        }
        return json({ exito: true });
      }
      // Ventana de asistencias -- ahora una función nativa de Postgres
      // (regenerar_ventana_asistencias(), supabase/migrations/20260828_*),
      // corrida por pg_cron cada 15 min y también invocada acá a demanda
      // justo después de crear/editar un venue (_evCrearGuardar(),
      // js/eventos.js) para no esperar el próximo tick del cron.
      case 'adminRegenerarVentanaAsistencias': {
        const adminEmail = await _validarAdminToken(params.adminToken);
        if (!adminEmail) return json({ exito: false, error: 'Sesión admin inválida.' }, 401);
        const { error } = await supabase.rpc('regenerar_ventana_asistencias');
        if (error) return json({ exito: false, error: error.message }, 500);
        return json({ exito: true });
      }
            default:
        return json({ exito: false, error: 'Acción desconocida: ' + String(action ?? '') }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Error interno.' }, 500);
  }
}
