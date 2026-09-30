import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildAtsAutoFillPayload } from "@/lib/worker/ats/filler";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const applicationId = searchParams.get("application_id");
    const workerSecret = req.headers.get("x-worker-secret") || searchParams.get("secret");
    const configuredSecret = process.env.WORKER_SECRET || process.env.N8N_WEBHOOK_SECRET;

    if (!applicationId) {
      return NextResponse.json(
        { error: "Falta parámetro application_id" },
        { status: 400 }
      );
    }

    // Permitir autenticación vía Worker Secret (para ejecuciones desde CLI / Playwright / n8n)
    const isWorkerAuth = Boolean(
      (configuredSecret && workerSecret === configuredSecret) ||
      (process.env.NODE_ENV !== "production" && (workerSecret === "local-worker" || !configuredSecret))
    );

    let clientToUse;
    let effectiveUserId: string | null = null;
    let userEmail = "";

    if (isWorkerAuth) {
      clientToUse = createServiceClient();
    } else {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json(
          { error: "No autorizado. Inicia sesión en el navegador o provee token de worker." },
          { status: 401 }
        );
      }

      clientToUse = supabase;
      effectiveUserId = user.id;
      userEmail = user.email || "";
    }

    // 1. Obtener la postulación y vacante
    let appQuery = clientToUse
      .from("applications")
      .select("*, job_posting:job_postings(*)")
      .eq("id", applicationId);

    if (effectiveUserId) {
      appQuery = appQuery.eq("user_id", effectiveUserId);
    }

    const { data: app, error: appError } = await appQuery.single();

    if (appError || !app) {
      return NextResponse.json({ error: "Postulación no encontrada" }, { status: 404 });
    }

    // 2. Obtener el perfil del usuario propietario de la postulación
    const { data: profile } = await clientToUse
      .from("profiles")
      .select("*")
      .eq("user_id", app.user_id)
      .maybeSingle();

    // Si es llamada desde el worker y no tenemos el correo, obtenerlo del usuario de Supabase
    if (isWorkerAuth && !userEmail) {
      try {
        const { data: userData } = await clientToUse.auth.admin.getUserById(app.user_id);
        userEmail = userData.user?.email || "";
      } catch {
        // Fallback si no tiene permisos de admin
      }
    }

    const payload = buildAtsAutoFillPayload(
      app.job_posting?.tipo_ats || null,
      app.job_posting?.url || "",
      {
        profile: profile || {},
        email: userEmail,
        cvText: app.cv_generado || "",
        cartaText: app.carta_generada || "",
      }
    );

    return NextResponse.json({
      success: true,
      applicationId: app.id,
      jobTitle: app.job_posting?.titulo,
      jobCompany: app.job_posting?.empresa,
      payload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al generar payload de auto-fill";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
