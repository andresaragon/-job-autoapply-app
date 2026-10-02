import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "../helpers/fakeSupabase";
import { makeReq } from "../helpers/mockServer";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock("@/lib/supabase/server", async () => {
  const m = await import("../helpers/fakeSupabase");
  return { createClient: async () => m.fakeClient(h.db), createServiceClient: () => m.fakeClient(h.db) };
});

import { DELETE, GET, PATCH, POST } from "@/app/api/applications/route";

const USER = { id: "u1", email: "u@example.com" };

beforeEach(() => {
  h.db = createFakeDb({
    applications: [
      { id: "a1", user_id: "u1", estado: "borrador" },
      { id: "a2", user_id: "otro", estado: "borrador" },
    ],
  }, USER);
});

describe("/api/applications — autenticación", () => {
  it("devuelve 401 en todos los métodos sin sesión", async () => {
    h.db.user = null;
    expect((await GET()).status).toBe(401);
    expect((await POST(makeReq("/x", { method: "POST", body: {} }))).status).toBe(401);
    expect((await PATCH(makeReq("/x", { method: "PATCH", body: {} }))).status).toBe(401);
    expect((await DELETE(makeReq("/x?id=a1", { method: "DELETE" }))).status).toBe(401);
  });
});

describe("/api/applications", () => {
  it("GET solo consulta las postulaciones del usuario", async () => {
    const res = await GET();
    const { applications } = await res.json();
    expect(applications.map((a: { id: string }) => a.id)).toEqual(["a1"]);
  });

  it("POST valida job_posting_id y aplica defaults (borrador/manual)", async () => {
    expect((await POST(makeReq("/x", { method: "POST", body: {} }))).status).toBe(400);
    const res = await POST(makeReq("/x", { method: "POST", body: { job_posting_id: "j1" } }));
    expect(res.status).toBe(201);
    const { application } = await res.json();
    expect(application).toMatchObject({ user_id: "u1", estado: "borrador", modo: "manual", fecha_envio: null, resume_id: null });
  });

  it("POST con estado 'enviada' fija fecha_envio", async () => {
    const res = await POST(makeReq("/x", { method: "POST", body: { job_posting_id: "j1", estado: "enviada" } }));
    expect((await res.json()).application.fecha_envio).toBeTruthy();
  });

  it("PATCH exige id y estado, y solo modifica filas propias", async () => {
    expect((await PATCH(makeReq("/x", { method: "PATCH", body: { id: "a1" } }))).status).toBe(400);
    const ok = await PATCH(makeReq("/x", { method: "PATCH", body: { id: "a1", estado: "enviada" } }));
    expect(ok.status).toBe(200);
    expect(h.db.tables.applications[0]).toMatchObject({ estado: "enviada" });
    expect(h.db.tables.applications[0].fecha_envio).toBeTruthy();

    const foreign = await PATCH(makeReq("/x", { method: "PATCH", body: { id: "a2", estado: "oferta" } }));
    expect(foreign.status).toBe(500); // no encuentra fila propia (single falla)
    expect(h.db.tables.applications[1].estado).toBe("borrador");
  });

  it("DELETE exige id y no borra filas ajenas", async () => {
    expect((await DELETE(makeReq("/x", { method: "DELETE" }))).status).toBe(400);
    await DELETE(makeReq("/x?id=a2", { method: "DELETE" }));
    expect(h.db.tables.applications).toHaveLength(2);
    const res = await DELETE(makeReq("/x?id=a1", { method: "DELETE" }));
    expect(await res.json()).toEqual({ success: true, deletedId: "a1" });
    expect(h.db.tables.applications.map((a) => a.id)).toEqual(["a2"]);
  });
});
