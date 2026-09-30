import { GoogleGenAI } from "@google/genai";

let cachedClient: GoogleGenAI | null = null;

export const DEFAULT_GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

export interface GeminiGenerateResult {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * Obtiene o inicializa perezosamente el cliente de Google GenAI.
 */
export function getGeminiClient(): GoogleGenAI {
  const currentApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!currentApiKey) {
    throw new Error(
      "GEMINI_API_KEY o GOOGLE_API_KEY no está configurada en las variables de entorno"
    );
  }

  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: currentApiKey });
  }
  return cachedClient;
}

/**
 * Genera contenido utilizando Google Gemini como modelo alterno o de respaldo (fallback).
 */
export async function generateWithGemini(
  prompt: string,
  modelName: string = DEFAULT_GEMINI_MODEL
): Promise<GeminiGenerateResult> {
  const client = getGeminiClient();

  const response = await client.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      maxOutputTokens: 2500,
    },
  });

  const text = response.text || "";
  const usage = response.usageMetadata;

  return {
    text,
    inputTokens: usage?.promptTokenCount ?? null,
    outputTokens: usage?.candidatesTokenCount ?? null,
  };
}
