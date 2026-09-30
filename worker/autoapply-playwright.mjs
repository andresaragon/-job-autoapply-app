#!/usr/bin/env node

/**
 * Worker Autónomo de Auto-Aplicación para ATS (Greenhouse, Lever, Ashby).
 * 
 * Uso:
 *   node worker/autoapply-playwright.mjs --appId <application_id> [--headless]
 * 
 * Requisitos:
 *   npm install -D playwright
 *   npx playwright install chromium
 */

import { parseArgs } from "node:util";

const options = {
  appId: { type: "string" },
  headless: { type: "boolean", default: false },
  secret: { type: "string", default: "local-worker" },
  help: { type: "boolean", default: false },
};

const { values: args } = parseArgs({ options, allowPositionals: true });

if (args.help || !args.appId) {
  console.log(`
🤖 JobAutoApply - Playwright ATS Worker

Uso:
  node worker/autoapply-playwright.mjs --appId <uuid> [--headless] [--secret <token>]

Parámetros:
  --appId     Identificador UUID de la postulación en Supabase.
  --headless  Ejecutar sin ventana visible (por defecto: false para revisión humana).
  --secret    Token secreto de worker para autenticación segura en la API.
  `);
  process.exit(0);
}

async function main() {
  console.log(`[Worker] Iniciando proceso para postulación: ${args.appId}`);

  // Verificar si playwright está instalado
  let chromium;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    console.error(`
❌ Playwright no está instalado en este entorno.
Para habilitar el navegador automatizado, ejecuta:
  npm install -D playwright
  npx playwright install chromium
`);
    process.exit(1);
  }

  // Obtener payload desde el endpoint de la app
  const appBaseUrl = process.env.APP_URL || "http://localhost:3000";
  const workerSecret = args.secret || process.env.WORKER_SECRET || "local-worker";
  console.log(`[Worker] Consultando datos de la postulación en ${appBaseUrl}...`);

  let autofillData;
  try {
    const res = await fetch(`${appBaseUrl}/api/worker/autofill?application_id=${args.appId}`, {
      headers: {
        "x-worker-secret": workerSecret,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    autofillData = await res.json();
  } catch (err) {
    console.error(`[Worker] Error al obtener datos de postulación:`, err.message);
    process.exit(1);
  }

  const { payload, jobTitle, jobCompany } = autofillData;
  console.log(`[Worker] Oferta: ${jobTitle} en ${jobCompany}`);
  console.log(`[Worker] ATS detectado: ${payload.ats}`);
  console.log(`[Worker] Campos listos para rellenar: ${payload.fields.length}`);

  const browser = await chromium.launch({
    headless: Boolean(args.headless),
    slowMo: 100,
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  console.log(`[Worker] Navegando a ${payload.targetUrl}...`);
  await page.goto(payload.targetUrl, { waitUntil: "domcontentloaded" });

  console.log(`[Worker] Inyectando script de auto-llenado...`);
  await page.evaluate(payload.script);

  console.log(`
✅ Formulario pre-llenado con éxito.
${args.headless ? "Modo headless: Proceso finalizado." : "Ventana abierta: Revisa los campos y pulsa enviar cuando estés listo."}
  `);

  if (!args.headless) {
    console.log("[Worker] Presiona Ctrl+C en esta terminal para cerrar el navegador.");
    // Mantener abierto el navegador
    await new Promise(() => {});
  } else {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[Worker] Fallo fatal:", err);
  process.exit(1);
});
