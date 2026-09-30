"use client";

import { createBrowserClient } from "@supabase/ssr";

// Cliente de Supabase para usar en componentes del navegador (Client Components).
// Usa URLs placeholder seguras durante el build de Next.js para evitar fallos de prerender cuando aún no se define .env.local.
export function createClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  return createBrowserClient(url, key);
}
