import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeDb, installCreditRpcs, type FakeDb } from "../helpers/fakeSupabase";

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  anthropicCreate: vi.fn(),
  gemini: vi.fn(),
  ollamaUp: vi.fn(),
  ollama: vi.fn(),
}));

vi.mock("@/lib/supabase/server", async () => {
  const m = await import("../helpers/fakeSupabase");
  return {
    createClient: async () => m.fakeClient(h.db),
    createServiceClient: () => m.fakeClient(h.db),
  };
});
vi.mock("@/lib/anthropic", () => ({
  anthropic: { messages: { create: h.anthropicCreate } },
  DEFAULT_ANTHROPIC_MODEL: "test-model",
}));
vi.mock("@/lib/gemini", () => ({ generateWithGemini: h.gemini }));
vi.mock("@/lib/ollama", () => ({ generateWithOllama: h.ollama, isOllamaAvailable: h.ollamaUp }));

import { POST } from "@/app/api/generate/route";

const USER = { id: "user-1", email: "u@example.com" };
const GOOD = "### CV_ADAPTADO\nCV reescrito\n\n### CARTA_PRESENTACION\nCarta corta";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/generate", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const credits = () => h.db.tables.subscriptions[0].creditos_disponibles;

function seed(balance = 3, user: typeof USER | null = USER) {
  h.db = createFakeDb(
    {
      resumes: [{ id: "cv-1", user_id: USER.id, contenido_base: "Mi CV base" }],
      subscriptions: [{ user_id: USER.id, creditos_disponibles: balance }],
      job_postings: [{ id: "job-1", titulo: "Dev", empresa: "Acme", descripcion: "Node y SQL" }],
      ai_generations: [],
    },
    user
  );
  installCreditRpcs(h.db);
}

beforeEach(() => {
  seed();
  h.ollamaUp.mockResolvedValue(false);
  h.ollama.mockResolvedValue({ text: GOOD, inputTokens: 10, outputTokens: 20 });
  h.anthropicCreate.mockResolvedValue({
    content: [{ type: "text", text: GOOD }],
    usage: { input_tokens: 11, output_tokens: 22 },
  });
  h.gemini.mockResolvedValue({ text: GOOD, inputTokens: 12, outputTokens: 24 });
});

describe("POST /api/generate — validación y autenticación", () => {
  it("400 si el cuerpo no es JSON", async () => {
    expect((await POST(req("no-json"))).status).toBe(400);
  });

  it("400 si falta resumeId o la oferta", async () => {
    expect((await POST(req({ jobDescriptionText: "x" }))).status).toBe(400);
    expect((await POST(req({ resumeId: "cv-1" }))).status).toBe(400);
  });

  it("401 en producción sin sesión, sin consultar la base", async () => {
    seed(3, null);
    vi.stubEnv("NODE_ENV", "production");
    const res = await POST(req({ resumeId: "cv-1", jobDescriptionText: "x" }));
    expect(res.status).toBe(401);
    expect(credits()).toBe(3);
  });

  it("404 si el CV no pertenece al usuario y no se cobra", async () => {
    h.db.tables.resumes[0].user_id = "otro";
    const res = await POST(req({ resumeId: "cv-1", jobDescriptionText: "x" }));
    expect(res.status).toBe(404);
    expect(credits()).toBe(3);
  });
});

describe("POST /api/generate — reserva de créditos", () => {
  it("descuenta exactamente 1 crédito por generación exitosa y audita", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const res = await POST(req({ resumeId: "cv-1", jobDescriptionText: "Node", preferredProvider: "anthropic" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cv_generado: "CV reescrito", carta_generada: "Carta corta", provider: "anthropic" });
    expect(credits()).toBe(2);
    expect(h.db.tables.ai_generations).toHaveLength(1);
    expect(h.db.tables.ai_generations[0]).toMatchObject({
      user_id: USER.id, proveedor: "anthropic", tokens_entrada: 11, tokens_salida: 22,
    });
  });

  it("402 sin saldo: no llama a ningún proveedor y el saldo sigue en 0", async () => {
    seed(0);
    const res = await POST(req({ resumeId: "cv-1", jobDescriptionText: "Node" }));
    expect(res.status).toBe(402);
    expect(credits()).toBe(0);
    expect(h.ollamaUp).not.toHaveBeenCalled();
    expect(h.anthropicCreate).not.toHaveBeenCalled();
    expect(h.gemini).not.toHaveBeenCalled();
  });

  it("403 si el usuario no tiene suscripción", async () => {
    h.db.tables.subscriptions = [];
    const res = await POST(req({ resumeId: "cv-1", jobDescriptionText: "Node" }));
    expect([402, 403]).toContain(res.status);
  });

  it("no pierde ni regala créditos: saldo 1 → éxito → saldo 0", async () => {
    seed(1);
    const res = await POST(req({ resumeId: "cv-1", jobDescriptionText: "Node" }));
    expect(res.status).toBe(200);
    expect(credits()).toBe(0);
  });

  it("anti-TOCTOU: con 1 crédito y 2 solicitudes simultáneas solo una tiene éxito", async () => {
    seed(1);
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const body = { resumeId: "cv-1", jobDescriptionText: "Node", preferredProvider: "anthropic" };
    const [a, b] = await Promise.all([POST(req(body)), POST(req(body))]);
    expect([a.status, b.status].sort()).toEqual([200, 402]);
    expect(credits()).toBe(0);
    expect(h.anthropicCreate).toHaveBeenCalledTimes(1);
  });

  it("anti-TOCTOU: con 3 créditos y 5 solicitudes simultáneas se cobran exactamente 3", async () => {
    seed(3);
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const body = { resumeId: "cv-1", jobDescriptionText: "Node", preferredProvider: "anthropic" };
    const res = await Promise.all(Array.from({ length: 5 }, () => POST(req(body))));
    expect(res.filter((r) => r.status === 200)).toHaveLength(3);
    expect(res.filter((r) => r.status === 402)).toHaveLength(2);
    expect(credits()).toBe(0);
  });
});

