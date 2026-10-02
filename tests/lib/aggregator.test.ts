import { describe, expect, it, vi } from "vitest";
import {
  detectAts,
  fetchArbeitnowJobs,
  fetchRemotiveJobs,
  stripHtml,
  syncJobsToSupabase,
} from "@/lib/jobs/aggregator";
import { createFakeDb, fakeClient } from "../helpers/fakeSupabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const remotivePayload = {
  jobs: [
    {
      id: 1,
      url: "https://boards.greenhouse.io/acme/jobs/1 ",
      title: "  Senior Backend Engineer ",
      company_name: " Acme ",
      publication_date: "2026-09-01T10:00:00",
      candidate_required_location: "Worldwide",
      description: "<p>Build <b>APIs</b> &amp; services</p><ul><li>Node</li><li>SQL</li></ul>",
    },
    { id: 2, url: "https://remotive.com/job/2", title: "Designer", company_name: "Foo" },
  ],
};

const arbeitnowPayload = {
  data: [
    {
      slug: "a",
      company_name: "Beta GmbH",
      title: "Platform Engineer",
      description: "<p>K8s</p>",
      remote: true,
      url: "https://jobs.lever.co/beta/123",
      location: "Berlin",
      created_at: 1788000000,
    },
    {
      slug: "b",
      company_name: "Gamma",
      title: "Onsite Dev",
      description: "",
      remote: false,
      url: "https://www.arbeitnow.com/jobs/b",
    },
  ],
};

describe("stripHtml", () => {
  it("devuelve cadena vacía para null/undefined/vacío", () => {
    expect(stripHtml(null)).toBe("");
    expect(stripHtml(undefined)).toBe("");
    expect(stripHtml("")).toBe("");
  });

  it("convierte bloques a saltos de línea, viñetas y decodifica entidades", () => {
    const out = stripHtml("<h2>Rol</h2><p>A &amp; B &quot;x&quot; &#39;y&#39; &lt;z&gt;&nbsp;ok</p><ul><li>uno</li><li>dos</li></ul>");
    expect(out).toContain("Rol");
    expect(out).toContain(`A & B "x" 'y' <z> ok`);
    expect(out).toContain("• uno\n• dos");
    expect(stripHtml('<div class="x"><span>hola</span></div>')).toBe("hola");
  });

  it("colapsa 3+ saltos de línea y normaliza CRLF", () => {
    expect(stripHtml("a<br>\r\n<br><br><br>b")).not.toMatch(/\n{3,}/);
    expect(stripHtml("a\r\nb")).toBe("a\nb");
  });
});

describe("detectAts", () => {
  it.each([
    ["https://boards.greenhouse.io/acme/jobs/1", "greenhouse"],
    ["https://job-boards.greenhouse.io/acme/jobs/1", "greenhouse"],
    ["https://jobs.lever.co/acme/abc", "lever"],
    ["https://jobs.ashbyhq.com/acme/abc", "ashby"],
    ["https://acme.wd1.myworkdayjobs.com/en-US/careers", "workday"],
    ["https://jobs.smartrecruiters.com/Acme/1", "smartrecruiters"],
    ["https://acme.breezy.hr/p/1", "breezy"],
    ["https://apply.workable.com/acme/j/1", "workable"],
    ["https://acme.bamboohr.com/careers/1", "bamboohr"],
    ["HTTPS://JOBS.LEVER.CO/ACME", "lever"],
  ])("%s → %s", (url, ats) => expect(detectAts(url)).toBe(ats));

  it("devuelve null para dominios desconocidos o URL vacía", () => {
    expect(detectAts("https://example.com/careers")).toBeNull();
    expect(detectAts("")).toBeNull();
  });
});

