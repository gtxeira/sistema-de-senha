import crypto from 'node:crypto';
import type { AuthRepository } from '@/server/repositories/types';
import { RouteError } from '@/server/http/errors';
import type { AuthSeedUserInput } from '../../contracts/auth-repo.contract';

/** Registro guardado no Map — só `email` é lido, o resto é o seed original. */
interface StoredUser {
  readonly id: string;
  readonly email: string;
  readonly password: string;
  readonly full_name: string | undefined;
  readonly role: string;
  readonly sector_id: string | null;
  readonly active: boolean;
}

/**
 * In-memory implementation of AuthRepository for fast contract testing.
 * Uses a simple Map to simulate user storage.
 */
export class InMemoryAuthRepository implements AuthRepository {
  #users = new Map<string, StoredUser>();

  /**
   * Seed a user into the in-memory store.
   * @returns `{ username, password }` para o teste criar a credencial.
   */
  seedUser(data: AuthSeedUserInput): { username: string; password: string } {
    const id = crypto.randomUUID();
    const username = data.username.toLowerCase();
    const email = `${username}@central-atendimento.local`;
    this.#users.set(username, {
      id,
      email,
      password: data.password,
      full_name: data.full_name,
      role: data.role || 'attendant',
      sector_id: data.sector_id || null,
      active: true,
    });
    return { username, password: data.password };
  }

  async resolveLoginEmail(username: string): Promise<string> {
    const user = this.#users.get(username.toLowerCase());
    if (!user) {
      throw new RouteError(404, 'Usuário não encontrado');
    }
    return user.email;
  }
}
