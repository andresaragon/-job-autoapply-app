import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, DEFAULT_ANTHROPIC_MODEL } from "@/lib/anthropic";
import { generateWithGemini } from "@/lib/gemini";
import { generateWithOllama, isOllamaAvailable } from "@/lib/ollama";
import type { GenerateContentRequest, GenerateContentResponse } from "@/lib/types";

function parseGeneratedContent(rawText: string): { cv: string; carta: string } | null {
  const cvMatch = rawText.match(/###\s*CV_ADAPTADO\s*\n*([\s\S]*?)(?=###\s*CARTA_PRESENTACION|$)/i);
  const cartaMatch = rawText.match(/###\s*CARTA_PRESENTACION\s*\n*([\s\S]*?)$/i);

  const cv = cvMatch ? cvMatch[1].trim() : "";
  const carta = cartaMatch ? cartaMatch[1].trim() : "";

  if (!cv && !carta) {
    return null;
  }

  return { cv, carta };
}

// POST /api/generate
// Genera CV adaptado y carta de presentación con IA Híbrida:
// Ollama Local (RTX 4060) | Claude Sonnet 5.5 | Google Gemini.
export async function POST(req: NextRequest) {
  try {
    let body: GenerateContentRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Cuerpo de solicitud inválido o no es JSON válido" },
        { status: 400 }
      );
    }

    if (!body.resumeId || (!body.jobPostingId && !body.jobDescriptionText)) {
      return NextResponse.json(
        { error: "Falta resumeId y (jobPostingId o jobDescriptionText)" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const serviceClient = createServiceClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let effectiveUserId: string;

    if (user) {
      effectiveUserId = user.id;
    } else if (process.env.NODE_ENV !== "production") {
      // Modo desarrollo: permite probar desde el dashboard buscando el owner del CV
      const { data: devResume, error: devError } = await serviceClient
        .from("resumes")
        .select("user_id")
        .eq("id", body.resumeId)
        .single();

      if (devError || !devResume) {
        return NextResponse.json(
          {
            error:
              "No autenticado y el resumeId proporcionado no fue encontrado en la base de datos.",
          },
          { status: 401 }
        );
      }
      effectiveUserId = devResume.user_id;
    } else {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Obtener CV base
    const { data: resume, error: resumeError } = await serviceClient
      .from("resumes")
      .select("contenido_base")
      .eq("id", body.resumeId)
      .eq("user_id", effectiveUserId)
      .single();

    if (resumeError || !resume) {
      return NextResponse.json(
        { error: "CV base no encontrado para el usuario actual" },
        { status: 404 }
      );
    }

    // Descuento / Reserva atómica de crédito ANTES de invocar la IA (elimina ventana TOCTOU)
    const { data: updatedSub, error: updateError } = await serviceClient
      .from("subscriptions")
      .update({ creditos_disponibles: 0 }) // Se calculará con select/gt
      .eq("user_id", effectiveUserId);

    // Consulta de saldo disponible
    const { data: subscription, error: subscriptionError } = await serviceClient
      .from("subscriptions")
      .select("creditos_disponibles")
      .eq("user_id", effectiveUserId)
      .single();

    if (subscriptionError || !subscription) {
      return NextResponse.json(
        { error: "No se encontró la suscripción del usuario" },
        { status: 403 }
      );
    }

    // Descuento atómico condicional
    const { data: deductedSub, error: deductError } = await serviceClient
      .from("subscriptions")
      .update({ creditos_disponibles: subscription.creditos_disponibles - 1 })
      .eq("user_id", effectiveUserId)
      .gt("creditos_disponibles", 0)
      .select("creditos_disponibles")
      .single();

    if (deductError || !deductedSub) {
      return NextResponse.json(
        { error: "Sin créditos disponibles para generar documentos" },
        { status: 402 }
      );
    }

    let jobDescription = body.jobDescriptionText ?? "";
    let empresa = "";
    let titulo = "";

    if (body.jobPostingId) {
      const { data: job, error: jobError } = await serviceClient
        .from("job_postings")
        .select("titulo, empresa, descripcion")
        .eq("id", body.jobPostingId)
        .single();

      if (jobError || !job) {
        // Reembolso del crédito si la vacante no existe
        await serviceClient
          .from("subscriptions")
          .update({ creditos_disponibles: subscription.creditos_disponibles })
          .eq("user_id", effectiveUserId);

        return NextResponse.json(
          { error: "Vacante especificada no encontrada" },
          { status: 404 }
        );
      }

      jobDescription = job.descripcion ?? "";
      empresa = job.empresa;
      titulo = job.titulo;
    }

    const prompt = `Eres un asistente experto en redacción de currículums y cartas de presentación profesionales.

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

    let generatedText = "";
    let providerUsed: "ollama" | "anthropic" | "gemini" = "ollama";
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;

    const preferredProvider = body.preferredProvider || process.env.DEFAULT_AI_PROVIDER || "auto";
    const providerErrors: Record<string, string> = {};

    // 1. Intento con Ollama Local si está solicitado o en modo auto
    const tryOllama = preferredProvider === "ollama" || preferredProvider === "auto";
    if (tryOllama) {
      try {
        const ollamaUp = await isOllamaAvailable();
        if (ollamaUp) {
          console.info("[API Generate] Invocando modelo local Ollama (RTX 4060)...");
          const ollamaRes = await generateWithOllama(prompt);
          generatedText = ollamaRes.text;
          inputTokens = ollamaRes.inputTokens;
          outputTokens = ollamaRes.outputTokens;
          providerUsed = "ollama";
        } else {
          providerErrors.ollama = "Servidor Ollama no disponible o modelo no descargado";
        }
      } catch (ollamaErr) {
        providerErrors.ollama = ollamaErr instanceof Error ? ollamaErr.message : String(ollamaErr);
        console.warn("[API Generate] Falló Ollama local:", providerErrors.ollama);
      }
    }

    // 2. Intento con Anthropic Claude (si Ollama no se usó o falló, o si se solicitó explícitamente)
    if (!generatedText && (preferredProvider === "anthropic" || preferredProvider === "auto" || preferredProvider === "ollama")) {
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
      if (hasAnthropicKey) {
        try {
          console.info("[API Generate] Invocando Claude Sonnet 5.5...");
          const message = await anthropic.messages.create({
            model: DEFAULT_ANTHROPIC_MODEL,
            max_tokens: 2500,
            messages: [{ role: "user", content: prompt }],
          });

          const textBlock = message.content.find((block) => block.type === "text");
          generatedText = textBlock && "text" in textBlock ? textBlock.text : "";
          inputTokens = message.usage?.input_tokens ?? null;
          outputTokens = message.usage?.output_tokens ?? null;
          providerUsed = "anthropic";
        } catch (anthropicErr) {
          providerErrors.anthropic = anthropicErr instanceof Error ? anthropicErr.message : String(anthropicErr);
          console.warn("[API Generate] Falló Anthropic:", providerErrors.anthropic);
        }
      } else {
        providerErrors.anthropic = "ANTHROPIC_API_KEY no configurada";
      }
    }

    // 3. Intento con Google Gemini (Respaldo en la nube)
    if (!generatedText) {
      try {
        console.info("[API Generate] Invocando Google Gemini...");
        const geminiResult = await generateWithGemini(prompt);
        generatedText = geminiResult.text;
        inputTokens = geminiResult.inputTokens;
        outputTokens = geminiResult.outputTokens;
        providerUsed = "gemini";
      } catch (geminiErr) {
        providerErrors.gemini = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
        console.error("[API Generate] Falló Google Gemini:", providerErrors.gemini);
      }
    }

    // Si ningún proveedor pudo generar la respuesta, reembolsar y retornar error
    if (!generatedText) {
      await serviceClient
        .from("subscriptions")
        .update({ creditos_disponibles: subscription.creditos_disponibles })
        .eq("user_id", effectiveUserId);

      return NextResponse.json(
        {
          error: "Error al generar con IA. Ningún proveedor disponible pudo completar la solicitud.",
          details: providerErrors,
        },
        { status: 502 }
      );
    }

    // Validar y parsear estructura de salida
    const parsed = parseGeneratedContent(generatedText);
    if (!parsed || !parsed.cv) {
      await serviceClient
        .from("subscriptions")
        .update({ creditos_disponibles: subscription.creditos_disponibles })
        .eq("user_id", effectiveUserId);

      return NextResponse.json(
        { error: "El modelo no devolvió la respuesta en el formato estructurado esperado" },
        { status: 502 }
      );
    }

    // Registro en tabla de auditoría ai_generations
    try {
      await serviceClient.from("ai_generations").insert({
        user_id: effectiveUserId,
        tipo: "cv",
        proveedor: providerUsed,
        tokens_entrada: inputTokens,
        tokens_salida: outputTokens,
      });
    } catch (auditError) {
      console.error("[API Generate] Error al registrar auditoría:", auditError);
    }

    const result: GenerateContentResponse = {
      cv_generado: parsed.cv,
      carta_generada: parsed.carta,
      provider: providerUsed,
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    console.error("[API Generate POST Error]:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