describe("fetchRemotiveJobs", () => {
  it("normaliza la respuesta (trim, ATS, remoto, HTML→texto, fechas ISO)", async () => {
    const fetchMock = vi.fn(async (_url: string) => jsonResponse(remotivePayload));
    vi.stubGlobal("fetch", fetchMock);

    const jobs = await fetchRemotiveJobs(10);

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://remotive.com/api/remote-jobs?limit=10");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      fuente: "remotive",
      titulo: "Senior Backend Engineer",
      empresa: "Acme",
      url: "https://boards.greenhouse.io/acme/jobs/1",
      tipo_ats: "greenhouse",
      remoto: true,
      ubicacion: "Worldwide",
    });
    expect(jobs[0].descripcion).toContain("Build APIs & services");
    expect(jobs[0].descripcion).toContain("• Node");
    expect(jobs[0].fecha_publicacion).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    // valores por defecto
    expect(jobs[1]).toMatchObject({ tipo_ats: null, ubicacion: "Remoto Global", descripcion: "" });
  });

  it("devuelve [] si la API responde con error HTTP", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 503)));
    expect(await fetchRemotiveJobs()).toEqual([]);
  });

  it("devuelve [] si falla la red o el JSON no trae jobs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    expect(await fetchRemotiveJobs()).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    expect(await fetchRemotiveJobs()).toEqual([]);
  });
});

describe("fetchArbeitnowJobs", () => {
  it("normaliza (unix seconds → ISO, remoto booleano, ubicación por defecto)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(arbeitnowPayload)));
    const jobs = await fetchArbeitnowJobs();

    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      fuente: "arbeitnow",
      titulo: "Platform Engineer",
      empresa: "Beta GmbH",
      tipo_ats: "lever",
      remoto: true,
      ubicacion: "Berlin",
      fecha_publicacion: new Date(1788000000 * 1000).toISOString(),
    });
    expect(jobs[1]).toMatchObject({ remoto: false, ubicacion: "No especificado", tipo_ats: null });
    expect(jobs[1].fecha_publicacion).toBeTruthy(); // fallback a "ahora"
  });

  it("devuelve [] ante status no OK o excepción", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));
    expect(await fetchArbeitnowJobs()).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await fetchArbeitnowJobs()).toEqual([]);
  });
});

describe("syncJobsToSupabase", () => {
  const route = (remotive: unknown, arbeitnow: unknown, status = 200) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("remotive") ? jsonResponse(remotive, status) : jsonResponse(arbeitnow, status)
      )
    );

  it("hace upsert idempotente por (fuente,url) y reporta conteos por fuente", async () => {
    route(remotivePayload, arbeitnowPayload);
    const db = createFakeDb();
    const client = fakeClient(db) as unknown as SupabaseClient;

    const first = await syncJobsToSupabase(client);
    expect(first).toEqual({ success: true, totalSynced: 4, sources: { remotive: 2, arbeitnow: 2 }, errors: undefined });
    expect(db.tables.job_postings).toHaveLength(4);
    const upsertOpts = db.calls.find((c) => c.method === "upsert")!.args[1];
    expect(upsertOpts).toMatchObject({ onConflict: "fuente,url" });

    const second = await syncJobsToSupabase(client);
    expect(second.totalSynced).toBe(4);
    expect(db.tables.job_postings).toHaveLength(4); // sin duplicados
  });

  it("falla con mensaje claro si ninguna fuente responde, sin tocar la base", async () => {
    route({}, {}, 500);
    const db = createFakeDb();
    const res = await syncJobsToSupabase(fakeClient(db) as unknown as SupabaseClient);
    expect(res.success).toBe(false);
    expect(res.totalSynced).toBe(0);
    expect(res.errors?.[0]).toMatch(/No se pudieron obtener/);
    expect(db.calls).toHaveLength(0);
  });

  it("parte en lotes de 40 y reporta errores del upsert sin contarlos", async () => {
    const many = {
      jobs: Array.from({ length: 85 }, (_, i) => ({
        id: i, url: `https://remotive.com/j/${i}`, title: `T${i}`, company_name: "C",
      })),
    };
    route(many, { data: [] });
    const db = createFakeDb();
    db.failures["job_postings.upsert"] = "boom";
    const res = await syncJobsToSupabase(fakeClient(db) as unknown as SupabaseClient);
    expect(db.calls.filter((c) => c.method === "upsert")).toHaveLength(3); // 40+40+5
    expect(res.success).toBe(false);
    expect(res.totalSynced).toBe(0);
    expect(res.errors).toEqual(["boom", "boom", "boom"]);
  });
});
