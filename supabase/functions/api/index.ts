// Supabase Edge Function -- reemplazo de Code.gs (Google Apps Script).
// Recibe action por query string (GET) o body form-encoded/JSON (POST),
// mismo contrato que js/api.js (api()/apiPost()) ya usa contra el backend GAS.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = '632992894668-gnbb5cclsmfdcnve0g34kmue1c72h73q.apps.googleusercontent.com';
const ADMIN_PRINCIPAL = 'victordbh@gmail.com';

// service role key -> bypasea RLS, esta función es la única puerta de entrada a las tablas.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Mapa único camelCase (JS) <-> snake_case (columnas Postgres) de la tabla equipo,
// reusado tanto para leer (getDatosCompletos) como para escribir (actualizarDatosPersona).
const CAMPO_MAP: Record<string, string> = {
  necesitaPatines: 'necesita_patines',
  talla: 'talla',
  necesitaProtecciones: 'necesita_protecciones',
  nombreDerby: 'nombre_derby',
  numeroDerby: 'numero_derby',
  pronombres: 'pronombres',
  email: 'email',
  prefijo: 'prefijo',
  telefono: 'telefono',
  fechaPublica: 'fecha_publica',
  edadPublica: 'edad_publica',
  fechaNacimiento: 'fecha_nacimiento',
  tipoDocumento: 'tipo_documento',
  paisExpedicion: 'pais_expedicion',
  numeroDocumento: 'numero_documento',
  nombreLegal: 'nombre_legal',
  callePrincipal: 'calle_principal',
  calleSecundaria: 'calle_secundaria',
  numeracion: 'numeracion',
  sector: 'sector',
  canton: 'canton',
  emerg1Nombre: 'emerg1_nombre',
  emerg1Relacion: 'emerg1_relacion',
  emerg1Prefijo: 'emerg1_prefijo',
  emerg1Telefono: 'emerg1_telefono',
  emerg2Nombre: 'emerg2_nombre',
  emerg2Relacion: 'emerg2_relacion',
  emerg2Prefijo: 'emerg2_prefijo',
  emerg2Telefono: 'emerg2_telefono',
  enfermedad: 'enfermedad',
  alergias: 'alergias',
  dieta: 'dieta',
  alergiasDesc: 'alergias_desc',
  antecedentes: 'antecedentes',
  medicamentos: 'medicamentos',
  medicamentosDesc: 'medicamentos_desc',
  atencionMedica: 'atencion_medica',
  seguro: 'seguro',
  seguroContacto: 'seguro_contacto',
  cuponDisponible: 'cupon_disponible',
  fotoPerfil: 'foto_perfil',
  permisosConfigurados: 'permisos_configurados',
};

