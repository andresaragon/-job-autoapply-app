/**
 * Background Service Worker — JobAutoApply Assistant (Manifest V3)
 */

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // Inicializar almacenamiento con perfil por defecto si está vacío
    const stored = await chrome.storage.local.get("candidateProfile");
    if (!stored.candidateProfile) {
      await chrome.storage.local.set({
        candidateProfile: {
          fullName: "Santiago Aragón",
          firstName: "Santiago",
          lastName: "Aragón",
          email: "santiagoaragon.sistemas@gmail.com",
          phone: "+57 300 000 0000",
          linkedin: "https://linkedin.com/in/santiagoaragon",
          github: "https://github.com/andresaragon",
          portfolio: "https://santiagoaragon.dev",
          location: "Bogotá, Colombia (Remoto)",
          appUrl: "http://localhost:3000"
        }
      });
      console.log("JobAutoApply: Perfil inicial de candidato configurado.");
    }
  }
});

// Listener para mensajes entre popup y content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ping") {
    sendResponse({ status: "alive" });
    return false;
  }
  return false;
});
