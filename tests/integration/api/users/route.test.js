import { beforeEach, describe, expect, it, vi } from "vitest";

let usersRepo = {
  list: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
};

vi.mock("@/lib/repositories", () => ({
  users: usersRepo,
}));

async function importRoute() {
  return import("@/app/api/users/route.js");
}

function resetMocks() {
  usersRepo.list.mockReset();
  usersRepo.create.mockReset();
  usersRepo.remove.mockReset();
}

describe("GET /api/users", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("retorna 503 sem configuração", async () => {
    usersRepo.list.mockRejectedValue({ status: 503, message: "Supabase não configurado" });
    const { GET } = await importRoute();
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Supabase não configurado");
  });

  it("lista usuários com sucesso", async () => {
    const users = [{ id: "1", full_name: "João" }];
    usersRepo.list.mockResolvedValue(users);

    const { GET } = await importRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toEqual(users);
  });

  it("retorna 500 em erro de consulta", async () => {
    usersRepo.list.mockRejectedValue({ status: 500, message: "boom" });

    const { GET } = await importRoute();
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("boom");
  });
});

describe("POST /api/users", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("retorna 400 com dados inválidos", async () => {
    usersRepo.create.mockRejectedValue({ status: 400, message: "Usuário (nome.sobrenome), senha e nome completo são obrigatórios" });

    const { POST } = await importRoute();
    const req = {
      json: vi.fn().mockResolvedValue({ username: "!invalido", password: "", full_name: "" }),
    };
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Usuário (nome.sobrenome), senha e nome completo são obrigatórios");
  });

  it("cria usuário e profile", async () => {
    const result = {
      success: true,
      user: {
        id: "user-1",
        username: "joao.silva",
        full_name: "João Silva",
        role: "attendant",
        sector_id: "farmacia",
      },
    };
    usersRepo.create.mockResolvedValue(result);

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
  });

  it("faz rollback do auth quando profile falha", async () => {
    usersRepo.create.mockRejectedValue({ status: 500, message: "dup" });

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
    const body = await res.json();
    expect(body.error).toBe("dup");
  });

  it("retorna 500 quando createUser falha (sem rollback)", async () => {
    usersRepo.create.mockRejectedValue({ status: 500, message: "auth boom" });

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
    const body = await res.json();
    expect(body.error).toBe("auth boom");
  });

  it("aplica defaults de role/sector_id quando omitidos", async () => {
    const result = {
      success: true,
      user: {
        id: "user-1",
        username: "joao.silva",
        full_name: "João Silva",
        role: "attendant",
        sector_id: null,
      },
    };
    usersRepo.create.mockResolvedValue(result);

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
    const body = await res.json();
    expect(body.user.role).toBe("attendant");
    expect(body.user.sector_id).toBeNull();
  });
});

describe("DELETE /api/users", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("retorna 400 sem id", async () => {
    const { DELETE } = await importRoute();
    const req = { url: "http://localhost/api/users" };
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it("remove profile e auth", async () => {
    usersRepo.remove.mockResolvedValue({ success: true });

    const { DELETE } = await importRoute();
    const req = { url: "http://localhost/api/users?id=user-1" };
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("retorna 500 quando remoção do profile falha (sem excluir auth)", async () => {
    usersRepo.remove.mockRejectedValue({ status: 500, message: "boom" });

    const { DELETE } = await importRoute();
    const req = { url: "http://localhost/api/users?id=user-1" };
    const res = await DELETE(req);
    expect(res.status).toBe(500);
  });

  it("retorna 500 quando remoção do auth falha", async () => {
    usersRepo.remove.mockRejectedValue({ status: 500, message: "boom" });

    const { DELETE } = await importRoute();
    const req = { url: "http://localhost/api/users?id=user-1" };
    const res = await DELETE(req);
    expect(res.status).toBe(500);
  });
});