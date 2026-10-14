// Tests del matcher: node --test extension/test
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const M = require("../matcher.js");

const NEW_FORMAT = `### Tell us about your experience. (300–2000)
Backend engineer with 5+ years at Open Intelligence.

### Are you already legally authorized to work in the United States? (sin límite)
No. I'm based in Colombia and would work remotely from Colombia.

### Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)?
No. I'm applying to work remotely from Colombia.

### What is your salary expectation?
[COMPLETAR: expectativa salarial en USD]

PENDIENTES:
- salario`;

const OLD_FORMAT = `- Location/authorization: Based in Colombia; available as contractor or employee for remote work from Colombia.
- Years: SQL 5+; Oracle 5+; Python (Pandas/NumPy): personal projects.
- Availability: [completar].`;

test("parsea el formato nuevo con límites y pendientes", () => {
  const items = M.parseAnswers(NEW_FORMAT);
  assert.equal(items.length, 4);
  assert.equal(items[0].question, "Tell us about your experience.");
  assert.deepEqual(items[0].limit, { min: 300, max: 2000 });
  assert.equal(items[0].intent, "experience");
  assert.equal(items[1].intent, "us_auth");
  assert.equal(items[2].intent, "sponsorship");
  assert.equal(items[3].pending, true);
  assert.ok(!items[3].answer.includes("PENDIENTES"));
});

test("parsea el formato antiguo de viñetas", () => {
  const items = M.parseAnswers(OLD_FORMAT);
  assert.equal(items.length, 3);
  assert.equal(items[0].intent, "based");
  assert.equal(items[2].pending, true);
});

test("empareja etiquetas reales de formularios por intención", () => {
  const items = M.withDefaults(M.parseAnswers(NEW_FORMAT));
  const cases = [
    ["Are you legally authorized to work in the US?*", "us_auth"],
    ["Will you now or in the future require sponsorship for employment visa status?", "sponsorship"],
    ["Where are you based?", "based"],
    ["How many years of experience do you have working with Python?", "python_years"],
    ["Tell us about your experience.", "experience"],
  ];
  for (const [label, intent] of cases) {
    const m = M.matchQuestion(label, items);
    assert.ok(m, `sin match para: ${label}`);
    assert.equal(m.item.intent, intent, label);
  }
});

test("nunca responde autorización EE.UU. con la respuesta de ubicación", () => {
  const items = M.parseAnswers(OLD_FORMAT); // sin defaults: solo trae 'based'
  const m = M.matchQuestion("Are you legally authorized to work in the United States?", items);
  assert.equal(m, null);
});

test("no inventa match para preguntas desconocidas", () => {
  const items = M.withDefaults(M.parseAnswers(NEW_FORMAT));
  assert.equal(M.matchQuestion("Do you have a driver's license?", items), null);
  assert.equal(M.matchQuestion("Pronouns", items), null);
});

test("elige la opción correcta en selects de sí/no", () => {
  const opts = ["Select...", "Yes", "No"];
  assert.equal(M.pickOption(opts, "No. I'm based in Colombia."), 2);
  assert.equal(M.pickOption(["--", "Sí", "No"], "Sí, tengo 5+ años."), 1);
  assert.equal(M.pickOption(opts, "I don't have professional Python experience"), -1);
  assert.equal(M.pickOption(["Argentina", "Colombia", "Mexico"], "Colombia"), 1);
});

test("respuestas base cubren filtros si la vacante no los trae", () => {
  const items = M.withDefaults([]);
  const m = M.matchQuestion("Are you authorized to work in the United States?", items);
  assert.match(m.item.answer, /^No\./);
});

test("encuentra la vacante del tracker para la pestaña abierta", () => {
  const vacantes = [
    { id: 1, empresa: "Backblaze", url: "https://job-boards.greenhouse.io/backblaze/jobs/5287532008", notas: "" },
    { id: 2, empresa: "OneSix", url: "https://himalayas.app/companies/onesix/jobs/data-engineer", notas: "ATS: Lever | form: https://jobs.lever.co/onesix/abc-123/apply" },
    { id: 3, empresa: "ClanX (para Periskope)", url: "https://himalayas.app/companies/clanx/jobs/ai-engineer-remote", notas: "" },
  ];
  assert.equal(M.matchVacante("https://job-boards.greenhouse.io/backblaze/jobs/5287532008?gh_src=x", vacantes).vacante.id, 1);
  assert.equal(M.matchVacante("https://jobs.lever.co/onesix/abc-123/apply", vacantes).vacante.id, 2);
  assert.equal(M.matchVacante("https://jobs.ashbyhq.com/clanx/999/application", vacantes).vacante.id, 3);
  assert.equal(M.matchVacante("https://jobs.lever.co/otraempresa/xyz", vacantes), null);
});
