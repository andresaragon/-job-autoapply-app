import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { detectAts, stripHtml } from "@/lib/jobs/aggregator";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    const query = searchParams.get("q")?.trim() || "";
    const remote = searchParams.get("remote");
    const ats = searchParams.get("ats")?.trim() || "";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "30", 10), 1), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    let dbQuery = supabase
      .from("job_postings")
      .select("*", { count: "exact" })
      .order("fecha_publicacion", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (query) {
      dbQuery = dbQuery.or(`titulo.ilike.%${query}%,empresa.ilike.%${query}%,ubicacion.ilike.%${query}%`);
    }

    if (remote === "true") {
      dbQuery = dbQuery.eq("remoto", true);
    } else if (remote === "false") {
      dbQuery = dbQuery.eq("remoto", false);
    }

    if (ats) {
      dbQuery = dbQuery.eq("tipo_ats", ats);
    }

    const { data, count, error } = await dbQuery;

    if (error) {
      console.error("[GET /api/jobs] Error consultando job_postings:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      jobs: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al obtener vacantes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { titulo, empresa, url, descripcion, remoto, ubicacion } = body;

    if (!titulo || !empresa || !url) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios: titulo, empresa y url" },
        { status: 400 }
      );
    }

    const cleanDescription = stripHtml(descripcion || "");
    const detectedAts = detectAts(url);

    // Determinar la fuente basándonos en el dominio o manual
    let fuente = "manual";
    try {
      const parsedUrl = new URL(url);
      fuente = parsedUrl.hostname.replace(/^www\./, "");
    } catch {
      // url relativa o no estándar
    }

    const clientToUse = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceClient() : supabase;

    const { data, error } = await clientToUse
      .from("job_postings")
      .upsert(
        {
          fuente,
          titulo: titulo.trim(),
          empresa: empresa.trim(),
          url: url.trim(),
          tipo_ats: detectedAts,
          remoto: Boolean(remoto),
          ubicacion: ubicacion ? ubicacion.trim() : null,
          descripcion: cleanDescription,
          fecha_publicacion: new Date().toISOString(),
        },
        { onConflict: "fuente,url" }
      )
      .select()
      .single();

    if (error) {
      console.error("[POST /api/jobs] Error al guardar vacante manual:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, job: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al registrar la vacante";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