// Toma una fila de equipo y devuelve el objeto con todos los campos mapeados (helper interno).
function getDatosCompletos(row: Record<string, any> | null): Record<string, any> | null {
  if (!row) return null;
  const out: Record<string, any> = {};
  for (const camel in CAMPO_MAP) out[camel] = row[CAMPO_MAP[camel]];
  return out;
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

async function _infoAdmin(email: string): Promise<{ esAdmin: boolean }> {
  if (!email) return { esAdmin: false };
  const { data } = await supabase.from('admins').select('email').ilike('email', email).maybeSingle();
  return { esAdmin: !!data };
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

// Verifica idToken de Google contra el endpoint tokeninfo -- aud debe incluir
// GOOGLE_CLIENT_ID y el email debe venir verificado.
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

// Agrega esAdmin/adminToken/dashboardAdmin al resultado si row.email está en admins
// -- mismo patrón de detección que loginGoogle, reusado por validarPin/restaurarSesion.
async function _aplicarInfoAdminSiCorresponde(result: Record<string, any>, row: Record<string, any>): Promise<Record<string, any>> {
  const admin = await _infoAdmin(row.email);
  if (admin.esAdmin) {
    result.esAdmin = true;
    result.adminToken = await _crearAdminToken(row.email);
    result.dashboardAdmin = !row.paga_cuota;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

async function loginGoogle(params: Record<string, any>): Promise<Record<string, any>> {
  const info = await _verificarGoogleToken(params.idToken);
  if (!info) return { valido: false };
  const email = info.email;

  const admin = await _infoAdmin(email);
  if (admin.esAdmin) {
    const adminToken = await _crearAdminToken(email);
    const row = await _getEquipoRowByEmail(email);
    if (row) {
      const token = await _crearToken(row.username);
      return {
        valido: true,
        token,
        nombre: row.username,
        datos: getDatosCompletos(row),
        foto: info.picture || '',
        esAdmin: true,
        adminToken,
        dashboardAdmin: !row.paga_cuota,
      };
    }
    return { valido: true, esAdmin: true, email, adminToken, dashboardAdmin: true };
  }

  const row = await _getEquipoRowByEmail(email);
  if (!row) return { valido: false, noRegistrado: true };
  const token = await _crearToken(row.username);
  return {
    valido: true,
    token,
    nombre: row.username,
    datos: getDatosCompletos(row),
    foto: info.picture || '',
  };
}

async function adminLogin(params: Record<string, any>): Promise<Record<string, any>> {
  const info = await _verificarGoogleToken(params.idToken);
  if (!info) return { ok: false, error: 'Token de Google inválido.' };
  const email = info.email;

  const admin = await _infoAdmin(email);
  if (!admin.esAdmin) return { ok: false, error: 'No autorizado como admin.' };

  const adminToken = await _crearAdminToken(email);
  const row = await _getEquipoRowByEmail(email);
  if (row) {
    const token = await _crearToken(row.username);
    return {
      valido: true,
      token,
      nombre: row.username,
      datos: getDatosCompletos(row),
      foto: info.picture || '',
      esAdmin: true,
      adminToken,
      dashboardAdmin: !row.paga_cuota,
    };
  }
  return { valido: true, esAdmin: true, email, adminToken, dashboardAdmin: true };
}

async function validarPin(params: Record<string, any>): Promise<Record<string, any>> {
  const nombre = params.nombre;
  const pinHash = params.pinHash;
  const now = new Date();

  const { data: attempt } = await supabase.from('pin_attempts').select('*').eq('username', nombre).maybeSingle();
  let attemptCount = attempt ? attempt.count : 0;

  if (attempt && attempt.count >= 5 && attempt.blocked_until && new Date(attempt.blocked_until) > now) {
    return { valido: false, bloqueado: true };
  }
  if (attempt && attempt.blocked_until && new Date(attempt.blocked_until) <= now) {
    attemptCount = 0;
    await supabase.from('pin_attempts').update({ count: 0, blocked_until: null }).eq('username', nombre);
  }

  const row = await _getEquipoRow(nombre);
  if (!row) return { valido: false };

  if (row.pin_needs_reset) return { valido: false, pinNeedsReset: true };

  if (row.pin_hash === null || row.pin_hash === undefined) {
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
  return _aplicarInfoAdminSiCorresponde(result, row);
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
  return _aplicarInfoAdminSiCorresponde(result, row);
}

async function cerrarSesion(params: Record<string, any>): Promise<Record<string, any>> {
  if (params.token) await supabase.from('sessions').delete().eq('token', params.token);
  return { exito: true };
}

async function resolverNombre(params: Record<string, any>): Promise<Record<string, any>> {
  const identificador = (params.identificador || '').trim();
  if (!identificador) return { encontrado: false };
  let { data } = await supabase.from('equipo').select('username').ilike('username', identificador).maybeSingle();
  if (!data) {
    const porEmail = await supabase.from('equipo').select('username').ilike('email', identificador).maybeSingle();
    data = porEmail.data;
  }
  if (!data) return { encontrado: false };
  return { encontrado: true, nombre: data.username };
}

async function getDatosCompletosAction(params: Record<string, any>): Promise<Record<string, any>> {
  const row = await _getEquipoRow(params.nombre);
  return getDatosCompletos(row) || {};
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
  const nombre = params.nombre;
  const username = await _validarToken(params.token);
  if (!username || username !== nombre) return { exito: false, error: 'Token inválido.' };

  let datos = params.datos;
  if (typeof datos === 'string') {
    try { datos = JSON.parse(datos); } catch { datos = {}; }
  }
  datos = datos || {};

  const update: Record<string, any> = {};
  for (const camel in CAMPO_MAP) {
    if (Object.prototype.hasOwnProperty.call(datos, camel)) update[CAMPO_MAP[camel]] = datos[camel];
  }
  await supabase.from('equipo').update(update).eq('username', nombre);
  return { exito: true };
}

async function actualizarEquipamientoPersona(params: Record<string, any>): Promise<boolean> {
  await supabase
    .from('equipo')
    .update({
      necesita_patines: params.necesitaPatines,
      talla: params.talla,
      necesita_protecciones: params.necesitaProtecciones,
    })
    .eq('username', params.nombre);
  return true;
}

async function actualizarPin(params: Record<string, any>): Promise<Record<string, any>> {
  const nombre = params.nombre;
  const username = await _validarToken(params.token);
  if (!username || username !== nombre) return { exito: false, error: 'Token inválido.' };
  await supabase.from('equipo').update({ pin_hash: params.pinHash, pin_needs_reset: false }).eq('username', nombre);
  return { exito: true };
}

async function getCuponDisponible(params: Record<string, any>): Promise<Record<string, any>> {
  const nombre = params.nombre;
  const username = await _validarToken(params.token);
  if (!username || username !== nombre) return { cuponDisponible: false };
  const { data } = await supabase.from('equipo').select('cupon_disponible').eq('username', nombre).maybeSingle();
  return { cuponDisponible: !!(data && data.cupon_disponible) };
}

async function marcarCuponUsado(params: Record<string, any>): Promise<Record<string, any>> {
  await supabase.from('equipo').update({ cupon_disponible: false }).eq('username', params.nombre);
  return { exito: true };
}

async function getNombres(): Promise<string[]> {
  const { data } = await supabase.from('equipo').select('username').order('username', { ascending: true });
  return (data || []).map((r: Record<string, any>) => r.username);
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
  return { colorEnfasis: data ? data.value : null };
}

async function adminSetColorEnfasis(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(params.adminToken);
  if (!email) return { exito: false, error: 'Token admin inválido.' };
  await supabase.from('config_app').update({ value: params.hex }).eq('key', 'color_enfasis');
  return { exito: true };
}

async function getPreciosClases(): Promise<Record<string, any>> {
  const { data } = await supabase.from('config_app').select('key, value').in('key', ['precio_por_clase', 'precio_mensual']);
  const map: Record<string, any> = {};
  (data || []).forEach((r: Record<string, any>) => { map[r.key] = r.value; });
  return { precioPorClase: map['precio_por_clase'] ?? null, precioMensual: map['precio_mensual'] ?? null };
}

async function adminSetPreciosClases(params: Record<string, any>): Promise<Record<string, any>> {
  const email = await _validarAdminToken(params.adminToken);
  if (!email) return { exito: false, error: 'Token admin inválido.' };
  await supabase.from('config_app').upsert(
    [
      { key: 'precio_por_clase', value: params.precioPorClase },
      { key: 'precio_mensual', value: params.precioMensual },
    ],
    { onConflict: 'key' },
  );
  return { exito: true };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function parseParams(req: Request): Promise<Record<string, any>> {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    return Object.fromEntries(url.searchParams.entries());
  }
  if (req.method === 'POST') {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try { return await req.json(); } catch { return {}; }
    }
    const text = await req.text();
    try {
      return Object.fromEntries(new URLSearchParams(text).entries());
    } catch {
      return {};
    }
  }
  return {};
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const params = await parseParams(req);
    const action = params.action;

    switch (action) {
      case 'loginGoogle': return jsonResponse(await loginGoogle(params));
      case 'adminLogin': return jsonResponse(await adminLogin(params));
      case 'validarPin': return jsonResponse(await validarPin(params));
      case 'restaurarSesion': return jsonResponse(await restaurarSesion(params));
      case 'cerrarSesion': return jsonResponse(await cerrarSesion(params));
      case 'resolverNombre': return jsonResponse(await resolverNombre(params));
      case 'getDatosCompletos': return jsonResponse(await getDatosCompletosAction(params));
      case 'getDatosPersona': return jsonResponse(await getDatosPersona(params));
      case 'actualizarDatosPersona': return jsonResponse(await actualizarDatosPersona(params));
      case 'actualizarEquipamientoPersona': return jsonResponse(await actualizarEquipamientoPersona(params));
      case 'actualizarPin': return jsonResponse(await actualizarPin(params));
      case 'getCuponDisponible': return jsonResponse(await getCuponDisponible(params));
      case 'marcarCuponUsado': return jsonResponse(await marcarCuponUsado(params));
      case 'getNombres': return jsonResponse(await getNombres());
      case 'verificarEmailDisponible': return jsonResponse(await verificarEmailDisponible(params));
      case 'verificarNombreDisponible': return jsonResponse(await verificarNombreDisponible(params));
      case 'adminGetColorEnfasis': return jsonResponse(await adminGetColorEnfasis());
      case 'adminSetColorEnfasis': return jsonResponse(await adminSetColorEnfasis(params));
      case 'getPreciosClases': return jsonResponse(await getPreciosClases());
      case 'adminSetPreciosClases': return jsonResponse(await adminSetPreciosClases(params));
      default:
        return jsonResponse({ error: 'Acción no implementada en Edge Function.' });
    }
  } catch (e) {
    return jsonResponse({ error: (e as Error).message || 'Error interno.' }, 500);
  }
});
