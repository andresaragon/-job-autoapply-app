export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-semibold sm:text-4xl">
        Aplica más rápido, con documentos que sí encajan con cada oferta
      </h1>
      <p className="max-w-xl text-slate-400">
        Sube tu CV una sola vez. Cada vez que encuentres una vacante, genera en
        segundos una versión adaptada de tu CV y una carta de presentación
        específica, y lleva el seguimiento de cada aplicación en un solo lugar.
      </p>
      <a
        href="/dashboard"
        className="rounded-lg bg-indigo-500 px-6 py-3 font-medium text-white hover:bg-indigo-400"
      >
        Ir al panel
      </a>
    </main>
  );
}
