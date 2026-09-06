import { beforeEach, describe, expect, it, vi } from "vitest";

let createAuthClient;
let adminClient = null;
let authClient = null;
let isAdminConfigured = false;
let isConfigured = false;

vi.mock("@/lib/supabase", () => ({
  createAuthClient: (...args) => createAuthClient(...args),
  get isSupabaseConfigured() {
    return isConfigured;
  },
}));

vi.mock("@/lib/supabase-admin", () => ({
  get isSupabaseAdminConfigured() {
    return isAdminConfigured;
  },
  get supabaseAdmin() {
    return adminClient;
  },
}));

async function importRoute() {
  return import("@/app/api/auth/route.js");
}

describe("POST /api/auth", () => {
  beforeEach(() => {
    isAdminConfigured = false;
    isConfigured = false;
    adminClient = null;
    authClient = null;
    createAuthClient = vi.fn();
  });

  it("retorna 503 sem configuração", async () => {
    const { POST } = await importRoute();
    const res = await POST({ json: vi.fn().mockResolvedValue({ login: "a", password: "b" }) });
    expect(res.status).toBe(503);
  });

  it("retorna 400 para username inválido", async () => {
    isConfigured = true;
    createAuthClient = vi.fn().mockReturnValue({});
    const { POST } = await importRoute();
    const res = await POST({
      json: vi.fn().mockResolvedValue({ login: "!invalido!", password: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("faz login com sucesso retornando perfil", async () => {
    isConfigured = true;
    const auth = {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    };
    const client = {
      auth,
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { full_name: "João Silva", role: "admin", sector_id: "farmacia", guiche_id: "none", active: true },
              error: null,
            }),
          }),
        }),
      }),
    };
    authClient = client;
    createAuthClient = vi.fn().mockReturnValue(client);

    const { POST } = await importRoute();
    const req = {
      json: vi.fn().mockResolvedValue({ login: "joao.silva", password: "123456" }),
    };
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("João Silva");
    expect(body.initials).toBe("JS");
    expect(body.role).toBe("admin");
  });

  it("retorna 401 para credenciais inválidas", async () => {
    isConfigured = true;
    const client = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "invalid" },
        }),
      },
      from: vi.fn(),
    };
    createAuthClient = vi.fn().mockReturnValue(client);

    const { POST } = await importRoute();
    const res = await POST({
      json: vi.fn().mockResolvedValue({ login: "joao.silva", password: "errada" }),
    });
    expect(res.status).toBe(401);
  });

  it("retorna 403 para perfil inativo", async () => {
    isConfigured = true;
    const client = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { full_name: "João", role: "attendant", sector_id: null, guiche_id: "none", active: false },
              error: null,
            }),
          }),
        }),
      }),
    };
    createAuthClient = vi.fn().mockReturnValue(client);

    const { POST } = await importRoute();
    const res = await POST({
      json: vi.fn().mockResolvedValue({ login: "joao.silva", password: "123456" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/auth (com supabaseAdmin)", () => {
  beforeEach(() => {
    isAdminConfigured = false;
    isConfigured = false;
    adminClient = null;
    authClient = null;
    createAuthClient = vi.fn();
  });

  function makeAdmin({ usernameResult, profileResult, adminGetUser }) {
    const chain = {
      select: vi.fn(),
      ilike: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
    };
    chain.select.mockReturnValue(chain);
    chain.ilike.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.maybeSingle.mockResolvedValue(usernameResult);
    chain.single.mockResolvedValue(profileResult);

    adminClient = {
      from: vi.fn(() => chain),
      auth: { admin: { getUserById: adminGetUser } },
    };
  }

  it("retorna 401 quando username não encontrado no admin", async () => {
    isAdminConfigured = true;
    isConfigured = true;
    createAuthClient = vi.fn().mockReturnValue({ auth: {}, from: vi.fn() });
    makeAdmin({ usernameResult: { data: null, error: null }, adminGetUser: vi.fn() });
    const { POST } = await importRoute();
    const res = await POST({
      json: vi.fn().mockResolvedValue({ login: "joao.silva", password: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("retorna 503 para invalid api key no admin", async () => {
    isAdminConfigured = true;
    isConfigured = true;
    createAuthClient = vi.fn().mockReturnValue({ auth: {}, from: vi.fn() });
    makeAdmin({
      usernameResult: { data: null, error: { message: "Invalid API Key" } },
      adminGetUser: vi.fn(),
    });
    const { POST } = await importRoute();
    const res = await POST({
      json: vi.fn().mockResolvedValue({ login: "joao.silva", password: "x" }),
    });
    expect(res.status).toBe(503);
  });

  it("retorna 401 quando getUserById falha", async () => {
    isAdminConfigured = true;
    isConfigured = true;
    createAuthClient = vi.fn().mockReturnValue({ auth: {}, from: vi.fn() });
    makeAdmin({
      usernameResult: { data: { id: "u1" }, error: null },
      adminGetUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "boom" } }),
    });
    const { POST } = await importRoute();
    const res = await POST({
      json: vi.fn().mockResolvedValue({ login: "joao.silva", password: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("usa o email do auth e faz login com sucesso", async () => {
    isAdminConfigured = true;
    isConfigured = true;
    const adminGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: "u1", email: "joao@real.domain" } },
      error: null,
    });
    makeAdmin({
      usernameResult: { data: { id: "u1" }, error: null },
      profileResult: {
        data: { full_name: "João", role: "attendant", sector_id: null, guiche_id: "none", active: true },
        error: null,
      },
      adminGetUser,
    });

    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    const client = {
      auth: { signInWithPassword },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { full_name: "João", role: "attendant", sector_id: null, guiche_id: "none", active: true },
              error: null,
            }),
          }),
        }),
      }),
    };
    createAuthClient = vi.fn().mockReturnValue(client);

    const { POST } = await importRoute();
    const res = await POST({
      json: vi.fn().mockResolvedValue({ login: "joao.silva", password: "123456" }),
    });
    expect(res.status).toBe(200);
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "joao@real.domain",
      password: "123456",
    });
  });
});