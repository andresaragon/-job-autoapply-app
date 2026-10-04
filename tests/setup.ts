// Los tests nunca deben tocar red ni keys reales: se vacían las variables sensibles
// y se bloquea fetch salvo que cada test lo simule explícitamente.
import { beforeEach, vi } from "vitest";

const SENSITIVE_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "N8N_WEBHOOK_SECRET",
  "WEBHOOK_SECRET",
  "WORKER_SECRET",
  "DEFAULT_AI_PROVIDER",
];

beforeEach(() => {
  for (const key of SENSITIVE_ENV) vi.stubEnv(key, "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Red bloqueada en tests: simula fetch explícitamente");
    })
  );
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
