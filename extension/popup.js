/**
 * Popup Logic — JobAutoApply Assistant (Manifest V3)
 */

document.addEventListener("DOMContentLoaded", async () => {
  // Elementos UI
  const atsBadge = document.getElementById("ats-badge");
  const statusText = document.getElementById("status-text");
  const btnAutofill = document.getElementById("btn-autofill");
  const resultBox = document.getElementById("result-box");
  const resultTitle = document.getElementById("result-title");
  const resultDesc = document.getElementById("result-desc");

  // Profile View
  const viewName = document.getElementById("view-name");
  const viewEmail = document.getElementById("view-email");
  const viewPhone = document.getElementById("view-phone");
  const viewLinkedin = document.getElementById("view-linkedin");
  const viewGithub = document.getElementById("view-github");
  const viewPortfolio = document.getElementById("view-portfolio");

  // Edit Form
  const btnToggleEdit = document.getElementById("btn-toggle-edit");
  const profileView = document.getElementById("profile-view");
  const profileForm = document.getElementById("profile-form");
  const btnCancelEdit = document.getElementById("btn-cancel-edit");
  const btnSyncApp = document.getElementById("btn-sync-app");
  const syncMsg = document.getElementById("sync-msg");

  const inputFullname = document.getElementById("input-fullname");
  const inputEmail = document.getElementById("input-email");
  const inputPhone = document.getElementById("input-phone");
  const inputLinkedin = document.getElementById("input-linkedin");
  const inputGithub = document.getElementById("input-github");
  const inputPortfolio = document.getElementById("input-portfolio");
  const inputLocation = document.getElementById("input-location");
  const inputCoverLetter = document.getElementById("input-coverletter");

  let currentProfile = null;
  let activeTab = null;

  // 1. Cargar perfil desde storage local
  async function loadProfile() {
    const data = await chrome.storage.local.get("candidateProfile");
    currentProfile = data.candidateProfile || {
      fullName: "Santiago Aragón",
      firstName: "Santiago",
      lastName: "Aragón",
      email: "santiagoaragon.sistemas@gmail.com",
      phone: "+57 300 000 0000",
      linkedin: "https://linkedin.com/in/santiagoaragon",
      github: "https://github.com/andresaragon",
      portfolio: "https://santiagoaragon.dev",
      location: "Bogotá, Colombia (Remoto)",
      coverLetter: ""
    };

    renderProfileView();
  }

  function renderProfileView() {
    if (!currentProfile) return;

    viewName.textContent = currentProfile.fullName || "—";
    viewEmail.textContent = currentProfile.email || "—";
    viewPhone.textContent = currentProfile.phone || "—";
    viewLinkedin.textContent = currentProfile.linkedin || "—";
    viewGithub.textContent = currentProfile.github || "—";
    viewPortfolio.textContent = currentProfile.portfolio || "—";

    inputFullname.value = currentProfile.fullName || "";
    inputEmail.value = currentProfile.email || "";
    inputPhone.value = currentProfile.phone || "";
    inputLinkedin.value = currentProfile.linkedin || "";
    inputGithub.value = currentProfile.github || "";
    inputPortfolio.value = currentProfile.portfolio || "";
    inputLocation.value = currentProfile.location || "";
    inputCoverLetter.value = currentProfile.coverLetter || "";
  }

  // 2. Inspeccionar la pestaña activa y detectar ATS
  async function inspectActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTab = tab;

      if (!tab || !tab.id || !tab.url) {
        statusText.textContent = "No se pudo acceder a la pestaña activa.";
        return;
      }

      // Evitar inyección en pestañas internas de Chrome (chrome://)
      if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
        statusText.textContent = "Página de sistema (no es un portal de empleo).";
        atsBadge.textContent = "Sistema";
        btnAutofill.disabled = true;
        return;
      }

      // Asegurar inyección de content.js en la pestaña
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        });
      } catch (err) {
        console.warn("Scripting execute error (posiblemente ya inyectado):", err);
      }

      // Enviar mensaje para detectar el ATS
      const response = await chrome.tabs.sendMessage(tab.id, { action: "detect_ats" });

      if (response && response.ats) {
        updateAtsUI(response.ats, tab.url);
      } else {
        updateAtsUI("generic", tab.url);
      }
    } catch (err) {
      console.warn("Error al inspeccionar pestaña:", err);
      statusText.textContent = "Abre un formulario de vacante para autocompletar.";
      atsBadge.textContent = "Genérico";
    }
  }

  function updateAtsUI(ats, url) {
    atsBadge.className = "badge";

    if (ats === "greenhouse") {
      atsBadge.textContent = "Greenhouse";
      atsBadge.classList.add("badge-greenhouse");
      statusText.textContent = "Portal Greenhouse detectado ✓ Listo para rellenar.";
    } else if (ats === "lever") {
      atsBadge.textContent = "Lever";
      atsBadge.classList.add("badge-lever");
      statusText.textContent = "Portal Lever detectado ✓ Listo para rellenar.";
    } else if (ats === "ashby") {
      atsBadge.textContent = "Ashby";
      atsBadge.classList.add("badge-ashby");
      statusText.textContent = "Portal Ashby detectado ✓ Listo para rellenar.";
    } else if (ats === "workday") {
      atsBadge.textContent = "Workday";
      atsBadge.classList.add("badge-lever");
      statusText.textContent = "Portal Workday detectado ✓ Listo para rellenar.";
    } else {
      atsBadge.textContent = "Genérico";
      atsBadge.classList.add("badge-neutral");
      statusText.textContent = "Formulario de empleo web detectado.";
    }
  }

  // 3. Ejecutar Autollenado al hacer clic en el botón principal
  btnAutofill.addEventListener("click", async () => {
    if (!activeTab || !activeTab.id) return;

    btnAutofill.disabled = true;
    btnAutofill.innerHTML = `<span>⏳ Rellenando formulario...</span>`;

    try {
      // Re-asegurar que el content script esté listo
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ["content.js"]
      });

      const response = await chrome.tabs.sendMessage(activeTab.id, {
        action: "auto_fill",
        profile: currentProfile
      });

      resultBox.classList.remove("hidden");

      if (response && response.success) {
        resultTitle.textContent = `¡Formulario Rellenado con Éxito!`;
        const count = response.filledCount || 0;
        const fieldsStr = (response.filledFields || []).join(", ");
        resultDesc.textContent = `${count} campo(s) completados [${fieldsStr || "Datos de contacto"}]. Revisa y pulsa Enviar.`;
      } else {
        resultTitle.textContent = "Completado con advertencia";
        resultDesc.textContent = response?.error || "Se escanearon los campos. Verifica si el portal requiere campos adicionales.";
      }
    } catch (err) {
      console.error("Error en autofill:", err);
      resultBox.classList.remove("hidden");
      resultTitle.textContent = "Error al autollenar";
      resultDesc.textContent = "Asegúrate de tener visible el formulario de aplicación en la pestaña activa.";
    } finally {
      btnAutofill.disabled = false;
      btnAutofill.innerHTML = `<span class="btn-icon">⚡</span><span class="btn-label">Auto-Fill en 1-Clic</span>`;
    }
  });

  // 4. Modo edición de perfil
  btnToggleEdit.addEventListener("click", () => {
    profileView.classList.add("hidden");
    profileForm.classList.remove("hidden");
  });

  btnCancelEdit.addEventListener("click", () => {
    profileForm.classList.add("hidden");
    profileView.classList.remove("hidden");
    renderProfileView();
  });

  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const parts = inputFullname.value.trim().split(/\s+/);
    const updated = {
      fullName: inputFullname.value.trim(),
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || "",
      email: inputEmail.value.trim(),
      phone: inputPhone.value.trim(),
      linkedin: inputLinkedin.value.trim(),
      github: inputGithub.value.trim(),
      portfolio: inputPortfolio.value.trim(),
      location: inputLocation.value.trim(),
      coverLetter: inputCoverLetter.value.trim(),
      appUrl: currentProfile?.appUrl || "http://localhost:3000"
    };

    currentProfile = updated;
    await chrome.storage.local.set({ candidateProfile: updated });

    profileForm.classList.add("hidden");
    profileView.classList.remove("hidden");
    renderProfileView();
  });

  // 5. Sincronizar perfil desde la Web App (localhost:3000)
  btnSyncApp.addEventListener("click", async () => {
    syncMsg.className = "sync-msg";
    syncMsg.textContent = "Conectando con http://localhost:3000...";
    syncMsg.classList.remove("hidden");

    try {
      const res = await fetch("http://localhost:3000/api/profile", {
        credentials: "include",
        headers: { "Accept": "application/json" }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Inicia sesión en el panel web primero.`);
      }

      const data = await res.json();
      if (data && data.profile) {
        const p = data.profile;
        const parts = (p.nombre_completo || "").split(/\s+/);

        currentProfile = {
          ...currentProfile,
          fullName: p.nombre_completo || currentProfile.fullName,
          firstName: parts[0] || currentProfile.firstName,
          lastName: parts.slice(1).join(" ") || currentProfile.lastName,
          email: p.email || currentProfile.email,
          phone: p.telefono || currentProfile.phone,
          linkedin: p.linkedin_url || currentProfile.linkedin,
          github: p.github_url || currentProfile.github,
          portfolio: p.portafolio_url || currentProfile.portfolio,
          location: p.ubicacion || currentProfile.location
        };

        await chrome.storage.local.set({ candidateProfile: currentProfile });
        renderProfileView();

        syncMsg.textContent = "✓ ¡Perfil sincronizado exitosamente desde la Web App!";
        syncMsg.classList.add("sync-success");
      } else {
        throw new Error("Respuesta inválida de la API");
      }
    } catch (err) {
      syncMsg.textContent = `Advertencia: ${err.message}`;
      syncMsg.classList.add("sync-error");
    }

    setTimeout(() => {
      syncMsg.classList.add("hidden");
    }, 4000);
  });

  // Inicializar
  await loadProfile();
  await inspectActiveTab();
});
