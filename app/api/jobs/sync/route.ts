import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { syncJobsToSupabase } from "@/lib/jobs/aggregator";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // En desarrollo permitimos sincronizar sin autenticación para pruebas rápidas
    if (!user && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "No autorizado. Inicia sesión para sincronizar vacantes." },
        { status: 401 }
      );
    }

    // Usamos el service client si está disponible para asegurar permisos de inserción en job_postings
    const clientToUse = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceClient() : supabase;

    const syncResult = await syncJobsToSupabase(clientToUse);

    return NextResponse.json(syncResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno al sincronizar vacantes";
    console.error("[POST /api/jobs/sync] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
