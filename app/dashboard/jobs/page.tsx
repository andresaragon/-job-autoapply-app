"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { JobPosting, SyncJobsResult } from "@/lib/types";

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncJobsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [remoteFilter, setRemoteFilter] = useState<string>("all");
  const [atsFilter, setAtsFilter] = useState<string>("");
  const [totalJobs, setTotalJobs] = useState(0);

  // Modal / Form de agregar vacante manual
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualCompany, setManualCompany] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualLocation, setManualLocation] = useState("Remoto");
  const [manualRemote, setManualRemote] = useState(true);
  const [manualDescription, setManualDescription] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Estado de tarjeta expandida para ver descripción
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (remoteFilter === "remote") params.set("remote", "true");
      if (remoteFilter === "onsite") params.set("remote", "false");
      if (atsFilter) params.set("ats", atsFilter);
      params.set("limit", "50");

      const res = await fetch(`/api/jobs?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al cargar vacantes");
      }

      setJobs(data.jobs || []);
      setTotalJobs(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al conectar con el catálogo de vacantes");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, remoteFilter, atsFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchJobs();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchJobs]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch("/api/jobs/sync", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Fallo en la sincronización de vacantes");
      }
      setSyncResult(data);
      fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error durante la sincronización");
    } finally {
      setSyncing(false);
    }
  }

  async function handleCreateManualJob(e: React.FormEvent) {
    e.preventDefault();
    setSavingManual(true);
    setManualError(null);

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: manualTitle,
          empresa: manualCompany,
          url: manualUrl,
          ubicacion: manualLocation,
          remoto: manualRemote,
          descripcion: manualDescription,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "No se pudo guardar la vacante");
      }

      setShowManualModal(false);
      setManualTitle("");
      setManualCompany("");
      setManualUrl("");
      setManualDescription("");
      fetchJobs();
    } catch (err) {
      setManualError(err instanceof Error ? err.message : "Error al registrar vacante");
    } finally {
      setSavingManual(false);
    }
  }

  function getAtsBadgeColor(ats: string | null) {
    switch (ats) {
      case "greenhouse":
        return "bg-emerald-950/70 text-emerald-400 border-emerald-800";
      case "lever":
        return "bg-amber-950/70 text-amber-400 border-amber-800";
      case "ashby":
        return "bg-purple-950/70 text-purple-400 border-purple-800";
      case "workday":
        return "bg-blue-950/70 text-blue-400 border-blue-800";
      case "smartrecruiters":
        return "bg-sky-950/70 text-sky-400 border-sky-800";
      default:
        return "bg-slate-800/80 text-slate-400 border-slate-700";
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      {/* Encabezado */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Catálogo de Vacantes</h1>
          <p className="mt-1 text-sm text-slate-400">
            Explora ofertas tech remotas agregadas de Remotive y Arbeitnow, listas para adaptar tu CV
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowManualModal(true)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            + Agregar vacante manual
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {syncing ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Sincronizando...</span>
              </>
            ) : (
              <>
                <span>🔄 Sincronizar feeds</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notificación de sincronización */}
      {syncResult && (
        <div className="mb-6 rounded-lg border border-emerald-800 bg-emerald-950/40 p-4 text-xs text-emerald-300 flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">¡Catálogo de vacantes actualizado!</p>
            <p className="mt-0.5 text-emerald-400/90">
              Se sincronizaron {syncResult.totalSynced} vacantes (Remotive: {syncResult.sources.remotive} | Arbeitnow: {syncResult.sources.arbeitnow})
            </p>
          </div>
          <button
            onClick={() => setSyncResult(null)}
            className="text-emerald-400 hover:text-emerald-200 text-xs ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-800 bg-red-950/40 p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Barra de Búsqueda y Filtros */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <input
            type="text"
            placeholder="Buscar por cargo, empresa o tecnología (ej: Python, Frontend, React)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <select
            value={remoteFilter}
            onChange={(e) => setRemoteFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">Modalidad: Todas</option>
            <option value="remote">100% Remoto</option>
            <option value="onsite">Presencial / Híbrido</option>
          </select>
        </div>

        <div>
          <select
            value={atsFilter}
            onChange={(e) => setAtsFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">ATS: Todos</option>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="ashby">Ashby</option>
            <option value="workday">Workday</option>
            <option value="smartrecruiters">SmartRecruiters</option>
          </select>
        </div>
      </div>

      {/* Contador de resultados */}
      <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
        <span>{totalJobs} vacantes encontradas</span>
        <span>Mostrando las más recientes primero</span>
      </div>

      {/* Lista de vacantes */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-slate-800 bg-slate-900/50 p-5"
            />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
          <p className="text-base font-semibold text-slate-300">No se encontraron vacantes</p>
          <p className="mt-1 text-xs text-slate-500">
            {totalJobs === 0
              ? "El catálogo está vacío. Haz clic en 'Sincronizar feeds' para poblarlo con vacantes en vivo."
              : "Prueba ajustando los términos de búsqueda o filtros de modalidad."}
          </p>
          {totalJobs === 0 && (
            <button
              onClick={handleSync}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
            >
              🔄 Sincronizar feeds ahora
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {jobs.map((job) => {
            const isExpanded = expandedJobId === job.id;
            return (
              <div
                key={job.id}
                className="group rounded-xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-slate-700 hover:bg-slate-900"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-white group-hover:text-indigo-300 transition-colors">
                        {job.titulo}
                      </h2>
                      {job.remoto && (
                        <span className="rounded-full border border-emerald-800/80 bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                          Remoto
                        </span>
                      )}
                      {job.tipo_ats && (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${getAtsBadgeColor(
                            job.tipo_ats
                          )}`}
                        >
                          ATS: {job.tipo_ats}
                        </span>
                      )}
                      <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                        {job.fuente}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="font-medium text-slate-300">{job.empresa}</span>
                      {job.ubicacion && (
                        <>
                          <span>•</span>
                          <span>📍 {job.ubicacion}</span>
                        </>
                      )}
                      {job.fecha_publicacion && (
                        <>
                          <span>•</span>
                          <span>
                            Publicada: {new Date(job.fecha_publicacion).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Acciones principales */}
                  <div className="flex items-center gap-2 sm:self-center">
                    <button
                      type="button"
                      onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition"
                    >
                      {isExpanded ? "Ocultar" : "Ver oferta"}
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard?job_id=${job.id}`)}
                      className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-500/30 hover:bg-indigo-500 transition"
                    >
                      <span>⚡ Postular con IA</span>
                    </button>
                  </div>
                </div>

                {/* Vista expandida con la descripción */}
                {isExpanded && (
                  <div className="mt-4 border-t border-slate-800 pt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Descripción de la posición
                      </h4>
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-indigo-400 hover:text-indigo-300 underline"
                      >
                        Abrir publicación original ↗
                      </a>
                    </div>
                    <div className="max-h-80 overflow-y-auto rounded-lg bg-slate-950/70 p-3.5 text-xs leading-relaxed text-slate-300 whitespace-pre-line border border-slate-800/80">
                      {job.descripcion || "No se incluyó descripción detallada en el feed."}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal / Formulario para agregar vacante manual */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-semibold text-white">Agregar Vacante Manual</h3>
              <button
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateManualJob} className="mt-4 space-y-4">
              {manualError && (
                <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-xs text-red-300">
                  {manualError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Título del puesto *
                </label>
                <input
                  type="text"
                  required
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Ej: Senior React / Next.js Developer"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300">Empresa *</label>
                  <input
                    type="text"
                    required
                    value={manualCompany}
                    onChange={(e) => setManualCompany(e.target.value)}
                    placeholder="Ej: Acme Corp"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Ubicación</label>
                  <input
                    type="text"
                    value={manualLocation}
                    onChange={(e) => setManualLocation(e.target.value)}
                    placeholder="Ej: Remoto / Madrid, España"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Enlace a la oferta o portal de postulación (URL) *
                </label>
                <input
                  type="url"
                  required
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="https://jobs.lever.co/empresa/puesto..."
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="remoteCheckbox"
                  checked={manualRemote}
                  onChange={(e) => setManualRemote(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="remoteCheckbox" className="text-xs text-slate-300">
                  Es una posición remota
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Descripción completa y requerimientos
                </label>
                <textarea
                  rows={6}
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  placeholder="Pega la descripción, tecnologías requeridas, responsabilidades..."
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingManual}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {savingManual ? "Guardando..." : "Guardar Vacante"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
