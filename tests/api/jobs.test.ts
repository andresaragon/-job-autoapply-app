import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "../helpers/fakeSupabase";
import { makeReq } from "../helpers/mockServer";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock("@/lib/supabase/server", async () => {
  const m = await import("../helpers/fakeSupabase");
  return { createClient: async () => m.fakeClient(h.db), createServiceClient: () => m.fakeClient(h.db) };
});

import { GET, POST } from "@/app/api/jobs/route";
import { POST as SYNC } from "@/app/api/jobs/sync/route";

const USER = { id: "u1", email: "u@example.com" };
const callsOf = (m: string) => h.db.calls.filter((c) => c.method === m);

beforeEach(() => {
  h.db = createFakeDb({
    job_postings: [
      { id: "1", titulo: "A", remoto: true, tipo_ats: "lever" },
      { id: "2", titulo: "B", remoto: false, tipo_ats: "greenhouse" },
    ],
  }, USER);
});

describe("GET /api/jobs", () => {
  it("lista vacantes con paginación por defecto", async () => {
    const res = await GET(makeReq("/api/jobs"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ total: 2, limit: 30, offset: 0 });
    expect(body.jobs).toHaveLength(2);
    expect(callsOf("range")[0].args).toEqual([0, 29]);
  });

  it("acota limit a [1,100] y offset a >= 0", async () => {
    await GET(makeReq("/api/jobs?limit=9999&offset=-5"));
    expect(callsOf("range")[0].args).toEqual([0, 99]);
    h.db.calls.length = 0;
    await GET(makeReq("/api/jobs?limit=0&offset=10"));
    expect(callsOf("range")[0].args).toEqual([10, 10]);
  });

  it("aplica filtros de búsqueda, modalidad y ATS", async () => {
    const res = await GET(makeReq("/api/jobs?q=node&remote=true&ats=lever"));
    expect(callsOf("or")[0].args[0]).toBe("titulo.ilike.%node%,empresa.ilike.%node%,ubicacion.ilike.%node%");
    expect((await res.json()).jobs.map((j: { id: string }) => j.id)).toEqual(["1"]);
    const res2 = await GET(makeReq("/api/jobs?remote=false"));
    expect((await res2.json()).jobs.map((j: { id: string }) => j.id)).toEqual(["2"]);
  });

  it("500 con el mensaje de la base si falla la consulta", async () => {
    h.db.failures["job_postings.select"] = "db caída";
    const res = await GET(makeReq("/api/jobs"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("db caída");
  });
});

describe("POST /api/jobs", () => {
  const post = (body: unknown) => POST(makeReq("/api/jobs", { method: "POST", body }));

  it("401 en producción sin sesión", async () => {
    h.db.user = null;
    vi.stubEnv("NODE_ENV", "production");
    expect((await post({ titulo: "t", empresa: "e", url: "https://x.y" })).status).toBe(401);
  });

  it("400 si faltan titulo, empresa o url", async () => {
    expect((await post({ titulo: "t", empresa: "e" })).status).toBe(400);
  });

  it("crea la vacante: limpia HTML, detecta ATS y fuente por dominio", async () => {
    const res = await post({
      titulo: " Dev ", empresa: " Acme ", url: "https://jobs.lever.co/acme/1",
      descripcion: "<p>Hola</p>", remoto: 1, ubicacion: " LATAM ",
    });
    expect(res.status).toBe(201);
    const { job } = await res.json();
    expect(job).toMatchObject({
      fuente: "jobs.lever.co", titulo: "Dev", empresa: "Acme", tipo_ats: "lever",
      remoto: true, ubicacion: "LATAM", descripcion: "Hola",
    });
  });

  it("fuente 'manual' si la URL no es parseable y es idempotente por (fuente,url)", async () => {
    await post({ titulo: "t", empresa: "e", url: "no-es-url" });
    await post({ titulo: "t2", empresa: "e", url: "no-es-url" });
    const manual = h.db.tables.job_postings.filter((j) => j.fuente === "manual");
    expect(manual).toHaveLength(1);
    expect(manual[0].titulo).toBe("t2");
  });
});

describe("POST /api/jobs/sync", () => {
  it("401 en producción sin sesión", async () => {
    h.db.user = null;
    vi.stubEnv("NODE_ENV", "production");
    expect((await SYNC()).status).toBe(401);
  });

  it("sincroniza desde fuentes simuladas y devuelve conteos", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true, status: 200,
      json: async () => String(url).includes("remotive")
        ? { jobs: [{ id: 1, url: "https://remotive.com/1", title: "R", company_name: "C" }] }
        : { data: [{ slug: "s", company_name: "C", title: "A", description: "", remote: true, url: "https://a.b/1" }] },
    })));
    const res = await SYNC();
    expect(await res.json()).toMatchObject({ success: true, totalSynced: 2, sources: { remotive: 1, arbeitnow: 1 } });
  });

  it("no hay llamadas de red reales: con fuentes caídas informa success=false", async () => {
    const res = await SYNC(); // fetch bloqueado por tests/setup.ts
    expect((await res.json()).success).toBe(false);
  });
});
