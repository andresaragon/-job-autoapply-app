"use client";

import { useState } from "react";
import type { GenerateContentResponse } from "@/lib/types";

// Panel mínimo de la fase 1 del roadmap: pegar una oferta a mano y generar el
// CV adaptado y la carta de presentación con IA Híbrida (Ollama Local, Claude o Gemini).
export default function DashboardPage() {
  const [resumeId, setResumeId] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [preferredProvider, setPreferredProvider] = useState<"auto" | "ollama" | "anthropic" | "gemini">("auto");
  const [result, setResult] = useState<GenerateContentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId, jobDescriptionText, preferredProvider }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Error generando el contenido");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Generar CV y carta adaptados</h1>

      <label className="mb-1 block text-sm text-slate-400">
        ID del CV base (insertado en la tabla resumes de Supabase)
      </label>
      <input
        className="mb-4 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
        value={resumeId}
        onChange={(e) => setResumeId(e.target.value)}
        placeholder="uuid del CV (ej: 123e4567-e89b-12d3-a456-426614174000)"
      />

      <label className="mb-1 block text-sm text-slate-400">
        Pega aquí la descripción de la oferta
      </label>
      <textarea
        className="mb-4 h-40 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
        value={jobDescriptionText}
        onChange={(e) => setJobDescriptionText(e.target.value)}
        placeholder="Descripción completa de la vacante, requisitos y responsabilidades..."
      />

      <div className="mb-6">
        <label className="mb-1 block text-sm text-slate-400">
          Motor de IA preferido
        </label>
        <select
          value={preferredProvider}
          onChange={(e) =>
            setPreferredProvider(e.target.value as "auto" | "ollama" | "anthropic" | "gemini")
          }
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-500 focus:outline-none"
        >
          <option value="auto">Automático (Ollama Local RTX 4060 con fallback Nube)</option>
          <option value="ollama">Ollama Local (qwen2.5:7b en GPU local - $0/Offline)</option>
          <option value="anthropic">Claude Sonnet 5.5 (Anthropic API - Nube)</option>
          <option value="gemini">Google Gemini (Google AI Studio - Nube)</option>
        </select>
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading || !resumeId || !jobDescriptionText}
        className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span>Generando con IA...</span>
          </>
        ) : (
          "Generar"
        )}
      </button>

      {error && (
        <div className="mt-4 rounded-md border border-red-800 bg-red-950/50 p-4 text-sm text-red-300">
          <p className="font-semibold">Error al procesar:</p>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-lg font-medium text-slate-200">Resultado Generado</h2>
            {result.provider && (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                  result.provider === "ollama"
                    ? "bg-emerald-950/70 text-emerald-300 border-emerald-600"
                    : result.provider === "gemini"
                    ? "bg-purple-950/70 text-purple-300 border-purple-600"
                    : "bg-indigo-950/70 text-indigo-300 border-indigo-600"
                }`}
              >
                {result.provider === "ollama" && "⚡ Generado con Ollama Local (RTX 4060)"}
                {result.provider === "gemini" && "✨ Generado con Google Gemini (Nube)"}
                {result.provider === "anthropic" && "🧠 Generado con Claude Sonnet 5.5 (Nube)"}
              </span>
            )}
          </div>

          <section>
            <h3 className="mb-2 font-semibold text-slate-300">CV adaptado</h3>
            <pre className="whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-900 p-4 text-sm leading-relaxed text-slate-200">
              {result.cv_generado}
            </pre>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-slate-300">Carta de presentación</h3>
            <pre className="whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-900 p-4 text-sm leading-relaxed text-slate-200">
              {result.carta_generada}
            </pre>
          </section>
        </div>
      )}
    </main>
  );
}
