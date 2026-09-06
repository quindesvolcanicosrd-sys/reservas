// Supabase Edge Function — reemplazo de Code.gs (Google Apps Script)
// Mismo contrato action-based que js/api.js usa contra el backend GAS.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = '632992894668-gnbb5cclsmfdcnve0g34kmue1c72h73q.apps.googleusercontent.com';
const ADMIN_PRINCIPAL  = 'victordbh@gmail.com';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbw40qNuCKh7_wDusEGRHmZttBKAt41__OcPTHYWCUk1f6e5ifvAUMznw6Xr_O5qQ5RJ/exec';

const ONESIGNAL_APP_ID  = Deno.env.get('ONESIGNAL_APP_ID')  ?? '';
const ONESIGNAL_API_KEY = Deno.env.get('ONESIGNAL_API_KEY') ?? '';
// URL pública de la SPA -- destino de los `url`/`web_buttons` de las push
// notifications (sendPush(), más abajo). Configurable vía secret para no
// hardcodear si algún día cambia de dominio; el literal es el dominio real
// de producción (mismo usado ya en chrome_web_icon de adminEnviarPush()).
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.quindesvolcanicos.com';
// Header x-cron-secret que debe traer cualquier llamada a `action:'cronDiario'`
// (pg_cron -> net.http_post, ver supabase/migrations) -- sin este secret
// configurado, cronDiario queda inalcanzable (falla cerrado, no abierto).
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

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

// ─── Helpers: datos equipo ────────────────────────────────────────────────────

function getDatosCompletos(row: Record<string, any> | null): Record<string, any> | null {
  if (!row) return null;
  return {
    necesitaPatines:      row.necesita_patines      ?? '',
    talla:                row.talla                 ?? '',
    necesitaProtecciones: row.necesita_protecciones ?? '',
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
    solicitudLesionPendiente: row.solicitud_lesion_pendiente === true,
    nombreDerby:          row.nombre_derby          ?? '',
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
    antecedentes:         row.antecedentes          ?? '',
    medicamentos:         row.medicamentos          ?? '',
    medicamentosDesc:     row.medicamentos_desc     ?? '',
    atencionMedica:       row.atencion_medica       ?? '',
    seguro:               row.seguro                ?? '',
    seguroContacto:       row.seguro_contacto       ?? '',
    cuponDisponible:      row.cupon_disponible      === true,
    fotoPerfil:           row.foto_perfil           ?? '',
    permisosConfigurados: row.permisos_configurados === true,
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

async function _validarToken(token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await supabase.from('sessions').select('username, expires_at').eq('token', token).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) <= new Date()) return null;
  return data.username;
}

async function _validarAdminToken(token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await supabase.from('admin_sessions').select('email, expires_at').eq('token', token).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) <= new Date()) return null;
  return data.email;
}

async function _esAdmin(email: string): Promise<boolean> {
  if (!email) return false;
  if (email.toLowerCase() === ADMIN_PRINCIPAL.toLowerCase()) return true;
  const { data } = await supabase.from('admins').select('email').ilike('email', email).maybeSingle();
  return !!data;
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
  const LOTE = 50;
  let data: any[] = [];
  for (let i = 0; i < idsEvento.length; i += LOTE) {
    const lote = idsEvento.slice(i, i + LOTE);
    const { data: filas, error } = await supabase.from('log_asistencias')
      .select('id_evento, nombre_usuario, origen, estado, marca_temporal')
      .in('id_evento', lote);
    if (error) console.error('[asist] error en lote', i, error.message);
    if (filas) data = data.concat(filas);
  }
  const ultimaPorClave: Record<string, any> = {};
  data.forEach((fila: any) => {
    const clave = fila.id_evento + '|' + fila.nombre_usuario;
    const actual = ultimaPorClave[clave];
    const prioridad = (o: string) => o === 'Usuario' ? 1 : 0;
    if (!actual || prioridad(fila.origen) > prioridad(actual.origen) || (prioridad(fila.origen) === prioridad(actual.origen) && (!actual.marcaStr || (fila.marca_temporal ?? '') > actual.marcaStr))) {
      ultimaPorClave[clave] = { idEvento: fila.id_evento, nombre: fila.nombre_usuario, origen: fila.origen, estado: fila.estado, marcaStr: fila.marca_temporal };
    }
  });
  const porEvento: Record<string, any[]> = {};
  for (const k of Object.keys(ultimaPorClave)) {
    const r = ultimaPorClave[k];
    if (!porEvento[r.idEvento]) porEvento[r.idEvento] = [];
    porEvento[r.idEvento].push({ nombre: r.nombre, estado: r.estado, origen: r.origen });
  }
  return porEvento;
}

async function _asistenciaEFPorEvento(): Promise<Record<string, any[]>> {
  const { data } = await supabase.from('asistencias').select('id_evento, a_horario, tarde');
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

async function _proximosEntrenamientos(): Promise<any[]> {
  const ecuadorNow = new Date(new Date().getTime() - 5 * 60 * 60 * 1000);
  const hoyISO = ecuadorNow.toISOString().substring(0, 10);
  const { data } = await supabase.from('asistencias')
    .select('id_evento, fecha, donde, inicia, termina, info_adicional, google_maps, dura, estado')
    .neq('estado', 'Evento Cancelado').gte('fecha', hoyISO).order('fecha').order('inicia');
  const requiereReserva = await _mapaRequiereReservaPorLugar();
  const videoInstructivo = await _mapaVideoInstructivoPorLugar();
  const ahora = new Date();
  const lista = (data ?? []).filter((f: any) => {
    if (requiereReserva[f.donde] === false) return false;
    const [yr, mo, dy] = f.fecha.split('-').map(Number);
    const [h, m] = (f.inicia ?? '00:00').split(':').map(Number);
    const inicioUTC = new Date(Date.UTC(yr, mo - 1, dy, h + 5, m, 0, 0)); // Ecuador = UTC-5
    const limite = new Date(inicioUTC.getTime() - 2 * 60 * 60 * 1000);
    return ahora < limite;
  }).map((f: any) => ({
    idEvento: f.id_evento, fecha: f.fecha, donde: f.donde,
    horaInicio: f.inicia ? f.inicia.substring(0, 5) : '',
    horaFin:    f.termina ? f.termina.substring(0, 5) : '',
    descripcion: f.info_adicional ?? '', mapsUrl: f.google_maps ?? '', duracion: f.dura ?? '', videoInstructivo: videoInstructivo[f.donde] ?? '',
  }));
  return lista.slice(0, 6);
}

// ─── Acciones: auth ───────────────────────────────────────────────────────────

async function loginGoogle(params: Record<string, any>): Promise<Record<string, any>> {
  const info = await _verificarGoogleToken(params.idToken);
  if (!info) return { valido: false, error: 'Token de Google inválido.' };
  const email = (info.email ?? '').toLowerCase();
  const foto = info.picture ?? '';
  const esAdmin = await _esAdmin(email);
  if (esAdmin) {
    const adminToken = await _crearAdminToken(email);
    const row = await _getEquipoRowByEmail(email);
    if (row) {
      const token = await _crearToken(row.username);
      const pagaCuota = (row.paga_cuota ?? '').toLowerCase();
      return { valido: true, token, nombre: row.username, datos: getDatosCompletos(row), foto, esAdmin: true, adminToken, dashboardAdmin: !(pagaCuota === 'sí' || pagaCuota === 'si') };
    }
    return { valido: true, esAdmin: true, email, adminToken, dashboardAdmin: true };
  }
  const row = await _getEquipoRowByEmail(email);
  if (!row) return { valido: false, noRegistrado: true };
  const token = await _crearToken(row.username);
  return { valido: true, token, nombre: row.username, datos: getDatosCompletos(row), foto };
}

async function adminLogin(params: Record<string, any>): Promise<Record<string, any>> {
  const info = await _verificarGoogleToken(params.idToken);
  if (!info) return { ok: false, error: 'Token de Google inválido.' };
  const email = (info.email ?? '').toLowerCase();
  const esAdmin = await _esAdmin(email);
  if (!esAdmin) return { ok: false, error: 'Este email no tiene permisos de administradorx.' };
  const adminToken = await _crearAdminToken(email);
  const row = await _getEquipoRowByEmail(email);
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
  if (!row) return { valido: false };
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
  if (!row) return { valido: false };
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
  return getDatosCompletos(await _getEquipoRow(params.nombre)) ?? {};
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
  const CAMPO_MAP: Record<string, string> = {
    nombreDerby: 'nombre_derby', numeroDerby: 'numero_derby', pronombres: 'pronombres',
    fechaIngreso: 'fecha_ingreso',
    dieta: 'dieta', prefijo: 'prefijo', telefono: 'telefono', email: 'email',
    estado_miembro: 'estado_miembro', categoria: 'categoria',
    fechaPublica: 'fecha_publica', edadPublica: 'edad_publica', fechaNacimiento: 'fecha_nacimiento',
    tipoDocumento: 'tipo_documento', paisExpedicion: 'pais_expedicion', numeroDocumento: 'numero_documento',
    nombreLegal: 'nombre_legal', callePrincipal: 'calle_principal', calleSecundaria: 'calle_secundaria',
    numeracion: 'numeracion', sector: 'sector', canton: 'canton',
    emerg1Nombre: 'emerg1_nombre', emerg1Relacion: 'emerg1_relacion', emerg1Prefijo: 'emerg1_prefijo', emerg1Telefono: 'emerg1_telefono',
    emerg2Nombre: 'emerg2_nombre', emerg2Relacion: 'emerg2_relacion', emerg2Prefijo: 'emerg2_prefijo', emerg2Telefono: 'emerg2_telefono',
    enfermedad: 'enfermedad', alergias: 'alergias', alergiasDesc: 'alergias_desc',
    antecedentes: 'antecedentes', medicamentos: 'medicamentos', medicamentosDesc: 'medicamentos_desc',
    atencionMedica: 'atencion_medica', seguro: 'seguro', seguroContacto: 'seguro_contacto',
  };
  const update: Record<string, any> = {};
  for (const camel of Object.keys(datos ?? {})) { if (CAMPO_MAP[camel]) update[CAMPO_MAP[camel]] = datos[camel]; }
  await supabase.from('equipo').update(update).eq('username', params.nombre);
  return { exito: true };
}

async function actualizarEquipamientoPersona(params: Record<string, any>): Promise<boolean> {
  await supabase.from('equipo').update({ necesita_patines: params.necesitaPatines, talla: params.talla, necesita_protecciones: params.necesitaProtecciones }).eq('username', params.nombre);
  return true;
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
  const { data } = await supabase.from('equipo').select('username').order('username');
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
  if (params.necesitaPatines !== undefined) update.necesita_patines = params.necesitaPatines;
  if (params.talla !== undefined) update.talla = params.talla;
  if (params.necesitaProtecciones !== undefined) update.necesita_protecciones = params.necesitaProtecciones;
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
  if (!email || !email.includes('@')) return { exito: false, error: 'Email inválido.' };
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/.test(nombre)) return { exito: false, error: 'El nombre solo puede contener letras y espacios.' };

  // Verificar Google token si viene
  if (idToken) {
    const info = await _verificarGoogleToken(idToken);
    if (!info) return { exito: false, error: 'Token de Google inválido. Volvé a iniciar sesión.' };
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
    cupon_disponible: true, permisos_configurados: true,
    fecha_registro: new Date().toISOString(),
  };
  if (pinHash && pinHash.length === 64) row.pin_hash = pinHash;
  if (foto && foto.startsWith('http')) row.foto_perfil = foto;
  if (guardarFecha === 'si' && fechaNac) {
    row.fecha_nacimiento = fechaNac;
    row.fecha_publica    = fechaPublica === 'Sí' ? 'Sí' : 'No';
    row.edad_publica     = edadPublica  === 'Sí' ? 'Sí' : 'No';
  }

  const { error } = await supabase.from('equipo').insert(row);
  if (error) return { exito: false, error: error.message };

  const token = await _crearToken(nombre);
  const newRow = await _getEquipoRow(nombre);
  await sendPush({
    included_segments: ['All'],
    headings: { es: '¡Nuevo integrante en el equipo!' },
    contents: { es: `${nombre} se unió hoy. ¡Bienvenidx!` },
    url: APP_URL + '/?tab=equipo',
  });
  return { exito: true, token, nombre, datos: getDatosCompletos(newRow) };
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

  if (!nombre) return { exito: false, error: 'El nombre es obligatorio.' };
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/.test(nombre)) return { exito: false, error: 'El nombre solo puede contener letras y espacios.' };
  if (pinHash.length !== 64) return { exito: false, error: 'PIN inválido.' };

  const { data: nombreExiste } = await supabase.from('equipo').select('username').ilike('username', nombre).maybeSingle();
  if (nombreExiste) return { exito: false, error: 'Este nombre de usuario ya está en uso.' };

  const row: Record<string, any> = {
    username: nombre, email: '', pronombres, prefijo: '', telefono: '',
    necesita_patines: necesitaPatines, talla, necesita_protecciones: necesitaProtecciones,
    cupon_disponible: true, permisos_configurados: true,
    fecha_registro: new Date().toISOString(), pin_hash: pinHash,
  };

  const { error } = await supabase.from('equipo').insert(row);
  if (error) return { exito: false, error: error.message };

  const token = await _crearToken(nombre);
  const newRow = await _getEquipoRow(nombre);
  await sendPush({
    included_segments: ['All'],
    headings: { es: '¡Nuevo integrante en el equipo!' },
    contents: { es: `${nombre} se unió hoy. ¡Bienvenidx!` },
    url: APP_URL + '/?tab=equipo',
  });
  return { exito: true, token, nombre, datos: getDatosCompletos(newRow) };
}

