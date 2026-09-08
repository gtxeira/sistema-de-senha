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
   * @returns {Promise<void>}
   */
  async saveCall(call) {}

  /**
   * Reset sequence for sector
   * @param {'farmacia'|'recepcao'} sector
   * @returns {Promise<void>}
   */
  async resetSector(sector) {}
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
 */
export class AuthRepository {
  /**
   * Resolve login username to email (using admin if configured)
   * @param {string} username
   * @returns {Promise<string>}
   */
  async resolveLoginEmail(username) {}

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
   *   guiche: 'none'|'guiche-1'|'guiche-2'|'guiche-3'|'guiche-4'
   * }>}
   * @throws {{ status: number, message: string }} on error (400, 401, 403, 500, 503)
   */
  async login(login, password) {}
}

/**
 * Users repository interface (profiles)
 */
export class UsersRepository {
  /**
   * List all users
   * @returns {Promise<Array<{
   *   id: string,
   *   username?: string,
   *   full_name: string,
   *   role: 'admin'|'attendant',
   *   sector_id: 'farmacia'|'recepcao'|null
   * }>>}
   */
  async list() {}

  /**
   * Create a new user
   * @param {{
   *   username: string,
   *   password: string,
   *   full_name: string,
   *   role?: 'admin'|'attendant',
   *   sector_id?: 'farmacia'|'recepcao'|null
   * }} data
   * @returns {Promise<{
   *   success: boolean,
   *   user: {
   *     id: string,
   *     username: string,
   *     full_name: string,
   *     role: 'admin'|'attendant',
   *     sector_id: 'farmacia'|'recepcao'|null
   *   }
   * }>}
   * @throws {{ status: number, message: string }} on error
   */
  async create(data) {}

  /**
   * Delete a user by id
   * @param {string} id
   * @returns {Promise<{ success: boolean }>}
   * @throws {{ status: number, message: string }} on error
   */
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

/**
 * Realtime repository interface
 */
export class RealtimeRepository {
  /**
   * Subscribe to queue inserts for a sector
   * @param {'farmacia'|'recepcao'} sector
   * @param {(call: { id:string, number:number, type:string, time:string }) => void} callback
   * @returns {() => void} unsubscribe function
   */
  async subscribeToQueue(sector, callback) {}
}
