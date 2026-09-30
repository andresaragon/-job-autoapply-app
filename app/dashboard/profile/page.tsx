"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { UserProfile } from "@/lib/types";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Partial<UserProfile>>({
    nombre_completo: "",
    telefono: "",
    linkedin_url: "",
    github_url: "",
    portafolio_url: "",
    ubicacion: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/profile");
        const data = await res.json();
        if (data.profile) {
          setProfile({
            nombre_completo: data.profile.nombre_completo || "",
            telefono: data.profile.telefono || "",
            linkedin_url: data.profile.linkedin_url || "",
            github_url: data.profile.github_url || "",
            portafolio_url: data.profile.portafolio_url || "",
            ubicacion: data.profile.ubicacion || "",
          });
        }
      } catch (err) {
        console.error("Error al cargar perfil:", err);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo actualizar el perfil");
      }

      setFeedback({ type: "success", message: "¡Perfil de candidato actualizado correctamente!" });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Perfil de Candidato</h1>
          <p className="mt-1 text-sm text-slate-400">
            Datos clave utilizados para auto-completar postulaciones ATS (Greenhouse, Lever, Ashby)
          </p>
        </div>
        <Link
          href="/dashboard/applications"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition"
        >
          Mis Postulaciones →
        </Link>
      </div>

      <div className="rounded-xl border border-indigo-900/60 bg-indigo-950/20 p-4 mb-6 text-xs text-indigo-300">
        💡 <strong>¿Cómo funciona el Auto-Apply?</strong> Cuando vayas a postularte a una vacante con ATS detectado, el motor inyectará estos datos directamente en los campos del formulario sin que tengas que copiarlos a mano.
      </div>

      {feedback && (
        <div
          className={`mb-6 rounded-lg p-3.5 text-xs border ${
            feedback.type === "success"
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
              : "border-red-800 bg-red-950/40 text-red-300"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-900/40" />
      ) : (
        <form onSubmit={handleSave} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div>
            <label className="block text-xs font-medium text-slate-300">Nombre Completo</label>
            <input
              type="text"
              value={profile.nombre_completo || ""}
              onChange={(e) => setProfile({ ...profile, nombre_completo: e.target.value })}
              placeholder="Ej: Santiago Pérez"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-300">Teléfono / WhatsApp</label>
              <input
                type="tel"
                value={profile.telefono || ""}
                onChange={(e) => setProfile({ ...profile, telefono: e.target.value })}
                placeholder="Ej: +57 300 123 4567"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Ubicación / Residencia</label>
              <input
                type="text"
                value={profile.ubicacion || ""}
                onChange={(e) => setProfile({ ...profile, ubicacion: e.target.value })}
                placeholder="Ej: Bogotá, Colombia / Remoto"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">Perfil de LinkedIn (URL)</label>
            <input
              type="url"
              value={profile.linkedin_url || ""}
              onChange={(e) => setProfile({ ...profile, linkedin_url: e.target.value })}
              placeholder="https://www.linkedin.com/in/tu-perfil"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-300">Perfil de GitHub (URL)</label>
              <input
                type="url"
                value={profile.github_url || ""}
                onChange={(e) => setProfile({ ...profile, github_url: e.target.value })}
                placeholder="https://github.com/tu-usuario"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Portafolio / Web (URL)</label>
              <input
                type="url"
                value={profile.portafolio_url || ""}
                onChange={(e) => setProfile({ ...profile, portafolio_url: e.target.value })}
                placeholder="https://tu-web-o-portfolio.com"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-3">
            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-50 transition"
            >
              {saving ? "Guardando cambios..." : "Guardar Perfil de Candidato"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
