import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

import { PrismaClient } from '../../src/server/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * Seed a test user into the users table via Prisma.
 * Password is hashed with bcrypt before insert.
 * @param {object} data
 * @param {string} data.username
 * @param {string} data.password
 * @param {string} data.full_name
 * @param {string} [data.role] chave do cargo ("admin"|"attendant"|custom)
 * @param {string} [data.sector_id]
 * @returns {{ id: string, username: string, password: string }}
 */
export interface SeedTestUserInput {
  readonly id?: string;
  readonly username?: string;
  readonly password?: string;
  readonly full_name?: string;
  /** Chave do cargo (`"admin" | "attendant"` ou custom). */
  readonly role?: string;
  /** Coluna nullable no banco. */
  readonly sector_id?: string | null;
}

export async function seedTestUser(data: SeedTestUserInput) {
  const id = data.id || crypto.randomUUID();
  const username = data.username || `test.user.${Date.now()}`;
  const email = `${username}@central-atendimento.local`;
  const rawPassword = data.password || 'default123';
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  // `users.role` (enum) virou FK para a tabela `roles`
  const role = await prisma.roles.findUnique({
    where: { key: data.role || 'attendant' },
  });
  if (!role)
    throw new Error(`Cargo não encontrado: ${data.role || 'attendant'}`);

  await prisma.users.create({
    data: {
      id,
      username,
      email,
      password_hash: passwordHash,
      full_name: data.full_name || 'Test User',
      role_id: role.id,
      sector_id: data.sector_id || null,
    },
  });

  // Devolve a senha que foi de fato hasheada (`rawPassword`): quando o teste
  // não informa, entra o padrão — devolver `data.password` solto aqui quebraria
  // quem usa o retorno para montar a credencial.
  return { id, username, password: rawPassword };
}

/**
 * Clean up test users by username.
 * @param {string[]} usernames
 */
export async function cleanupTestUsers(usernames: readonly string[]) {
  if (!usernames.length) return;
  await prisma.users.deleteMany({
    // Prisma pede `string[]`; o spread preserva a leitura `readonly` da assinatura.
    where: { username: { in: [...usernames] } },
  });
}

/**
 * Clean up all test users (prefix test.).
 */
export async function cleanupAllTestUsers() {
  await prisma.users.deleteMany({
    where: { username: { startsWith: 'test.' } },
  });
}

/**
 * Seed a test news item into the news table via Prisma.
 * @param {object} data
 * @param {string} [data.title]
 * @param {string} [data.image]
 * @param {Date} [data.created_at]
 * @returns {{ id: number, title: string }}
 */
export interface SeedTestNewsInput {
  readonly title?: string;
  readonly image?: string;
  readonly active?: boolean;
  readonly created_at?: Date;
}

export async function seedTestNews(data: SeedTestNewsInput = {}) {
  const result = await prisma.news.create({
    data: {
      title: data.title || `Test News ${Date.now()}`,
      image_url: data.image || 'https://fake.test/news.jpg',
      active: data.active !== undefined ? data.active : true,
      ...(data.created_at ? { created_at: data.created_at } : {}),
    },
    select: { id: true, title: true },
  });

  return { id: Number(result.id), title: result.title };
}

/**
 * Clean up test news items by id.
 * @param {number[]} ids
 */
export async function cleanupTestNews(ids: readonly number[]) {
  if (!ids.length) return;
  await prisma.news.deleteMany({
    where: { id: { in: ids.map(BigInt) } },
  });
}

/**
 * Clean up all news records (for tests that need isolated state).
 */
export async function cleanupAllNews() {
  await prisma.news.deleteMany();
}

/**
 * Seed a queue sequence for a sector/type.
 * @param {'farmacia'|'recepcao'} sector
 * @param {'normal'|'preferencial'} type
 * @param {number} currentNumber
 */
export async function seedTestQueueSequence(
  sector: string,
  type: 'normal' | 'preferencial',
  currentNumber: number,
) {
  await prisma.queue_sequences.upsert({
    where: {
      sector_id_call_type: {
        sector_id: sector,
        call_type: type,
      },
    },
    update: { current_number: currentNumber, updated_at: new Date() },
    create: {
      sector_id: sector,
      call_type: type,
      current_number: currentNumber,
    },
  });
}

/**
 * Clean up queue test data (calls + sequences).
 */
export async function cleanupQueueTestData() {
  await prisma.queue_calls.deleteMany();
  await prisma.queue_sequences.deleteMany();
  // The sector rows themselves are seeded and referenced by FKs — only the
  // reset marker is cleared, so tests start with "never reset".
  await prisma.sectors.updateMany({ data: { reset_at: null } });
}

export { prisma };
