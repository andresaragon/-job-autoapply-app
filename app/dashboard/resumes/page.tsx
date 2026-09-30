"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Resume } from "@/lib/types";

export default function ResumesPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [contenidoBase, setContenidoBase] = useState("");
  const [esActual, setEsActual] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedResumeId, setExpandedResumeId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  async function loadResumes() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("resumes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setResumes(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar currículums.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadResumes();
  }, []);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setContenidoBase(content);
        setSuccess(`Archivo "${file.name}" cargado exitosamente en el editor.`);
      }
    };
    reader.onerror = () => {
      setError("No se pudo leer el archivo seleccionado.");
    };
    reader.readAsText(file);
  }

  async function handleSaveResume(e: React.FormEvent) {
    e.preventDefault();
    if (!contenidoBase.trim()) {
      setError("Por favor escribe o pega el contenido de tu CV.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Debes iniciar sesión para guardar tu CV.");
      }

      // Si se marca como actual, desmarcar los demás
      if (esActual && resumes.length > 0) {
        await supabase
          .from("resumes")
          .update({ es_actual: false })
          .eq("user_id", user.id);
      }

      const { data: newResume, error: insertError } = await supabase
        .from("resumes")
        .insert({
          user_id: user.id,
          contenido_base: contenidoBase.trim(),
          es_actual: esActual || resumes.length === 0,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setContenidoBase("");
      setSuccess("¡CV guardado exitosamente!");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadResumes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el CV.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetCurrent(resumeId: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Desmarcar todos y marcar el seleccionado
      await supabase.from("resumes").update({ es_actual: false }).eq("user_id", user.id);
      await supabase.from("resumes").update({ es_actual: true }).eq("id", resumeId);

      await loadResumes();
      setSuccess("CV principal actualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar CV principal.");
    }
  }

  async function handleDeleteResume(resumeId: string) {
    if (!window.confirm("¿Seguro que deseas eliminar esta versión de tu CV?")) return;

    try {
      const { error: deleteError } = await supabase.from("resumes").delete().eq("id", resumeId);
      if (deleteError) throw deleteError;

      await loadResumes();
      setSuccess("CV eliminado con éxito.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar el CV.");
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Mis Currículums Base</h1>
          <p className="text-sm text-slate-400">
            Administra tus versiones de CV para generar adaptaciones automáticas
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-400 hover:text-indigo-300"
        >
          ← Ir al Generador
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 rounded-lg border border-emerald-800 bg-emerald-950/40 p-4 text-sm text-emerald-300">
          {success}
        </div>
      )}

      <div className="grid gap-10 md:grid-cols-5">
        {/* Formulario de Subida (2 cols) */}
        <section className="md:col-span-2">
          <div className="sticky top-20 rounded-xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm">
            <h2 className="mb-4 text-lg font-semibold text-white">Subir o Pegar CV</h2>

            <form onSubmit={handleSaveResume} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">
                  Cargar desde archivo (.txt, .md)
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".txt,.md"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-slate-400 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-200 hover:file:bg-slate-700"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">
                  Contenido estructurado del CV
                </label>
                <textarea
                  rows={10}
                  required
                  value={contenidoBase}
                  onChange={(e) => setContenidoBase(e.target.value)}
                  placeholder="Pega aquí el texto completo de tu CV: Perfil, Experiencia laboral, Tecnologías, Educación..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs leading-relaxed text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="es_actual"
                  checked={esActual}
                  onChange={(e) => setEsActual(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="es_actual" className="text-xs text-slate-300">
                  Usar como CV principal por defecto
                </label>
              </div>

              <button
                type="submit"
                disabled={saving || !contenidoBase.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar CV Base"}
              </button>
            </form>
          </div>
        </section>

        {/* Listado de CVs (3 cols) */}
        <section className="md:col-span-3">
          <h2 className="mb-4 text-lg font-semibold text-white">Versiones Registradas</h2>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400">
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
              Cargando currículums...
            </div>
          ) : resumes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center text-sm text-slate-400">
              No tienes ningún CV registrado. Pega tu currículum en el formulario de la izquierda para comenzar.
            </div>
          ) : (
            <div className="space-y-4">
              {resumes.map((item) => {
                const isExpanded = expandedResumeId === item.id;
                const formattedDate = new Date(item.created_at).toLocaleDateString("es-CO", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-5 transition ${
                      item.es_actual
                        ? "border-indigo-600/70 bg-indigo-950/20 shadow-lg shadow-indigo-500/5"
                        : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs text-slate-400">
                            {item.id.slice(0, 8)}...
                          </span>
                          {item.es_actual && (
                            <span className="rounded-full border border-indigo-500 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                              ★ Principal
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Registrado el {formattedDate}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        {!item.es_actual && (
                          <button
                            onClick={() => handleSetCurrent(item.id)}
                            className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white"
                          >
                            Hacer principal
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteResume(item.id)}
                          className="rounded-md border border-red-900/60 bg-red-950/30 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-900/50"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p
                        className={`font-mono text-xs text-slate-300 ${
                          !isExpanded ? "line-clamp-3" : "whitespace-pre-wrap"
                        }`}
                      >
                        {item.contenido_base}
                      </p>
                      <button
                        onClick={() => setExpandedResumeId(isExpanded ? null : item.id)}
                        className="mt-2 text-xs font-medium text-indigo-400 hover:text-indigo-300"
                      >
                        {isExpanded ? "▲ Ver menos" : "▼ Ver contenido completo"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
