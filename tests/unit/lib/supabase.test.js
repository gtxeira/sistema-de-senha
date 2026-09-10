import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

beforeEach(() => {
  createClient.mockReset();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("supabase", () => {
  it("isSupabaseConfigured false sem env", async () => {
    const mod = await import("@/lib/supabase");
    expect(mod.isSupabaseConfigured).toBe(false);
    expect(mod.supabase).toBeNull();
  });

  it("cria cliente singleton quando configurado", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    const fake = { __client: true };
    createClient.mockReturnValue(fake);

    const mod = await import("@/lib/supabase");
    expect(mod.isSupabaseConfigured).toBe(true);
    expect(mod.supabase).toBe(fake);
    expect(mod.getRealtimeClient()).toBe(fake);
  });

  it("callQueueAtomic retorna null quando não configurado", async () => {
    const mod = await import("@/lib/supabase");
    expect(await mod.callQueueAtomic("farmacia", "normal")).toBeNull();
  });

  it("callQueueAtomic chama rpc e extrai number", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    const rpc = vi.fn().mockResolvedValue({ data: { number: 9 }, error: null });
    createClient.mockReturnValue({ rpc });

    const mod = await import("@/lib/supabase");
    const n = await mod.callQueueAtomic("farmacia", "preferencial");

    expect(n).toBe(9);
    expect(rpc).toHaveBeenCalledWith("call_queue", {
      p_sector_id: "farmacia",
      p_call_type: "preferencial",
    });
  });

  it("callQueueAtomic lança erro do rpc", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    createClient.mockReturnValue({ rpc });

    const mod = await import("@/lib/supabase");
    await expect(mod.callQueueAtomic("farmacia", "normal")).rejects.toEqual({
      message: "boom",
    });
  });

  it("createAuthClient retorna null sem config", async () => {
    const mod = await import("@/lib/supabase");
    expect(mod.createAuthClient()).toBeNull();
  });

  it("callQueueAtomic aceita data escalar", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    const rpc = vi.fn().mockResolvedValue({ data: 5, error: null });
    createClient.mockReturnValue({ rpc });
    const mod = await import("@/lib/supabase");
    expect(await mod.callQueueAtomic("farmacia", "normal")).toBe(5);
  });

  it("callQueueAtomic extrai campos alternativos", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    for (const field of ["queue_number", "current_number", "next_number"]) {
      const rpc = vi
        .fn()
        .mockResolvedValue({ data: { [field]: 12 }, error: null });
      createClient.mockReturnValue({ rpc });
      const mod = await import("@/lib/supabase");
      expect(await mod.callQueueAtomic("farmacia", "preferencial")).toBe(12);
    }
  });
});