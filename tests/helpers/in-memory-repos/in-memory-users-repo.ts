import type {
  CreateUserInput,
  UpdateUserInput,
  UserRecord,
  UsersRepository,
} from '@/server/repositories/types';
import type { Permission, PermissionOverride } from '@/shared/permissions';
import type { UsersSeedUserInput } from '../../contracts/users-repo.contract';

import crypto from 'node:crypto';

import { RouteError } from '@/server/http/errors';
import { DEFAULT_GUICHE } from '@/shared/constants';
import {
  ALL_PERMISSIONS,
  computeEffectivePermissions,
} from '@/shared/permissions';

/**
 * Mesmo truque de `PERMISSION_SET` em `permissions.ts`: guardado como
 * `Set<string>` para filtrar a chave vinda do teste sem cast.
 */
const KNOWN_PERMISSIONS = new Set<string>(ALL_PERMISSIONS);

/**
 * In-memory implementation of UsersRepository for fast contract testing.
 */
export class InMemoryUsersRepository implements UsersRepository {
  #usernameIndex = new Map<string, string>(); // username → id
  #users = new Map<string, StoredUser>();

  async create(
    data: CreateUserInput,
  ): Promise<{ success: true; user: UserRecord }> {
    const username = (data.username || '').trim().toLowerCase();

    if (!isValidUsername(username) || !data.password || !data.full_name) {
      throw new RouteError(
        400,
        'Usuário (nome.sobrenome), senha e nome completo são obrigatórios',
      );
    }

    if (this.#usernameIndex.has(username)) {
      throw new RouteError(409, 'Nome de usuário já existe');
    }

    const id = crypto.randomUUID();
    const user = buildUser(id, username, data);
    user.permissions = data.permissions ? [...data.permissions] : [];
    this.#users.set(id, user);
    this.#usernameIndex.set(username, id);

    return {
      success: true,
      user: toUserRecord(user),
    };
  }

  /**
   * Permissões efetivas (cargo ∪ grants − denials).
   *
   * O double não tem a tabela `roles`, então só os overrides do usuário entram
   * no cálculo; `computeEffectivePermissions` aplica o mesmo filtro de chaves
   * inválidas da implementação em Postgres.
   */
  async getEffectivePermissions(id: string): Promise<Permission[] | null> {
    const user = this.#users.get(id);
    if (!user) return null;
    return computeEffectivePermissions([], user.permissions);
  }

  async list(): Promise<UserRecord[]> {
    return [...this.#users.values()].map((user) => toUserRecord(user));
  }

  async remove(id: string): Promise<void> {
    const user = this.#users.get(id);
    if (!user) throw new RouteError(404, 'Usuário não encontrado');
    this.#users.delete(id);
    if (user.username) {
      this.#usernameIndex.delete(user.username);
    }
  }

  /**
   * Seed a user into the in-memory store.
   * @returns `{ id, username }` para o teste reutilizar a linha criada.
   */
  seedUser(data: UsersSeedUserInput): { id: string; username: string } {
    const id = crypto.randomUUID();
    const username = (data.username || `user.${Date.now()}`).toLowerCase();
    this.#usernameIndex.set(username, id);
    this.#users.set(id, buildUser(id, username, data));
    return { id, username };
  }

  async setPermissions(
    id: string,
    permissions: readonly PermissionOverride[],
  ): Promise<PermissionOverride[]> {
    const user = this.#users.get(id);
    if (!user) throw new RouteError(404, 'Usuário não encontrado');
    if (!isOverrideList(permissions)) {
      throw new RouteError(400, 'Permissões devem ser uma lista');
    }

    const rows: PermissionOverride[] = [];
    for (const row of permissions) {
      if (!KNOWN_PERMISSIONS.has(row.permission)) {
        throw new RouteError(400, `Permissão desconhecida: ${row.permission}`);
      }
      rows.push({ granted: !!row.granted, permission: row.permission });
    }

    user.permissions = rows;
    return rows;
  }

  async update(id: string, data: UpdateUserInput): Promise<UserRecord> {
    const user = this.#users.get(id);
    if (!user) throw new RouteError(404, 'Usuário não encontrado');

    if (data?.full_name !== undefined) {
      const fullName = String(data.full_name).trim();
      if (!fullName) throw new RouteError(400, 'Nome completo é obrigatório');
      user.full_name = fullName;
    }
    // senha vazia/ausente mantém a atual (mesma regra do repositório real)
    if (data?.password) {
      if (String(data.password).length < 6) {
        throw new RouteError(400, 'Senha deve ter pelo menos 6 caracteres');
      }
      user.password_hash = `hashed:${data.password}`;
    }
    if (data?.role !== undefined) user.role = data.role;
    if (data?.role_id !== undefined) user.role_id = data.role_id;
    if (data?.sector_id !== undefined) user.sector_id = data.sector_id || null;
    if (data?.active !== undefined) user.active = !!data.active;

    return toUserRecord(user);
  }
}

/**
 * Usuário gravado no Map. Espelha `UserRecord` (é o que `list()`/`create()`
 * devolvem) mais o campo opcional que `update()` escreve.
 *
 * Sem tabela `roles` em memória: `role_id` recebe a própria chave do cargo e
 * `role_name` fica `null` — `toUserRecord()` mantém o shape exato do contrato.
 */
interface StoredUser {
  id: string;
  active: boolean;
  full_name: string;
  guiche_id: string;
  permissions: PermissionOverride[];
  role: null | string;
  role_built_in: boolean;
  role_id: string;
  role_name: null | string;
  sector_id: null | string;
  username: string;
  password_hash?: string;
}

/** Monta o registro com os defaults que o Postgres derivaria do cargo/banco. */
function buildUser(
  id: string,
  username: string,
  data: CreateUserInput | UsersSeedUserInput,
): StoredUser {
  const role = data.role || 'attendant';
  return {
    id,
    full_name: data.full_name || 'Test User',
    role,
    username,
    // Sem `roles` em memória o id do cargo é a própria chave.
    active: data.active ?? true,
    guiche_id: DEFAULT_GUICHE,
    permissions: [],
    role_built_in: role === 'admin' || role === 'attendant',
    role_id: role,
    role_name: null,
    sector_id: data.sector_id || null,
  };
}

/**
 * `Array.isArray` tem assinatura `arg is any[]`; declarar o elemento evita
 * que a validação de cada override caia no `any` — mesmo truque do
 * `users-repo.postgres.ts`.
 */
function isOverrideList(
  value: unknown,
): value is readonly PermissionOverride[] {
  return Array.isArray(value);
}

/** Valida username (nome.sobrenome). */
function isValidUsername(username: string): boolean {
  return /^[a-z0-9]+(?:[._][a-z0-9]+)*$/.test(username);
}

function toUserRecord(user: StoredUser): UserRecord {
  return {
    id: user.id,
    active: user.active,
    full_name: user.full_name,
    guiche_id: user.guiche_id,
    permissions: user.permissions,
    role: user.role,
    role_built_in: user.role_built_in,
    role_id: user.role_id,
    role_name: user.role_name,
    sector_id: user.sector_id,
    username: user.username,
  };
}
