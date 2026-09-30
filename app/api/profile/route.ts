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
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: data || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al obtener perfil";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const {
      nombre_completo,
      telefono,
      linkedin_url,
      github_url,
      portafolio_url,
      ubicacion,
    } = body;

    const payload = {
      user_id: user.id,
      nombre_completo: nombre_completo ? String(nombre_completo).trim() : null,
      telefono: telefono ? String(telefono).trim() : null,
      linkedin_url: linkedin_url ? String(linkedin_url).trim() : null,
      github_url: github_url ? String(github_url).trim() : null,
      portafolio_url: portafolio_url ? String(portafolio_url).trim() : null,
      ubicacion: ubicacion ? String(ubicacion).trim() : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, profile: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al actualizar perfil";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
