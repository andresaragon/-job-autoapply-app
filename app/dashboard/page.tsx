"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { GenerateContentResponse, JobPosting, Resume } from "@/lib/types";
import CvPdfModal from "@/components/CvPdfModal";

function DashboardContent() {
  const searchParams = useSearchParams();
  const urlJobId = searchParams.get("job_id");

  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [preferredProvider, setPreferredProvider] = useState<"auto" | "ollama" | "anthropic" | "gemini">("auto");
  const [manualMode, setManualMode] = useState(false);
  const [result, setResult] = useState<GenerateContentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingResumes, setLoadingResumes] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCvPdfModal, setShowCvPdfModal] = useState(false);

  // Guardado en Mis Postulaciones
  const [savingApp, setSavingApp] = useState(false);
  const [savedAppSuccess, setSavedAppSuccess] = useState(false);
  const [savedAppError, setSavedAppError] = useState<string | null>(null);

  const supabase = createClient();

  // Cargar CVs del usuario
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

  // Si viene job_id por parámetro, cargar los datos de la vacante
  useEffect(() => {
    if (!urlJobId) return;

    async function loadJob() {
      try {
        const { data, error: jobErr } = await supabase
          .from("job_postings")
          .select("*")
          .eq("id", urlJobId)
          .single();

        if (!jobErr && data) {
          setSelectedJob(data);
          setJobDescriptionText(data.descripcion || "");
        }
      } catch (err) {
        console.error("Error al cargar vacante desde job_id:", err);
      }
    }

    loadJob();
  }, [urlJobId, supabase]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);
    setSavedAppSuccess(false);
    setSavedAppError(null);

    try {
      const payload: {
        resumeId: string;
        preferredProvider: string;
        jobPostingId?: string;
        jobDescriptionText?: string;
      } = {
        resumeId,
        preferredProvider,
      };

      if (selectedJob?.id) {
        payload.jobPostingId = selectedJob.id;
      }
      if (jobDescriptionText.trim()) {
        payload.jobDescriptionText = jobDescriptionText.trim();
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  async function handleSaveApplication() {
    if (!result) return;
    setSavingApp(true);
    setSavedAppError(null);

    try {
      let targetJobPostingId = selectedJob?.id;

      // Si no hay vacante seleccionada (se pegó texto manual), creamos una entrada en job_postings
      if (!targetJobPostingId) {
        const firstLine = jobDescriptionText.split("\n")[0]?.slice(0, 50) || "Oferta Personalizada";
        const manualJobRes = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: firstLine.trim(),
            empresa: "Empresa no especificada",
            url: `https://manual.local/job-${Date.now()}`,
            descripcion: jobDescriptionText,
            remoto: true,
          }),
        });

        const manualJobData = await manualJobRes.json();
        if (!manualJobRes.ok || !manualJobData.job?.id) {
          throw new Error(manualJobData.error || "No se pudo registrar la vacante asociada");
        }
        targetJobPostingId = manualJobData.job.id;
      }

      const appRes = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_posting_id: targetJobPostingId,
          resume_id: resumeId,
          cv_generado: result.cv_generado,
          carta_generada: result.carta_generada,
          estado: "lista_para_revision",
          modo: selectedJob?.tipo_ats ? "auto_ats" : "manual",
        }),
      });

      const appData = await appRes.json();
      if (!appRes.ok) {
        throw new Error(appData.error || "No se pudo guardar la postulación");
      }

      setSavedAppSuccess(true);
    } catch (err) {
      setSavedAppError(err instanceof Error ? err.message : "Error al guardar postulación");
    } finally {
      setSavingApp(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Generar CV y Carta Adaptados</h1>
          <p className="mt-1 text-sm text-slate-400">
            Adapta tu experiencia en segundos al perfil exacto de la vacante
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/jobs"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            Explorar Vacantes →
          </Link>
          <Link
            href="/dashboard/resumes"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            Mis CVs →
          </Link>
        </div>
      </div>

      {/* Tarjeta de vacante preseleccionada si viene de /dashboard/jobs */}
      {selectedJob && (
        <div className="mb-5 rounded-xl border border-indigo-800/80 bg-indigo-950/30 p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                Vacante Seleccionada del Catálogo
              </span>
              <h3 className="text-base font-bold text-white">{selectedJob.titulo}</h3>
              <p className="text-xs text-slate-300">
                {selectedJob.empresa} • {selectedJob.ubicacion || "Remoto"}
                {selectedJob.tipo_ats && (
                  <span className="ml-2 rounded border border-indigo-700/60 bg-indigo-900/40 px-1.5 py-0.5 text-[10px] uppercase text-indigo-300">
                    ATS: {selectedJob.tipo_ats}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={selectedJob.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300 underline"
              >
                Ver oferta ↗
              </a>
              <button
                type="button"
                onClick={() => {
                  setSelectedJob(null);
                  setJobDescriptionText("");
                }}
                className="text-xs text-slate-400 hover:text-slate-200"
                title="Quitar selección"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-slate-300">
            Descripción de la Oferta de Empleo
          </label>
          {!selectedJob && (
            <Link
              href="/dashboard/jobs"
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Seleccionar de catálogo de vacantes →
            </Link>
          )}
        </div>
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
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
                  {result.provider === "ollama" && "⚡ Ollama Local (RTX 4060)"}
                  {result.provider === "gemini" && "✨ Google Gemini"}
                  {result.provider === "anthropic" && "🧠 Claude Sonnet 5.5"}
                </span>
              )}
            </div>

            {/* Botón para guardar la postulación */}
            <div className="flex items-center gap-2">
              {savedAppSuccess ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-950/80 border border-emerald-800 px-3 py-1.5 text-xs text-emerald-300">
                  <span>✓ Guardado en Mis Postulaciones</span>
                  <Link
                    href="/dashboard/applications"
                    className="font-semibold underline hover:text-white"
                  >
                    Ver →
                  </Link>
                </div>
              ) : (
                <button
                  onClick={handleSaveApplication}
                  disabled={savingApp}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {savingApp ? (
                    <>
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <span>💾 Guardar en Mis Postulaciones</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {savedAppError && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-xs text-red-300">
              {savedAppError}
            </div>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-slate-300">CV Adaptado para la Oferta</h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowCvPdfModal(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
                >
                  <span>📄 Exportar PDF ATS</span>
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(result.cv_generado)}
                  className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
                >
                  Copiar texto
                </button>
              </div>
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

          {/* Modal de Exportación a PDF */}
          <CvPdfModal
            isOpen={showCvPdfModal}
            onClose={() => setShowCvPdfModal(false)}
            cvText={result.cv_generado}
            jobTitle={selectedJob?.titulo}
            jobCompany={selectedJob?.empresa}
          />
        </div>
      )}
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-6 py-12 text-center text-xs text-slate-400">
          Cargando panel...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
