"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { GenerateContentResponse, Resume } from "@/lib/types";

export default function DashboardPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [preferredProvider, setPreferredProvider] = useState<"auto" | "ollama" | "anthropic" | "gemini">("auto");
  const [manualMode, setManualMode] = useState(false);
  const [result, setResult] = useState<GenerateContentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingResumes, setLoadingResumes] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function fetchUserResumes() {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        setLoadingResumes(false);
        return;
      }
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data, error: resumeErr } = await supabase
            .from("resumes")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

          if (!resumeErr && data && data.length > 0) {
            setResumes(data);
            const current = data.find((r) => r.es_actual) || data[0];
            setResumeId(current.id);
          }
        }
      } catch (err) {
        console.error("Error al cargar CVs del usuario:", err);
      } finally {
        setLoadingResumes(false);
      }
    }

    fetchUserResumes();
  }, [supabase]);

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Generar CV y Carta Adaptados</h1>
          <p className="mt-1 text-sm text-slate-400">
            Adapta tu experiencia en segundos al perfil exacto de la vacante
          </p>
        </div>
        <Link
          href="/dashboard/resumes"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          Mis CVs →
        </Link>
      </div>

      {/* Selector de CV */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-slate-300">
            CV Base para la adaptación
          </label>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/resumes"
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
            >
              + Subir nuevo CV
            </Link>
            <button
              type="button"
              onClick={() => setManualMode(!manualMode)}
              className="text-[11px] text-slate-500 hover:text-slate-400"
            >
              {manualMode ? "Usar lista de CVs" : "Pegar UUID manual"}
            </button>
          </div>
        </div>

        {manualMode ? (
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            value={resumeId}
            onChange={(e) => setResumeId(e.target.value)}
            placeholder="uuid del CV (ej: 123e4567-e89b-12d3-a456-426614174000)"
          />
        ) : loadingResumes ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5 text-xs text-slate-400">
            Cargando tus CVs guardados...
          </div>
        ) : resumes.length > 0 ? (
          <select
            value={resumeId}
            onChange={(e) => setResumeId(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
          >
            {resumes.map((r) => {
              const snippet = r.contenido_base.slice(0, 45).replace(/\n/g, " ");
              return (
                <option key={r.id} value={r.id}>
                  {r.es_actual ? "★ [Principal] " : ""}
                  {snippet}... ({new Date(r.created_at).toLocaleDateString()})
                </option>
              );
            })}
          </select>
        ) : (
          <div className="rounded-lg border border-dashed border-indigo-900/80 bg-indigo-950/20 p-4 text-xs text-indigo-300">
            <span>No tienes ningún CV registrado aún. </span>
            <Link href="/dashboard/resumes" className="font-semibold underline hover:text-white">
              Sube tu primer CV aquí para empezar →
            </Link>
          </div>
        )}
      </div>

      {/* Descripción de la Oferta */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-slate-300">
          Descripción de la Oferta de Empleo
        </label>
        <textarea
          className="h-44 w-full rounded-lg border border-slate-700 bg-slate-900 p-3.5 text-xs leading-relaxed text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          value={jobDescriptionText}
          onChange={(e) => setJobDescriptionText(e.target.value)}
          placeholder="Pega aquí la descripción completa de la vacante, requisitos, tecnologías solicitadas y responsabilidades..."
        />
      </div>

      {/* Selector de IA */}
      <div className="mb-6">
        <label className="mb-1.5 block text-xs font-medium text-slate-300">
          Motor de IA para Generación
        </label>
        <select
          value={preferredProvider}
          onChange={(e) =>
            setPreferredProvider(e.target.value as "auto" | "ollama" | "anthropic" | "gemini")
          }
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
        >
          <option value="auto">Automático (Ollama Local en RTX 4060 con fallback Nube)</option>
          <option value="ollama">⚡ Ollama Local (qwen2.5:7b en GPU local - $0/Privado)</option>
          <option value="anthropic">🧠 Claude Sonnet 5.5 (API Nube Anthropic)</option>
          <option value="gemini">✨ Google Gemini 2.5 (API Nube Google AI)</option>
        </select>
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading || !resumeId || !jobDescriptionText.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span>Generando documentos con IA...</span>
          </>
        ) : (
          "Generar CV Adaptado y Carta"
        )}
      </button>

      {error && (
        <div className="mt-5 rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
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
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-slate-300">CV Adaptado para la Oferta</h3>
              <button
                onClick={() => navigator.clipboard.writeText(result.cv_generado)}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
              >
                Copiar texto
              </button>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/90 p-4 text-xs leading-relaxed text-slate-200">
              {result.cv_generado}
            </pre>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-slate-300">Carta de Presentación</h3>
              <button
                onClick={() => navigator.clipboard.writeText(result.carta_generada)}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
              >
                Copiar texto
              </button>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/90 p-4 text-xs leading-relaxed text-slate-200">
              {result.carta_generada}
            </pre>
          </section>
        </div>
      )}
    </main>
  );
}
