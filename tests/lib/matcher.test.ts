import { describe, expect, it } from "vitest";
import { calculateAtsMatch, getQuickAtsScore } from "@/lib/ats/matcher";

const JOB = `We need a senior engineer with TypeScript, React and Node.js experience.
You will build REST APIs on AWS using Docker and PostgreSQL. SQL skills are a must.
TypeScript, TypeScript everywhere. Strong communication and leadership.`;

describe("calculateAtsMatch", () => {
  it("devuelve score 0 y mensaje cuando no hay descripción de vacante", () => {
    for (const empty of ["", "   "]) {
      const r = calculateAtsMatch(empty, "cualquier cv");
      expect(r.overallScore).toBe(0);
      expect(r.grade).toBe("Bajo");
      expect(r.gradeColor).toBe("rose");
      expect(r.matchedKeywords).toEqual([]);
      expect(r.recommendations).toHaveLength(1);
    }
  });

  it("un CV que cubre todas las keywords obtiene nivel Excelente", () => {
    const cv = `${JOB}\nReduced latency by 35% and led a team of 6 engineers, saving $50 and 20 hours.`;
    const r = calculateAtsMatch(JOB, cv);
    expect(r.missingKeywords).toEqual([]);
    expect(r.overallScore).toBeGreaterThanOrEqual(80);
    expect(r.grade).toBe("Excelente");
    expect(r.gradeColor).toBe("emerald");
    expect(r.stats.hardSkillsScore).toBe(100);
  });

  it("un CV sin relación obtiene nivel Bajo y lista las keywords ausentes", () => {
    const r = calculateAtsMatch(JOB, "Chef con diez anos de cocina italiana y gestion de restaurantes.");
    expect(r.matchedKeywords).toEqual([]);
    expect(r.overallScore).toBeLessThan(50);
    expect(r.grade).toBe("Bajo");
    const missing = r.missingKeywords.map((k) => k.term.toLowerCase());
    expect(missing).toEqual(expect.arrayContaining(["typescript", "react", "sql"]));
  });

  it("separa keywords coincidentes y ausentes y cuenta ocurrencias", () => {
    const r = calculateAtsMatch(JOB, "Built apps with TypeScript and React.");
    const matched = r.matchedKeywords.map((k) => k.term);
    expect(matched).toEqual(expect.arrayContaining(["typescript", "react"]));
    const ts = r.matchedKeywords.find((k) => k.term === "typescript")!;
    expect(ts.inJobCount).toBe(3);
    expect(ts.inCvCount).toBe(1);
    expect(ts.importance).toBe("high");
    expect(r.missingKeywords.map((k) => k.term)).toContain("docker");
    expect(r.stats.totalJobKeywords).toBe(r.matchedKeywords.length + r.missingKeywords.length);
    expect(r.stats.matchedKeywordsCount).toBe(r.matchedKeywords.length);
  });

  it("ordena las ausentes por importancia y coincidentes por frecuencia", () => {
    const r = calculateAtsMatch(JOB, "TypeScript React");
    const freq = r.matchedKeywords.map((k) => k.inJobCount);
    expect(freq).toEqual([...freq].sort((a, b) => b - a));
    const rank = { high: 3, medium: 2, low: 1 } as const;
    const imp = r.missingKeywords.map((k) => rank[k.importance]);
    expect(imp).toEqual([...imp].sort((a, b) => b - a));
  });

  it("respeta límites de palabra y términos con símbolos (C++, C#, Node.js)", () => {
    const job = "Experience with C++, C# and Node.js. Also javascripty is not a thing; Java is.";
    const r = calculateAtsMatch(job, "I write c++ and C# daily, plus node.js.");
    const matched = r.matchedKeywords.map((k) => k.term);
    expect(matched).toEqual(expect.arrayContaining(["c++", "c#", "node.js"]));
    // "java" aparece como palabra suelta en la oferta pero no en el CV; "javascripty" no cuenta como javascript
    expect(r.missingKeywords.map((k) => k.term)).toContain("java");
    expect(r.matchedKeywords.map((k) => k.term)).not.toContain("javascript");
  });

  it("detecta siglas de la whitelist y descarta mayúsculas arbitrarias", () => {
    const r = calculateAtsMatch("Knowledge of AWS and CI is needed. URGENT HIRE ASAP.", "AWS");
    const terms = [...r.matchedKeywords, ...r.missingKeywords].map((k) => k.term.toLowerCase());
    expect(terms).toContain("aws");
    expect(terms).not.toContain("urgent");
    expect(terms).not.toContain("asap");
  });

  it("cuenta métricas cuantificables y bonifica con tope de 10 puntos", () => {
    const base = "TypeScript";
    const few = calculateAtsMatch("TypeScript developer wanted", base);
    const many = calculateAtsMatch(
      "TypeScript developer wanted",
      `${base} 10% 20% 30% 40% 50% 60% 70% 80% 90% 100% 5 6 7 8`
    );
    expect(many.stats.quantifiableMetricsCount).toBeGreaterThan(few.stats.quantifiableMetricsCount);
    expect(many.overallScore).toBeLessThanOrEqual(100);
    expect(many.overallScore - few.overallScore).toBeLessThanOrEqual(10);
    expect(few.recommendations.some((x) => /cuantificables/i.test(x))).toBe(true);
  });

  it("recomienda incorporar requisitos clave ausentes", () => {
    const r = calculateAtsMatch(JOB, "Cocinero");
    expect(r.recommendations.some((x) => x.includes("ausentes"))).toBe(true);
  });

  it("sin keywords detectables usa un score base según longitud del CV", () => {
    const job = "Looking for a friendly and curious person to join our team.";
    expect(calculateAtsMatch(job, "corto").overallScore).toBe(40);
    expect(calculateAtsMatch(job, "x".repeat(250)).overallScore).toBe(70);
  });

  it("los umbrales de nivel son consistentes con el score", () => {
    const r = calculateAtsMatch(JOB, "TypeScript React Node.js SQL AWS Docker PostgreSQL REST");
    const expected =
      r.overallScore >= 80 ? "Excelente" : r.overallScore >= 65 ? "Bueno" : r.overallScore >= 50 ? "Regular" : "Bajo";
    expect(r.grade).toBe(expected);
    expect(r.summary).toContain(`${r.overallScore}%`);
  });

  it("es determinista", () => {
    expect(calculateAtsMatch(JOB, "TypeScript")).toEqual(calculateAtsMatch(JOB, "TypeScript"));
  });
});

describe("getQuickAtsScore", () => {
  it("devuelve null si falta vacante o CV", () => {
    expect(getQuickAtsScore(null, "cv")).toBeNull();
    expect(getQuickAtsScore("job", undefined)).toBeNull();
    expect(getQuickAtsScore("", "")).toBeNull();
  });

  it("resume score, nivel y color del análisis completo", () => {
    const full = calculateAtsMatch(JOB, "TypeScript React");
    expect(getQuickAtsScore(JOB, "TypeScript React")).toEqual({
      score: full.overallScore,
      grade: full.grade,
      color: full.gradeColor,
    });
  });
});
