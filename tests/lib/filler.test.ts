import { describe, expect, it } from "vitest";
import { buildAtsAutoFillPayload, type CandidateData } from "@/lib/worker/ats/filler";

const candidate: CandidateData = {
  email: "ana@example.com",
  cartaText: "Hola, me interesa el puesto.",
  profile: {
    nombre_completo: "Ana María López Pérez",
    telefono: "+57 300 000 0000",
    linkedin_url: "https://linkedin.com/in/ana",
    github_url: "https://github.com/ana",
    portafolio_url: "https://ana.dev",
    ubicacion: "Bogotá",
  },
};

const byField = (p: ReturnType<typeof buildAtsAutoFillPayload>) =>
  Object.fromEntries(p.fields.map((f) => [f.field, f]));

describe("buildAtsAutoFillPayload", () => {
  it("Greenhouse: separa nombre y apellido y usa selectores por id", () => {
    const p = buildAtsAutoFillPayload("greenhouse", "https://boards.greenhouse.io/x/jobs/1", candidate);
    const f = byField(p);
    expect(p.ats).toBe("greenhouse");
    expect(p.targetUrl).toBe("https://boards.greenhouse.io/x/jobs/1");
    expect(f["Nombre"]).toMatchObject({ selector: "#first_name", value: "Ana" });
    expect(f["Apellido"]).toMatchObject({ selector: "#last_name", value: "María López Pérez" });
    expect(f["Correo"]).toMatchObject({ selector: "#email", value: "ana@example.com" });
    expect(f["Teléfono"].selector).toBe("#phone");
    expect(f["Carta de Presentación"].value).toBe(candidate.cartaText);
  });

  it("Lever: usa nombre completo y campos urls[...]", () => {
    const f = byField(buildAtsAutoFillPayload("lever", "u", candidate));
    expect(f["Nombre completo"]).toMatchObject({ selector: 'input[name="name"]', value: "Ana María López Pérez" });
    expect(f["LinkedIn"].selector).toBe('input[name="urls[LinkedIn]"]');
    expect(f["GitHub"].selector).toBe('input[name="urls[GitHub]"]');
    expect(f["Portafolio"].selector).toBe('input[name="urls[Portfolio]"]');
    expect(f["Ubicación"].value).toBe("Bogotá");
    expect(f["Comentarios / Carta"].selector).toContain('textarea[name="comments"]');
  });

  it("Ashby: selectores flexibles por name/type", () => {
    const f = byField(buildAtsAutoFillPayload("ashby", "u", candidate));
    expect(f["Correo"].selector).toContain('input[type="email"]');
    expect(f["Teléfono"].selector).toContain('input[name="phoneNumber"]');
    expect(f["Carta de Presentación"].selector).toContain("coverLetter");
  });

  it("es insensible a mayúsculas en el nombre del ATS", () => {
    expect(buildAtsAutoFillPayload("LEVER", "u", candidate).ats).toBe("lever");
  });

  it.each([null, "workday", "smartrecruiters", "desconocido"])("usa el mapeo genérico para ATS=%s", (ats) => {
    const p = buildAtsAutoFillPayload(ats, "u", candidate);
    const f = byField(p);
    expect(p.ats).toBe(ats ? ats.toLowerCase() : "generic");
    expect(f["Correo"].selector).toContain('input[type="email"]');
    expect(f["Carta"].selector).toContain("textarea");
    // el genérico no hace distinción nombre/apellido
    expect(f["Nombre completo"].value).toBe("Ana María López Pérez");
  });

  it("omite los campos sin dato en vez de rellenar vacíos", () => {
    const p = buildAtsAutoFillPayload("lever", "u", { email: "", profile: {} });
    expect(p.fields).toEqual([]);
  });

  it("un solo nombre no genera apellido en Greenhouse", () => {
    const p = buildAtsAutoFillPayload("greenhouse", "u", { email: "a@b.c", profile: { nombre_completo: "Madonna" } });
    const f = byField(p);
    expect(f["Nombre"].value).toBe("Madonna");
    expect(f["Apellido"]).toBeUndefined();
  });

  it("el script incrusta los campos como JSON, dispara input/change y no envía el formulario", () => {
    const p = buildAtsAutoFillPayload("lever", "u", candidate);
    expect(p.script).toContain(JSON.stringify(p.fields));
    expect(p.script).toContain("dispatchEvent(new Event('input'");
    expect(p.script).toContain("dispatchEvent(new Event('change'");
    expect(p.script).not.toMatch(/\.submit\(|type=["']submit|\.click\(\)/);
    expect(() => new Function(p.script)).not.toThrow(); // sintaxis válida
  });
});
