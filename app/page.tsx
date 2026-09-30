import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-65px)] max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-indigo-900 bg-indigo-950/40 px-3 py-1 text-xs text-indigo-300">
        <span className="flex h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
        IA Híbrida: Local en tu GPU RTX 4060 o Nube con Claude y Gemini
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
        Aplica más rápido, con documentos que sí encajan con cada oferta
      </h1>
      <p className="max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base">
        Sube tu CV una sola vez. Cada vez que encuentres una vacante, genera en
        segundos una versión adaptada de tu experiencia y una carta de presentación
        específica para superar los filtros ATS.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/dashboard"
          className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500"
        >
          Ir al Generador
        </Link>
        <Link
          href="/dashboard/jobs"
          className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-3 font-semibold text-slate-200 transition-all hover:bg-slate-800 hover:text-white"
        >
          Explorar Vacantes
        </Link>
        <Link
          href="/dashboard/resumes"
          className="rounded-lg border border-slate-800 bg-slate-950 px-6 py-3 font-semibold text-slate-400 transition-all hover:bg-slate-900 hover:text-white"
        >
          Subir mi CV Base
        </Link>
      </div>
    </main>
  );
}
