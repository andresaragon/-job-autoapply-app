"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      setLoading(false);
      return;
    }

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      // Si Supabase tiene confirmación de email activada
      if (data?.user && data.user.identities && data.user.identities.length === 0) {
        setError("Este correo electrónico ya se encuentra registrado.");
        return;
      }

      if (data?.session) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setSuccessMessage(
          "¡Registro exitoso! Si tu proyecto requiere confirmación, revisa tu bandeja de entrada para verificar tu cuenta."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar la cuenta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-60px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">Crear Cuenta</h1>
          <p className="mt-2 text-sm text-slate-400">
            Obtén 5 créditos de prueba gratuitos para generar CVs con IA
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-md border border-red-800/80 bg-red-950/40 p-3.5 text-sm text-red-300">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-5 rounded-md border border-emerald-800/80 bg-emerald-950/40 p-3.5 text-sm text-emerald-300">
            {successMessage}
            <div className="mt-3">
              <Link
                href="/login"
                className="font-medium text-emerald-200 underline hover:text-white"
              >
                Ir a Iniciar Sesión
              </Link>
            </div>
          </div>
        )}

        {!successMessage && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Correo Electrónico
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Contraseña
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Confirmar Contraseña
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite tu contraseña"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Creando cuenta...</span>
                </>
              ) : (
                "Registrarme"
              )}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-indigo-400 hover:text-indigo-300">
            Inicia sesión aquí
          </Link>
        </p>
      </div>
    </main>
  );
}
