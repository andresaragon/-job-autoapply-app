import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, DEFAULT_MODEL } from "@/lib/anthropic";
import type { GenerateContentRequest, GenerateContentResponse } from "@/lib/types";

// POST /api/generate
// Recibe el id del CV base y, o bien el id de una vacante ya guardada, o el texto
// de una oferta pegada a mano, y devuelve un CV adaptado y una carta de presentación.
// No inventa experiencia que no esté en el CV base: el prompt lo prohíbe explícitamente.
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body: GenerateContentRequest = await req.json();

  if (!body.resumeId || (!body.jobPostingId && !body.jobDescriptionText)) {
    return NextResponse.json(
      { error: "Falta resumeId y jobPostingId o jobDescriptionText" },
      { status: 400 }
    );
  }

  const { data: resume, error: resumeError } = await supabase
    .from("resumes")
    .select("contenido_base")
    .eq("id", body.resumeId)
    .eq("user_id", user.id)
    .single();

  if (resumeError || !resume) {
    return NextResponse.json({ error: "CV base no encontrado" }, { status: 404 });
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("creditos_disponibles")
    .eq("user_id", user.id)
    .single();

  if (subscriptionError || !subscription) {
    return NextResponse.json({ error: "No se encontró la suscripción del usuario" }, { status: 403 });
  }

  if (subscription.creditos_disponibles <= 0) {
    return NextResponse.json({ error: "Sin créditos disponibles" }, { status: 402 });
  }

  let jobDescription = body.jobDescriptionText ?? "";
  let empresa = "";
  let titulo = "";

  if (body.jobPostingId) {
    const { data: job, error: jobError } = await supabase
      .from("job_postings")
      .select("titulo, empresa, descripcion")
      .eq("id", body.jobPostingId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Vacante no encontrada" }, { status: 404 });
    }

    jobDescription = job.descripcion ?? "";
    empresa = job.empresa;
    titulo = job.titulo;
  }

  const prompt = `Eres un asistente experto en redacción de currículums y cartas de presentación.

CV base del candidato (no inventes experiencia, títulos ni habilidades que no estén aquí):
"""
${resume.contenido_base}
"""

Oferta de empleo${titulo ? ` (${titulo} en ${empresa})` : ""}:
"""
${jobDescription}
"""

Genera:
1. Una versión adaptada del CV que reordene y reescriba los puntos de experiencia ya existentes para resaltar lo más relevante para esta oferta específica. No agregues logros, tecnologías ni responsabilidades que no estén en el CV base.
2. Una carta de presentación corta (máximo 200 palabras), específica para esta empresa y este puesto, evitando frases genéricas de relleno.

Responde exactamente en este formato, sin texto adicional antes o después:

### CV_ADAPTADO
<cv adaptado aquí>

### CARTA_PRESENTACION
<carta aquí>`;

  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  const fullText = textBlock && "text" in textBlock ? textBlock.text : "";

  if (!fullText.includes("### CV_ADAPTADO") || !fullText.includes("### CARTA_PRESENTACION")) {
    return NextResponse.json(
      { error: "El modelo no devolvió la respuesta en el formato esperado" },
      { status: 502 }
    );
  }

  const cvMatch = fullText.split("### CARTA_PRESENTACION")[0].replace("### CV_ADAPTADO", "").trim();
  const cartaMatch = fullText.split("### CARTA_PRESENTACION")[1].trim();

  const result: GenerateContentResponse = {
    cv_generado: cvMatch,
    carta_generada: cartaMatch,
  };

  // Registro para auditoría y control de costo, y descuento del crédito usado.
  // Se usa la service role key porque el descuento de créditos no debe quedar
  // en manos de una policy de RLS editable por el propio usuario.
  const serviceClient = createServiceClient();

  await supabase.from("ai_generations").insert({
    user_id: user.id,
    tipo: "cv",
    tokens_entrada: message.usage?.input_tokens ?? null,
    tokens_salida: message.usage?.output_tokens ?? null,
  });

  await serviceClient
    .from("subscriptions")
    .update({ creditos_disponibles: subscription.creditos_disponibles - 1 })
    .eq("user_id", user.id);

  return NextResponse.json(result);
}