async function eliminarCuenta(params: Record<string, any>): Promise<Record<string, any>> {
  const tok = params.token as string;
  const usr = await _validarToken(tok);
  if (!usr) return { exito: false, error: 'Sesión inválida.' };
  await supabase.from('equipo').delete().eq('username', usr);
  await supabase.from('sessions').delete().eq('username', usr);
  return { exito: true };
}

async function actualizarPerfilGoogle(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const update: Record<string, any> = { permisos_configurados: true };
  if (params.foto && params.foto.toString().startsWith('http')) update.foto_perfil = params.foto;
  if (params.fechaNac && params.guardarFecha === 'si') {
    update.fecha_nacimiento = params.fechaNac;
    update.fecha_publica    = params.fechaPublica === 'Sí' ? 'Sí' : 'No';
    update.edad_publica     = params.edadPublica  === 'Sí' ? 'Sí' : 'No';
  }
  await supabase.from('equipo').update(update).eq('username', username);
  return { exito: true };
}

// ─── Acciones: config ─────────────────────────────────────────────────────────

async function adminBorrarEvento(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(params.adminToken);
  if (!email) return { exito: false, error: 'Sesión admin inválida.' };
  const { error } = await supabase.from('asistencias').delete().eq('id_evento', params.idEvento);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

async function getPreciosClases(): Promise<Record<string, any>> {
  const { data } = await supabase.from('config_app').select('key, value').in('key', ['precio_por_clase', 'precio_mensual']);
  const map: Record<string, any> = {};
  (data ?? []).forEach((r: any) => { map[r.key] = r.value; });
  return { precioPorClase: map['precio_por_clase'] ?? null, precioMensual: map['precio_mensual'] ?? null };
}

async function adminSetPreciosClases(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(params.adminToken);
  if (!email) return { exito: false, error: 'Sesión admin inválida.' };
  await supabase.from('config_app').upsert([
    { key: 'precio_por_clase', value: String(params.precioPorClase) },
    { key: 'precio_mensual',   value: String(params.precioMensual) },
  ], { onConflict: 'key' });
  return { exito: true };
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
  const { data, error } = await supabase.from('venues').insert(datos).select().single();
  if (error) return { exito: false, error: error.message };
  return data;
}

async function adminEditarVenue(params: Record<string, any>): Promise<Record<string, any>> {
  let datos = params.datosJson ?? params.datos;
  if (typeof datos === 'string') datos = JSON.parse(datos);
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
    if (nombresVistos.has(t.talla)) return { exito: false, error: 'Esa talla ya está cargada. Usá + para aumentar la cantidad.' };
    nombresVistos.add(t.talla);
  }

  // Delete all + re-insert
  const { data: existentes } = await supabase.from('equipamiento_tallas').select('id');
  for (const f of (existentes ?? [])) await supabase.from('equipamiento_tallas').delete().eq('id', f.id);
  if (tallasValidas.length) await supabase.from('equipamiento_tallas').insert(tallasValidas);

  const { data: cfg } = await supabase.from('config_equipamiento').select('id').limit(1).maybeSingle();
  if (cfg) await supabase.from('config_equipamiento').update({ total_protecciones: protecciones }).eq('id', cfg.id);
  else await supabase.from('config_equipamiento').insert({ total_protecciones: protecciones });

  return { exito: true };
}

// ─── Acciones: tareas ─────────────────────────────────────────────────────────

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

async function tomarTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre, tareaId } = params;
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

async function soltarTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre, tareaId } = params;
  const { data: asigs } = await supabase.from('asignaciones_tareas').select('id').eq('tarea_id', tareaId).eq('nombre_usuario', nombre).eq('estado', 'iniciada');
  for (const a of (asigs ?? [])) await supabase.from('asignaciones_tareas').delete().eq('id', a.id);
  const { data: quedan } = await supabase.from('asignaciones_tareas').select('id').eq('tarea_id', tareaId).in('estado', ['iniciada', 'pendiente_revision']);
  if (!(quedan?.length)) {
    const { data: t } = await supabase.from('tareas').select('estado').eq('id', tareaId).maybeSingle();
    if (t?.estado === 'en_progreso') await supabase.from('tareas').update({ estado: 'no_iniciada' }).eq('id', tareaId);
  }
  return { exito: true };
}

async function rescatarTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre, tareaId } = params;
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

async function enviarRevisionTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const { idAsignacion, nombre } = params;
  const { data: a } = await supabase.from('asignaciones_tareas').select('nombre_usuario, estado').eq('id', idAsignacion).maybeSingle();
  if (!a) return { exito: false, error: 'Asignación no encontrada.' };
  if (a.nombre_usuario !== nombre) return { exito: false, error: 'No autorizado.' };
  if (a.estado !== 'iniciada') return { exito: false, error: 'La asignación no está iniciada.' };
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

async function adminValidarTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const { idAsignacion, accion, notaRechazo } = params;
  const { data: a } = await supabase.from('asignaciones_tareas').select('*').eq('id', idAsignacion).maybeSingle();
  if (!a) return { exito: false, error: 'Asignación no encontrada.' };
  if (accion === 'aprobar') {
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
    await supabase.from('asignaciones_tareas').update({ estado: 'aprobada', fecha_revision: new Date().toISOString() }).eq('id', idAsignacion);
    const { data: t } = await supabase.from('tareas').select('puntos').eq('id', a.tarea_id).maybeSingle();
    const puntosOriginales = Number(t?.puntos) || 0;
    const puntos = _puntosTareaCreditados(puntosOriginales, a.fecha_vencimiento_personal, a.fecha_envio);
    const hoy = new Date();
    await _acreditarPuntosTarea(a.nombre_usuario, hoy.getFullYear(), hoy.getMonth() + 1, puntos);
    const { data: quedan } = await supabase.from('asignaciones_tareas').select('id').eq('tarea_id', a.tarea_id).in('estado', ['iniciada', 'pendiente_revision']);
    if (!quedan?.length) await supabase.from('tareas').update({ estado: 'archivada', fecha_archivado: hoy.toISOString() }).eq('id', a.tarea_id);
  } else {
    await supabase.from('asignaciones_tareas').update({ estado: 'iniciada', nota_rechazo: notaRechazo ?? null, fecha_revision: new Date().toISOString() }).eq('id', idAsignacion);
  }
  return { exito: true };
}

async function adminDesvalidarTarea(params: Record<string, any>): Promise<Record<string, any>> {
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
  const { idTarea } = params;
  const { data: pendientes } = await supabase.from('asignaciones_tareas').select('id').eq('tarea_id', idTarea).eq('estado', 'pendiente_revision');
  if (pendientes?.length) return { exito: false, error: 'Hay revisiones pendientes. Valídalas antes de archivar.' };
  await supabase.from('asignaciones_tareas').delete().eq('tarea_id', idTarea).eq('estado', 'iniciada');
  await supabase.from('tareas').update({ estado: 'archivada', fecha_archivado: new Date().toISOString() }).eq('id', idTarea);
  return { exito: true };
}

async function adminCrearTarea(params: Record<string, any>): Promise<any> {
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
  return creada;
}

