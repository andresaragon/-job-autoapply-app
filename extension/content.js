/**
 * Inyector y Asistente de Autollenado ATS — JobAutoApply Content Script
 * 
 * Capaz de autocompletar formularios en Greenhouse, Lever, Ashby, Workday y portales genéricos,
 * disparando eventos reactivos (React, Vue, Angular) y resaltando los campos completados.
 */

(() => {
  // Evitar múltiples declaraciones si se inyecta varias veces
  if (window.__jobAutoApplyInjected) {
    return;
  }
  window.__jobAutoApplyInjected = true;

  function detectAts() {
    const url = window.location.href.toLowerCase();

    if (url.includes("greenhouse.io") || document.querySelector("#application_form, #first_name, #last_name")) {
      return "greenhouse";
    }
    if (url.includes("lever.co") || document.querySelector(".application-form, input[name='urls[LinkedIn]']")) {
      return "lever";
    }
    if (url.includes("ashbyhq.com") || document.querySelector("[data-testid*='application-form'], [data-testid*='ashby']")) {
      return "ashby";
    }
    if (url.includes("myworkdayjobs.com") || url.includes("workday.com")) {
      return "workday";
    }
    if (url.includes("smartrecruiters.com")) {
      return "smartrecruiters";
    }
    return "generic";
  }

  function setNativeValue(element, value) {
    if (!element || value === undefined || value === null) return false;

    try {
      const isTextarea = element.tagName.toLowerCase() === "textarea";
      const prototype = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

      if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
      } else {
        element.value = value;
      }

      // Disparar ciclo completo de eventos reactivos
      element.dispatchEvent(new Event("focus", { bubbles: true }));
      element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));

      // Estilo de confirmación visual verde esmeralda
      element.style.transition = "all 0.3s ease";
      element.style.borderColor = "#10b981";
      element.style.boxShadow = "0 0 0 2px rgba(16, 185, 129, 0.25)";
      element.style.backgroundColor = "rgba(16, 185, 129, 0.05)";

      return true;
    } catch (err) {
      console.warn("JobAutoApply: Error seteando campo", element, err);
      return false;
    }
  }

  function findFieldByHeuristics(keywords, inputTypes = ["text", "email", "tel", "url"]) {
    const inputs = Array.from(document.querySelectorAll("input, textarea"));

    for (const input of inputs) {
      // Ignorar inputs ocultos o botones
      const type = (input.getAttribute("type") || "text").toLowerCase();
      if (type === "hidden" || type === "submit" || type === "button" || type === "checkbox" || type === "radio") {
        continue;
      }

      const id = (input.id || "").toLowerCase();
      const name = (input.name || "").toLowerCase();
      const placeholder = (input.placeholder || "").toLowerCase();
      const ariaLabel = (input.getAttribute("aria-label") || "").toLowerCase();
      const autocomplete = (input.getAttribute("autocomplete") || "").toLowerCase();

      // Buscar texto del label asociado
      let labelText = "";
      if (input.id) {
        try {
          const escapedId = window.CSS && CSS.escape ? CSS.escape(input.id) : input.id.replace(/["\\]/g, "\\$&");
          const label = document.querySelector(`label[for="${escapedId}"]`);
          if (label) labelText = (label.textContent || label.innerText || "").toLowerCase();
        } catch {
          // Selector no válido o caracteres no soportados, continuar silenciosamente
        }
      }
      if (!labelText && input.closest("label")) {
        labelText = (input.closest("label").textContent || input.closest("label").innerText || "").toLowerCase();
      }

      for (const kw of keywords) {
        const kwLower = kw.toLowerCase();
        if (
          id.includes(kwLower) ||
          name.includes(kwLower) ||
          placeholder.includes(kwLower) ||
          ariaLabel.includes(kwLower) ||
          autocomplete.includes(kwLower) ||
          labelText.includes(kwLower)
        ) {
          return input;
        }
      }
    }
    return null;
  }

  // Campos rellenados en esta corrida, para comprobar después que el portal no los vació.
  let filledEls = [];

  function runAutoFill(profile, vacante) {
    if (!profile) {
      return { success: false, error: "Perfil de candidato no provisto" };
    }
    filledEls = [];
    if (vacante && vacante.carta) {
      profile = { ...profile, coverLetter: vacante.carta };
    }

    const ats = detectAts();
    let filledCount = 0;
    const filledFields = [];

    // Derivar primer y segundo nombre si no vienen separados
    const parts = (profile.fullName || "").trim().split(/\s+/);
    const firstName = profile.firstName || parts[0] || "";
    const lastName = profile.lastName || parts.slice(1).join(" ") || "";

    const fieldDefinitions = [
      {
        name: "First Name",
        value: firstName,
        selectors: [
          "#first_name",
          "input[name='first_name']",
          "input[name='firstName']",
          "input[data-qa='first-name']",
          "input[autocomplete='given-name']"
        ],
        keywords: ["first name", "nombre", "primer nombre", "given name"]
      },
      {
        name: "Last Name",
        value: lastName,
        selectors: [
          "#last_name",
          "input[name='last_name']",
          "input[name='lastName']",
          "input[data-qa='last-name']",
          "input[autocomplete='family-name']"
        ],
        keywords: ["last name", "apellido", "apellidos", "family name", "surname"]
      },
      {
        name: "Full Name",
        value: profile.fullName || `${firstName} ${lastName}`.trim(),
        selectors: [
          "input[name='name']",
          "input[name='fullName']",
          "#name",
          "#applicant_name",
          "input[autocomplete='name']"
        ],
        keywords: ["full name", "nombre completo", "your name", "candidate name"]
      },
      {
        name: "Email",
        value: profile.email,
        selectors: [
          "#email",
          "input[name='email']",
          "input[type='email']",
          "input[data-qa='email']",
          "input[autocomplete='email']"
        ],
        keywords: ["email", "correo", "e-mail"]
      },
      {
        name: "Phone",
        value: profile.phone,
        selectors: [
          "#phone",
          "input[name='phone']",
          "input[name='phoneNumber']",
          "input[type='tel']",
          "input[data-qa='phone']",
          "input[autocomplete='tel']"
        ],
        keywords: ["phone", "teléfono", "celular", "mobile", "telephone"]
      },
      {
        name: "LinkedIn",
        value: profile.linkedin,
        selectors: [
          "input[name='urls[LinkedIn]']",
          "input[name*='linkedin']",
          "input[id*='linkedin']",
          "input[placeholder*='linkedin.com']"
        ],
        keywords: ["linkedin", "perfil linkedin"]
      },
      {
        name: "GitHub",
        value: profile.github,
        selectors: [
          "input[name='urls[GitHub]']",
          "input[name*='github']",
          "input[id*='github']",
          "input[placeholder*='github.com']"
        ],
        keywords: ["github", "repositorio github"]
      },
      {
        name: "Portfolio / Website",
        value: profile.portfolio,
        selectors: [
          "input[name='urls[Portfolio]']",
          "input[name='urls[Website]']",
          "input[name*='portfolio']",
          "input[name*='website']",
          "input[id*='website']",
          "input[id*='portfolio']"
        ],
        keywords: ["portfolio", "portafolio", "website", "sitio web", "personal site"]
      },
      {
        name: "Location",
        value: profile.location,
        selectors: [
          "#location",
          "input[name='location']",
          "input[name*='address']",
          "input[id*='location']",
          "input[id*='address']"
        ],
        keywords: ["location", "ubicación", "ciudad", "city", "address", "residencia"]
      },
      {
        name: "Cover Letter / Comments",
        value: profile.coverLetter,
        selectors: [
          "#cover_letter_text",
          "textarea[name='comments']",
          "textarea[name='cover_letter']",
          "textarea[name*='cover']",
          "textarea[id*='cover']"
        ],
        keywords: ["cover letter", "carta de presentación", "additional information", "comments"]
      }
    ];

    for (const def of fieldDefinitions) {
      if (!def.value) continue;

      let targetEl = null;

      // 1. Probar selectores específicos
      for (const sel of def.selectors) {
        targetEl = document.querySelector(sel);
        if (targetEl && targetEl.offsetParent !== null) {
          break; // Debe ser visible
        }
      }

      // 2. Si no se encontró por selector específico, probar heurísticas
      if (!targetEl) {
        targetEl = findFieldByHeuristics(def.keywords);
      }

      if (targetEl) {
        const success = setNativeValue(targetEl, def.value);
        if (success) {
          filledCount++;
          filledFields.push(def.name);
          filledEls.push({ el: targetEl, label: def.name });
        }
      }
    }

    // Preguntas del formulario con las respuestas del tracker
    let answers = null;
    if (vacante && window.JobAutoApplyMatcher) {
      answers = fillAnswers(vacante.respuestas_sugeridas || "", profile);
      filledCount += answers.filled.length;
    }

    return {
      success: true,
      ats,
      filledCount,
      filledFields,
      answers
    };
  }

  // ---------------------------------------------------------------------------
  // Respuestas del tracker → preguntas del formulario
  // ---------------------------------------------------------------------------

  const REVIEW_STYLE = { borderColor: "#f59e0b", boxShadow: "0 0 0 2px rgba(245, 158, 11, 0.35)" };

  function clean(text) {
    return String(text || "").replace(/\s+/g, " ").replace(/\*/g, "").trim();
  }

  function isVisible(el) {
    return !!(el && (el.offsetParent !== null || el.getClientRects().length));
  }

  function questionText(el) {
    if (el.id) {
      try {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l && clean(l.textContent)) return clean(l.textContent);
      } catch {
        // id con caracteres raros: seguir con otras estrategias
      }
    }
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const t = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ");
      if (clean(t)) return clean(t);
    }
    const aria = el.getAttribute("aria-label");
    if (aria) return clean(aria);
    const wrap = el.closest("label");
    if (wrap && clean(wrap.textContent)) return clean(wrap.textContent);
    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend && clean(legend.textContent)) return clean(legend.textContent);
    }
    let node = el.parentElement;
    for (let i = 0; i < 4 && node; i++) {
      const cand = node.querySelector("label, legend, [class*='label'], [class*='question'], [class*='title']");
      if (cand && !cand.contains(el) && clean(cand.textContent)) return clean(cand.textContent);
      node = node.parentElement;
    }
    return clean(el.placeholder || el.name || "");
  }

  function markForReview(el) {
    el.style.transition = "all 0.3s ease";
    el.style.borderColor = REVIEW_STYLE.borderColor;
    el.style.boxShadow = REVIEW_STYLE.boxShadow;
  }

  function radioGroups() {
    const groups = new Map();
    for (const r of document.querySelectorAll("input[type='radio']")) {
      if (!isVisible(r) || !r.name) continue;
      if (!groups.has(r.name)) groups.set(r.name, []);
      groups.get(r.name).push(r);
    }
    return groups;
  }

  function radioGroupQuestion(radios) {
    const fieldset = radios[0].closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend && clean(legend.textContent)) return clean(legend.textContent);
    }
    // Subir hasta el contenedor que agrupa todas las opciones y buscar su etiqueta.
    let node = radios[0].parentElement;
    for (let i = 0; i < 5 && node; i++) {
      if (radios.every((r) => node.contains(r))) {
        const cand = node.querySelector("label:not(:has(input)), legend, [class*='label'], [class*='question']");
        if (cand && !radios.some((r) => cand.contains(r)) && clean(cand.textContent)) return clean(cand.textContent);
      }
      node = node.parentElement;
    }
    return "";
  }

  // Obligatorio si algún radio lo declara o si la etiqueta del grupo termina en "*".
  function radioGroupRequired(radios) {
    if (radios.some((r) => r.required || r.getAttribute("aria-required") === "true")) return true;
    if (radios[0].closest("[aria-required='true'], [data-required='true']")) return true;
    const legend = radios[0].closest("fieldset")?.querySelector("legend");
    return !!legend && /\*\s*$/.test(legend.textContent.trim());
  }

  function markRadioGroup(radios) {
    const fieldset = radios[0].closest("fieldset");
    if (fieldset) markForReview(fieldset);
    else radios.forEach((r) => markForReview(r.closest("label") || r));
  }

  // Algunos portales (p. ej. el autocompletado de ubicación de Lever) vacían el campo si no
  // se elige una opción de su lista: lo que quedó vacío pasa de verde a naranja.
  function verifyFilled(result) {
    result.cleared = [];
    for (const { el, label } of filledEls) {
      if (clean(el.value) !== "") continue;
      markForReview(el);
      el.style.backgroundColor = "";
      result.filledCount--;
      result.filledFields = result.filledFields.filter((f) => f !== label);
      if (result.answers) result.answers.filled = result.answers.filled.filter((q) => q !== label);
      result.cleared.push(label);
    }
    return result;
  }

  function radioOptionText(radio) {
    if (radio.id) {
      const l = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
      if (l) return clean(l.textContent);
    }
    const wrap = radio.closest("label");
    return clean(wrap ? wrap.textContent : radio.value);
  }

  function fillAnswers(raw, profile) {
    const M = window.JobAutoApplyMatcher;
    const extras = [["What is your salary expectation?", profile && profile.salaryExpectation]];
    const items = M.withDefaults(M.parseAnswers(raw), extras);
    const result = { filled: [], pending: [], review: [], unmatched: [] };

    const fields = Array.from(document.querySelectorAll("input, textarea, select")).filter((el) => {
      if (!isVisible(el) || el.disabled || el.readOnly) return false;
      const type = (el.getAttribute("type") || "text").toLowerCase();
      return !["hidden", "submit", "button", "checkbox", "radio", "file", "search", "password"].includes(type);
    });

    for (const el of fields) {
      const question = questionText(el);
      const isSelect = el.tagName.toLowerCase() === "select";
      const alreadyFilled = isSelect ? el.selectedIndex > 0 : clean(el.value) !== "";
      if (!question || alreadyFilled) continue;

      const match = M.matchQuestion(question, items);
      if (!match) {
        if (el.required || el.getAttribute("aria-required") === "true") {
          markForReview(el);
          result.unmatched.push(question);
        }
        continue;
      }
      const { item } = match;
      if (item.pending) {
        markForReview(el);
        result.pending.push(question);
        continue;
      }

      if (isSelect) {
        const idx = M.pickOption(Array.from(el.options).map((o) => o.textContent), item.answer);
        if (idx < 0) {
          markForReview(el);
          result.review.push(question);
          continue;
        }
        el.selectedIndex = idx;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.style.borderColor = "#10b981";
        result.filled.push(question);
        continue;
      }

      const max = Number(el.getAttribute("maxlength")) || (item.limit && item.limit.max) || 0;
      if (max > 0 && item.answer.length > max) {
        // Nunca recortar: una respuesta cortada a la mitad es peor que un campo vacío.
        markForReview(el);
        result.review.push(`${question} (respuesta de ${item.answer.length} > ${max} caracteres)`);
        continue;
      }
      if (setNativeValue(el, item.answer)) {
        result.filled.push(question);
        filledEls.push({ el, label: question });
      }
    }

    for (const radios of radioGroups().values()) {
      if (radios.some((r) => r.checked)) continue;
      const question = radioGroupQuestion(radios);
      const match = question && M.matchQuestion(question, items);
      if (!match) {
        if (radioGroupRequired(radios)) {
          markRadioGroup(radios);
          result.unmatched.push(question || radios[0].name);
        }
        continue;
      }
      if (match.item.pending) {
        markRadioGroup(radios);
        result.pending.push(question);
        continue;
      }
      const idx = M.pickOption(radios.map(radioOptionText), match.item.answer);
      if (idx < 0) {
        markRadioGroup(radios);
        result.review.push(question);
        continue;
      }
      radios[idx].click();
      result.filled.push(question);
    }

    return result;
  }

  function showFloatingToast(count, ats, answers, cleared) {
    const toReview =
      (answers ? answers.pending.length + answers.review.length + answers.unmatched.length : 0) +
      (cleared ? cleared.length : 0);
    const existing = document.getElementById("job-autoapply-toast");
    if (existing) existing.remove();

    if (!document.getElementById("job-autoapply-keyframes")) {
      const style = document.createElement("style");
      style.id = "job-autoapply-keyframes";
      style.textContent = `
        @keyframes jobAutoApplyFadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    const toast = document.createElement("div");
    toast.id = "job-autoapply-toast";
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999999;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #10b981;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(16, 185, 129, 0.4);
      border-radius: 12px;
      padding: 14px 18px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: jobAutoApplyFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    toast.innerHTML = `
      <div style="background: rgba(16, 185, 129, 0.2); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: #10b981; font-weight: bold; font-size: 14px;">✓</div>
      <div>
        <div style="font-weight: 600; color: #ffffff;">JobAutoApply: ${count} campos completados</div>
        <div style="font-size: 11px; color: #94a3b8;">Portal detectado: <b style="color: #6ee7b7; text-transform: uppercase;">${ats}</b></div>
        ${toReview ? `<div style="font-size: 11px; color: #fbbf24;">${toReview} campo(s) en naranja para revisar a mano</div>` : ""}
      </div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.transition = "opacity 0.4s ease, transform 0.4s ease";
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-10px)";
        setTimeout(() => toast.remove(), 400);
      }
    }, 4500);
  }

  // Escuchar mensajes desde el popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "detect_ats") {
      const ats = detectAts();
      sendResponse({ ats, url: window.location.href });
      return false;
    }

    if (request.action === "auto_fill") {
      const result = runAutoFill(request.profile, request.vacante || null);
      if (!result.success) {
        sendResponse(result);
        return false;
      }
      // Dar tiempo a que el portal reaccione (autocompletados que vacían el campo) antes de reportar.
      setTimeout(() => {
        verifyFilled(result);
        showFloatingToast(result.filledCount, result.ats, result.answers, result.cleared);
        sendResponse(result);
      }, 800);
      return true;
    }

    return false;
  });
})();
