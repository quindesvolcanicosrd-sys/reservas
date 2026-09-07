// Edge Function — confirma/da de baja asistencia a un evento desde los
// botones de acción de una push notification (OneSignal), EN BACKGROUND
// (sin abrir la app) -- ver OneSignalSDKWorker.js (notificationclick) y
// pushEventoCreado() en supabase/functions/api/index.ts (mint del token,
// mismo PUSH_TOKEN_SECRET).
//
// No requiere auth header del usuario -- se llama desde el service worker,
// sin ninguna pestaña/sesión abierta. La identidad viene 100% del `token`
// firmado (HMAC-SHA256, ver _verificarTokenAccion() más abajo), NO de
// `sessions`/`_validarToken()` (esos requieren el token de sesión real del
// usuario, que nunca debe viajar dentro de un payload de push a un tercero
// como OneSignal -- de ahí el token dedicado, de un solo propósito y con
// expiración corta).
//
// Standalone (sin imports de supabase/functions/api/index.ts -- cada Edge
// Function de este proyecto se despliega aislada, mismo criterio ya usado
// por supabase/functions/recalcular-categorias/index.ts): duplica acá el
// mínimo de helpers/lógica de `marcarAsistenciaUsuario()` (rama de click
// manual, no la de auto-persist -- un RSVP desde push siempre es un click
// real de la persona) que hace falta para escribir en `log_asistencias`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Mismo secret que firma el token en pushEventoCreado() (supabase/functions/api/index.ts)
// -- debe configurarse IDÉNTICO en ambas funciones:
//   supabase secrets set PUSH_TOKEN_SECRET=<valor> --project-ref uusbnreitoobqssizbfq
const PUSH_TOKEN_SECRET = Deno.env.get('PUSH_TOKEN_SECRET') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function _b64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Verifica firma + expiración; devuelve `{ username, idEvento }` del payload
// solo si la firma es válida y el token no venció -- mismo formato que
// _firmarTokenAccion() en supabase/functions/api/index.ts
// (`base64url(payload).base64url(firma)`, HMAC-SHA256).
async function _verificarTokenAccion(token: string): Promise<{ username: string; idEvento: string } | null> {
  if (!PUSH_TOKEN_SECRET || !token) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [payloadB64, firmaB64] = partes;
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(PUSH_TOKEN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const valido = await crypto.subtle.verify(
      'HMAC', key, _b64urlDecode(firmaB64), new TextEncoder().encode(payloadB64)
    );
    if (!valido) return null;
    const payload = JSON.parse(new TextDecoder().decode(_b64urlDecode(payloadB64)));
    if (!payload.u || !payload.e || !payload.exp) return null;
    if (Date.now() > Number(payload.exp)) return null;
    return { username: String(payload.u), idEvento: String(payload.e) };
  } catch (_e) {
    return null;
  }
}

// Mismo criterio que _agregarFilaLogAsistencia() en supabase/functions/api/index.ts
async function _agregarFilaLogAsistencia(idEvento: string, nombre: string, estado: string): Promise<{ error: string | null }> {
  const { data: ev } = await supabase.from('asistencias').select('fecha').eq('id_evento', idEvento).maybeSingle();
  const { error } = await supabase.from('log_asistencias').insert({
    id_evento: idEvento,
    fecha_entrenamiento: ev?.fecha ? ev.fecha + 'T00:00:00Z' : null,
    nombre_usuario: nombre,
    origen: 'Usuario',
    estado,
    marca_temporal: new Date().toISOString(),
  });
  return { error: error?.message ?? null };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ exito: false, error: 'Método no soportado.' }, 405);

  let params: Record<string, any>;
  try {
    params = await req.json();
  } catch (_e) {
    return json({ exito: false, error: 'Body inválido.' }, 400);
  }

  const verificado = await _verificarTokenAccion(params.token);
  if (!verificado) return json({ exito: false, error: 'Token inválido o vencido.' }, 401);
  const { username, idEvento } = verificado;

  // Si el body trae evento_id, debe coincidir con el del token -- defensa
  // extra contra un token reusado fuera de contexto (el token ya es la
  // fuente de verdad real, esto es un chequeo de consistencia adicional).
  if (params.evento_id && String(params.evento_id) !== idEvento) {
    return json({ exito: false, error: 'evento_id no coincide con el token.' }, 400);
  }

  const accion = params.action;
  const estado = accion === 'asistire' ? 'Asistiré' : accion === 'no_asistire' ? 'No asistiré' : null;
  if (!estado) return json({ exito: false, error: 'action inválida.' }, 400);

  // Click manual (siempre, acá): limpiar filas RSVP previas para que este
  // click sea definitivo -- mismo criterio que marcarAsistenciaUsuario()
  // (supabase/functions/api/index.ts) en su rama `!esAuto`.
  await supabase.from('log_asistencias')
    .delete()
    .eq('id_evento', idEvento)
    .eq('nombre_usuario', username)
    .in('origen', ['Usuario', 'AsistenciaAnticipada']);

  const { error } = await _agregarFilaLogAsistencia(idEvento, username, estado);
  if (error) return json({ exito: false, error: 'No se pudo guardar la asistencia: ' + error }, 500);

  return json({ exito: true });
});
