import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(),
}));

import { PrismaClient } from "@prisma/client";

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