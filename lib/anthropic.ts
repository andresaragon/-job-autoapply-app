import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Modelo por defecto para generación de contenido (CV, cartas, preguntas de entrevista).
// Ajusta este identificador al modelo que tengas disponible en tu cuenta de API.
export const DEFAULT_MODEL = "claude-sonnet-5";
