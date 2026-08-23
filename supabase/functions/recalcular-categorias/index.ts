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
  return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - n, 1));
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

    const { data: equipoData, error: equipoError } = await supabase.from('equipo').select('username, estado_miembro');
    if (equipoError) return json({ ok: false, error: equipoError.message }, 500);
    const miembros: { username: string; estadoMiembro: string | null }[] = (equipoData ?? [])
      .filter((r: any) => r.username)
      .map((r: any) => ({ username: r.username, estadoMiembro: r.estado_miembro ?? null }));

    const maxVentana = Math.max(0, ...tiers.map((t: any) => Number(t.ventana_meses) || 0));

    const { data: asistData, error: asistError } = await supabase
      .from('asistencias')
      .select('fecha, a_horario, tarde')
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

    const resultados: { username: string; categoria: string }[] = [];

    for (const { username, estadoMiembro } of miembros) {
      // Lesionadx: no se toca la categoría (queda como esté, no participa
      // del recálculo -- ver MANIFEST.md "estado_miembro").
      if (estadoMiembro === 'Lesionadx') continue;

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
      await supabase.from('equipo').update({ categoria: categoriaAsignada }).eq('username', username);
      resultados.push({ username, categoria: categoriaAsignada });
    }

    return json({ ok: true, procesados: resultados.length, resultados });
  } catch (err) {
    return json({ ok: false, error: String((err as any)?.message ?? err) }, 500);
  }
});
