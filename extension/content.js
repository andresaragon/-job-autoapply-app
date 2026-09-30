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

  function runAutoFill(profile) {
    if (!profile) {
      return { success: false, error: "Perfil de candidato no provisto" };
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
        }
      }
    }

    // Mostrar toast visual en la página
    showFloatingToast(filledCount, ats);

    return {
      success: true,
      ats,
      filledCount,
      filledFields
    };
  }

  function showFloatingToast(count, ats) {
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
      const result = runAutoFill(request.profile);
      sendResponse(result);
      return false;
    }

    return false;
  });
})();
