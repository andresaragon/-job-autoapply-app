import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("applications")
      .select("*, job_posting:job_postings(*), resume:resumes(id, created_at)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/applications] Error al obtener postulaciones:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ applications: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al obtener postulaciones";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { job_posting_id, resume_id, cv_generado, carta_generada, estado, modo } = body;

    if (!job_posting_id) {
      return NextResponse.json(
        { error: "Falta el identificador de la vacante (job_posting_id)" },
        { status: 400 }
      );
    }

    const validStatus = estado || "borrador";
    const validMode = modo || "manual";

    const { data, error } = await supabase
      .from("applications")
      .insert({
        user_id: user.id,
        job_posting_id,
        resume_id: resume_id || null,
        cv_generado: cv_generado || null,
        carta_generada: carta_generada || null,
        estado: validStatus,
        modo: validMode,
        fecha_envio: validStatus === "enviada" ? new Date().toISOString() : null,
      })
      .select("*, job_posting:job_postings(*)")
      .single();

    if (error) {
      console.error("[POST /api/applications] Error al guardar postulación:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, application: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al crear la postulación";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { id, estado } = body;

    if (!id || !estado) {
      return NextResponse.json(
        { error: "Se requieren id y nuevo estado de postulación" },
        { status: 400 }
      );
    }

    const updatePayload: { estado: string; fecha_envio?: string } = { estado };
    if (estado === "enviada") {
      updatePayload.fecha_envio = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("applications")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("[PATCH /api/applications] Error al actualizar estado:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, application: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al actualizar postulación";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Falta id de postulación" }, { status: 400 });
    }

    const { error } = await supabase
      .from("applications")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[DELETE /api/applications] Error al eliminar postulación:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al eliminar postulación";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
