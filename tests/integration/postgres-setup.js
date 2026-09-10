import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Seed a test user into the users table via Prisma.
 * Password is hashed with bcrypt before insert.
 * @param {object} data
 * @param {string} data.username
 * @param {string} data.password
 * @param {string} data.full_name
 * @param {string} [data.role]
 * @param {string} [data.sector_id]
 * @returns {{ id: string, username: string, password: string }}
 */
export async function seedTestUser(data) {
  const id = crypto.randomUUID();
  const username = data.username || `test.user.${Date.now()}`;
  const email = `${username}@central-atendimento.local`;
  const rawPassword = data.password || "default123";
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  await prisma.users.create({
    data: {
      id,
      username,
      email,
      password_hash: passwordHash,
      full_name: data.full_name || "Test User",
      role: data.role || "attendant",
      sector_id: data.sector_id || null,
    },
  });

  return { id, username, password: data.password };
}

/**
 * Clean up test users by username.
 * @param {string[]} usernames
 */
export async function cleanupTestUsers(usernames) {
  if (!usernames.length) return;
  await prisma.users.deleteMany({
    where: { username: { in: usernames } },
  });
}

/**
 * Clean up all test users (prefix test.).
 */
export async function cleanupAllTestUsers() {
  await prisma.users.deleteMany({
    where: { username: { startsWith: "test." } },
  });
}

export { prisma };
