"use client";

import { useState } from "react";

interface CvPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  cvText: string;
  jobTitle?: string;
  jobCompany?: string;
}

/**
 * Parsea el texto del CV generado (Markdown simple) en secciones limpias
 * estructuradas para visualización y parseo ATS estricto.
 */
function parseCvSections(text: string) {
  const lines = text.split("\n");
  let title = "";
  let contact = "";
  const sections: { heading: string; lines: string[] }[] = [];
  let currentHeading = "Perfil / Resumen";
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Primer encabezado suele ser el nombre del candidato
    if (i === 0 && (line.startsWith("# ") || !line.startsWith("##"))) {
      title = line.replace(/^#+\s*/, "").replace(/\*\*/g, "");
      continue;
    }

    // Segunda línea suele ser datos de contacto
    if (!contact && (line.includes("@") || line.includes("|") || line.includes("linkedin") || line.includes("+"))) {
      contact = line.replace(/\*\*/g, "");
      continue;
    }

    // Detección de títulos de sección (## Experiencia, ## Educación, etc.)
    if (line.startsWith("## ") || line.startsWith("### ") || (line.endsWith(":") && line.length < 35)) {
      if (currentLines.length > 0) {
        sections.push({ heading: currentHeading, lines: [...currentLines] });
        currentLines = [];
      }
      currentHeading = line.replace(/^#+\s*/, "").replace(/[:*#]/g, "").trim();
      continue;
    }

    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    sections.push({ heading: currentHeading, lines: [...currentLines] });
  }

  return { title, contact, sections };
}

/**
 * Renderiza texto inline de markdown convirtiendo **texto** en elementos <strong> limpios
 */
function renderFormattedText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export default function CvPdfModal({
  isOpen,
  onClose,
  cvText,
  jobTitle,
  jobCompany,
}: CvPdfModalProps) {
  const [template, setTemplate] = useState<"standard" | "classic" | "executive">("standard");

  if (!isOpen || !cvText) return null;

  const parsed = parseCvSections(cvText);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm print:p-0 print:bg-white print:static">
      {/* Estilos para impresión nativa ATS */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-cv-sheet,
          #printable-cv-sheet * {
            visibility: visible;
          }
          #printable-cv-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            margin: 0 !important;
            padding: 12mm 15mm !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            color: #000 !important;
          }
          @page {
            size: letter portrait;
            margin: 10mm;
          }
        }
      `}</style>

      {/* Contenedor del Modal */}
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl print:border-none print:shadow-none print:bg-white print:max-h-none print:w-full">
        {/* Barra superior de controles (oculta al imprimir) */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 px-6 py-3.5 print:hidden">
          <div className="space-y-0.5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>📄 Exportador de CV ATS-Friendly</span>
              <span className="rounded bg-emerald-950 border border-emerald-800 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                100% Parseable
              </span>
            </h3>
            {jobTitle && (
              <p className="text-xs text-slate-400">
                Adaptado para: {jobTitle} {jobCompany ? `en ${jobCompany}` : ""}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Selector de plantilla */}
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="text-slate-400 text-[11px]">Estilo:</span>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value as "standard" | "classic" | "executive")}
                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
              >
                <option value="standard">ATS Minimalista (Recomendado)</option>
                <option value="executive">Ejecutivo Serif</option>
                <option value="classic">Clásico Suizo</option>
              </select>
            </div>

            {/* Botón de Impresión / Guardado PDF */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-500 transition"
            >
              <span>🖨️ Descargar como PDF</span>
            </button>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Notificación informativa */}
        <div className="bg-slate-950 px-6 py-2 text-[11px] text-slate-400 border-b border-slate-800/80 flex items-center justify-between print:hidden">
          <span>
            💡 <strong>Instrucciones:</strong> Al hacer clic en <em>Descargar como PDF</em>, selecciona <strong>"Guardar como PDF"</strong> en la ventana de impresión de tu navegador.
          </span>
          <span className="text-indigo-400 font-medium">Fuente estándar sin columnas complejas para máximo score ATS</span>
        </div>

        {/* Área de Visualización del Documento (Hoja de Papel en Pantalla) */}
        <div className="flex-1 overflow-y-auto bg-slate-950 p-6 flex justify-center print:p-0 print:bg-white">
          <div
            id="printable-cv-sheet"
            className={`w-full max-w-[216mm] bg-white text-slate-900 p-10 shadow-2xl rounded-sm print:rounded-none print:shadow-none print:p-0 ${
              template === "executive"
                ? "font-serif text-[13px] leading-relaxed"
                : template === "classic"
                ? "font-mono text-[12px] leading-normal"
                : "font-sans text-[13px] leading-relaxed"
            }`}
          >
            {/* Encabezado del CV */}
            <div className="border-b border-slate-300 pb-4 mb-5 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">
                {parsed.title || "Currículum Vitae"}
              </h1>
              {parsed.contact && (
                <p className="mt-1 text-xs text-slate-600 font-medium tracking-wide">
                  {parsed.contact}
                </p>
              )}
            </div>

            {/* Secciones del CV */}
            {parsed.sections.length > 0 ? (
              <div className="space-y-4">
                {parsed.sections.map((section, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-0.5">
                      {section.heading}
                    </h2>
                    <div className="space-y-1 text-slate-800">
                      {section.lines.map((line, lIdx) => {
                        const isBullet = line.startsWith("- ") || line.startsWith("• ") || line.startsWith("* ");
                        const cleanLine = line.replace(/^[-•*]\s*/, "");

                        return isBullet ? (
                          <div key={lIdx} className="flex items-start gap-2 pl-2">
                            <span className="text-slate-500 font-bold select-none">•</span>
                            <span className="flex-1 leading-snug">{renderFormattedText(cleanLine)}</span>
                          </div>
                        ) : (
                          <p key={lIdx} className="leading-snug">
                            {renderFormattedText(cleanLine)}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Fallback directo si no se pudieron parsear secciones
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-800">
                {cvText}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
