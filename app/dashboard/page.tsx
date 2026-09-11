"use client";

import { useState } from "react";
import type { GenerateContentResponse } from "@/lib/types";

// Panel mínimo de la fase 1 del roadmap: pegar una oferta a mano y generar el
// CV adaptado y la carta de presentación. Sin autenticación de UI todavía ni
// agregador de vacantes: eso llega en las fases siguientes del plan.
export default function DashboardPage() {
  const [resumeId, setResumeId] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState("");
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
        body: JSON.stringify({ resumeId, jobDescriptionText }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error generando el contenido");
      }

      setResult(await res.json());
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
        ID del CV base (por ahora se sube directamente en la tabla resumes de Supabase)
      </label>
      <input
        className="mb-4 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
        value={resumeId}
        onChange={(e) => setResumeId(e.target.value)}
        placeholder="uuid del CV"
      />

      <label className="mb-1 block text-sm text-slate-400">
        Pega aquí la descripción de la oferta
      </label>
      <textarea
        className="mb-4 h-40 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
        value={jobDescriptionText}
        onChange={(e) => setJobDescriptionText(e.target.value)}
        placeholder="Descripción completa de la vacante..."
      />

      <button
        onClick={handleGenerate}
        disabled={loading || !resumeId || !jobDescriptionText}
        className="rounded-md bg-indigo-500 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {loading ? "Generando..." : "Generar"}
      </button>

      {error && <p className="mt-4 text-red-400">{error}</p>}

      {result && (
        <div className="mt-8 space-y-6">
          <section>
            <h2 className="mb-2 font-semibold">CV adaptado</h2>
            <pre className="whitespace-pre-wrap rounded-md bg-slate-900 p-4 text-sm">
              {result.cv_generado}
            </pre>
          </section>
          <section>
            <h2 className="mb-2 font-semibold">Carta de presentación</h2>
            <pre className="whitespace-pre-wrap rounded-md bg-slate-900 p-4 text-sm">
              {result.carta_generada}
            </pre>
          </section>
        </div>
      )}
    </main>
  );
}
