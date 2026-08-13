// Supabase Edge Function — reemplazo de Code.gs (Google Apps Script)
// Mismo contrato action-based que js/api.js usa contra el backend GAS.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = '632992894668-gnbb5cclsmfdcnve0g34kmue1c72h73q.apps.googleusercontent.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDatosCompletos(row: Record<string, any> | null): Record<string, any> | null {
  if (!row) return null;
  return {
    necesitaPatines:      row.necesita_patines      ?? '',
    talla:                row.talla                 ?? '',
    necesitaProtecciones: row.necesita_protecciones ?? '',
    nombreDerby:          row.nombre_derby          ?? '',
    numeroDerby:          row.numero_derby          ?? '',
    pronombres:           row.pronombres            ?? '',
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

// Adjunta esAdmin/adminToken/dashboardAdmin al resultado si row.email está en admins
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

// ─── Acciones ────────────────────────────────────────────────────────────────

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
      return {
        valido: true, token, nombre: row.username,
        datos: getDatosCompletos(row), foto,
        esAdmin: true, adminToken,
        dashboardAdmin: !(pagaCuota === 'sí' || pagaCuota === 'si'),
      };
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
    return {
      valido: true, token, nombre: row.username,
      datos: getDatosCompletos(row), foto: info.picture ?? '',
      esAdmin: true, adminToken,
      dashboardAdmin: !(pagaCuota === 'sí' || pagaCuota === 'si'),
    };
  }
  return { valido: true, esAdmin: true, email, adminToken, dashboardAdmin: true };
}

async function validarPin(params: Record<string, any>): Promise<Record<string, any>> {
  const nombre = params.nombre;
  const pinHash = params.pinHash;
  const now = new Date();

  const { data: attempt } = await supabase.from('pin_attempts').select('*').eq('username', nombre).maybeSingle();
  let attemptCount = attempt?.count ?? 0;

  if (attempt?.count >= 5 && attempt?.blocked_until && new Date(attempt.blocked_until) > now) {
    return { valido: false, bloqueado: true };
  }
  if (attempt?.blocked_until && new Date(attempt.blocked_until) <= now) {
    attemptCount = 0;
    await supabase.from('pin_attempts').update({ count: 0, blocked_until: null }).eq('username', nombre);
  }

  const row = await _getEquipoRow(nombre);
  if (!row) return { valido: false };
  if (row.pin_needs_reset) return { valido: false, pinNeedsReset: true };
  if (!row.pin_hash) {
    await _registrarIntentoFallido(nombre, attemptCount);
    return { valido: false };
  }
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
  if (!data) {
    const r = await supabase.from('equipo').select('username').ilike('email', id).maybeSingle();
    data = r.data;
  }
  if (!data) return { encontrado: false };
  return { encontrado: true, nombre: data.username };
}

async function getDatosCompletosAction(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username || username !== params.nombre) return { error: 'Sesión inválida.' };
  const row = await _getEquipoRow(params.nombre);
  return getDatosCompletos(row) ?? {};
}

async function getDatosPersona(params: Record<string, any>): Promise<Record<string, any>> {
  const { data } = await supabase
    .from('equipo')
    .select('username, necesita_patines, talla, necesita_protecciones, email')
    .eq('username', params.nombre)
    .maybeSingle();
  if (!data) return {};
  return {
    nombre: data.username,
    necesitaPatines: data.necesita_patines,
    talla: data.talla,
    necesitaProtecciones: data.necesita_protecciones,
    email: data.email,
  };
}

