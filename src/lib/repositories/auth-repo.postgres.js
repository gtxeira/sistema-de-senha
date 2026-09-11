import bcrypt from "bcryptjs";
import { prisma } from "../prisma-client.js";

/**
 * Validate username format (nome.sobrenome)
 * @param {string} username
 * @returns {boolean}
 */
function isValidUsername(username) {
  return /^[a-z0-9]+(?:[._][a-z0-9]+)*$/.test(username);
}

/**
 * Create typed error with status
 * @param {number} status
 * @param {string} message
 * @returns {{ status: number, message: string }}
 */
function routeError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Generate initials from full name (max 2 chars)
 * @param {string} fullName
 * @returns {string}
 */
function initials(fullName) {
  return fullName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export class AuthRepository {
  /**
   * Resolve login username to email
   * @param {string} username
   * @returns {Promise<string>}
   */
  async resolveLoginEmail(username) {
    const user = await prisma.users.findUnique({
      where: { username: username.toLowerCase() },
      select: { email: true },
    });

    if (!user) {
      throw routeError(404, "Usuário não encontrado");
    }

    return user.email;
  }

  /**
   * Login with username and password
   * @param {string} login
   * @param {string} password
   * @returns {Promise<{
   *   id: string,
   *   name: string,
   *   initials: string,
   *   role: 'admin'|'attendant',
   *   sector: 'farmacia'|'recepcao'|null,
   *   guiche: string
   * }>}
   */
  async login(login, password) {
    const username = String(login || "").trim().toLowerCase();

    if (!isValidUsername(username) || !password) {
      throw routeError(400, "Usuário (nome.sobrenome) e senha são obrigatórios");
    }

    const user = await prisma.users.findUnique({
      where: { username },
    });

    if (!user) {
      throw routeError(401, "Login ou senha inválidos.");
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw routeError(401, "Login ou senha inválidos.");
    }

    if (!user.active) {
      throw routeError(403, "Usuário sem acesso ativo.");
    }

    return {
      id: user.id,
      name: user.full_name,
      initials: initials(user.full_name),
      role: user.role,
      sector: user.sector_id,
      guiche: user.guiche_id || "none",
    };
  }
}
