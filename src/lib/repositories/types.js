/**
 * Queue repository interface
 */
export class QueueRepository {
  /**
   * Get next number for sector and type (normal/preferencial)
   * @param {'farmacia'|'recepcao'} sector
   * @param {'normal'|'preferencial'} type
   * @returns {Promise<number>}
   */
  async nextNumber(sector, type) {}

  /**
   * Save a queue call
   * @param {{
   *   sector: 'farmacia'|'recepcao',
   *   number: number,
   *   numberStr: string,
   *   sequenceType: 'normal'|'preferencial',
   *   callType: 'normal'|'preferencial',
   *   attendantId: string|null
   * }} call
   * @returns {Promise<{id: string}>}
   */
  async saveCall(call) {}

  /**
   * Reset sequence for sector
   * @param {'farmacia'|'recepcao'} sector
   * @returns {Promise<void>}
   */
  async resetSector(sector) {}

  /**
   * Get the reset marker for a sector (null when never reset)
   * @param {'farmacia'|'recepcao'} sector
   * @returns {Promise<Date|null>}
   */
  async getSectorResetAt(sector) {}

  /**
   * Get recent calls for a sector, optionally excluding pre-reset calls
   * @param {'farmacia'|'recepcao'} sector
   * @param {number} limit
   * @param {Date|null} [resetAt]
   * @returns {Promise<Array<{id:string, number:number, type:string, time:string}>>}
   */
  async getRecentCalls(sector, limit, resetAt) {}
}

/**
 * Read repository interface (aggregations, listings)
 */
export class ReadRepository {
  /**
   * Get stats for a time window with filters
   * @param {{
   *   sector?: 'farmacia'|'recepcao'|null,
   *   since?: Date,
   *   until?: Date|null,
   *   limit?: number
   * }} options
   * @returns {Promise<{
   *   days: number,
   *   summary: { total:number, today:number, preferencial:number, normal:number },
   *   bySector: Array<{sector:string, total:number}>,
   *   byType: Array<{type:string, total:number}>,
   *   recent: Array<{id:string, number:number, type:string, time:string}>,
   *   recentBySector: Record<string, Array<{id:string, number:number, type:string, time:string}>>
   * }>}
   */
  async getStats(options) {}
}

/**
 * Auth repository interface
 *
 * Credential verification is NOT part of this interface — it lives in
 * `src/auth.js` (NextAuth), so there is no second, rate-limit-free path to
 * validate a password.
 */
export class AuthRepository {
  /**
   * Resolve login username to email
   * @param {string} username
   * @returns {Promise<string>}
   */
  async resolveLoginEmail(username) {}
}

/**
 * Users repository interface (profiles + overrides de permissão)
 *
 * `role` é a CHAVE do cargo ("admin"|"attendant"|chave custom) — um dado de
 * exibição/edição. As permissões efetivas saem de
 * `getEffectivePermissions()` (cargo ∪ grants − denials).
 */
export class UsersRepository {
  /**
   * List all users (com cargo e overrides)
   * @returns {Promise<Array<{
   *   id: string,
   *   username?: string,
   *   full_name: string,
   *   role: string,
   *   role_id: string,
   *   role_name: string,
   *   active: boolean,
   *   sector_id: 'farmacia'|'recepcao'|null,
   *   permissions: Array<{permission: string, granted: boolean}>
   * }>>}
   */
  async list() {}

  /**
   * Create a new user
   * @param {{
   *   username: string,
   *   password: string,
   *   full_name: string,
   *   role_id?: string,
   *   role?: string,
   *   sector_id?: 'farmacia'|'recepcao'|null,
   *   active?: boolean,
   *   permissions?: Array<{permission: string, granted: boolean}>
   * }} data
   * @returns {Promise<{ success: boolean, user: object }>}
   * @throws {{ status: number, message: string }} on error
   */
  async create(data) {}

  /**
   * Update user data (senha em branco mantém a atual)
   * @param {string} id
   * @param {object} data
   * @returns {Promise<object>} usuário atualizado
   * @throws {{ status: number, message: string }} on error
   */
  async update(id, data) {}

  /**
   * Substitui os overrides de permissão (grants/denials) do usuário
   * @param {string} id
   * @param {Array<{permission: string, granted: boolean}>} permissions
   * @returns {Promise<Array<{permission: string, granted: boolean}>>}
   * @throws {{ status: number, message: string }} on error
   */
  async setPermissions(id, permissions) {}

  /**
   * Permissões efetivas para login/refresh
   * @param {string} id
   * @returns {Promise<string[]|null>} null se o usuário não existir
   */
  async getEffectivePermissions(id) {}

  /**
   * Delete a user by id
   * @param {string} id
   * @returns {Promise<{ success: boolean }>}
   * @throws {{ status: number, message: string }} on error
   */
  async remove(id) {}
}

/**
 * Roles repository interface (cargos + atribuições de permissão)
 *
 * As chaves de permissão em si vivem em `src/lib/permissions.js` — aqui só
 * se grava cargo→permissão. Cargos built-in são imutáveis.
 */
export class RolesRepository {
  /**
   * @returns {Promise<Array<{id:string, key:string, name:string,
   *   description:string|null, built_in:boolean, permissions:string[]}>>}
   */
  async list() {}

  /** @param {string} key */
  async getByKey(key) {}

  /** @param {{key:string, name:string, description?:string|null, permissions?:string[]}} data */
  async create(data) {}

  /** @param {string} id @param {{name?:string, description?:string|null, permissions?:string[]}} data */
  async update(id, data) {}

  /** @param {string} id */
  async remove(id) {}
}

/**
 * News repository interface
 */
export class NewsRepository {
  /**
   * Create a news item (upload image + save to db)
   * @param {{ title: string, image: File }} data
   * @returns {Promise<{
   *   success: boolean,
   *   news: { id: string, title: string, image: string }
   * }>}
   * @throws {{ status: number, message: string }} on error
   */
  async create(data) {}

  /**
   * Delete a news item (soft delete + remove image)
   * @param {string} id
   * @returns {Promise<{ success: boolean }>}
   * @throws {{ status: number, message: string }} on error
   */
  async remove(id) {}

  /**
   * List active news (limited)
   * @returns {Promise<Array<{id: string, title: string, image: string}>>}
   */
  async listActive() {}
}