async function adminEditarTarea(params: Record<string, any>): Promise<Record<string, any>> {
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

// ─── Acciones: eventos / asistencias ─────────────────────────────────────────

async function getEventosRango(params: Record<string, any>): Promise<Record<string, any>> {
  const desde = params.fechaInicio ?? params.desde,
        hasta  = params.fechaFin   ?? params.hasta;
  const d0 = desde.substring(0, 10), d1 = hasta.substring(0, 10);
  const { data } = await supabase.from('asistencias').select('id_evento, fecha, donde, inicia, termina, estado, google_maps, info_adicional, tipo_evento').gte('fecha', d0).lte('fecha', d1);
  const idsEvento = (data ?? []).map((f: any) => f.id_evento);
  const [tipoIcono, requiereReserva, asistLog, asistEF, equipoPorNombre, videoInstructivo] = await Promise.all([
    _mapaTipoIconoPorLugar(), _mapaRequiereReservaPorLugar(), _ultimaAsistenciaPorPersonaTodas(idsEvento), _asistenciaEFPorEvento(), _mapaEquipoPorNombre(), _mapaVideoInstructivoPorLugar()
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
    const asistencias = fuenteAsistencia.map((a: any) => {
      const eq = equipoPorNombre[String(a.nombre).trim().toUpperCase()] ?? {};
      return { nombre: a.nombre, estado: a.estado, origen: a.origen, nombreDerby: eq.nombreDerby ?? '', fotoPerfil: eq.fotoPerfil ?? '' };
    });
    return {
      idEvento, fecha: fila.fecha, lugar: fila.donde, horaInicio: fila.inicia?.substring(0, 5) ?? '', horaFin: fila.termina?.substring(0, 5) ?? '', estado: fila.estado, tipoIcono: fila.tipo_evento ?? tipoIcono[fila.donde] ?? 'Entrenamiento', requiereReserva: requiereReserva[fila.donde] !== false, asistencias,
      mapsUrl: fila.google_maps ?? fila.mapsUrl ?? '',
      descripcion: fila.info_adicional ?? fila.descripcion ?? fila.infoAdicional ?? '',
      videoInstructivo: videoInstructivo[fila.donde] ?? '',
    };
  });
  eventos.sort((a: any, b: any) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
  return { eventos };
}

async function getCumpleañosRango(params: Record<string, any>): Promise<Record<string, any>> {
  const d0 = new Date(params.desde), d1 = new Date(params.hasta);
  const { data } = await supabase.from('equipo').select('username, fecha_nacimiento, fecha_publica, edad_publica, foto_perfil').not('fecha_nacimiento', 'is', null).not('fecha_publica', 'is', null);
  const resultado: any[] = [];
  for (const r of (data ?? [])) {
    if (!r.fecha_nacimiento || !r.fecha_publica) continue;
    const fnac = new Date(r.fecha_nacimiento + 'T00:00:00');
    const cand1 = new Date(d0.getFullYear(), fnac.getMonth(), fnac.getDate());
    const cand2 = new Date(d1.getFullYear(), fnac.getMonth(), fnac.getDate());
    const candidato = (cand1 >= d0 && cand1 <= d1) ? cand1 : ((cand2 >= d0 && cand2 <= d1) ? cand2 : null);
    if (!candidato) continue;
    const entrada: Record<string, any> = { nombre: r.username, fecha: candidato.toISOString().substring(0, 10), fotoPerfil: r.foto_perfil ?? '' };
    if (r.edad_publica === 'Sí' || r.edad_publica === 'Si') entrada.edad = candidato.getFullYear() - fnac.getFullYear();
    resultado.push(entrada);
  }
  resultado.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
  return { cumpleanos: resultado };
}

async function getEventosFiltrados(params: Record<string, any>): Promise<Record<string, any>> {
  const { estado, mes, lugar, tipo } = params;
  const { data } = await supabase.from('asistencias').select('id_evento, fecha, donde, inicia, termina, estado');
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

async function marcarAsistenciaUsuario(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre, idEvento, estado } = params;
  if (!idEvento) return { exito: false, error: 'Evento inválido.' };
  if (!ESTADOS_RSVP.includes(estado)) return { exito: false, error: 'Estado inválido.' };

  const esAuto = params.origenAuto === true || params.origenAuto === 'true';

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

  if (eraAsistire) {
    const { data: ev } = await supabase.from('asistencias').select('fecha, donde, inicia, tipo_evento').eq('id_evento', idEvento).maybeSingle();
    if (ev) {
      const esHoy = ev.fecha === _hoyEcuadorISO();
      await sendPush({
        include_aliases: { external_id: await _adminOneSignalAliases() },
        headings: { es: 'Baja de asistencia' },
        contents: { es: `${nombre} no asistirá al ${ev.tipo_evento || 'evento'} de ${esHoy ? 'hoy' : _fechaEs(ev.fecha)} · ${_horaEs(ev.inicia)} · ${ev.donde || ''}` },
        url: APP_URL + '/?tab=eventos',
      });
    }
  }

  return { exito: true };
}

const ESTADOS_ROLLCALL = ['A tiempo', 'Tarde', 'Ninguno'];
async function adminMarcarAsistencia(params: Record<string, any>): Promise<Record<string, any>> {
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
    const { data: filaEquipo } = await supabase.from('equipo').select('racha_actual, estado_miembro').eq('username', nombre).maybeSingle();
    if (estado === 'A tiempo' || estado === 'Tarde') {
      const rachaNueva = (Number(filaEquipo?.racha_actual) || 0) + 1;
      await supabase.from('equipo').update({ racha_actual: rachaNueva }).eq('username', nombre);
      if (rachaNueva % 3 === 0) {
        await _acreditarPuntosExtra(nombre, anioEvento, mesEvento, 2);
      }
      // Reactivación automática (feat nueva, ver MANIFEST.md -- "usuarios
      // inactivos en Eventos"): una marca real de presente ('A
      // tiempo'/'Tarde') ES la prueba de que la persona volvió -- si estaba
      // 'Ausente' (el único estado que este mismo backend marca solo por
      // inactividad -- ver `_eqEstadoEfectivo()`/js/equipo.js, "30+ días sin
      // asistir"), pasa a 'Activx' sola, sin que el admin tenga que ir
      // aparte al perfil de Equipo a cambiarla a mano. NO toca
      // 'Técnico'/'Lesionadx' -- esos son categorías de membresía propias,
      // no un estado de inactividad detectado por fecha, tomarle asistencia
      // a alguien en esos estados no implica que deban dejar de serlo.
      if (filaEquipo?.estado_miembro === 'Ausente') {
        await supabase.from('equipo').update({ estado_miembro: 'Activx' }).eq('username', nombre);
      }
    } else if (estado === 'Ninguno') {
      await supabase.from('equipo').update({ racha_actual: 0 }).eq('username', nombre);
    }
  }

  // Batch 8 (ver MANIFEST.md): recalcula los stats de ESTA persona apenas
  // se confirma que la asistencia quedó guardada -- antes solo pasaba con
  // el botón manual "Recalcular ahora" (recalcularStatsEquipo(), completo,
  // no se toca acá). Después del `return` de arriba (errores), nunca antes.
  await recalcularStatsUsuario(nombre);

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
  const { data: equipo } = await supabase.from('equipo').select('username, estado_miembro').order('username');
  const asistLog = await _ultimaAsistenciaPorPersonaTodas([idEvento]);
  const yaMarcadas: Record<string, string> = {};
  (asistLog[idEvento] ?? []).forEach((a: any) => { yaMarcadas[a.nombre] = a.estado; });
  const personas = (equipo ?? []).map((r: any) => ({ nombre: r.username, estadoActual: yaMarcadas[r.username] ?? null, estadoMiembro: r.estado_miembro ?? 'Activx' }));
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
  const { data: ev } = await supabase.from('asistencias').select('fecha').eq('id_evento', idEvento).maybeSingle();
  await supabase.from('rectificaciones_asistencia').insert({
    nombre: username,
    id_evento: idEvento,
    fecha_evento: ev?.fecha ?? null,
    estado_solicitado: estadoSolicitado,
    decision: 'Pendiente',
  });
  return { exito: true };
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
async function solicitarExcepcion(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const tipo = String(params.tipo ?? '').trim();
  if (!['ausencias', 'economica'].includes(tipo)) return { exito: false, error: 'Tipo de solicitud inválido.' };
  const mesAplicacion = String(params.mesAplicacion ?? '').trim();
  if (!mesAplicacion) return { exito: false, error: 'Mes de aplicación inválido.' };
  let datos = params.datos;
  if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch { return { exito: false, error: 'Datos inválidos.' }; } }
  const { data, error } = await supabase.from('solicitudes_excepcion').insert({
    nombre: username, tipo, datos: datos ?? {}, mes_aplicacion: mesAplicacion, estado: 'pendiente',
  }).select('id').maybeSingle();
  if (error) return { exito: false, error: error.message };
  return { exito: true, id: data?.id };
}

async function adminGetExcepciones(params: Record<string, any>): Promise<any[]> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return [];
  const { data } = await supabase.from('solicitudes_excepcion').select('*').eq('estado', 'pendiente').order('created_at', { ascending: false });
  return (data ?? []).map((r: any) => ({ id: r.id, nombre: r.nombre, tipo: r.tipo, datos: r.datos, mesAplicacion: r.mes_aplicacion, createdAt: r.created_at }));
}

async function adminSetEstadoExcepcion(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const id = params.id;
  const estado = String(params.estado ?? '').trim();
  if (!id || !['aprobada', 'rechazada'].includes(estado)) return { exito: false, error: 'Parámetros inválidos.' };
  const notaAdmin = params.notaAdmin != null && params.notaAdmin !== '' ? String(params.notaAdmin) : null;
  const { error } = await supabase.from('solicitudes_excepcion').update({ estado, nota_admin: notaAdmin }).eq('id', id);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

// ─── Acciones: reservas ───────────────────────────────────────────────────────

async function getProximosEntrenamientos(): Promise<any[]> {
  const lista = await _proximosEntrenamientos();
  return lista.map((ev: any) => ({ fecha: ev.idEvento, estado: 'Evento Programado', mapsUrl: ev.mapsUrl, descripcion: ev.descripcion, horaFin: ev.horaFin, duracion: ev.duracion, donde: ev.donde, horaInicio: ev.horaInicio, fechaCalendario: ev.fecha, videoInstructivo: ev.videoInstructivo ?? '' }));
}

async function getFechasDisponibles(params: Record<string, any>): Promise<any[]> {
  const { nombre, talla, necesitaProtecciones } = params;
  const proximos = await _proximosEntrenamientos();
  const { data: tallasSupa } = await supabase.from('equipamiento_tallas').select('talla, cantidad');
  const stockPatines: Record<string, number> = {};
  (tallasSupa ?? []).forEach((t: any) => { stockPatines[t.talla] = t.cantidad; });
  const { data: cfgProt } = await supabase.from('config_equipamiento').select('total_protecciones').limit(1).maybeSingle();
  const totalProtecciones = cfgProt?.total_protecciones ?? 0;

  // Reservas activas desde Supabase (no Canceladas)
  const { data: reservas } = await supabase.from('reservas').select('nombre_usuario, id_evento, talla, protecciones, estado').neq('estado', 'Cancelada').not('id_evento', 'is', null);
  const resArr = reservas ?? [];

  return proximos.map((ev: any) => {
    const idEvento = ev.idEvento;
    const extra = { mapsUrl: ev.mapsUrl, descripcion: ev.descripcion, horaFin: ev.horaFin, duracion: ev.duracion, donde: ev.donde, horaInicio: ev.horaInicio, fechaCalendario: ev.fecha, videoInstructivo: ev.videoInstructivo ?? '' };
    const yaReservo = resArr.some((r: any) => r.nombre_usuario === nombre && r.id_evento === idEvento);
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
    return { ...extra, fecha: idEvento, disponible: true, razon: '' };
  });
}

async function guardarReserva(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre, fecha, talla, protecciones, email } = params;

  // Check duplicate
  const { data: dup } = await supabase.from('reservas').select('id').eq('nombre_usuario', nombre).eq('id_evento', fecha).neq('estado', 'Cancelada').maybeSingle();
  if (dup) return { exito: false, mensaje: 'Ya tienes una reserva para esta fecha.' };

  // Precio server-side
  const precios = await getPreciosClases();
  const esMensual = !fecha.startsWith('ev_');
  let montoFinal = esMensual ? Number(precios.precioMensual ?? 0) : Number(precios.precioPorClase ?? 0);

  // Consumir crédito o cupón
  const credito = await _consumirCreditoReal(nombre);
  if (credito) {
    montoFinal = 0;
  } else {
    const { data: eq } = await supabase.from('equipo').select('cupon_disponible').eq('username', nombre).maybeSingle();
    if (eq?.cupon_disponible) {
      await supabase.from('equipo').update({ cupon_disponible: false }).eq('username', nombre);
      montoFinal = 0;
    }
  }

  const hoyISO = new Date().toISOString().substring(0, 10);
  await supabase.from('reservas').insert({
    nombre_usuario: nombre, id_evento: esMensual ? null : fecha, tipo: esMensual ? 'mensual' : 'clase',
    mes_texto: esMensual ? fecha : null, talla: talla ?? null, protecciones: protecciones ?? null,
    estado: 'Pendiente', monto: montoFinal, fecha_pago: hoyISO, email: email ?? null,
  });
  return { exito: true };
}

