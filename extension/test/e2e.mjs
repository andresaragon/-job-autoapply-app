// Prueba E2E de la extensión: npm run test:extension:e2e
//
// Abre Chromium con la extensión real cargada, sirve el fixture tipo Greenhouse por http y ejecuta
// desde el service worker lo mismo que el botón "Auto-Fill en 1-Clic" del popup (inyectar
// matcher.js + content.js y mandar auto_fill). La vacante está escrita aquí: no necesita red ni token.
// Requiere Chromium de Playwright: npx playwright install chromium
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(EXT, "test/fixtures/greenhouse-like.html");
const SHOT = process.env.E2E_SCREENSHOT || "";

const PROFILE = {
  fullName: "Santiago Aragón",
  firstName: "Santiago",
  lastName: "Aragón",
  email: "santiagoaragon.sistemas@gmail.com",
  phone: "+57 300 000 0000",
  linkedin: "https://linkedin.com/in/santiagoaragonguzman",
  location: "Cali, Colombia",
  salaryExpectation: "USD 3,500/month, negotiable",
};

const VACANTE = {
  id: "999",
  empresa: "Fixture Inc",
  fuente: "linkedin",
  carta: "Hello Fixture team,\n\nThis is the cover letter.",
  respuestas_sugeridas: [
    "- Location/authorization: Based in Colombia; available as contractor for remote work from Colombia.",
    "- Rate expectation: [completar en USD].",
  ].join("\n"),
};

const server = http.createServer((_, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(fs.readFileSync(FIXTURE));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

const ctx = await chromium.launchPersistentContext("", {
  headless: false,
  args: ["--headless=new", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1100, height: 1300 },
});

try {
  const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${server.address().port}/apply`);

  const result = await sw.evaluate(async ({ profile, vacante }) => {
    const [tab] = await chrome.tabs.query({ url: "http://localhost/*" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["matcher.js", "content.js"] });
    return chrome.tabs.sendMessage(tab.id, { action: "auto_fill", profile, vacante });
  }, { profile: PROFILE, vacante: VACANTE });

  const fields = await page.evaluate(() => {
    const color = (el) => {
      const b = el.style.borderColor;
      if (b.includes("245, 158, 11") || b === "#f59e0b") return "naranja";
      if (b.includes("16, 185, 129") || b === "#10b981") return "verde";
      return "";
    };
    const out = {};
    for (const el of document.querySelectorAll("input, textarea, select, fieldset")) {
      if (!el.id) continue;
      const value = el.tagName === "SELECT" ? el.options[el.selectedIndex].text : el.value;
      out[el.id] = { value, color: color(el) };
    }
    out.contractor.value = document.querySelector("input[name=contractor]:checked")?.value || "";
    return out;
  });
  if (SHOT) {
    await page.waitForTimeout(400); // dejar terminar la transición de color (0.3s)
    await page.screenshot({ path: SHOT, fullPage: true });
  }

  const ok = (id, value) => {
    assert.equal(fields[id].color, "verde", `${id} debería quedar verde`);
    if (value !== undefined) assert.equal(fields[id].value, value, `${id}: valor`);
  };
  const review = (id) => assert.equal(fields[id].color, "naranja", `${id} debería quedar naranja`);

  assert.equal(result.success, true);
  ok("first_name", "Santiago");
  ok("email", PROFILE.email);
  ok("q2"); // Where are you based?
  assert.match(fields.q2.value, /^Based in Colombia/);
  ok("q3", "No"); // autorizado en EE.UU.
  ok("q4", "No"); // visa
  ok("q7", PROFILE.salaryExpectation); // el tracker trae [completar]: se usa el del perfil
  ok("cover_letter_text", VACANTE.carta);
  ok("q6", "LinkedIn"); // How did you hear about us? — sale de la fuente del tracker
  review("q8"); // driver's license — obligatoria sin respuesta
  assert.equal(fields.contractor.value, "y"); // acepta contratista: Yes por defecto
  review("relocate"); // radio obligatorio sin respuesta: nunca se adivina
  review("location"); // el portal vació el campo: no puede quedar verde
  assert.equal(fields.location.value, "");
  assert.equal(fields.resume.value, ""); // nunca sube archivos
  assert.ok(result.cleared.includes("Location"), "Location debería reportarse como no guardado");
  assert.ok(result.answers.filled.some((q) => q.includes("independent contractor")));
  assert.ok(result.answers.unmatched.some((q) => q.includes("relocate")));
  assert.ok(!result.filledFields.includes("Location"));

  console.log(`OK: ${result.filledCount} campos completados; a revisar: ${[
    ...result.answers.unmatched, ...result.answers.pending, ...result.answers.review, ...result.cleared,
  ].join(" | ")}`);
} finally {
  await ctx.close();
  server.close();
}
