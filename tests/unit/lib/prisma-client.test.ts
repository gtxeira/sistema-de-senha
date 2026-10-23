import { beforeEach, describe, expect, it, vi } from 'vitest';

// O client gerado (prisma-client) importa o runtime real do Prisma; o adapter
// também é substituído para o teste não depender de um DATABASE_URL válido.
vi.mock('@/server/generated/prisma/client', () => ({
  PrismaClient: vi.fn(),
}));

vi.mock('@prisma/adapter-pg', () => ({
  // função comum (não arrow): o código real instancia com `new`
  // eslint-disable-next-line prefer-arrow-callback
  PrismaPg: vi.fn(function PrismaPg() {
    return { __adapter: true };
  }),
}));

import { PrismaClient } from '@/server/generated/prisma/client';

/** Espelha o alias que `src/server/db/prisma-client.ts` usa para gravar em globalThis. */
const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
} & typeof globalThis;

const PrismaClientMock = vi.mocked(PrismaClient);

beforeEach(() => {
  PrismaClientMock.mockReset();
  delete globalForPrisma.prisma;
  vi.resetModules();
});

async function importClient() {
  const mod = await import('@/server/db/prisma-client');
  return mod.prisma;
}

describe('prisma-client', () => {
  it('cria uma instância do PrismaClient', async () => {
    const prisma = await importClient();

    expect(PrismaClientMock).toHaveBeenCalledTimes(1);
    // O construtor é mockado — o export é o objeto que ele instanciou
    // (antes isto era `prisma.__mock`, propriedade que o tipo não tem).
    expect(PrismaClientMock.mock.instances[0]).toBe(prisma);
  });

  it('reutiliza a mesma instância via globalThis fora de produção', async () => {
    const prisma = await importClient();

    expect(globalForPrisma.prisma).toBe(prisma);
    expect(PrismaClientMock).toHaveBeenCalledTimes(1);
  });
});
