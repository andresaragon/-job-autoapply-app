// Fábrica compartida para `vi.mock("@/lib/supabase/server", ...)` en los tests de rutas.
import { NextRequest } from "next/server";

export const makeReq = (url: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) =>
  new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? "GET",
    headers: init?.headers,
    body: init?.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