async function actualizarDatosPersona(params: Record<string, any>): Promise<Record<string, any>> {
  const username = await _validarToken(params.token);
  if (!username || username !== params.nombre) return { exito: false, error: 'Sesión inválida.' };

  let datos = params.datos;
  if (typeof datos === 'string') {
    try { datos = JSON.parse(datos); } catch { return { exito: false, error: 'datos inválido.' }; }
  }

  const CAMPO_MAP: Record<string, string> = {
    nombreDerby: 'nombre_derby', numeroDerby: 'numero_derby', pronombres: 'pronombres',
    dieta: 'dieta', prefijo: 'prefijo', telefono: 'telefono', email: 'email',
    fechaPublica: 'fecha_publica', edadPublica: 'edad_publica', fechaNacimiento: 'fecha_nacimiento',
    tipoDocumento: 'tipo_documento', paisExpedicion: 'pais_expedicion', numeroDocumento: 'numero_documento',
    nombreLegal: 'nombre_legal', callePrincipal: 'calle_principal', calleSecundaria: 'calle_secundaria',
    numeracion: 'numeracion', sector: 'sector', canton: 'canton',
    emerg1Nombre: 'emerg1_nombre', emerg1Relacion: 'emerg1_relacion',
    emerg1Prefijo: 'emerg1_prefijo', emerg1Telefono: 'emerg1_telefono',
    emerg2Nombre: 'emerg2_nombre', emerg2Relacion: 'emerg2_relacion',
    emerg2Prefijo: 'emerg2_prefijo', emerg2Telefono: 'emerg2_telefono',
    enfermedad: 'enfermedad', alergias: 'alergias', alergiasDesc: 'alergias_desc',
    antecedentes: 'antecedentes', medicamentos: 'medicamentos', medicamentosDesc: 'medicamentos_desc',
    atencionMedica: 'atencion_medica', seguro: 'seguro', seguroContacto: 'seguro_contacto',
  };

  const update: Record<string, any> = {};
  for (const camel of Object.keys(datos ?? {})) {
    if (CAMPO_MAP[camel]) update[CAMPO_MAP[camel]] = datos[camel];
  }

  await supabase.from('equipo').update(update).eq('username', params.nombre);
  return { exito: true };
}

async function actualizarEquipamientoPersona(params: Record<string, any>): Promise<boolean> {
  await supabase.from('equipo').update({
    necesita_patines: params.necesitaPatines,
    talla: params.talla,
    necesita_protecciones: params.necesitaProtecciones,
  }).eq('username', params.nombre);
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
  const { data } = await supabase.from('equipo').select('username').order('username', { ascending: true });
  return (data ?? []).map((r: Record<string, any>) => r.username);
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

async function adminGetColorEnfasis(): Promise<Record<string, any>> {
  const { data } = await supabase.from('config_app').select('value').eq('key', 'color_enfasis').maybeSingle();
  return { colorEnfasis: data?.value ?? null };
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
  (data ?? []).forEach((r: Record<string, any>) => { map[r.key] = r.value; });
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

// ─── Parser de parámetros ─────────────────────────────────────────────────────

async function parseParams(req: Request): Promise<Record<string, any>> {
  if (req.method === 'GET') {
    return Object.fromEntries(new URL(req.url).searchParams.entries());
  }
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try { return await req.json(); } catch { return {}; }
  }
  const text = await req.text();
  try { return Object.fromEntries(new URLSearchParams(text).entries()); } catch { return {}; }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const params = await parseParams(req);
    const action = params.action;

    switch (action) {
      case 'loginGoogle':                return json(await loginGoogle(params));
      case 'adminLogin':                 return json(await adminLogin(params));
      case 'validarPin':                 return json(await validarPin(params));
      case 'restaurarSesion':            return json(await restaurarSesion(params));
      case 'cerrarSesion':               return json(await cerrarSesion(params));
      case 'resolverNombre':             return json(await resolverNombre(params));
      case 'getDatosCompletos':          return json(await getDatosCompletosAction(params));
      case 'getDatosPersona':            return json(await getDatosPersona(params));
      case 'actualizarDatosPersona':     return json(await actualizarDatosPersona(params));
      case 'actualizarEquipamientoPersona': return json(await actualizarEquipamientoPersona(params));
      case 'actualizarPin':              return json(await actualizarPin(params));
      case 'getCuponDisponible':         return json(await getCuponDisponible(params));
      case 'marcarCuponUsado':           return json(await marcarCuponUsado(params));
      case 'getNombres':                 return json(await getNombres());
      case 'verificarEmailDisponible':   return json(await verificarEmailDisponible(params));
      case 'verificarNombreDisponible':  return json(await verificarNombreDisponible(params));
      case 'adminGetColorEnfasis':       return json(await adminGetColorEnfasis());
      case 'adminSetColorEnfasis':       return json(await adminSetColorEnfasis(params));
      case 'getPreciosClases':           return json(await getPreciosClases());
      case 'adminSetPreciosClases':      return json(await adminSetPreciosClases(params));
      default:
        return json({ error: 'Acción no implementada en Edge Function.' });
    }
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Error interno.' }, 500);
  }
});
