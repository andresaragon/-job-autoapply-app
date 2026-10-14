/**
 * Edge Function: empleo-autofill
 *
 * Puente entre la extensión de Chrome y el tracker `empleo.vacantes` (proyecto Supabase
 * del pipeline diario de vacantes). La tabla tiene RLS activo y el esquema `empleo` no
 * está expuesto en la API REST, así que la extensión nunca toca la base directamente:
 * habla con esta función, que se autentica con un token propio (AUTOFILL_TOKEN).
 *
 *   GET  /empleo-autofill            → vacantes en estado 'propuesta' (con carta y respuestas)
 *   POST /empleo-autofill {id}       → marca la vacante como 'postulada' (hoy, seguimiento +7 días)
 *
 * Despliegue (sin verificación JWT; la autenticación es el header x-autofill-token):
 *   supabase secrets set AUTOFILL_TOKEN=<token largo aleatorio>
 *   supabase functions deploy empleo-autofill --no-verify-jwt
 */
import postgres from "npm:postgres@3.4.4";

const TOKEN = Deno.env.get("AUTOFILL_TOKEN") ?? "";
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-autofill-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Comparación en tiempo constante para no filtrar el token por timing.
function sameToken(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function todayBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (TOKEN.length < 24) return json({ error: "AUTOFILL_TOKEN no configurado en el servidor" }, 500);
  if (!sameToken(req.headers.get("x-autofill-token") ?? "", TOKEN)) return json({ error: "No autorizado" }, 401);

  try {
    if (req.method === "GET") {
      const rows = await sql`
        select id, fuente, empresa, titulo, url, fuente_job_id, notas, carta, respuestas_sugeridas, cv_sugerido, relacion, salario, creado_en
        from empleo.vacantes
        where estado = 'propuesta'
        order by creado_en desc
        limit 30`;
      return json({ vacantes: rows });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const id = Number(body?.id);
      if (!Number.isInteger(id) || id <= 0) return json({ error: "id inválido" }, 400);

      const hoy = todayBogota();
      // Solo se permite propuesta → postulada: la extensión no puede tocar nada más.
      const rows = await sql`
        update empleo.vacantes
        set estado = 'postulada',
            fecha_postulacion = ${hoy}::date,
            fecha_seguimiento = ${hoy}::date + 7,
            actualizado_en = now(),
            notas = coalesce(notas, '') || ' | Postulada desde la extensión.'
        where id = ${id} and estado = 'propuesta'
        returning id, empresa, titulo, estado, fecha_postulacion`;
      if (!rows.length) return json({ error: "La vacante no existe o ya no está en estado 'propuesta'" }, 409);
      return json({ vacante: rows[0] });
    }

    return json({ error: "Método no permitido" }, 405);
  } catch (err) {
    console.error("empleo-autofill", err);
    return json({ error: "Error interno" }, 500);
  }
});
