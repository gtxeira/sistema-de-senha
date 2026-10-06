import crypto from "node:crypto";
import { ALL_PERMISSIONS } from "@/lib/permissions.js";

/**
 * Validate username format (nome.sobrenome).
 */
function isValidUsername(username) {
  return /^[a-z0-9]+(?:[._][a-z0-9]+)*$/.test(username);
}

function routeError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * In-memory implementation of UsersRepository for fast contract testing.
 */
export class InMemoryUsersRepository {
  #users = new Map(); // id → user
  #usernameIndex = new Map(); // username → id

  /**
   * Seed a user into the in-memory store.
   * @param {object} data
   * @returns {{ id: string, username: string }}
   */
  seedUser(data) {
    const id = crypto.randomUUID();
    const username = (data.username || `user.${Date.now()}`).toLowerCase();
    const user = {
      id,
      username,
      full_name: data.full_name || "Test User",
      role: data.role || "attendant",
      sector_id: data.sector_id || null,
      active: data.active ?? true,
      permissions: [],
    };
    this.#users.set(id, user);
    this.#usernameIndex.set(username, id);
    return { id, username };
  }

  async list() {
    return Array.from(this.#users.values());
  }

  async create(data) {
    const username = (data.username || "").trim().toLowerCase();

    if (!isValidUsername(username) || !data.password || !data.full_name) {
      throw routeError(
        400,
        "Usuário (nome.sobrenome), senha e nome completo são obrigatórios",
      );
    }

    if (this.#usernameIndex.has(username)) {
      throw routeError(409, "Nome de usuário já existe");
    }

    const id = crypto.randomUUID();
    const user = {
      id,
      username,
      full_name: data.full_name,
      role: data.role || "attendant",
      sector_id: data.sector_id || null,
      active: data.active ?? true,
      permissions: data.permissions ? [...data.permissions] : [],
    };
    this.#users.set(id, user);
    this.#usernameIndex.set(username, id);

    return {
      success: true,
      user,
    };
  }

  async update(id, data) {
    const user = this.#users.get(id);
    if (!user) throw routeError(404, "Usuário não encontrado");

    if (data?.full_name !== undefined) {
      const fullName = String(data.full_name).trim();
      if (!fullName) throw routeError(400, "Nome completo é obrigatório");
      user.full_name = fullName;
    }
    // senha vazia/ausente mantém a atual (mesma regra do repositório real)
    if (data?.password) {
      if (String(data.password).length < 6) {
        throw routeError(400, "Senha deve ter pelo menos 6 caracteres");
      }
      user.password_hash = `hashed:${data.password}`;
    }
    if (data?.role !== undefined) user.role = data.role;
    if (data?.role_id !== undefined) user.role_id = data.role_id;
    if (data?.sector_id !== undefined) user.sector_id = data.sector_id || null;
    if (data?.active !== undefined) user.active = !!data.active;

    return { ...user };
  }

  async setPermissions(id, permissions) {
    const user = this.#users.get(id);
    if (!user) throw routeError(404, "Usuário não encontrado");
    if (!Array.isArray(permissions)) {
      throw routeError(400, "Permissões devem ser uma lista");
    }

    const rows = [];
    for (const row of permissions) {
      if (!ALL_PERMISSIONS.includes(row?.permission)) {
        throw routeError(400, `Permissão desconhecida: ${row?.permission}`);
      }
      rows.push({ permission: row.permission, granted: !!row.granted });
    }

    user.permissions = rows;
    return rows;
  }

  async remove(id) {
    const user = this.#users.get(id);
    if (!user) throw routeError(404, "Usuário não encontrado");
    this.#users.delete(id);
    if (user.username) {
      this.#usernameIndex.delete(user.username);
    }
  }
}
