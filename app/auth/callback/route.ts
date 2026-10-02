import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Solo rutas internas: evita open redirect con valores como "@evil.com", "//evil.com" o "https://...".
  const requestedNext = searchParams.get("next") ?? "";
  const next =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//") && !requestedNext.includes("\\")
      ? requestedNext
      : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
