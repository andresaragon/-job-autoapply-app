import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "../helpers/fakeSupabase";
import { makeReq } from "../helpers/mockServer";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock("@/lib/supabase/server", async () => {
  const m = await import("../helpers/fakeSupabase");
  return { createClient: async () => m.fakeClient(h.db), createServiceClient: () => m.fakeClient(h.db) };
});

import { GET, POST } from "@/app/api/webhooks/n8n/route";

const auth = { "x-webhook-secret": "tok" };
const post = (body: unknown, headers: Record<string, string> = auth, qs = "") =>
  POST(makeReq(`/api/webhooks/n8n${qs}`, { method: "POST", body, headers }));

beforeEach(() => {
  vi.stubEnv("N8N_WEBHOOK_SECRET", "tok");
  h.db = createFakeDb({
    applications: [
      { id: "a1", estado: "borrador", created_at: "2026-01-01" },
      { id: "a2", estado: "enviada", created_at: "2026-01-02" },
      { id: "a3", estado: "lista_para_revision", created_at: "2026-01-03" },
    ],
    job_postings: [{ id: "j1", titulo: "Dev_*[x]", empresa: "Ac`me", url: "https://u", tipo_ats: "lever", remoto: true }],
  });
});

describe("webhook n8n — autenticación", () => {
  it("401 sin secreto o con secreto incorrecto", async () => {
    expect((await GET(makeReq("/api/webhooks/n8n"))).status).toBe(401);
    expect((await post({ action: "get_pending" }, { "x-webhook-secret": "mal" })).status).toBe(401);
  });

  it("acepta el secreto por header y por query", async () => {
    expect((await GET(makeReq("/api/webhooks/n8n", { headers: auth }))).status).toBe(200);
    expect((await GET(makeReq("/api/webhooks/n8n?secret=tok"))).status).toBe(200);
  });

  it("en producción sin secreto configurado rechaza todo (incluida la petición sin header)", async () => {
    vi.stubEnv("N8N_WEBHOOK_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect((await GET(makeReq("/api/webhooks/n8n"))).status).toBe(401);
    expect((await GET(makeReq("/api/webhooks/n8n", { headers: { "x-webhook-secret": "" } }))).status).toBe(401);
  });

  it("GET informa las acciones soportadas", async () => {
    const body = await (await GET(makeReq("/api/webhooks/n8n", { headers: auth }))).json();
    expect(body.supported_actions).toEqual(["sync_jobs", "get_pending", "update_status", "telegram_digest"]);
  });
});

describe("webhook n8n — acciones", () => {
  it("get_pending devuelve solo borradores y listas para revisión", async () => {
    const body = await (await post({ action: "get_pending" })).json();
    expect(body.pending_applications.map((a: { id: string }) => a.id).sort()).toEqual(["a1", "a3"]);
    expect(body.count).toBe(2);
  });

  it("update_status valida parámetros y fija fecha_envio al enviar", async () => {
    expect((await post({ action: "update_status", application_id: "a1" })).status).toBe(400);
    const res = await post({ action: "update_status", application_id: "a1", estado: "enviada" });
    expect(res.status).toBe(200);
    expect(h.db.tables.applications[0].estado).toBe("enviada");
    expect(h.db.tables.applications[0].fecha_envio).toBeTruthy();
  });

  it("telegram_digest escapa markdown y arma deep links con base_url", async () => {
    const body = await (await post({ action: "telegram_digest", base_url: "https://app.example.com" })).json();
    expect(body.count).toBe(1);
    expect(body.jobs[0]).toMatchObject({ titulo: "Dev   x", empresa: "Ac me", deep_link: "https://app.example.com/dashboard?job_id=j1" });
    expect(body.formatted_telegram_markdown).toContain("[ATS: LEVER]");
    expect(body.formatted_telegram_markdown).toContain("Remoto");
  });

  it("sync_jobs usa las fuentes simuladas", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ jobs: [], data: [] }) })));
    const body = await (await post({ action: "sync_jobs" })).json();
    expect(body.action).toBe("sync_jobs");
    expect(body.result.success).toBe(false); // sin ofertas
  });

  it("acción desconocida → 400; la acción también puede venir por query", async () => {
    expect((await post({ action: "borrar_todo" })).status).toBe(400);
    expect((await post({}, auth, "?action=get_pending")).status).toBe(200);
  });
});
