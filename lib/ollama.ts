export const DEFAULT_OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

export const DEFAULT_OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || "qwen2.5:7b";

export interface OllamaGenerateResult {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * Comprueba si el servidor local de Ollama está activo y si el modelo está disponible.
 */
export async function isOllamaAvailable(
  modelName: string = DEFAULT_OLLAMA_MODEL,
  baseUrl: string = DEFAULT_OLLAMA_BASE_URL
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return false;

    const data = (await res.json()) as { models?: Array<{ name: string }> };
    if (!data.models || !Array.isArray(data.models)) return false;

    // Si modelName es '*', solo verifica si el servidor responde
    if (modelName === "*") return true;

    const baseName = modelName.split(":")[0];
    return data.models.some(
      (m) => m.name === modelName || m.name.startsWith(`${baseName}:`)
    );
  } catch {
    return false;
  }
}

/**
 * Genera contenido utilizando un modelo local servido por Ollama (ej: qwen2.5:7b en RTX 4060).
 */
export async function generateWithOllama(
  prompt: string,
  modelName: string = DEFAULT_OLLAMA_MODEL,
  baseUrl: string = DEFAULT_OLLAMA_BASE_URL
): Promise<OllamaGenerateResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/generate`;

  const controller = new AbortController();
  // Timeout de 90 segundos para permitir inferencia local en textos largos
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 2500,
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    throw new Error(
      `No se pudo conectar con Ollama en ${url}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Ollama respondió con error HTTP ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as {
    response: string;
    prompt_eval_count?: number;
    eval_count?: number;
  };

  return {
    text: data.response || "",
    inputTokens: data.prompt_eval_count ?? null,
    outputTokens: data.eval_count ?? null,
  };
}
