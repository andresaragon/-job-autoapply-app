import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ exchange: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: h.exchange } }),
}));

import { GET } from "@/app/auth/callback/route";

const call = (qs: string) => GET(new Request(`https://app.example.com/auth/callback${qs}`));

beforeEach(() => h.exchange.mockResolvedValue({ error: null }));

describe("GET /auth/callback", () => {
  it("intercambia el code y redirige a /dashboard por defecto", async () => {
    const res = await call("?code=abc");
    expect(h.exchange).toHaveBeenCalledWith("abc");
    expect(res.headers.get("location")).toBe("https://app.example.com/dashboard");
  });

  it("respeta un destino interno válido", async () => {
    const res = await call("?code=abc&next=/dashboard/jobs");
    expect(res.headers.get("location")).toBe("https://app.example.com/dashboard/jobs");
  });

  it.each(["@evil.com", "//evil.com", "https://evil.com", "\\evil.com", "dashboard"])(
    "no permite open redirect con next=%s",
    async (next) => {
      const res = await call(`?code=abc&next=${encodeURIComponent(next)}`);
      expect(new URL(res.headers.get("location")!).origin).toBe("https://app.example.com");
      expect(res.headers.get("location")).toBe("https://app.example.com/dashboard");
    }
  );

  it("redirige a /login con error si falta el code o el intercambio falla", async () => {
    expect((await call("")).headers.get("location")).toBe("https://app.example.com/login?error=auth_callback_error");
    h.exchange.mockResolvedValue({ error: new Error("expirado") });
    expect((await call("?code=abc")).headers.get("location")).toBe("https://app.example.com/login?error=auth_callback_error");
  });
});