async function getReservasPersona(params: Record<string, any>): Promise<any[]> {
  const { nombre } = params;
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
    };
  });
}

// Notifica a los admins una baja/reagendo de reserva MENSUAL (r.tipo -- ver
// guardarReserva() más arriba -- 'mensual' vs 'clase') -- reservas de clase
// puntual son frecuentes y de bajo impacto, a propósito fuera de este aviso.
async function _notificarReservaMensualCambio(r: Record<string, any>, nombre: string, accion: 'cancelar' | 'reagendar'): Promise<void> {
  if (r?.tipo !== 'mensual') return;
  await sendPush({
    include_aliases: { external_id: await _adminOneSignalAliases() },
    headings: { es: accion === 'cancelar' ? 'Reserva cancelada' : 'Reserva reagendada' },
    contents: { es: `${nombre} ${accion === 'cancelar' ? 'canceló' : 'reagendó'} su reserva mensual.` },
    url: APP_URL + '/?tab=miliga',
  });
}

async function cancelarReserva(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre, fecha } = params;
  const { data } = await supabase.from('reservas').select('*').eq('nombre_usuario', nombre).eq('id_evento', fecha).neq('estado', 'Cancelada').limit(1);
  const r = data?.[0];
  if (!r) return { exito: false, error: 'Reserva no encontrada.' };
  await supabase.from('reservas').update({ estado: 'Cancelada' }).eq('id', r.id);
  // Restaurar cupón si la reserva estaba Confirmada
  let cuponRestaurado = false;
  if (r.estado === 'Confirmada' && nombre) {
    await supabase.from('equipo').update({ cupon_disponible: true }).eq('username', nombre);
    cuponRestaurado = true;
  }
  await _notificarReservaMensualCambio(r, nombre, 'cancelar');
  return { exito: true, cuponRestaurado };
}

async function reagendarReserva(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre, fechaAnterior, fechaNueva } = params;
  const { data } = await supabase.from('reservas').select('id, tipo').eq('nombre_usuario', nombre).eq('id_evento', fechaAnterior).neq('estado', 'Cancelada').limit(1);
  const reserva = data?.[0];
  if (!reserva) return { exito: false, error: 'Reserva no encontrada.' };
  const { error } = await supabase.from('reservas').update({ id_evento: fechaNueva, estado: 'Pendiente' }).eq('id', reserva.id);
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

