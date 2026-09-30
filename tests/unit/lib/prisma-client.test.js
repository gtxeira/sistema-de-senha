import { beforeEach, describe, expect, it, vi } from "vitest";

// O client gerado (prisma-client) importa o runtime real do Prisma; o adapter
// também é substituído para o teste não depender de um DATABASE_URL válido.
vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: vi.fn(),
}));

vi.mock("@prisma/adapter-pg", () => ({
  // função comum (não arrow): o código real instancia com `new`
  PrismaPg: vi.fn(function PrismaPg() {
    return { __adapter: true };
  }),
}));

import { PrismaClient } from "@/generated/prisma/client";

beforeEach(() => {
  PrismaClient.mockReset();
  PrismaClient.mockImplementation(function () {
    return { __mock: true };
  });
  delete globalThis.prisma;
  vi.resetModules();
});

async function importClient() {
  const mod = await import("@/lib/prisma-client");
  return mod.prisma;
}

describe("prisma-client", () => {
  it("cria uma instância do PrismaClient", async () => {
    const prisma = await importClient();
    expect(PrismaClient).toHaveBeenCalledTimes(1);
    expect(prisma.__mock).toBe(true);
  });

  it("reutiliza a mesma instância via globalThis fora de produção", async () => {
    const prisma = await importClient();
    expect(prisma).toBe(globalThis.prisma);
    expect(PrismaClient).toHaveBeenCalledTimes(1);
  });
});
