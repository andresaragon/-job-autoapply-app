import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncJobsToSupabase } from "@/lib/jobs/aggregator";

function verifySecret(req: NextRequest): boolean {
  const configuredSecret = process.env.N8N_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;

  // Si no está configurado en entorno local de desarrollo, permitir con fallback
  if (!configuredSecret && process.env.NODE_ENV !== "production") {
    return true;
  }

  const headerSecret = req.headers.get("x-webhook-secret");
  const querySecret = new URL(req.url).searchParams.get("secret");

  return (headerSecret === configuredSecret) || (querySecret === configuredSecret);
}

export async function GET(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "No autorizado. Token de webhook inválido." }, { status: 401 });
  }

  return NextResponse.json({
    status: "ok",
    service: "JobAutoApply n8n Webhook Bridge",
    timestamp: new Date().toISOString(),
    supported_actions: [
      "sync_jobs",
      "get_pending",
      "update_status",
      "telegram_digest",
    ],
  });
}

export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "No autorizado. Token de webhook inválido." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || new URL(req.url).searchParams.get("action");

    const serviceClient = createServiceClient();

    switch (action) {
      case "sync_jobs": {
        const syncResult = await syncJobsToSupabase(serviceClient);
        return NextResponse.json({
          action: "sync_jobs",
          result: syncResult,
        });
      }

      case "get_pending": {
        const { data, error } = await serviceClient
          .from("applications")
          .select("id, estado, created_at, job_posting:job_postings(titulo, empresa, url, tipo_ats)")
          .in("estado", ["borrador", "lista_para_revision"])
          .order("created_at", { ascending: false })
          .limit(20);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
          action: "get_pending",
          count: data?.length || 0,
          pending_applications: data || [],
        });
      }

      case "update_status": {
        const { application_id, estado } = body;
        if (!application_id || !estado) {
          return NextResponse.json(
            { error: "Faltan application_id o estado" },
            { status: 400 }
          );
        }

        const updatePayload: { estado: string; fecha_envio?: string } = { estado };
        if (estado === "enviada") {
          updatePayload.fecha_envio = new Date().toISOString();
        }

        const { data, error } = await serviceClient
          .from("applications")
          .update(updatePayload)
          .eq("id", application_id)
          .select()
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
          action: "update_status",
          success: true,
          application: data,
        });
      }

      case "telegram_digest": {
        const baseUrl =
          body.base_url ||
          new URL(req.url).searchParams.get("base_url") ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "http://localhost:3000";

        const { data: latestJobs, error } = await serviceClient
          .from("job_postings")
          .select("id, titulo, empresa, url, tipo_ats, remoto, ubicacion, created_at")
          .order("created_at", { ascending: false })
          .limit(5);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const enrichedJobs = (latestJobs || []).map((job) => {
          const cleanTitle = (job.titulo || "Vacante").replace(/[_*[\]`]/g, " ").trim();
          const cleanEmpresa = (job.empresa || "Empresa").replace(/[_*[\]`]/g, " ").trim();
          return {
            ...job,
            titulo: cleanTitle,
            empresa: cleanEmpresa,
            deep_link: `${baseUrl}/dashboard?job_id=${job.id}`,
          };
        });

        let message = "🎯 *Radar de Empleos — JobAutoApply*\n\n";
        enrichedJobs.forEach((job, idx) => {
          const atsBadge = job.tipo_ats ? ` 🏷️ \`[ATS: ${job.tipo_ats.toUpperCase()}]\`` : "";
          const remoteBadge = job.remoto ? " 🌍 _Remoto_" : "";
          message += `*${idx + 1}. ${job.titulo}*\n`;
          message += `🏢 *${job.empresa}*${remoteBadge}${atsBadge}\n`;
          message += `🔗 [Ver Oferta Original](${job.url}) | ⚡ [Postular con IA](${job.deep_link})\n\n`;
        });
        message += "💡 _Haz clic en 'Postular con IA' para precargar la oferta en tu panel y generar tu CV adaptado._";

        return NextResponse.json({
          action: "telegram_digest",
          count: enrichedJobs.length,
          formatted_telegram_markdown: message,
          jobs: enrichedJobs,
        });
      }

      default:
        return NextResponse.json(
          {
            error: `Acción desconocida: '${action}'. Acciones válidas: sync_jobs, get_pending, update_status, telegram_digest.`,
          },
          { status: 400 }
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno procesando webhook";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