async function actualizarTallaReserva(params: Record<string, any>): Promise<Record<string, any>> {
  const { id, talla, idEvento } = params;
  // Verificar disponibilidad
  const { data: stock } = await supabase.from('equipamiento_tallas').select('cantidad').eq('talla', talla).maybeSingle();
  const { data: usadas } = await supabase.from('reservas').select('id').eq('id_evento', idEvento).eq('talla', talla).neq('estado', 'Cancelada').neq('id', id);
  if ((usadas?.length ?? 0) >= (stock?.cantidad ?? 0)) return { exito: false, error: 'Sin patines talla ' + talla + ' disponibles para esa fecha.' };
  await supabase.from('reservas').update({ talla }).eq('id', id);
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

// ─── Acciones: pagos ──────────────────────────────────────────────────────────

async function adminRegistrarPago(params: Record<string, any>): Promise<any> {
  let datos = params.datosJson ?? params.datos;
  if (typeof datos === 'string') datos = JSON.parse(datos);
  const { data, error } = await supabase.from('pagos').insert({
    nombre_usuario: datos.nombre, mes: datos.mes, anio: datos.anio, exoneradx: !!datos.exoneradx,
    monto: datos.monto ?? 0, forma_pago: datos.formaPago ?? null, comprobante_url: datos.comprobanteUrl ?? null,
    notas: datos.notas ?? null, fecha: datos.fecha ?? null,
  }).select();
  if (error) return { exito: false, error: error.message };
  return data;
}

async function adminRegistrarIngreso(params: Record<string, any>): Promise<any> {
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
  const { data: quindes } = await supabase.from('equipo').select('username').eq('categoria', 'Quindes');
  const personas = (quindes ?? []).map((n: any) => n.username);
  const [{ data: pagosDelMes }, { data: solicitudesAprobadas }] = await Promise.all([
    supabase.from('pagos').select('nombre_usuario, exoneradx, monto').eq('mes', mes).eq('anio', anio),
    supabase.from('solicitudes_pago').select('nombre_usuario, tipo').eq('estado', 'aprobada').eq('mes', mes).eq('anio', anio),
  ]);
  return personas.map((nombre: string) => ({ nombre, estado: _estadoPagoPersonaMes(nombre, mes, anio, pagosDelMes ?? [], solicitudesAprobadas ?? [], hoy) }));
}

// Mismo fix que adminGetEstadoPagosMes() -- ver comentario ahí.
async function adminGetPagosAnual(params: Record<string, any>): Promise<Record<string, any>> {
  const anio = Number(params.anio);
  const hoy = new Date();
  const { data: quindes } = await supabase.from('equipo').select('username').eq('categoria', 'Quindes');
  const personas = (quindes ?? []).map((n: any) => n.username);
  const [{ data: pagosDelAnio }, { data: solicitudesDelAnio }] = await Promise.all([
    supabase.from('pagos').select('nombre_usuario, mes, exoneradx, monto').eq('anio', anio),
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

async function adminGetSolicitudesPago(): Promise<any[]> {
  const { data } = await supabase.from('solicitudes_pago').select('*').order('created_at', { ascending: false });
  return data ?? [];
}

async function adminResolverSolicitudPago(params: Record<string, any>): Promise<Record<string, any>> {
  const { id, accion } = params; // accion: 'aprobar' | 'rechazar'
  const estado = accion === 'aprobar' ? 'aprobada' : 'rechazada';
  await supabase.from('solicitudes_pago').update({ estado }).eq('id', id);
  return { exito: true };
}

// ─── Acciones: usuarios / admins ─────────────────────────────────────────────

async function adminGetUsuarios(): Promise<any[]> {
  const { data } = await supabase.from('equipo').select('username, email, cupon_disponible').order('username');
  return (data ?? []).map((r: any) => ({ nombre: r.username, email: r.email, cuponDisponible: !!r.cupon_disponible }));
}

async function adminToggleCupon(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { nombre, cuponDisponible } = params;
  if (!nombre) return { exito: false, error: 'Parámetros inválidos.' };
  const { error } = await supabase.from('equipo').update({ cupon_disponible: !!cuponDisponible }).eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

const ESTADOS_MIEMBRO = ['Activx', 'Ausente', 'Técnico', 'Lesionadx'];

async function adminSetEstadoMiembro(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { nombre, estadoMiembro } = params;
  if (!nombre || !ESTADOS_MIEMBRO.includes(estadoMiembro)) return { exito: false, error: 'Parámetros inválidos.' };
  // `exenta_cuota` sigue a Lesionadx como única fuente de verdad (Cambio 55)
  // sin importar el camino que llega acá -- este action es compartido por
  // el selector de Mi Liga → Categorías y por el perfil de Equipo.
  const { error } = await supabase.from('equipo')
    .update({ estado_miembro: estadoMiembro, exenta_cuota: estadoMiembro === 'Lesionadx' })
    .eq('username', nombre);
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
  if (!nombre || !['auto', 'quinde', 'mirlxs'].includes(tierModo)) return { exito: false, error: 'Parámetros inválidos.' };
  const update: Record<string, any> = { tier_modo: tierModo };
  if (tierModo === 'quinde') update.categoria = 'Quindes';
  else if (tierModo === 'mirlxs') update.categoria = 'Mirlxs';
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
  const { error } = await supabase.from('equipo').update({ exenta_cuota: !!params.valor }).eq('username', nombre);
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
    .not('estado', 'in', '("Evento Cancelado","No se entrena")')
    .gte('fecha', inicioAnio).lt('fecha', hoyISO);
  if (errorAsist) return { exito: false, error: errorAsist.message };
  const eventos = filasAsist ?? [];
  const totalEventos = eventos.length;

  const { data: miembros, error: errorMiembros } = await supabase.from('equipo').select('username');
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
    .eq('origen', 'Admin')
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
  const ultimaPorClave: Record<string, { estado: string; nombre_usuario: string; marca: number }> = {};
  (logs ?? []).forEach((l: any) => {
    const u = String(l.nombre_usuario ?? '').trim();
    if (!u) return;
    const clave = l.id_evento + '|' + u;
    const marca = l.marca_temporal ? new Date(l.marca_temporal).getTime() : 0;
    const actual = ultimaPorClave[clave];
    if (!actual || marca >= actual.marca) ultimaPorClave[clave] = { estado: l.estado, nombre_usuario: u, marca };
  });

  const puntosPorUsuario: Record<string, number> = {};
  Object.keys(ultimaPorClave).forEach((clave) => {
    const l = ultimaPorClave[clave];
    if (l.estado === 'A tiempo') puntosPorUsuario[l.nombre_usuario] = (puntosPorUsuario[l.nombre_usuario] || 0) + 1;
    else if (l.estado === 'Tarde') puntosPorUsuario[l.nombre_usuario] = (puntosPorUsuario[l.nombre_usuario] || 0) + 0.5;
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
// "Sus asistencias" (pedido) se interpreta como SOLO los eventos donde
// la persona tiene una marca real de admin (`log_asistencias`,
// `origen==='Admin'`) -- un evento sin ninguna fila para esa persona
// (nunca se le tomó lista, ej. no pertenece a ese tier) no cuenta ni como
// racha ni como corte: no todo evento aplica a toda persona en este
// club (ver `_modoUsuario()`/Quindes-Mirlxs, MANIFEST.md).
//
// `soloUsuario` (opcional, fix real "racha inflada en re-marcados" --
// `adminMarcarAsistencia()`, arriba en este archivo): acota la
// reconstrucción a UNA sola persona, en vez de recorrer/reescribir todo
// el equipo -- ese camino en caliente (re-marcar el mismo evento+persona
// para corregir un click) necesita recalcular YA, no puede esperar a la
// próxima corrida completa/manual de `recalcularPuntosAsistencia()`. Los
// eventos siguen leyéndose completos (el orden cronológico es compartido,
// no depende de quién se está recalculando) -- solo el filtro de
// `log_asistencias` cambia.
async function _reconstruirRachasHistoricas(soloUsuario?: string): Promise<void> {
  const { data: eventos } = await supabase.from('asistencias')
    .select('id_evento, fecha, inicia')
    .not('estado', 'in', '("Evento Cancelado","No se entrena")')
    .order('fecha', { ascending: true })
    .order('inicia', { ascending: true, nullsFirst: false });
  if (!eventos || !eventos.length) return;

  const ordenPorEvento: Record<string, number> = {};
  const mesAnioPorEvento: Record<string, { anio: number; mes: number }> = {};
  eventos.forEach((ev: any, i: number) => {
    ordenPorEvento[ev.id_evento] = i;
    const partes = String(ev.fecha).split('-');
    mesAnioPorEvento[ev.id_evento] = { anio: Number(partes[0]), mes: Number(partes[1]) };
  });

  let queryLogs = supabase.from('log_asistencias')
    .select('id_evento, nombre_usuario, estado, marca_temporal')
    .eq('origen', 'Admin');
  if (soloUsuario) queryLogs = queryLogs.eq('nombre_usuario', soloUsuario);
  const { data: logsTodos } = await queryLogs;

  // Última marca real por (evento, persona) -- puede haber más de 1 fila
  // para el mismo evento+persona (re-marcados, rectificaciones aprobadas).
  const ultimaPorClave: Record<string, { estado: string; marca: number }> = {};
  (logsTodos ?? []).forEach((l: any) => {
    if (!Object.prototype.hasOwnProperty.call(ordenPorEvento, l.id_evento)) return; // evento cancelado/inexistente -- no cuenta
    const u = String(l.nombre_usuario ?? '').trim();
    if (!u) return;
    const clave = l.id_evento + '|' + u;
    const marca = l.marca_temporal ? new Date(l.marca_temporal).getTime() : 0;
    const actual = ultimaPorClave[clave];
    if (!actual || marca >= actual.marca) ultimaPorClave[clave] = { estado: l.estado, marca };
  });

  // Agrupar por persona, cada entrada con el orden cronológico real del
  // evento (no de la marca) para poder ordenar la secuencia correctamente.
  const entradasPorUsuario: Record<string, Array<{ orden: number; estado: string; idEvento: string }>> = {};
  Object.keys(ultimaPorClave).forEach((clave) => {
    const sep = clave.lastIndexOf('|');
    const idEvento = clave.substring(0, sep);
    const u = clave.substring(sep + 1);
    if (!entradasPorUsuario[u]) entradasPorUsuario[u] = [];
    entradasPorUsuario[u].push({ orden: ordenPorEvento[idEvento], estado: ultimaPorClave[clave].estado, idEvento });
  });

  const puntosExtraPorClaveMes: Record<string, number> = {}; // clave 'usuario|anio|mes' -> total del mes
  const rachaFinalPorUsuario: Record<string, number> = {};

  Object.keys(entradasPorUsuario).forEach((u) => {
    const entradas = entradasPorUsuario[u].sort(function(a, b) { return a.orden - b.orden; });
    let racha = 0;
    entradas.forEach((e) => {
      const mesAnio = mesAnioPorEvento[e.idEvento];
      const claveMes = u + '|' + mesAnio.anio + '|' + mesAnio.mes;
      if (puntosExtraPorClaveMes[claveMes] === undefined) puntosExtraPorClaveMes[claveMes] = 0;
      if (e.estado === 'A tiempo' || e.estado === 'Tarde') {
        racha++;
        if (racha % 3 === 0) puntosExtraPorClaveMes[claveMes] += 2;
      } else if (e.estado === 'Ninguno') {
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
    .not('estado', 'in', '("Evento Cancelado","No se entrena")')
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
async function solicitarLesion(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username) return { exito: false, error: 'Sesión inválida.' };
  const row = await _getEquipoRow(username);
  if (!row) return { exito: false, error: 'Usuarix no encontradx.' };
  if (row.estado_miembro === 'Lesionadx') return { exito: false, error: 'Ya estás marcadx como Lesionadx.' };
  const { error } = await supabase.from('equipo').update({ solicitud_lesion_pendiente: true }).eq('username', username);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
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
  const row = await _getEquipoRow(username);
  if (!row || row.estado_miembro !== 'Lesionadx') return { exito: false, error: 'No estás marcadx como Lesionadx.' };
  // exenta_cuota vuelve a false -- la exención estaba atada a Lesionadx
  // (Cambio 55, ver adminAprobarLesion/adminSetEstadoMiembro).
  const { error } = await supabase.from('equipo').update({ estado_miembro: 'Activx', solicitud_lesion_pendiente: false, exenta_cuota: false }).eq('username', username);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

async function adminGetSolicitudesLesion(params: Record<string, any>): Promise<any[]> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return [];
  const { data } = await supabase.from('equipo').select('username, nombre_derby, foto_perfil, estado_miembro')
    .eq('solicitud_lesion_pendiente', true).order('username');
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
  const { error } = await supabase.from('equipo').update({ estado_miembro: 'Lesionadx', solicitud_lesion_pendiente: false, exenta_cuota: true }).eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

async function adminRechazarLesion(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { nombre } = params;
  if (!nombre) return { exito: false, error: 'Parámetros inválidos.' };
  const { error } = await supabase.from('equipo').update({ solicitud_lesion_pendiente: false }).eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

async function adminEliminarUsuario(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre } = params;
  const { error } = await supabase.from('equipo').delete().eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  await supabase.from('sessions').delete().eq('username', nombre);
  return { exito: true };
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
  await supabase.from('admins').delete().ilike('email', params.email);
  return { exito: true };
}

async function adminGetCandidatosAdmin(): Promise<any[]> {
  const { data: equipo } = await supabase.from('equipo').select('username, email').order('username');
  const { data: admins } = await supabase.from('admins').select('email');
  const adminEmails = new Set([(ADMIN_PRINCIPAL.toLowerCase()), ...(admins ?? []).map((a: any) => a.email.toLowerCase())]);
  return (equipo ?? []).filter((r: any) => {
    if (adminEmails.has((r.email ?? '').toLowerCase())) return false;
    return true;
  }).map((r: any) => ({ nombre: r.username, email: r.email }));
}

async function adminGetRosterEquipo(): Promise<Record<string, any>> {
  const { data } = await supabase.from('equipo').select('username, nombre_derby, foto_perfil').order('username');
  const personas = (data ?? []).map((r: any) => ({ nombre: r.username, nombreDerby: r.nombre_derby ?? '', fotoPerfil: r.foto_perfil ?? '' }));
  if (!personas.length) return { personas };
  // `ultimaAsistencia` (bug real "usuarios inactivos siguen en la lista de
  // toma de asistencia", ver MANIFEST.md): mismo query que getEquipo() (más
  // abajo en este archivo) duplicado acá a propósito -- 2 endpoints
  // distintos con su propio shape de salida, mismo criterio de duplicación
  // ya usado en el resto del repo (ver comentario de cabecera de
  // _eqFormatearFechaIngreso(), js/equipo.js) en vez de hacer que este
  // endpoint dependa de getEquipo(). `_evEsInactivo()`/js/eventos.js filtra
  // el roster de "Marcar asistencia" con este campo, mismo criterio de 30
  // días que `_eqEstadoEfectivo()`/js/equipo.js.
  const usernames = personas.map((p: any) => p.nombre);
  const { data: logs } = await supabase.from('log_asistencias')
    .select('nombre_usuario, fecha_entrenamiento')
    .eq('origen', 'Admin').neq('estado', 'Ninguno').in('nombre_usuario', usernames);
  const ultimaPorUsuario: Record<string, string> = {};
  (logs ?? []).forEach((l: any) => {
    if (!l.fecha_entrenamiento) return;
    const actual = ultimaPorUsuario[l.nombre_usuario];
    if (!actual || l.fecha_entrenamiento > actual) ultimaPorUsuario[l.nombre_usuario] = l.fecha_entrenamiento;
  });
  personas.forEach((p: any) => { p.ultimaAsistencia = ultimaPorUsuario[p.nombre] ? ultimaPorUsuario[p.nombre].slice(0, 10) : null; });
  return { personas };
}

// ─── Acciones: Equipo (Cambio 55, roster real -- ver MANIFEST.md "Auditoría
// previa" para el detalle completo de qué columnas existen/faltaban) ───────────
// Sin token requerido -- mismo criterio que getNombres()/getProximosEntrenamientos()
// (arriba): la sección Equipo es un directorio visible para cualquier cuenta
// logueada, no admin-only, y esta app no valida sesión en la mayoría de sus
// acciones de solo-lectura.
async function getEquipo(params: Record<string, any> = {}): Promise<Record<string, any>> {
  const { data: filas } = await supabase.from('equipo')
    .select('username, nombre_derby, numero_derby, foto_perfil, categoria, pronombres, prefijo, telefono, email, estado_miembro, solicitud_lesion_pendiente, tier_modo, exenta_cuota, horas_ano, asistencias_ano, total_eventos_ano, termometro_pct, fecha_ingreso, necesita_patines, necesita_protecciones, puntos_anteriores')
    .order('username');
  const personas = filas ?? [];
  if (!personas.length) return { personas: [] };

  const usernames = personas.map((p: any) => p.username);

  // Última asistencia REAL (no solicitada/rectificada por el usuario) --
  // origen 'Admin' (rollcall real, no autoreporte) y estado != 'Ninguno'
  // (no ausente). `log_asistencias.fecha_entrenamiento` ya viene copiada de
  // `asistencias.fecha` al insertar (ver _agregarFilaLogAsistencia() arriba),
  // sin necesitar JOIN.
  const { data: logs } = await supabase.from('log_asistencias')
    .select('nombre_usuario, fecha_entrenamiento')
    .eq('origen', 'Admin').neq('estado', 'Ninguno').in('nombre_usuario', usernames);
  const ultimaPorUsuario: Record<string, string> = {};
  (logs ?? []).forEach((l: any) => {
    if (!l.fecha_entrenamiento) return;
    const actual = ultimaPorUsuario[l.nombre_usuario];
    if (!actual || l.fecha_entrenamiento > actual) ultimaPorUsuario[l.nombre_usuario] = l.fecha_entrenamiento;
  });

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
  // `refDate` (ahí siempre era "hoy") para poder pedir la ventana tanto
  // desde hoy como desde `haceUnMes` (definida abajo, con `n=1` sobre este
  // mismo helper -- sin duplicar la aritmética de fin-de-mes).
  const primerDiaMesesAtras = (refDate: Date, n: number): Date => {
    const year = refDate.getUTCFullYear();
    const month = refDate.getUTCMonth() - n;
    const dia = Math.min(refDate.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
    return new Date(Date.UTC(year, month, dia));
  };
  const haceUnMes = primerDiaMesesAtras(hoy, 1);
  const nombresDe = (s: string | null | undefined): string[] =>
    String(s ?? '').split(',').map((n: string) => n.trim().toUpperCase()).filter(Boolean);
  const { data: tiersData } = await supabase.from('config_tiers').select('*').order('orden', { ascending: true });
  const tiers = tiersData ?? [];
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
  // de "hace 1 mes" ([haceUnMes−ventana, haceUnMes)) -- contarClases() de
  // abajo filtra la porción exacta de cada una sobre este mismo array, sin
  // pedirle a la DB 2 veces.
  const { data: asistDataTermometro } = await supabase.from('asistencias')
    .select('fecha, a_horario, tarde')
    .not('estado', 'in', '("Evento Cancelado","No se entrena")')
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
  const idxActualTermometro = anioActual * 12 + (mesActual - 1);
  // `tendencia` por persona ('sube'/'baja'/ausente = igual o sin tier techo
  // configurado) -- calculada acá, aparte, en vez de inline en
  // `personasOut` más abajo (mismo criterio que `puntosPeriodoPorUsuario`/
  // `puntosAnioPorUsuario`: un objeto de una sola expresión por persona).
  const tendenciaPorUsuario: Record<string, 'sube' | 'baja'> = {};
  if (tierTecho) {
    usernames.forEach((u: string) => {
      // Reforzado (bug real, ver MANIFEST.md -- "chevron para personas que
      // regresan de inactividad"): el chevron solo tiene sentido como
      // COMPARACIÓN de una tendencia real, no para "alguien que no
      // entrenaba nada empezó a entrenar de nuevo" -- ese caso es un
      // regreso, no una mejora/caída medible. `contarClases()` (arriba en
      // esta función) ya cuenta asistencia REAL (a_horario/tarde) en cada
      // una de las 2 ventanas comparadas ("hoy" y "hace 1 mes") -- si
      // CUALQUIERA de las 2 tiene 0 clases reales, no hay tendencia que
      // mostrar (sin entrada en el mapa, `personasOut` la traduce a `null`,
      // igual que el caso "dio lo mismo" de siempre) -- cubre tanto la
      // primera vuelta tras inactividad (ventana de "hace 1 mes" en 0,
      // todavía sin nada con qué comparar) como a alguien que dejó de venir
      // (ventana de "hoy" en 0, no hay "tendencia" que reportar sobre una
      // ausencia).
      const clasesActual = contarClases(u, hoy);
      const clasesAnterior = contarClases(u, haceUnMes);
      if (clasesActual === 0 || clasesAnterior === 0) return;
      const actualPct = calcularTermometroPctAsOf(u, hoy, idxActualTermometro);
      const anteriorPct = calcularTermometroPctAsOf(u, haceUnMes, idxActualTermometro - 1);
      if (actualPct > anteriorPct) tendenciaPorUsuario[u] = 'sube';
      else if (actualPct < anteriorPct) tendenciaPorUsuario[u] = 'baja';
      // Iguales -- queda sin entrada, `personasOut` la traduce a `null`.
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
  const personasOut = personas.map((r: any) => ({
    id: r.username, nombre: r.username, username: r.username,
    nombreDerby: r.nombre_derby ?? '', numeroDerby: r.numero_derby ?? '',
    fotoPerfil: r.foto_perfil ?? '', rol: r.categoria ?? 'Mirlxs',
    pronombres: r.pronombres ?? '', prefijo: r.prefijo ?? '', telefono: r.telefono ?? '', email: r.email ?? '',
    fechaIngreso: r.fecha_ingreso ?? null,
    estado: r.estado_miembro ?? 'Activx',
    solicitudLesionPendiente: r.solicitud_lesion_pendiente === true,
    tierModo: r.tier_modo ?? 'auto', exentaCuota: r.exenta_cuota === true,
    esAdminMiembro: adminEmails.has(String(r.email ?? '').toLowerCase()),
    horas_ano: Number(r.horas_ano) || 0,
    asistencias_ano: Number(r.asistencias_ano) || 0,
    total_eventos_ano: Number(r.total_eventos_ano) || 0,
    termometro_pct: Number(r.termometro_pct) || 0,
    ultimaAsistencia: ultimaPorUsuario[r.username] ? ultimaPorUsuario[r.username].slice(0, 10) : null,
    puntosAsistencia: puntosPeriodoPorUsuario[r.username] ? puntosPeriodoPorUsuario[r.username].asistencia : 0,
    puntosTareas: puntosPeriodoPorUsuario[r.username] ? puntosPeriodoPorUsuario[r.username].tareas : 0,
    // `puntos_bonificacion` + `puntos_extra` combinados -- ver comentario
    // grande junto a `puntosPeriodoPorUsuario` más arriba en esta función.
    puntosRacha: puntosPeriodoPorUsuario[r.username] ? puntosPeriodoPorUsuario[r.username].racha : 0,
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
  }));

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
async function getDesglosePuntos(params: Record<string, any>): Promise<Record<string, any>> {
  const solicitante = await _validarToken(params.token);
  if (!solicitante) return { exito: false, error: 'Sesión inválida.' };
  const nombreUsuario = String(params.nombreUsuario || '').trim();
  if (!nombreUsuario) return { exito: false, error: 'Falta nombreUsuario.' };
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
      .select('id_evento, estado, fecha_entrenamiento, marca_temporal')
      .eq('nombre_usuario', nombreUsuario).eq('origen', 'Admin')
      .gte('fecha_entrenamiento', periodo.desde).lt('fecha_entrenamiento', periodo.hasta);
    const ultimaPorEventoDesglose: Record<string, { estado: string; fecha: string; marca: number }> = {};
    (logs ?? []).forEach((l: any) => {
      const marca = l.marca_temporal ? new Date(l.marca_temporal).getTime() : 0;
      const actual = ultimaPorEventoDesglose[l.id_evento];
      if (!actual || marca >= actual.marca) ultimaPorEventoDesglose[l.id_evento] = { estado: l.estado, fecha: l.fecha_entrenamiento, marca };
    });
    const filas = Object.keys(ultimaPorEventoDesglose)
      .map((idEvento) => ultimaPorEventoDesglose[idEvento])
      .filter((f) => f.estado === 'A tiempo' || f.estado === 'Tarde')
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
      .map((l: any) => ({
        fecha: String(l.fecha).slice(0, 10),
        estado: l.estado,
        puntos: l.estado === 'A tiempo' ? 1 : 0.5,
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
    const { data: eventos } = await supabase.from('asistencias')
      .select('id_evento, fecha, inicia')
      .not('estado', 'in', '("Evento Cancelado","No se entrena")')
      .order('fecha', { ascending: true })
      .order('inicia', { ascending: true, nullsFirst: false });
    const ordenPorEvento: Record<string, number> = {};
    const fechaPorEvento: Record<string, string> = {};
    (eventos ?? []).forEach((ev: any, i: number) => { ordenPorEvento[ev.id_evento] = i; fechaPorEvento[ev.id_evento] = ev.fecha; });

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
    const entradas = Object.keys(ultimaPorEvento)
      .map((idEvento) => ({ idEvento, orden: ordenPorEvento[idEvento], estado: ultimaPorEvento[idEvento].estado }))
      .sort((x, y) => x.orden - y.orden);
    let racha = 0;
    const filasExtra: Array<{ fecha: string; puntos: number; legado: boolean }> = [];
    entradas.forEach((e) => {
      if (e.estado === 'A tiempo' || e.estado === 'Tarde') {
        racha++;
        if (racha % 3 === 0) filasExtra.push({ fecha: String(fechaPorEvento[e.idEvento]).slice(0, 10), puntos: 2, legado: false });
      } else if (e.estado === 'Ninguno') {
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

  const { data: equipo } = await supabase.from('equipo').select('username, pronombres, prefijo, telefono');
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
    out.push({ nombre: r.nombre_usuario, patines: r.talla ?? '', protecciones: r.protecciones ?? '', fecha: ev.fecha + (ev.donde ? ' - ' + ev.donde : ''), pronombres: pronMap[r.nombre_usuario] ?? '', waLink: waMap[r.nombre_usuario] ?? '' });
  }
  return out;
}

// ─── Acciones: push ───────────────────────────────────────────────────────────

// Helper genérico de push automáticas (a diferencia de adminEnviarPush(),
// que es el envío MANUAL desde el panel admin, con su propio payload/target
// -- este helper no se reusa ahí para no tocar ese flujo ya en producción).
// Mismo endpoint/convención de auth que ya usa adminEnviarPush() (API v2,
// sin app_id en la URL, target_channel:'push') -- confirmado funcionando,
// se reusa tal cual en vez del v1 (`onesignal.com/api/v1/...`, deprecado).
// Best-effort a propósito: un push que falla nunca debe tumbar la acción
// real (crear evento, marcar RSVP, etc.) que lo disparó.
async function sendPush(payload: {
  include_aliases?: { external_id: string[] };
  included_segments?: string[];
  headings: { es: string };
  contents: { es: string };
  url?: string;
  web_buttons?: { id: string; text: string; url: string }[];
}): Promise<void> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) return;
  if (!payload.include_aliases && !payload.included_segments) return;
  try {
    await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Key ' + ONESIGNAL_API_KEY },
      body: JSON.stringify({ app_id: ONESIGNAL_APP_ID, target_channel: 'push', ...payload }),
    });
  } catch (_e) { /* best-effort, no bloquea la acción que disparó el push */ }
}

// Identidades OneSignal de cuentas admin -- 'admin_'+email, mismo prefijo que
// ya usa auth.js (OneSignal.login('admin_'+_adminEmail)) en cada login/
// restauración de sesión admin. Fuente real: tabla `admins` + ADMIN_PRINCIPAL
// (mismo criterio que adminGetCandidatosAdmin()/adminGetAdmins(), más abajo).
async function _adminOneSignalAliases(): Promise<string[]> {
  const { data } = await supabase.from('admins').select('email');
  const emails = new Set([ADMIN_PRINCIPAL.toLowerCase(), ...(data ?? []).map((a: any) => String(a.email).toLowerCase())]);
  return Array.from(emails).map((e) => 'admin_' + e);
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
// criterio ya documentado en supabase/migrations/20260831_cron_eventos_finalizados.sql),
// como string 'YYYY-MM-DD'.
function _hoyEcuadorISO(): string {
  const ecu = new Date(Date.now() - 5 * 3600 * 1000);
  return ecu.toISOString().substring(0, 10);
}

async function adminEnviarPush(params: Record<string, any>): Promise<Record<string, any>> {
  const { titulo, mensaje, destino, sendAfter } = params;
  if (!titulo || !mensaje) return { exito: false, error: 'Falta título o mensaje.' };
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) return { exito: false, error: 'OneSignal no configurado.' };
  const payload: Record<string, any> = {
    app_id: ONESIGNAL_APP_ID, target_channel: 'push',
    headings: { en: titulo }, contents: { en: mensaje },
    chrome_web_icon: 'https://app.quindesvolcanicos.com/icons/icon-192B.png',
  };
  if (destino && destino !== 'todos') payload.include_aliases = { external_id: [destino] };
  else payload.included_segments = ['Total Subscriptions'];
  if (sendAfter) payload.send_after = sendAfter;
  const resp = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Key ' + ONESIGNAL_API_KEY },
    body: JSON.stringify(payload),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || body.errors) return { exito: false, error: JSON.stringify(body.errors ?? body) };
  return { exito: true, id: body.id ?? '' };
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
// base. `adminCancelarEvento` (todavía en GAS, ver comentario "Aún en GAS"
// más abajo) también dispara `pushEventoCancelado` desde el mismo call site
// del frontend -- el push no depende de dónde vive la mutación real.
async function pushEventoCreado(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { tipo, fecha, hora, lugar, idEvento } = params;
  await sendPush({
    included_segments: ['All'],
    headings: { es: `Nuevo ${tipo || 'evento'}: ${_fechaEs(fecha)}` },
    contents: { es: `${_horaEs(hora)} · ${lugar || ''}` },
    url: APP_URL + '/?tab=eventos',
    web_buttons: idEvento ? [
      { id: 'asistire', text: 'Asistiré', url: APP_URL + '/?rsvp=' + encodeURIComponent(idEvento) + '&estado=' + encodeURIComponent('Asistiré') },
      { id: 'no-asistire', text: 'No asistiré', url: APP_URL + '/?rsvp=' + encodeURIComponent(idEvento) + '&estado=' + encodeURIComponent('No asistiré') },
    ] : undefined,
  });
  return { exito: true };
}

async function pushEventoCancelado(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { tipo, fecha, hora, lugar } = params;
  await sendPush({
    included_segments: ['All'],
    headings: { es: 'Evento cancelado' },
    contents: { es: `${tipo || 'Evento'} del ${_fechaEs(fecha)} · ${lugar || ''} · ${_horaEs(hora)}` },
    url: APP_URL + '/?tab=eventos',
  });
  return { exito: true };
}

async function pushEventoEditado(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { fecha, lugar, cambios } = params;
  if (!cambios) return { exito: true };
  await sendPush({
    included_segments: ['All'],
    headings: { es: `Evento actualizado: ${_fechaEs(fecha)}` },
    contents: { es: `${lugar || ''} · Cambios: ${cambios}` },
    url: APP_URL + '/?tab=eventos',
  });
  return { exito: true };
}

async function pushOffseasonCreado(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { desde, hasta } = params;
  await sendPush({
    included_segments: ['All'],
    headings: { es: 'Período de descanso programado' },
    contents: { es: `Sin entrenamientos del ${_fechaEs(desde)} al ${_fechaEs(hasta)}.` },
    url: APP_URL + '/?tab=eventos',
  });
  return { exito: true };
}

// ─── Acciones: cron diario de notificaciones ──────────────────────────────────
// Disparado por pg_cron todos los días a las 8am hora de Ecuador (ver
// supabase/migrations/*_cron_notificaciones_diarias.sql) vía net.http_post
// con el header `x-cron-secret` -- validado en el router (Deno.serve), no
// acá, porque necesita leer `req.headers`, no `params`.
async function cronDiario(): Promise<Record<string, any>> {
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
    .not('estado', 'in', '("Evento Cancelado","No se entrena")');
  const idsHoy = (eventosHoy ?? []).map((e: any) => e.id_evento);
  const asistPorEvento = await _ultimaAsistenciaPorPersonaTodas(idsHoy);
  for (const ev of (eventosHoy ?? [])) {
    const asistentes = (asistPorEvento[ev.id_evento] ?? []).filter((a: any) => a.estado === 'Asistiré').length;
    await sendPush({
      included_segments: ['All'],
      headings: { es: `${ev.tipo_evento || 'Entrenamiento'} hoy a las ${_horaEs(ev.inicia)}` },
      contents: { es: `${asistentes} ${asistentes === 1 ? 'persona asistirá' : 'personas asistirán'} · ${ev.donde || ''}` },
      url: APP_URL + '/?tab=eventos',
    });
  }

  // 2) Cumpleaños -- mismo doble opt-in que getCumpleañosRango() (fecha
  // guardada Y hecha pública); edad solo si edad_publica='Sí'.
  const { data: cumpleaneros } = await supabase.from('equipo')
    .select('username, fecha_nacimiento, edad_publica')
    .not('fecha_nacimiento', 'is', null)
    .not('fecha_publica', 'is', null);
  for (const p of (cumpleaneros ?? [])) {
    if (String(p.fecha_nacimiento).substring(5) !== diaMes) continue;
    const edad = anio - Number(String(p.fecha_nacimiento).substring(0, 4));
    const mostrarEdad = p.edad_publica === 'Sí';
    await sendPush({
      included_segments: ['All'],
      headings: { es: `Hoy es el cumpleaños de ${p.username}` },
      contents: { es: mostrarEdad ? `Deséale felices ${edad} años.` : 'Deséale feliz cumpleaños.' },
      url: APP_URL + '/?tab=equipo',
    });
  }

  // 3) Aniversario en el equipo (fecha_ingreso, solo a la propia persona).
  const { data: miembros } = await supabase.from('equipo')
    .select('username, fecha_ingreso')
    .not('fecha_ingreso', 'is', null);
  for (const p of (miembros ?? [])) {
    if (String(p.fecha_ingreso).substring(5) !== diaMes) continue;
    const anios = anio - Number(String(p.fecha_ingreso).substring(0, 4));
    if (anios <= 0) continue;
    await sendPush({
      include_aliases: { external_id: [p.username] },
      headings: { es: '¡Feliz aniversario!' },
      contents: { es: `Hoy cumples ${anios} ${anios === 1 ? 'año' : 'años'} en el equipo. ¡Gracias por estar!` },
      url: APP_URL + '/?tab=ajustes',
    });
  }

  // 4) Cuota pendiente -- solo el día 1 de cada mes, reusando la MISMA lógica
  // de "quién debe" que ya usa adminGetEstadoPagosMes() (_estadoPagoPersonaMes(),
  // más arriba en este archivo) -- únicamente cuentas 'Quindes' pagan cuota.
  if (diaDelMes === 1) {
    const mes = Number(hoyIso.substring(5, 7));
    const { data: quindes } = await supabase.from('equipo').select('username').eq('categoria', 'Quindes');
    const personas = (quindes ?? []).map((q: any) => q.username);
    const [{ data: pagosDelMes }, { data: solicitudesAprobadas }] = await Promise.all([
      supabase.from('pagos').select('nombre_usuario, exoneradx, monto').eq('mes', mes).eq('anio', anio),
      supabase.from('solicitudes_pago').select('nombre_usuario, tipo').eq('estado', 'aprobada').eq('mes', mes).eq('anio', anio),
    ]);
    const hoyDate = new Date(hoyIso + 'T00:00:00');
    for (const nombre of personas) {
      const estadoPago = _estadoPagoPersonaMes(nombre, mes, anio, pagosDelMes ?? [], solicitudesAprobadas ?? [], hoyDate);
      if (estadoPago !== 'Debe') continue;
      await sendPush({
        include_aliases: { external_id: [nombre] },
        headings: { es: 'Recordatorio de cuota mensual' },
        contents: { es: `${nombre}, tienes cuota pendiente. Haz una reserva y envía el comprobante.` },
        url: APP_URL + '/?tab=ajustes',
      });
    }
  }

  return { exito: true };
}

// ─── Acciones: reservas admin ─────────────────────────────────────────────────

async function adminGetReservas(params: Record<string, any>): Promise<any[]> {
  const { data: reservas } = await supabase.from('reservas').select('*').order('fecha_pago', { ascending: false });
  if (!reservas?.length) return [];
  const ids = reservas.filter((r: any) => r.id_evento).map((r: any) => r.id_evento);
  const { data: eventos } = ids.length
    ? await supabase.from('asistencias').select('id_evento, fecha, donde, inicia').in('id_evento', ids)
    : { data: [] };
  const evPorId: Record<string, any> = {};
  (eventos ?? []).forEach((e: any) => { evPorId[e.id_evento] = e; });
  return reservas.map((r: any) => {
    const ev = evPorId[r.id_evento];
    return { ...r, fechaEvento: ev?.fecha ?? null, donde: ev?.donde ?? null, horaInicio: ev?.inicia?.substring(0, 5) ?? null };
  });
}

async function adminSetEstadoReserva(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const id = params.id ?? params.fila;
  const { estado } = params;
  if (!id || !estado) return { exito: false, error: 'Parámetros inválidos.' };
  const { error } = await supabase.from('reservas').update({ estado }).eq('id', id);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

// ─── Parser de parámetros ─────────────────────────────────────────────────────

async function parseParams(req: Request): Promise<Record<string, any>> {
  if (req.method === 'GET') return Object.fromEntries(new URL(req.url).searchParams.entries());
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) { try { return await req.json(); } catch { return {}; } }
  const text = await req.text();
  try { return Object.fromEntries(new URLSearchParams(text).entries()); } catch { return {}; }
}

// ─── Proxy a GAS para acciones que aún dependen de Sheets ────────────────────

async function forwardToGAS(params: Record<string, any>): Promise<Response> {
  try {
    const qs = new URLSearchParams(params).toString();
    const resp = await fetch(GAS_URL + '?' + qs, { method: 'GET', headers: { 'User-Agent': 'Mirlxs-EdgeFunction/1.0' } });
    const text = await resp.text();
    return new Response(text, { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return json({ error: 'Error al contactar GAS: ' + (e as Error).message }, 502);
  }
}

// POST a GAS para acciones con payloads grandes (subirFoto*) — el base64
// no cabe en una URL de GET; GAS ya tiene doPost() que lee e.parameter igual.
async function forwardToGASPost(params: Record<string, any>): Promise<Response> {
  try {
    const body = Object.entries(params)
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v ?? '')))
      .join('&');
    const resp = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mirlxs-EdgeFunction/1.0' },
      body,
    });
    const text = await resp.text();
    return new Response(text, { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return json({ error: 'Error al contactar GAS: ' + (e as Error).message }, 502);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const params = await parseParams(req);
    const action = params.action;

    switch (action) {
      // Auth
      case 'loginGoogle':                     return json(await loginGoogle(params));
      case 'adminLogin':                      return json(await adminLogin(params));
      case 'validarPin':                      return json(await validarPin(params));
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
      case 'actualizarPin':                   return json(await actualizarPin(params));
      case 'actualizarPerfilGoogle':          return json(await actualizarPerfilGoogle(params));
      case 'getCuponDisponible':              return json(await getCuponDisponible(params));
      case 'marcarCuponUsado':                return json(await marcarCuponUsado(params));
      case 'getNombres':                      return json(await getNombres());
      case 'verificarEmailDisponible':        return json(await verificarEmailDisponible(params));
      case 'verificarNombreDisponible':       return json(await verificarNombreDisponible(params));
      case 'verificarGoogle':                 return json(await verificarGoogle(params));
      case 'validarInviteToken':              return json(await validarInviteToken(params));
      case 'activarCuenta':                   return json(await activarCuenta(params));
      case 'completarActivacion':             return json(await completarActivacion(params));
      case 'generarInviteToken':              return json(await generarInviteToken(params));
      // Config
      case 'getPreciosClases':                return json(await getPreciosClases());
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
      case 'getConfigTareas':                 return json(await getConfigTareas());
      case 'getTareasDisponibles':            return json(await getTareasDisponibles());
      case 'getMisTareas':                    return json(await getMisTareas(params));
      case 'tomarTarea':                      return json(await tomarTarea(params));
      case 'soltarTarea':                     return json(await soltarTarea(params));
      case 'rescatarTarea':                   return json(await rescatarTarea(params));
      case 'enviarRevisionTarea':             return json(await enviarRevisionTarea(params));
      case 'adminValidarTarea':               return json(await adminValidarTarea(params));
      case 'adminDesvalidarTarea':            return json(await adminDesvalidarTarea(params));
      case 'adminGetTareasActivas':           return json(await adminGetTareasActivas());
      case 'getTareasArchivadas':             return json(await getTareasArchivadas());
      case 'adminEliminarTareaArchivada':     return json(await adminEliminarTareaArchivada(params));
      case 'adminArchivarTarea':              return json(await adminArchivarTarea(params));
      case 'adminCrearTarea':                 return json(await adminCrearTarea(params));
      case 'adminEditarTarea':                return json(await adminEditarTarea(params));
      case 'adminEditarAsignacionesTarea':    return json(await adminEditarAsignacionesTarea(params));
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
      case 'getEventosFiltrados':             return json(await getEventosFiltrados(params));
      case 'marcarAsistenciaUsuario':         return json(await marcarAsistenciaUsuario(params));
      case 'adminMarcarAsistencia':           return json(await adminMarcarAsistencia(params));
      case 'adminBuscarPersonasParaEvento':   return json(await adminBuscarPersonasParaEvento(params));
      case 'solicitarRectificacionAsistencia': return json(await solicitarRectificacionAsistencia(params));
      case 'adminGetRectificaciones':          return json(await adminGetRectificaciones(params));
      case 'adminSetEstadoRectificacion':      return json(await adminSetEstadoRectificacion(params));
      case 'solicitarExcepcion':               return json(await solicitarExcepcion(params));
      case 'adminGetExcepciones':              return json(await adminGetExcepciones(params));
      case 'adminSetEstadoExcepcion':          return json(await adminSetEstadoExcepcion(params));
      // Reservas
      case 'getProximosEntrenamientos':       return json(await getProximosEntrenamientos());
      case 'getFechasDisponibles':            return json(await getFechasDisponibles(params));
      case 'guardarReserva':                  return json(await guardarReserva(params));
      case 'getReservasPersona':              return json(await getReservasPersona(params));
      case 'cancelarReserva':                 return json(await cancelarReserva(params));
      case 'reagendarReserva':                return json(await reagendarReserva(params));
      case 'getTallasDisponiblesParaFecha':   return json(await getTallasDisponiblesParaFecha(params));
      case 'actualizarTallaReserva':          return json(await actualizarTallaReserva(params));
      case 'usarCreditos':                    return json(await usarCreditos(params));
      // Pagos
      case 'adminRegistrarPago':              return json(await adminRegistrarPago(params));
      case 'adminRegistrarIngreso':           return json(await adminRegistrarIngreso(params));
      case 'adminRegistrarEgreso':            return json(await adminRegistrarEgreso(params));
      case 'adminGetEstadoPagosMes':          return json(await adminGetEstadoPagosMes(params));
      case 'adminGetPagosAnual':              return json(await adminGetPagosAnual(params));
      case 'adminGetBalanceFinanciero':       return json(await adminGetBalanceFinanciero());
      case 'crearSolicitudPago':              return json(await crearSolicitudPago(params));
      case 'adminGetSolicitudesPago':         return json(await adminGetSolicitudesPago());
      case 'adminResolverSolicitudPago':      return json(await adminResolverSolicitudPago(params));
      // Usuarios / admins
      case 'adminGetUsuarios':               return json(await adminGetUsuarios());
      case 'adminToggleCupon':               return json(await adminToggleCupon(params));
      case 'adminSetEstadoMiembro':          return json(await adminSetEstadoMiembro(params));
      case 'adminSetTierModo':               return json(await adminSetTierModo(params));
      case 'adminSetExentaCuota':            return json(await adminSetExentaCuota(params));
      case 'recalcularStatsEquipo':          return json(await recalcularStatsEquipo(params));
      case 'adminRecalcularStats':           return json(await adminRecalcularStats(params));
      case 'adminRecalcularPuntosAsistencia': return json(await adminRecalcularPuntosAsistencia(params));
      case 'solicitarLesion':                return json(await solicitarLesion(params));
      case 'cancelarSolicitudLesion':         return json(await cancelarSolicitudLesion(params));
      case 'recuperarseLesion':              return json(await recuperarseLesion(params));
      case 'adminGetSolicitudesLesion':      return json(await adminGetSolicitudesLesion(params));
      case 'adminAprobarLesion':             return json(await adminAprobarLesion(params));
      case 'adminRechazarLesion':            return json(await adminRechazarLesion(params));
      case 'adminEliminarUsuario':           return json(await adminEliminarUsuario(params));
      case 'adminGetAdmins':                 return json(await adminGetAdmins());
      case 'adminAgregarAdmin':              return json(await adminAgregarAdmin(params));
      case 'adminQuitarAdmin':               return json(await adminQuitarAdmin(params));
      case 'adminGetCandidatosAdmin':        return json(await adminGetCandidatosAdmin());
      case 'adminGetRosterEquipo':           return json(await adminGetRosterEquipo());
      case 'getEquipo':                      return json(await getEquipo(params));
      case 'getDesglosePuntos':              return json(await getDesglosePuntos(params));
      case 'adminGetQueLlevar':              return json(await adminGetQueLlevar());
      // Push
      case 'adminEnviarPush':               return json(await adminEnviarPush(params));
      case 'pushEventoCreado':              return json(await pushEventoCreado(params));
      case 'pushEventoCancelado':           return json(await pushEventoCancelado(params));
      case 'pushEventoEditado':             return json(await pushEventoEditado(params));
      case 'pushOffseasonCreado':           return json(await pushOffseasonCreado(params));
      case 'cronDiario': {
        const secretHeader = req.headers.get('x-cron-secret') ?? '';
        if (!CRON_SECRET || secretHeader !== CRON_SECRET) return json({ error: 'No autorizado.' }, 401);
        return json(await cronDiario());
      }
      // Reservas admin / sesión admin
      case 'adminGetReservas':              return json(await adminGetReservas(params));
      case 'adminSetEstadoReserva':         return json(await adminSetEstadoReserva(params));
      case 'adminCerrarSesion':             { if (params.adminToken) await supabase.from('admin_sessions').delete().eq('token', params.adminToken); return json({ exito: true }); }
      case 'adminBorrarEvento':             return json(await adminBorrarEvento(params));
      case 'subirFotoPerfil':
      case 'subirFotoInscripcion':
        return forwardToGASPost(params);
      // Mi Liga — config de tiers (categorías de equipo)
      case 'getTiers': {
        const adminEmail = await _validarAdminToken(params.adminToken);
        if (!adminEmail) return json({ error: 'Sesión admin inválida.' }, 401);
        const { data, error } = await supabase.from('config_tiers').select('*').order('orden');
        if (error) return json({ error: error.message }, 500);
        return json({ tiers: data });
      }
      case 'upsertTier': {
        const adminEmail = await _validarAdminToken(params.adminToken);
        if (!adminEmail) return json({ error: 'Sesión admin inválida.' }, 401);
        const { id, orden, nombre, min_clases, min_puntos, ventana_meses, logica, es_default } = params;
        const row = { orden, nombre, min_clases, min_puntos, ventana_meses, logica, es_default: !!es_default };
        const { data, error } = id
          ? await supabase.from('config_tiers').update(row).eq('id', id).select().single()
          : await supabase.from('config_tiers').insert(row).select().single();
        if (error) return json({ error: error.message }, 500);
        return json({ tier: data });
      }
      case 'deleteTier': {
        const adminEmail = await _validarAdminToken(params.adminToken);
        if (!adminEmail) return json({ error: 'Sesión admin inválida.' }, 401);
        const { data: tier } = await supabase.from('config_tiers').select('es_default').eq('id', params.id).single();
        if (!tier || tier.es_default) return json({ error: 'No se puede eliminar el tier por defecto' }, 400);
        const { error } = await supabase.from('config_tiers').delete().eq('id', params.id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
      // Mi Liga — roster con categoría actual (adminGetRosterEquipo ya existente no trae `categoria`, sin tocarla)
      case 'adminGetCategorias': {
        const adminEmail = await _validarAdminToken(params.adminToken);
        if (!adminEmail) return json({ error: 'Sesión admin inválida.' }, 401);
        const { data, error } = await supabase.from('equipo').select('username, categoria, estado_miembro').order('username');
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
            include_aliases: { external_id: [params.nombre] },
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
      // Aún en GAS: AsistenciaAnticipada, enviarResumenReservas, adminCancelarEvento, guardarNotaPago
      default:
        return forwardToGAS(params);
    }
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Error interno.' }, 500);
  }
});
