"use client";

import { useState, useMemo } from "react";
import { calculateAtsMatch, type AtsMatchAnalysis, type KeywordMatch } from "@/lib/ats/matcher";

interface AtsMatchCardProps {
  jobDescription: string;
  cvText: string;
  className?: string;
  compact?: boolean;
}

export default function AtsMatchCard({
  jobDescription,
  cvText,
  className = "",
  compact = false,
}: AtsMatchCardProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [activeTab, setActiveTab] = useState<"matched" | "missing" | "tips">("matched");
  const [copiedTerm, setCopiedTerm] = useState<string | null>(null);

  // Calcular el análisis reactivamente cuando cambie el CV o la descripción de la vacante
  const analysis: AtsMatchAnalysis = useMemo(() => {
    return calculateAtsMatch(jobDescription, cvText);
  }, [jobDescription, cvText]);

  const { overallScore, grade, gradeColor, summary, stats, matchedKeywords, missingKeywords, recommendations } =
    analysis;

  function handleCopyTerm(term: string) {
    navigator.clipboard.writeText(term);
    setCopiedTerm(term);
    setTimeout(() => setCopiedTerm(null), 1500);
  }

  // Estilos dinámicos según el score
  const scoreColors = {
    emerald: {
      text: "text-emerald-400",
      bg: "bg-emerald-950/40",
      border: "border-emerald-800",
      badge: "bg-emerald-950 text-emerald-300 border-emerald-700",
      bar: "bg-emerald-500",
      ring: "stroke-emerald-500",
    },
    amber: {
      text: "text-amber-400",
      bg: "bg-amber-950/40",
      border: "border-amber-800",
      badge: "bg-amber-950 text-amber-300 border-amber-700",
      bar: "bg-amber-500",
      ring: "stroke-amber-500",
    },
    orange: {
      text: "text-orange-400",
      bg: "bg-orange-950/40",
      border: "border-orange-800",
      badge: "bg-orange-950 text-orange-300 border-orange-700",
      bar: "bg-orange-500",
      ring: "stroke-orange-500",
    },
    rose: {
      text: "text-rose-400",
      bg: "bg-rose-950/40",
      border: "border-rose-800",
      badge: "bg-rose-950 text-rose-300 border-rose-700",
      bar: "bg-rose-500",
      ring: "stroke-rose-500",
    },
  }[gradeColor];

  // SVG Gauge circular
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (overallScore / 100) * circumference;

  return (
    <div
      className={`rounded-2xl border ${scoreColors.border} ${scoreColors.bg} p-5 backdrop-blur-md transition-all ${className}`}
    >
      {/* Cabecera del Score */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {/* Circular Score Gauge */}
          <div className="relative flex h-16 w-16 items-center justify-center">
            <svg className="h-16 w-16 -rotate-90 transform" viewBox="0 0 70 70">
              <circle
                cx="35"
                cy="35"
                r={radius}
                className="stroke-slate-800"
                strokeWidth="6"
                fill="transparent"
              />
              <circle
                cx="35"
                cy="35"
                r={radius}
                className={`${scoreColors.ring} transition-all duration-1000 ease-out`}
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className={`text-sm font-bold ${scoreColors.text}`}>{overallScore}%</span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">Score de Match ATS</h3>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${scoreColors.badge}`}
              >
                {grade}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-300">{summary}</p>
          </div>
        </div>

        {/* Botón de alternar vista detallada */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 self-start rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white sm:self-auto"
        >
          <span>{isExpanded ? "Ocultar detalles" : "Ver palabras clave y sugerencias"}</span>
          <span className="text-[10px]">{isExpanded ? "▲" : "▼"}</span>
        </button>
      </div>

      {/* Métricas rápidas de barra */}
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-800/80 pt-4 text-center">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
          <p className="text-[11px] font-medium text-slate-400">Hard Skills</p>
          <p className="mt-0.5 text-sm font-bold text-slate-100">{stats.hardSkillsScore}%</p>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full ${scoreColors.bar}`}
              style={{ width: `${stats.hardSkillsScore}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
          <p className="text-[11px] font-medium text-slate-400">Soft Skills / Métodos</p>
          <p className="mt-0.5 text-sm font-bold text-slate-100">{stats.softSkillsScore}%</p>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-indigo-500"
              style={{ width: `${stats.softSkillsScore}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
          <p className="text-[11px] font-medium text-slate-400">Métricas Cuantitativas</p>
          <p className="mt-0.5 text-sm font-bold text-slate-100">
            {stats.quantifiableMetricsCount}{" "}
            <span className="text-[11px] font-normal text-slate-400">datos</span>
          </p>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-cyan-500"
              style={{ width: `${Math.min(100, stats.quantifiableMetricsCount * 20)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Contenido expandido con Pestañas de Keywords y Sugerencias */}
      {isExpanded && (
        <div className="mt-5 border-t border-slate-800/80 pt-4">
          {/* Navegación por pestañas */}
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setActiveTab("matched")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition ${
                activeTab === "matched"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>✓ Coincidentes</span>
              <span className="rounded-full bg-emerald-950 px-1.5 py-0.2 text-[10px] text-emerald-300 border border-emerald-800">
                {matchedKeywords.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("missing")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition ${
                activeTab === "missing"
                  ? "border-rose-500 text-rose-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>✕ Faltantes en CV</span>
              <span className="rounded-full bg-rose-950 px-1.5 py-0.2 text-[10px] text-rose-300 border border-rose-800">
                {missingKeywords.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("tips")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition ${
                activeTab === "tips"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>💡 Sugerencias ATS</span>
              <span className="rounded-full bg-indigo-950 px-1.5 py-0.2 text-[10px] text-indigo-300 border border-indigo-800">
                {recommendations.length}
              </span>
            </button>
          </div>

          {/* Panel de Pestaña 1: Coincidentes */}
          {activeTab === "matched" && (
            <div className="mt-3.5">
              {matchedKeywords.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No se detectaron términos coincidentes directos.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                  {matchedKeywords.map((k: KeywordMatch) => (
                    <div
                      key={k.term}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800/80 bg-emerald-950/50 px-2.5 py-1 text-xs text-emerald-200"
                    >
                      <span className="font-medium">{k.term}</span>
                      <span className="rounded bg-emerald-900/90 px-1 text-[10px] text-emerald-300">
                        {k.inCvCount}x en CV
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Panel de Pestaña 2: Faltantes */}
          {activeTab === "missing" && (
            <div className="mt-3.5">
              {missingKeywords.length === 0 ? (
                <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-3 text-xs text-emerald-300">
                  ¡Excelente! Tu currículum cubre todas las palabras clave y tecnologías identificadas en la vacante.
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">
                    Haz clic en cualquier palabra para copiarla e incorporarla en tu CV:
                  </p>
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                    {missingKeywords.map((k: KeywordMatch) => (
                      <button
                        key={k.term}
                        onClick={() => handleCopyTerm(k.term)}
                        title="Clic para copiar término"
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
                          k.importance === "high"
                            ? "border-rose-800/80 bg-rose-950/60 text-rose-200 hover:border-rose-600"
                            : "border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        <span className="font-medium">{k.term}</span>
                        {k.importance === "high" && (
                          <span className="rounded bg-rose-900/80 px-1 text-[9px] font-bold text-rose-200">
                            Alta
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">
                          {copiedTerm === k.term ? "✓ Copiado" : `(${k.inJobCount} en vacante)`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Panel de Pestaña 3: Sugerencias */}
          {activeTab === "tips" && (
            <div className="mt-3.5 space-y-2.5">
              {recommendations.map((tip, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-200"
                >
                  <span className="text-indigo-400">✦</span>
                  <span className="leading-relaxed">{tip}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
