import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({ createClient }));

beforeEach(() => {
  createClient.mockReset();
  vi.unstubAllEnvs();
  vi.resetModules();
});

const URL = "https://example.supabase.co";
const KEY = "service-key";

function stubEnv() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", KEY);
}

async function importRoute() {
  return import("@/app/api/users/route.js");
}

describe("GET /api/users", () => {
  it("retorna 503 sem configuração", async () => {
    const { GET } = await importRoute();
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Supabase não configurado");
  });

  it("lista usuários com sucesso", async () => {
    stubEnv();
    const users = [{ id: "1", full_name: "João" }];
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: users, error: null }),
      }),
    });
    createClient.mockReturnValue({ from });

    const { GET } = await importRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toEqual(users);
  });

  it("retorna 500 em erro de consulta", async () => {
    stubEnv();
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
      }),
    });
    createClient.mockReturnValue({ from });

    const { GET } = await importRoute();
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/users", () => {
  it("retorna 400 com dados inválidos", async () => {
    stubEnv();
    const { POST } = await importRoute();
    const req = {
      json: vi.fn().mockResolvedValue({ username: "!invalido", password: "", full_name: "" }),
    };
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("cria usuário e profile", async () => {
    stubEnv();
    const admin = {
      createUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
      deleteUser: vi.fn(),
    };
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    createClient.mockReturnValue({ auth: { admin }, from });

    const { POST } = await importRoute();
    const req = {
      json: vi.fn().mockResolvedValue({
        username: "joao.silva",
        password: "123456",
        full_name: "João Silva",
        role: "attendant",
        sector_id: "farmacia",
      }),
    };
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.username).toBe("joao.silva");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ username: "joao.silva" }),
    );
  });

  it("faz rollback do auth quando profile falha", async () => {
    stubEnv();
    const admin = {
      createUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
      deleteUser: vi.fn().mockResolvedValue({ error: null }),
    };
    const insert = vi.fn().mockResolvedValue({ error: { message: "dup" } });
    const from = vi.fn().mockReturnValue({ insert });
    createClient.mockReturnValue({ auth: { admin }, from });

    const { POST } = await importRoute();
    const req = {
      json: vi.fn().mockResolvedValue({
        username: "joao.silva",
        password: "123456",
        full_name: "João Silva",
      }),
    };
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(admin.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("retorna 500 quando createUser falha (sem rollback)", async () => {
    stubEnv();
    const admin = {
      createUser: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "auth boom" },
      }),
      deleteUser: vi.fn(),
    };
    const from = vi.fn();
    createClient.mockReturnValue({ auth: { admin }, from });

    const { POST } = await importRoute();
    const req = {
      json: vi.fn().mockResolvedValue({
        username: "joao.silva",
        password: "123456",
        full_name: "João Silva",
      }),
    };
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("aplica defaults de role/sector_id quando omitidos", async () => {
    stubEnv();
    const admin = {
      createUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
      deleteUser: vi.fn(),
    };
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    createClient.mockReturnValue({ auth: { admin }, from });

    const { POST } = await importRoute();
    const req = {
      json: vi.fn().mockResolvedValue({
        username: "joao.silva",
        password: "123456",
        full_name: "João Silva",
      }),
    };
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ role: "attendant", sector_id: null }),
    );
  });
});

describe("DELETE /api/users", () => {
  it("retorna 400 sem id", async () => {
    stubEnv();
    const { DELETE } = await importRoute();
    const req = { url: "http://localhost/api/users" };
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it("remove profile e auth", async () => {
    stubEnv();
    const admin = { deleteUser: vi.fn().mockResolvedValue({ error: null }) };
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const from = vi.fn().mockReturnValue({ delete: del });
    createClient.mockReturnValue({ auth: { admin }, from });

    const { DELETE } = await importRoute();
    const req = { url: "http://localhost/api/users?id=user-1" };
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    expect(admin.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("retorna 500 quando remoção do profile falha (sem excluir auth)", async () => {
    stubEnv();
    const admin = { deleteUser: vi.fn().mockResolvedValue({ error: null }) };
    const del = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: { message: "boom" } }),
    });
    const from = vi.fn().mockReturnValue({ delete: del });
    createClient.mockReturnValue({ auth: { admin }, from });

    const { DELETE } = await importRoute();
    const req = { url: "http://localhost/api/users?id=user-1" };
    const res = await DELETE(req);
    expect(res.status).toBe(500);
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("retorna 500 quando remoção do auth falha", async () => {
    stubEnv();
    const admin = {
      deleteUser: vi.fn().mockResolvedValue({ error: { message: "boom" } }),
    };
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const from = vi.fn().mockReturnValue({ delete: del });
    createClient.mockReturnValue({ auth: { admin }, from });

    const { DELETE } = await importRoute();
    const req = { url: "http://localhost/api/users?id=user-1" };
    const res = await DELETE(req);
    expect(res.status).toBe(500);
  });
});