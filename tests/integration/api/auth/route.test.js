import { beforeEach, describe, expect, it, vi } from "vitest";

let authRepo = {
  login: vi.fn(),
  resolveLoginEmail: vi.fn(),
};

vi.mock("@/lib/repositories", () => ({
  auth: authRepo,
}));

async function importRoute() {
  return import("@/app/api/auth/route.js");
}

function resetMocks() {
  authRepo.login.mockReset();
  authRepo.resolveLoginEmail.mockReset();
}

describe("POST /api/auth", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("retorna 503 sem configuração", async () => {
    authRepo.login.mockRejectedValue({ status: 503, message: "Supabase não configurado" });
    const { POST } = await importRoute();
    const res = await POST({ json: vi.fn().mockResolvedValue({ login: "a", password: "b" }) });
    expect(res.status).toBe(503);
  });

  it("retorna 400 para username inválido", async () => {
    authRepo.login.mockRejectedValue({ status: 400, message: "Usuário inválido. Use nome.sobrenome." });
    const { POST } = await importRoute();
    const res = await POST({
      json: vi.fn().mockResolvedValue({ login: "!invalido!", password: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("faz login com sucesso retornando perfil", async () => {
    const userData = {
      id: "user-1",
      name: "João Silva",
      initials: "JS",
      role: "admin",
      sector: "farmacia",
      guiche: "none",
    };
    authRepo.login.mockResolvedValue(userData);

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
    authRepo.login.mockRejectedValue({ status: 401, message: "Login ou senha inválidos." });

    const { POST } = await importRoute();
    const res = await POST({
      json: vi.fn().mockResolvedValue({ login: "joao.silva", password: "errada" }),
    });
    expect(res.status).toBe(401);
  });

  it("retorna 403 para perfil inativo", async () => {
    authRepo.login.mockRejectedValue({ status: 403, message: "Usuário sem acesso ativo." });

    const { POST } = await importRoute();
    const res = await POST({
      json: vi.fn().mockResolvedValue({ login: "joao.silva", password: "123456" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/auth (com supabaseAdmin)", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("retorna 401 quando username não encontrado no admin", async () => {
    authRepo.login.mockRejectedValue({ status: 401, message: "Login ou senha inválidos." });
    const { POST } = await importRoute();
    const res = await POST({
      json: vi.fn().mockResolvedValue({ login: "joao.silva", password: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("retorna 503 para invalid api key no admin", async () => {
    authRepo.login.mockRejectedValue({ status: 503, message: "Supabase não configurado" });
    const { POST } = await importRoute();
    const res = await POST({
      json: vi.fn().mockResolvedValue({ login: "joao.silva", password: "x" }),
    });
    expect(res.status).toBe(503);
  });

  it("retorna 401 quando getUserById falha", async () => {
    authRepo.login.mockRejectedValue({ status: 401, message: "Login ou senha inválidos." });
    const { POST } = await importRoute();
    const res = await POST({
      json: vi.fn().mockResolvedValue({ login: "joao.silva", password: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("usa o email do auth e faz login com sucesso", async () => {
    const userData = {
      id: "user-1",
      name: "João",
      initials: "J",
      role: "attendant",
      sector: null,
      guiche: "none",
    };
    authRepo.login.mockResolvedValue(userData);

    const { POST } = await importRoute();
    const req = {
      json: vi.fn().mockResolvedValue({ login: "joao.silva", password: "123456" }),
    };
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("João");
  });
});