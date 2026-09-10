import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ __client: true })),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

beforeEach(() => {
  createClient.mockClear();
  vi.unstubAllEnvs();
});

import { isValidServiceKey } from "@/lib/supabase-admin";

describe("isValidServiceKey", () => {
  it("aceita chave no formato sb_secret_", () => {
    expect(isValidServiceKey("sb_secret_ABCDEFGHIJKLMNOPQRSTUVWXYZ12")).toBe(true);
  });

  it("aceita JWT clássico eyJ", () => {
    expect(
      isValidServiceKey("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature"),
    ).toBe(true);
  });

  it("rejeita valores vazios ou inválidos", () => {
    expect(isValidServiceKey("")).toBe(false);
    expect(isValidServiceKey(undefined)).toBe(false);
    expect(isValidServiceKey(null)).toBe(false);
    expect(isValidServiceKey("not-a-key")).toBe(false);
    expect(isValidServiceKey("sb_secret_short")).toBe(false);
  });
});

describe("supabaseAdmin com env", () => {
  it("cria cliente quando URL e service key válidos", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_ABCDEFGHIJKLMNOPQRSTUVWXYZ12");

    vi.resetModules();
    const mod = await import("@/lib/supabase-admin");
    expect(mod.isSupabaseAdminConfigured).toBe(true);
    expect(mod.supabaseAdmin).not.toBeNull();
    expect(createClient).toHaveBeenCalled();
  });

  it("não cria cliente quando falta service key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    vi.resetModules();
    const mod = await import("@/lib/supabase-admin");
    expect(mod.isSupabaseAdminConfigured).toBe(false);
    expect(mod.supabaseAdmin).toBeNull();
  });
});