import 'server-only';

import { PrismaClient } from '@/server/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Singleton por processo. Sem isso, cada hot-reload do dev cria um client novo
 * e acumula pools de conexão até o Postgres recusar.
 */
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

// Prisma 7 exige driver adapter: a conexão passa a ser feita pelo `pg`,
// não mais pelo engine embutido em `@prisma/client`.
const createAdapter = () =>
  new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma =
  globalForPrisma.prisma || new PrismaClient({ adapter: createAdapter() });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
