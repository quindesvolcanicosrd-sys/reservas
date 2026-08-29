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
  const { data } = await supabase.from('log_asistencias').select('id_evento, nombre_usuario, origen, estado, marca_temporal').in('id_evento', idsEvento);
  const ultimaPorClave: Record<string, any> = {};
  (data ?? []).forEach((fila: any) => {
    const clave = fila.id_evento + '|' + fila.nombre_usuario;
    const marca = fila.marca_temporal ? new Date(fila.marca_temporal) : null;
    const actual = ultimaPorClave[clave];
    if (!actual || (marca && marca > actual.marca)) {
      ultimaPorClave[clave] = { idEvento: fila.id_evento, nombre: fila.nombre_usuario, origen: fila.origen, estado: fila.estado, marca };
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

async function adminGetColorEnfasis(): Promise<Record<string, any>> {
  const { data } = await supabase.from('config_app').select('value').eq('key', 'color_enfasis').maybeSingle();
  return { colorEnfasis: data?.value ?? null };
}

async function adminBorrarEvento(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(params.adminToken);
  if (!email) return { exito: false, error: 'Sesión admin inválida.' };
  const { error } = await supabase.from('asistencias').delete().eq('id_evento', params.idEvento);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
}

async function adminSetColorEnfasis(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(params.adminToken);
  if (!email) return { exito: false, error: 'Sesión admin inválida.' };
  await supabase.from('config_app').update({ value: params.hex }).eq('key', 'color_enfasis');
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

async function adminValidarTarea(params: Record<string, any>): Promise<Record<string, any>> {
  const { idAsignacion, accion, notaRechazo } = params;
  const { data: a } = await supabase.from('asignaciones_tareas').select('*').eq('id', idAsignacion).maybeSingle();
  if (!a) return { exito: false, error: 'Asignación no encontrada.' };
  if (accion === 'aprobar') {
    await supabase.from('asignaciones_tareas').update({ estado: 'aprobada', fecha_revision: new Date().toISOString() }).eq('id', idAsignacion);
    const { data: t } = await supabase.from('tareas').select('puntos').eq('id', a.tarea_id).maybeSingle();
    const puntos = Number(t?.puntos) || 0;
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
  if (asignarA.length) {
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
    // solo cuando NO hay ninguna marca real de admin para este evento --
    // eventos históricos anteriores a la migración a `log_asistencias` (ver
    // MANIFEST.md), o eventos con RSVPs pero sin rollcall, tienen datos
    // únicamente en esas columnas. No se usa como fuente primaria: mezclarla
    // siempre reintroducía el bug de RSVP anticipado mostrándose como
    // "marcado por un admin" (ver MANIFEST.md). Cuando SÍ hay marca real, se
    // sigue mandando `logDeEvento` completo (no `logAdminReal`) -- el
    // frontend (`_evMapEventoBackend()`, js/eventos.js) ya separa por estado
    // en `asistentes`/`rsvps`, y `rsvps` sigue haciendo falta ahí (resumen
    // de RSVP de cuentas no-admin/no-quindes, rol combinado en el label de
    // puntualidad) -- filtrar acá de más le borraría esa data sin necesidad.
    const fuenteAsistencia = logAdminReal.length ? logDeEvento : (asistEF[idEvento] ?? []);
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
async function marcarAsistenciaUsuario(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre, idEvento, estado } = params;
  if (!idEvento) return { exito: false, error: 'Evento inválido.' };
  if (!ESTADOS_RSVP.includes(estado)) return { exito: false, error: 'Estado inválido.' };
  await _agregarFilaLogAsistencia(String(idEvento).trim(), nombre, 'Usuario', estado);
  return { exito: true };
}

const ESTADOS_ROLLCALL = ['A tiempo', 'Tarde', 'Ninguno'];
async function adminMarcarAsistencia(params: Record<string, any>): Promise<Record<string, any>> {
  const idEvento = String(params.idEvento ?? '').trim();
  const nombre   = String(params.nombre   ?? '').trim();
  const estado   = String(params.estado   ?? '').trim();
  if (!idEvento || !nombre) return { exito: false, error: 'Datos incompletos.' };
  if (!ESTADOS_ROLLCALL.includes(estado)) return { exito: false, error: 'Estado inválido.' };

  const logResult = await _agregarFilaLogAsistencia(idEvento, nombre, 'Admin', estado);
  if (logResult.error) return { exito: false, error: 'Error insertando log: ' + logResult.error };

  // Actualizar a_horario / tarde en asistencias directamente
  const { data: ev, error: errorLectura } = await supabase.from('asistencias').select('a_horario, tarde').eq('id_evento', idEvento).maybeSingle();
  if (errorLectura) return { exito: false, error: 'Error leyendo asistencias: ' + errorLectura.message };
  if (!ev) return { exito: false, error: 'No existe fila en asistencias para evento: ' + idEvento };

  const parseNames = (s: string) => String(s ?? '').split(',').map((n: string) => n.trim()).filter(Boolean);
  let aHorario = parseNames(ev.a_horario).filter((n: string) => n.toUpperCase() !== nombre.toUpperCase());
  let tarde     = parseNames(ev.tarde).filter((n: string) => n.toUpperCase() !== nombre.toUpperCase());
  if (estado === 'A tiempo') aHorario.push(nombre);
  else if (estado === 'Tarde') tarde.push(nombre);
  const { error: errorUpdate } = await supabase.from('asistencias').update({ a_horario: aHorario.join(', '), tarde: tarde.join(', ') }).eq('id_evento', idEvento);
  if (errorUpdate) return { exito: false, error: 'Error actualizando asistencias: ' + errorUpdate.message };

  return { exito: true };
}

async function adminBuscarPersonasParaEvento(params: Record<string, any>): Promise<Record<string, any>> {
  const idEvento = String(params.idEvento ?? '').trim();
  const { data: equipo } = await supabase.from('equipo').select('username').order('username');
  const asistLog = await _ultimaAsistenciaPorPersonaTodas([idEvento]);
  const yaMarcadas: Record<string, string> = {};
  (asistLog[idEvento] ?? []).forEach((a: any) => { yaMarcadas[a.nombre] = a.estado; });
  const personas = (equipo ?? []).map((r: any) => ({ nombre: r.username, estadoActual: yaMarcadas[r.username] ?? null }));
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
  return { exito: true, cuponRestaurado };
}

async function reagendarReserva(params: Record<string, any>): Promise<Record<string, any>> {
  const { nombre, fechaAnterior, fechaNueva } = params;
  const { data } = await supabase.from('reservas').select('id').eq('nombre_usuario', nombre).eq('id_evento', fechaAnterior).neq('estado', 'Cancelada').limit(1);
  const reserva = data?.[0];
  if (!reserva) return { exito: false, error: 'Reserva no encontrada.' };
  const { error } = await supabase.from('reservas').update({ id_evento: fechaNueva, estado: 'Pendiente' }).eq('id', reserva.id);
  if (error) return { exito: false, error: error.message };
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

async function adminGetEstadoPagosMes(params: Record<string, any>): Promise<any[]> {
  const mes = Number(params.mes), anio = Number(params.anio);
  const hoy = new Date();
  const { data: nivelActual } = await supabase.from('nivel_actual').select('nombre_usuario').eq('nivel_orden', 2);
  const personas = (nivelActual ?? []).map((n: any) => n.nombre_usuario);
  const [{ data: pagosDelMes }, { data: solicitudesAprobadas }] = await Promise.all([
    supabase.from('pagos').select('nombre_usuario, exoneradx, monto').eq('mes', mes).eq('anio', anio),
    supabase.from('solicitudes_pago').select('nombre_usuario, tipo').eq('estado', 'aprobada').eq('mes', mes).eq('anio', anio),
  ]);
  return personas.map((nombre: string) => ({ nombre, estado: _estadoPagoPersonaMes(nombre, mes, anio, pagosDelMes ?? [], solicitudesAprobadas ?? [], hoy) }));
}

async function adminGetPagosAnual(params: Record<string, any>): Promise<Record<string, any>> {
  const anio = Number(params.anio);
  const hoy = new Date();
  const { data: nivelActual } = await supabase.from('nivel_actual').select('nombre_usuario').eq('nivel_orden', 2);
  const personas = (nivelActual ?? []).map((n: any) => n.nombre_usuario);
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
  const { error } = await supabase.from('equipo').update({ estado_miembro: estadoMiembro }).eq('username', nombre);
  if (error) return { exito: false, error: error.message };
  return { exito: true };
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
  const { error } = await supabase.from('equipo').update({ estado_miembro: 'Activx', solicitud_lesion_pendiente: false }).eq('username', username);
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
// cualquier miembro. Pisarlo acá para exentar a unx lesionadx rompería esa
// lógica ajena si esa persona también es admin. La exención de cuota real
// por Lesionadx (Cambio 53, toggle en js/equipo.js) sigue siendo 100%
// frontend/demo hasta que exista un campo real dedicado para eso.
async function adminAprobarLesion(params: Record<string, any>): Promise<Record<string, any>> {
  const adminEmail = await _validarAdminToken(params.adminToken);
  if (!adminEmail) return { exito: false, error: 'Sesión admin inválida.' };
  const { nombre } = params;
  if (!nombre) return { exito: false, error: 'Parámetros inválidos.' };
  const { error } = await supabase.from('equipo').update({ estado_miembro: 'Lesionadx', solicitud_lesion_pendiente: false }).eq('username', nombre);
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
  const { error } = await supabase.from('admins').insert({ email: params.email.toLowerCase(), invitado_por: adminEmail, fecha: new Date().toISOString().substring(0, 10) });
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
  return { personas };
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
      // Config
      case 'adminGetColorEnfasis':            return json(await adminGetColorEnfasis());
      case 'adminSetColorEnfasis':            return json(await adminSetColorEnfasis(params));
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
      case 'adminGetQueLlevar':              return json(await adminGetQueLlevar());
      // Push
      case 'adminEnviarPush':               return json(await adminEnviarPush(params));
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
        const { error } = await supabase.from('equipo').update({ categoria: params.categoria }).eq('username', params.nombre);
        if (error) return json({ exito: false, error: error.message });
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
