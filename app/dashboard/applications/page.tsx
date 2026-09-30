"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { ApplicationStatus, ApplicationWithJob, AtsAutoFillPayload } from "@/lib/types";

const STATUS_CONFIG: Record<
  ApplicationStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  borrador: {
    label: "Borrador",
    color: "text-slate-300",
    bg: "bg-slate-800/80",
    border: "border-slate-700",
  },
  lista_para_revision: {
    label: "Lista para revisión",
    color: "text-amber-300",
    bg: "bg-amber-950/60",
    border: "border-amber-800",
  },
  enviada: {
    label: "Enviada",
    color: "text-blue-300",
    bg: "bg-blue-950/60",
    border: "border-blue-800",
  },
  en_proceso: {
    label: "En Proceso",
    color: "text-cyan-300",
    bg: "bg-cyan-950/60",
    border: "border-cyan-800",
  },
  entrevista: {
    label: "Entrevista",
    color: "text-purple-300",
    bg: "bg-purple-950/60",
    border: "border-purple-800",
  },
  rechazada: {
    label: "Rechazada",
    color: "text-rose-300",
    bg: "bg-rose-950/60",
    border: "border-rose-800",
  },
  oferta: {
    label: "¡Oferta!",
    color: "text-emerald-300",
    bg: "bg-emerald-950/60",
    border: "border-emerald-800",
  },
};

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationWithJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Modal para ver los textos generados
  const [viewingApp, setViewingApp] = useState<ApplicationWithJob | null>(null);
  const [copiedCv, setCopiedCv] = useState(false);
  const [copiedCarta, setCopiedCarta] = useState(false);

  // Modal para Auto-Fill ATS
  const [autofillApp, setAutofillApp] = useState<ApplicationWithJob | null>(null);
  const [autofillData, setAutofillData] = useState<AtsAutoFillPayload | null>(null);
  const [loadingAutofill, setLoadingAutofill] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedPlaywright, setCopiedPlaywright] = useState(false);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/applications");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al cargar postulaciones");
      }
      setApplications(data.applications || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido al obtener postulaciones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  async function handleStatusChange(id: string, newStatus: ApplicationStatus) {
    setUpdatingId(id);
    try {
      const res = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, estado: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo actualizar el estado");
      }
      setApplications((prev) =>
        prev.map((app) => (app.id === id ? { ...app, estado: newStatus } : app))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al actualizar estado");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Seguro que deseas eliminar el registro de esta postulación?")) return;

    try {
      const res = await fetch(`/api/applications?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo eliminar la postulación");
      }
      setApplications((prev) => prev.filter((app) => app.id !== id));
      if (viewingApp?.id === id) setViewingApp(null);
      if (autofillApp?.id === id) setAutofillApp(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  function handleCopy(text: string, type: "cv" | "carta") {
    navigator.clipboard.writeText(text);
    if (type === "cv") {
      setCopiedCv(true);
      setTimeout(() => setCopiedCv(false), 2000);
    } else {
      setCopiedCarta(true);
      setTimeout(() => setCopiedCarta(false), 2000);
    }
  }

  async function handleOpenAutofill(app: ApplicationWithJob) {
    setAutofillApp(app);
    setLoadingAutofill(true);
    setAutofillData(null);
    setCopiedScript(false);
    setCopiedPlaywright(false);

    try {
      const res = await fetch(`/api/worker/autofill?application_id=${app.id}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo preparar el auto-fill");
      }
      setAutofillData(data.payload);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al obtener datos de auto-llenado");
    } finally {
      setLoadingAutofill(false);
    }
  }

  function handleCopyScript() {
    if (!autofillData?.script) return;
    navigator.clipboard.writeText(autofillData.script);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  }

  function handleCopyPlaywrightCmd() {
    if (!autofillApp) return;
    const cmd = `node worker/autoapply-playwright.mjs --appId ${autofillApp.id} --secret local-worker`;
    navigator.clipboard.writeText(cmd);
    setCopiedPlaywright(true);
    setTimeout(() => setCopiedPlaywright(false), 2000);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Mis Postulaciones</h1>
          <p className="mt-1 text-sm text-slate-400">
            Control, seguimiento y automatización de postulación con asistente ATS
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/profile"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white"
          >
            Configurar Perfil Candidato
          </Link>
          <Link
            href="/dashboard/jobs"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white"
          >
            Buscar Vacantes →
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-500"
          >
            + Nueva Adaptación
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-800 bg-red-950/40 p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Lista de postulaciones */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900/50 p-5"
            />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
          <p className="text-base font-semibold text-slate-300">Aún no tienes postulaciones guardadas</p>
          <p className="mt-1 text-xs text-slate-500">
            Genera un CV y carta adaptados desde el Generador o el Explorador de Vacantes para guardarlos aquí.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link
              href="/dashboard/jobs"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
            >
              Explorar Vacantes
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => {
            const statusConfig = STATUS_CONFIG[app.estado] || STATUS_CONFIG.borrador;
            const job = app.job_posting;

            return (
              <div
                key={app.id}
                className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-slate-700 hover:bg-slate-900"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-white">
                        {job?.titulo || "Oferta personalizada"}
                      </h3>
                      {job?.remoto && (
                        <span className="rounded-full border border-emerald-800/80 bg-emerald-950/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                          Remoto
                        </span>
                      )}
                      {job?.tipo_ats && (
                        <span className="rounded-full border border-indigo-800 bg-indigo-950/70 px-2 py-0.5 text-[10px] font-medium uppercase text-indigo-300">
                          ATS: {job.tipo_ats}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="font-medium text-slate-300">{job?.empresa || "Empresa externa"}</span>
                      {job?.ubicacion && <span>• 📍 {job.ubicacion}</span>}
                      <span>• Registrada: {new Date(app.created_at).toLocaleDateString()}</span>
                      {app.fecha_envio && (
                        <span className="text-emerald-400">
                          • Enviada: {new Date(app.fecha_envio).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Selector de estado y acciones */}
                  <div className="flex flex-wrap items-center gap-2 sm:self-center">
                    <select
                      value={app.estado}
                      disabled={updatingId === app.id}
                      onChange={(e) => handleStatusChange(app.id, e.target.value as ApplicationStatus)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold focus:outline-none ${statusConfig.bg} ${statusConfig.color} ${statusConfig.border}`}
                    >
                      <option value="borrador">Borrador</option>
                      <option value="lista_para_revision">Lista para revisión</option>
                      <option value="enviada">Enviada</option>
                      <option value="en_proceso">En Proceso</option>
                      <option value="entrevista">Entrevista</option>
                      <option value="rechazada">Rechazada</option>
                      <option value="oferta">¡Oferta!</option>
                    </select>

                    {/* Botón Auto-Fill ATS */}
                    <button
                      onClick={() => handleOpenAutofill(app)}
                      className="flex items-center gap-1.5 rounded-lg border border-indigo-700 bg-indigo-950/40 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-900/60 hover:text-white transition"
                    >
                      <span>🤖 Auto-Fill ATS</span>
                    </button>

                    {(app.cv_generado || app.carta_generada) && (
                      <button
                        onClick={() => setViewingApp(app)}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white"
                      >
                        Ver Textos
                      </button>
                    )}

                    {job?.url && (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                        title="Ver oferta original"
                      >
                        ↗
                      </a>
                    )}

                    <button
                      onClick={() => handleDelete(app.id)}
                      className="rounded-lg border border-red-900/60 bg-red-950/20 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-900/40 hover:text-red-300"
                      title="Eliminar registro"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal para Auto-Fill ATS */}
      {autofillApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-indigo-800/80 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>🤖 Asistente Auto-Fill ATS</span>
                  <span className="rounded bg-indigo-950 border border-indigo-800 px-2 py-0.5 text-[11px] font-medium text-indigo-300 uppercase">
                    {autofillData?.ats || autofillApp.job_posting?.tipo_ats || "Estándar"}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {autofillApp.job_posting?.titulo} en {autofillApp.job_posting?.empresa}
                </p>
              </div>
              <button
                onClick={() => setAutofillApp(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              {loadingAutofill ? (
                <div className="h-40 animate-pulse rounded-xl bg-slate-950/50" />
              ) : autofillData ? (
                <>
                  <div className="rounded-xl border border-indigo-900/80 bg-indigo-950/30 p-4 text-xs space-y-2">
                    <p className="font-semibold text-indigo-300">
                      ⚡ Modo Semi-Automático (Recomendado y Seguro):
                    </p>
                    <ol className="list-decimal pl-4 space-y-1 text-slate-300">
                      <li>
                        Abre la página oficial de la oferta haciendo clic en{" "}
                        <a
                          href={autofillData.targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 underline font-semibold"
                        >
                          Abrir Formulario de Oferta ↗
                        </a>
                      </li>
                      <li>
                        Copia el inyector con el botón de abajo, presiona <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-[11px]">F12</kbd> (Consola) en la página de la oferta y pégalo (<kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-[11px]">Ctrl+V</kbd> + Enter).
                      </li>
                      <li>
                        ¡Todos los campos se completarán al instante con bordes verdes! Revisa y pulsa Enviar.
                      </li>
                    </ol>
                  </div>

                  {/* Campos que se van a rellenar */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Campos mapeados listos ({autofillData.fields.length}):
                    </h4>
                    <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs">
                      {autofillData.fields.map((f, i) => (
                        <div key={i} className="flex items-center gap-1.5 truncate text-slate-300">
                          <span className="text-emerald-400">✓</span>
                          <span className="font-medium text-slate-400">{f.field}:</span>
                          <span className="truncate text-slate-200">{f.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Botones de acción */}
                  <div className="flex flex-col gap-2.5 pt-2">
                    <div className="flex gap-2">
                      <button
                        onClick={handleCopyScript}
                        className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-500 transition"
                      >
                        {copiedScript ? "✓ ¡Inyector Copiado al Portapapeles!" : "📋 Copiar Inyector JavaScript"}
                      </button>
                      <a
                        href={autofillData.targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition flex items-center gap-1.5"
                      >
                        <span>Abrir Oferta</span>
                        <span>↗</span>
                      </a>
                    </div>

                    <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between">
                      <button
                        onClick={handleCopyPlaywrightCmd}
                        className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
                      >
                        <span>💻 {copiedPlaywright ? "✓ Comando Playwright copiado" : "Copiar comando Playwright CLI (Headless)"}</span>
                      </button>

                      <button
                        onClick={() => {
                          handleStatusChange(autofillApp.id, "enviada");
                          setAutofillApp(null);
                        }}
                        className="text-xs text-emerald-400 hover:text-emerald-300 underline font-medium"
                      >
                        Marcar como enviada ✓
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Modal para ver CV y Carta generados */}
      {viewingApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-white">
                  Documentos Adaptados para {viewingApp.job_posting?.titulo || "la vacante"}
                </h3>
                <p className="text-xs text-slate-400">
                  {viewingApp.job_posting?.empresa || "Empresa"} • Modo: {viewingApp.modo}
                </p>
              </div>
              <button
                onClick={() => setViewingApp(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {viewingApp.cv_generado && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                      CV Adaptado
                    </h4>
                    <button
                      onClick={() => handleCopy(viewingApp.cv_generado || "", "cv")}
                      className="text-xs font-medium text-slate-300 hover:text-white"
                    >
                      {copiedCv ? "✓ Copiado" : "Copiar CV"}
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs leading-relaxed text-slate-200">
                    {viewingApp.cv_generado}
                  </pre>
                </div>
              )}

              {viewingApp.carta_generada && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                      Carta de Presentación
                    </h4>
                    <button
                      onClick={() => handleCopy(viewingApp.carta_generada || "", "carta")}
                      className="text-xs font-medium text-slate-300 hover:text-white"
                    >
                      {copiedCarta ? "✓ Copiada" : "Copiar Carta"}
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs leading-relaxed text-slate-200">
                    {viewingApp.carta_generada}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-slate-800 px-6 py-3">
              <button
                onClick={() => setViewingApp(null)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
