import type { AtsAutoFillPayload, AtsFieldMapping, UserProfile } from "@/lib/types";

export interface CandidateData {
  profile: Partial<UserProfile>;
  email: string;
  cvText?: string;
  cartaText?: string;
}

/**
 * Genera el mapeo de campos y el script de inyección automática para rellenar
 * formularios de ATS (Greenhouse, Lever, Ashby, Workday o genéricos).
 */
export function buildAtsAutoFillPayload(
  ats: string | null,
  targetUrl: string,
  candidate: CandidateData
): AtsAutoFillPayload {
  const fields: AtsFieldMapping[] = [];

  const fullName = candidate.profile.nombre_completo || "";
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";
  const email = candidate.email || "";
  const phone = candidate.profile.telefono || "";
  const linkedin = candidate.profile.linkedin_url || "";
  const github = candidate.profile.github_url || "";
  const portfolio = candidate.profile.portafolio_url || "";
  const location = candidate.profile.ubicacion || "";
  const coverLetter = candidate.cartaText || "";

  const detectedAts = (ats || "generic").toLowerCase();

  switch (detectedAts) {
    case "greenhouse":
      if (firstName) fields.push({ field: "Nombre", selector: "#first_name", value: firstName });
      if (lastName) fields.push({ field: "Apellido", selector: "#last_name", value: lastName });
      if (email) fields.push({ field: "Correo", selector: "#email", value: email });
      if (phone) fields.push({ field: "Teléfono", selector: "#phone", value: phone });
      if (linkedin) {
        fields.push({
          field: "LinkedIn",
          selector: 'input[autocomplete*="custom_fields[linkedin]"], input[id*="job_application_answers_attributes"][id*="text"]',
          value: linkedin,
        });
      }
      if (coverLetter) {
        fields.push({
          field: "Carta de Presentación",
          selector: '#cover_letter_text, textarea[name*="cover_letter"]',
          value: coverLetter,
        });
      }
      break;

    case "lever":
      if (fullName) fields.push({ field: "Nombre completo", selector: 'input[name="name"]', value: fullName });
      if (email) fields.push({ field: "Correo", selector: 'input[name="email"]', value: email });
      if (phone) fields.push({ field: "Teléfono", selector: 'input[name="phone"]', value: phone });
      if (linkedin) fields.push({ field: "LinkedIn", selector: 'input[name="urls[LinkedIn]"]', value: linkedin });
      if (github) fields.push({ field: "GitHub", selector: 'input[name="urls[GitHub]"]', value: github });
      if (portfolio) fields.push({ field: "Portafolio", selector: 'input[name="urls[Portfolio]"]', value: portfolio });
      if (location) fields.push({ field: "Ubicación", selector: 'input[name="location"]', value: location });
      if (coverLetter) {
        fields.push({
          field: "Comentarios / Carta",
          selector: 'textarea[name="comments"], textarea[name="additional_information"]',
          value: coverLetter,
        });
      }
      break;

    case "ashby":
      if (fullName) fields.push({ field: "Nombre completo", selector: 'input[name="name"], input[name*="_name"]', value: fullName });
      if (email) fields.push({ field: "Correo", selector: 'input[name="email"], input[type="email"]', value: email });
      if (phone) fields.push({ field: "Teléfono", selector: 'input[name="phoneNumber"], input[type="tel"]', value: phone });
      if (linkedin) fields.push({ field: "LinkedIn", selector: 'input[name*="linkedin"], input[name*="LinkedIn"]', value: linkedin });
      if (github) fields.push({ field: "GitHub", selector: 'input[name*="github"], input[name*="GitHub"]', value: github });
      if (coverLetter) {
        fields.push({
          field: "Carta de Presentación",
          selector: 'textarea[name*="coverLetter"], textarea[name*="note"]',
          value: coverLetter,
        });
      }
      break;

    default: // generic fallback
      if (fullName) fields.push({ field: "Nombre completo", selector: 'input[name*="name" i], input[id*="name" i]', value: fullName });
      if (email) fields.push({ field: "Correo", selector: 'input[type="email"], input[name*="email" i]', value: email });
      if (phone) fields.push({ field: "Teléfono", selector: 'input[type="tel"], input[name*="phone" i]', value: phone });
      if (linkedin) fields.push({ field: "LinkedIn", selector: 'input[name*="linkedin" i], input[placeholder*="linkedin" i]', value: linkedin });
      if (github) fields.push({ field: "GitHub", selector: 'input[name*="github" i], input[placeholder*="github" i]', value: github });
      if (coverLetter) fields.push({ field: "Carta", selector: 'textarea[name*="cover" i], textarea[name*="letter" i], textarea[name*="comment" i]', value: coverLetter });
      break;
  }

  // Generar script ejecutable en consola o bookmarklet con eventos de cambio y resaltado visual
  const script = `(() => {
  const fields = ${JSON.stringify(fields)};
  let filled = 0;
  console.info("%c[JobAutoApply] Iniciando auto-completado de formulario ATS...", "color: #6366f1; font-weight: bold; font-size: 13px;");

  fields.forEach(({ field, selector, value }) => {
    try {
      const el = document.querySelector(selector);
      if (el) {
        el.focus();
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.style.border = "2px solid #10b981";
        el.style.backgroundColor = "#ecfdf5";
        filled++;
        console.log("✓ Campo completado:", field);
      }
    } catch (e) {
      console.warn("No se pudo rellenar campo:", field, e);
    }
  });

  const banner = document.createElement("div");
  banner.style = "position:fixed;top:20px;right:20px;z-index:999999;background:#0f172a;color:#fff;padding:12px 18px;border-radius:10px;box-shadow:0 10px 25px rgba(0,0,0,0.5);font-family:sans-serif;font-size:13px;border:1px solid #10b981;display:flex;align-items:center;gap:8px;";
  banner.innerHTML = \`<span style="color:#10b981;font-weight:bold;">✓ JobAutoApply:</span> \${filled} campos completados automáticamente. Revisa y presiona Enviar.\`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 7000);
})();`;

  return {
    ats: detectedAts,
    targetUrl,
    fields,
    script,
  };
}
