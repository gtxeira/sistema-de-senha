import crypto from "node:crypto";

/**
 * Validate username format (nome.sobrenome).
 */
function isValidUsername(username) {
  return /^[a-z0-9]+(?:[._][a-z0-9]+)*$/.test(username);
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
      const err = new Error(
        "Usuário (nome.sobrenome), senha e nome completo são obrigatórios",
      );
      err.status = 400;
      throw err;
    }

    if (this.#usernameIndex.has(username)) {
      const err = new Error("Nome de usuário já existe");
      err.status = 409;
      throw err;
    }

    const id = crypto.randomUUID();
    const user = {
      id,
      username,
      full_name: data.full_name,
      role: data.role || "attendant",
      sector_id: data.sector_id || null,
    };
    this.#users.set(id, user);
    this.#usernameIndex.set(username, id);

    return {
      success: true,
      user,
    };
  }

  async remove(id) {
    const user = this.#users.get(id);
    if (!user) {
      const err = new Error("Usuário não encontrado");
      err.status = 404;
      throw err;
    }
    this.#users.delete(id);
    if (user.username) {
      this.#usernameIndex.delete(user.username);
    }
  }
}
