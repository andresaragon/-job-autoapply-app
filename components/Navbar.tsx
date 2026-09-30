"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setLoading(false);
      return;
    }

    async function loadUserData() {
      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        setUser(currentUser);

        if (currentUser) {
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("creditos_disponibles")
            .eq("user_id", currentUser.id)
            .single();

          if (sub) {
            setCredits(sub.creditos_disponibles);
          }
        }
      } catch (err) {
        console.error("Error cargando sesión:", err);
      } finally {
        setLoading(false);
      }
    }

    loadUserData();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const authUser = session?.user ?? null;
      setUser(authUser);
      if (authUser) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("creditos_disponibles")
          .eq("user_id", authUser.id)
          .single();
        if (sub) {
          setCredits(sub.creditos_disponibles);
        }
      } else {
        setCredits(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
    setCredits(null);
    router.push("/login");
    router.refresh();
  }

  // No renderizar barra de navegación en login o register si no se desea, o mantenerla limpia
  const isAuthPage = pathname === "/login" || pathname === "/register";

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white shadow-md shadow-indigo-500/20">
              JA
            </span>
            <span>Job AutoApply</span>
          </Link>

          {!isAuthPage && (
            <nav className="hidden items-center gap-4 text-sm font-medium sm:flex">
              <Link
                href="/dashboard"
                className={`transition-colors ${
                  pathname === "/dashboard"
                    ? "text-indigo-400"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Generador
              </Link>
              <Link
                href="/dashboard/resumes"
                className={`transition-colors ${
                  pathname === "/dashboard/resumes"
                    ? "text-indigo-400"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Mis CVs
              </Link>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-4">
          {!loading && user ? (
            <>
              {credits !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-900 bg-indigo-950/50 px-2.5 py-1 text-xs font-medium text-indigo-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  {credits} créditos
                </span>
              )}
              <span className="hidden text-xs text-slate-400 md:inline max-w-[150px] truncate">
                {user.email}
              </span>
              <button
                onClick={handleSignOut}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Salir
              </button>
            </>
          ) : !loading && !isAuthPage ? (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white"
              >
                Entrar
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                Registrarse
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
