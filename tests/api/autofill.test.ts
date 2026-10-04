import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "../helpers/fakeSupabase";
import { makeReq } from "../helpers/mockServer";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock("@/lib/supabase/server", async () => {
  const m = await import("../helpers/fakeSupabase");
  return { createClient: async () => m.fakeClient(h.db), createServiceClient: () => m.fakeClient(h.db) };
});

import { GET } from "@/app/api/worker/autofill/route";

beforeEach(() => {
  h.db = createFakeDb({
    applications: [{
      id: "a1", user_id: "u1", cv_generado: "CV", carta_generada: "Carta",
      job_posting: { titulo: "Dev", empresa: "Acme", tipo_ats: "lever", url: "https://jobs.lever.co/acme/1" },
    }],
    profiles: [{ user_id: "u1", nombre_completo: "Ana Pérez", telefono: "123" }],
  }, { id: "u1", email: "ana@example.com" });
});

describe("GET /api/worker/autofill", () => {
  it("400 sin application_id", async () => {
    expect((await GET(makeReq("/api/worker/autofill"))).status).toBe(400);
  });

  it("sesión de usuario: devuelve el payload con el mapeo del ATS", async () => {
    const res = await GET(makeReq("/api/worker/autofill?application_id=a1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, applicationId: "a1", jobTitle: "Dev", jobCompany: "Acme" });
    expect(body.payload.ats).toBe("lever");
    expect(body.payload.fields.find((f: { field: string }) => f.field === "Correo").value).toBe("ana@example.com");
    expect(body.payload.fields.find((f: { field: string }) => f.field === "Comentarios / Carta").value).toBe("Carta");
  });

  it("un usuario no accede a postulaciones ajenas (404)", async () => {
    h.db.user = { id: "otro", email: "o@example.com" };
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WORKER_SECRET", "s3cret");
    expect((await GET(makeReq("/api/worker/autofill?application_id=a1"))).status).toBe(404);
  });

  it("401 sin sesión y sin secreto de worker en producción", async () => {
    h.db.user = null;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WORKER_SECRET", "s3cret");
    expect((await GET(makeReq("/api/worker/autofill?application_id=a1"))).status).toBe(401);
    expect((await GET(makeReq("/api/worker/autofill?application_id=a1", { headers: { "x-worker-secret": "mal" } }))).status).toBe(401);
  });

  it("secreto de worker válido: accede sin sesión y resuelve el email del dueño", async () => {
    h.db.user = null;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WORKER_SECRET", "s3cret");
    const res = await GET(makeReq("/api/worker/autofill?application_id=a1", { headers: { "x-worker-secret": "s3cret" } }));
    expect(res.status).toBe(200);
    const { payload } = await res.json();
    expect(payload.fields.find((f: { field: string }) => f.field === "Correo").value).toBe("worker@example.com");
  });

  it("producción sin ningún secreto configurado nunca autentica como worker", async () => {
    h.db.user = null;
    vi.stubEnv("NODE_ENV", "production");
    const res = await GET(makeReq("/api/worker/autofill?application_id=a1", { headers: { "x-worker-secret": "" } }));
    expect(res.status).toBe(401);
  });
});
