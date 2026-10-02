import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "../helpers/fakeSupabase";
import { makeReq } from "../helpers/mockServer";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock("@/lib/supabase/server", async () => {
  const m = await import("../helpers/fakeSupabase");
  return { createClient: async () => m.fakeClient(h.db), createServiceClient: () => m.fakeClient(h.db) };
});

import { GET, PUT } from "@/app/api/profile/route";

beforeEach(() => {
  h.db = createFakeDb({ profiles: [] }, { id: "u1", email: "u@example.com" });
});

describe("/api/profile", () => {
  it("401 sin sesión", async () => {
    h.db.user = null;
    expect((await GET()).status).toBe(401);
    expect((await PUT(makeReq("/p", { method: "PUT", body: {} }))).status).toBe(401);
  });

  it("GET sin perfil devuelve solo el email", async () => {
    expect(await (await GET()).json()).toEqual({ profile: { email: "u@example.com" } });
  });

  it("PUT hace upsert por user_id, recorta espacios y nulifica vacíos", async () => {
    const body = { nombre_completo: "  Ana  ", telefono: "", linkedin_url: " https://l.in/a " };
    const res = await PUT(makeReq("/p", { method: "PUT", body }));
    expect(res.status).toBe(200);
    expect(h.db.tables.profiles[0]).toMatchObject({
      user_id: "u1", nombre_completo: "Ana", telefono: null, linkedin_url: "https://l.in/a", github_url: null,
    });
    await PUT(makeReq("/p", { method: "PUT", body: { nombre_completo: "Ana B" } }));
    expect(h.db.tables.profiles).toHaveLength(1);
    expect((await (await GET()).json()).profile).toMatchObject({ nombre_completo: "Ana B", email: "u@example.com" });
  });

  it("PUT propaga errores de la base como 500", async () => {
    h.db.failures["profiles.upsert"] = "rls";
    const res = await PUT(makeReq("/p", { method: "PUT", body: {} }));
    expect(res.status).toBe(500);
  });
});
