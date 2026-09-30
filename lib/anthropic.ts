import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

// Modelo por defecto para generación de contenido (CV, cartas, preguntas de entrevista).
// Usa claude-sonnet-5-5 por defecto, configurable mediante la variable de entorno ANTHROPIC_MODEL.
export const DEFAULT_ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

// Mantener compatibilidad retroactiva con DEFAULT_MODEL
export const DEFAULT_MODEL = DEFAULT_ANTHROPIC_MODEL;