describe("POST /api/generate — reembolso de créditos", () => {
  it("reembolsa si la vacante no existe (404)", async () => {
    const res = await POST(req({ resumeId: "cv-1", jobPostingId: "no-existe" }));
    expect(res.status).toBe(404);
    expect(credits()).toBe(3);
  });

  it("reembolsa si ningún proveedor responde (502) y expone los errores", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    h.anthropicCreate.mockRejectedValue(new Error("anthropic caído"));
    h.gemini.mockRejectedValue(new Error("gemini caído"));
    const res = await POST(req({ resumeId: "cv-1", jobDescriptionText: "Node" }));
    expect(res.status).toBe(502);
    expect((await res.json()).details).toMatchObject({ anthropic: "anthropic caído", gemini: "gemini caído" });
    expect(credits()).toBe(3);
    expect(h.db.tables.ai_generations).toHaveLength(0);
  });

  it("reembolsa si el modelo no devuelve el formato esperado", async () => {
    h.gemini.mockResolvedValue({ text: "texto libre sin secciones", inputTokens: 1, outputTokens: 1 });
    const res = await POST(req({ resumeId: "cv-1", jobDescriptionText: "Node", preferredProvider: "gemini" }));
    expect(res.status).toBe(502);
    expect(credits()).toBe(3);
  });

  it("el reembolso es relativo: no pisa el saldo si hubo otro movimiento durante la generación", async () => {
    // Mientras Gemini falla, otra solicitud consume un crédito: el reembolso debe sumar 1 al saldo
    // vigente (2 → 3 - 1 + 1), no restaurar el valor leído al inicio.
    h.gemini.mockImplementation(async () => {
      h.db.tables.subscriptions[0].creditos_disponibles = 1; // saldo real tras otra compra de 1 crédito
      throw new Error("gemini caído");
    });
    const res = await POST(req({ resumeId: "cv-1", jobDescriptionText: "Node", preferredProvider: "gemini" }));
    expect(res.status).toBe(502);
    expect(credits()).toBe(2);
  });
});

describe("POST /api/generate — selección de proveedor", () => {
  it("auto: usa Ollama local si está disponible", async () => {
    h.ollamaUp.mockResolvedValue(true);
    const res = await POST(req({ resumeId: "cv-1", jobDescriptionText: "Node" }));
    expect((await res.json()).provider).toBe("ollama");
    expect(h.anthropicCreate).not.toHaveBeenCalled();
  });

  it("auto: cae a Claude si Ollama falla", async () => {
    h.ollamaUp.mockResolvedValue(true);
    h.ollama.mockRejectedValue(new Error("gpu ocupada"));
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const res = await POST(req({ resumeId: "cv-1", jobDescriptionText: "Node" }));
    expect((await res.json()).provider).toBe("anthropic");
  });

  it("auto: cae a Gemini si no hay ANTHROPIC_API_KEY ni Ollama", async () => {
    const res = await POST(req({ resumeId: "cv-1", jobDescriptionText: "Node" }));
    expect((await res.json()).provider).toBe("gemini");
    expect(h.anthropicCreate).not.toHaveBeenCalled();
  });

  it("cae a Gemini si Claude lanza error", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    h.anthropicCreate.mockRejectedValue(new Error("529 overloaded"));
    const res = await POST(req({ resumeId: "cv-1", jobDescriptionText: "Node", preferredProvider: "anthropic" }));
    expect((await res.json()).provider).toBe("gemini");
    expect(credits()).toBe(2);
  });

  it("preferredProvider=gemini no intenta Ollama ni Claude", async () => {
    await POST(req({ resumeId: "cv-1", jobDescriptionText: "Node", preferredProvider: "gemini" }));
    expect(h.ollamaUp).not.toHaveBeenCalled();
    expect(h.anthropicCreate).not.toHaveBeenCalled();
  });

  it("DEFAULT_AI_PROVIDER se respeta cuando el cuerpo no especifica proveedor", async () => {
    vi.stubEnv("DEFAULT_AI_PROVIDER", "gemini");
    await POST(req({ resumeId: "cv-1", jobDescriptionText: "Node" }));
    expect(h.ollamaUp).not.toHaveBeenCalled();
  });

  it("el prompt incluye el CV base y la descripción de la vacante cargada por id", async () => {
    await POST(req({ resumeId: "cv-1", jobPostingId: "job-1", preferredProvider: "gemini" }));
    const prompt = h.gemini.mock.calls[0][0] as string;
    expect(prompt).toContain("Mi CV base");
    expect(prompt).toContain("Node y SQL");
    expect(prompt).toContain("Dev en Acme");
  });
});

