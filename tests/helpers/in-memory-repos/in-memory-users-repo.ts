import crypto from "node:crypto";
import { DEFAULT_GUICHE } from "@/lib/constants";
import { ALL_PERMISSIONS, computeEffectivePermissions } from "@/lib/permissions";
import type { Permission, PermissionOverride } from "@/lib/permissions";
import type {
  CreateUserInput,
  UpdateUserInput,
  UserRecord,
  UsersRepository,
} from "@/lib/repositories/types";
import { RouteError } from "@/lib/repositories/utils";
import type { UsersSeedUserInput } from "../../contracts/users-repo.contract";

/**
 * Mesmo truque de `PERMISSION_SET` em `permissions.ts`: guardado como
 * `Set<string>` para filtrar a chave vinda do teste sem cast.
 */
const KNOWN_PERMISSIONS = new Set<string>(ALL_PERMISSIONS);

/**
 * `Array.isArray` tem assinatura `arg is any[]`; declarar o elemento evita
 * que a validação de cada override caia no `any` — mesmo truque do
 * `users-repo.postgres.ts`.
 */
function isOverrideList(value: unknown): value is readonly PermissionOverride[] {
  return Array.isArray(value);
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
  username: string;
  full_name: string;
  active: boolean;
  sector_id: string | null;
  guiche_id: string;
  role_id: string;
  role: string | null;
  role_name: string | null;
  role_built_in: boolean;
  permissions: PermissionOverride[];
  password_hash?: string;
}

function toUserRecord(user: StoredUser): UserRecord {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    active: user.active,
    sector_id: user.sector_id,
    guiche_id: user.guiche_id,
    role_id: user.role_id,
    role: user.role,
    role_name: user.role_name,
    role_built_in: user.role_built_in,
    permissions: user.permissions,
  };
}

/** Valida username (nome.sobrenome). */
function isValidUsername(username: string): boolean {
  return /^[a-z0-9]+(?:[._][a-z0-9]+)*$/.test(username);
}

/**
 * In-memory implementation of UsersRepository for fast contract testing.
 */
export class InMemoryUsersRepository implements UsersRepository {
  #users = new Map<string, StoredUser>();
  #usernameIndex = new Map<string, string>(); // username → id

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

  async list(): Promise<UserRecord[]> {
    return Array.from(this.#users.values()).map(toUserRecord);
  }

  async create(data: CreateUserInput): Promise<{ success: true; user: UserRecord }> {
    const username = (data.username || "").trim().toLowerCase();

    if (!isValidUsername(username) || !data.password || !data.full_name) {
      throw new RouteError(
        400,
        "Usuário (nome.sobrenome), senha e nome completo são obrigatórios",
      );
    }

    if (this.#usernameIndex.has(username)) {
      throw new RouteError(409, "Nome de usuário já existe");
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

  async update(id: string, data: UpdateUserInput): Promise<UserRecord> {
    const user = this.#users.get(id);
    if (!user) throw new RouteError(404, "Usuário não encontrado");

    if (data?.full_name !== undefined) {
      const fullName = String(data.full_name).trim();
      if (!fullName) throw new RouteError(400, "Nome completo é obrigatório");
      user.full_name = fullName;
    }
    // senha vazia/ausente mantém a atual (mesma regra do repositório real)
    if (data?.password) {
      if (String(data.password).length < 6) {
        throw new RouteError(400, "Senha deve ter pelo menos 6 caracteres");
      }
      user.password_hash = `hashed:${data.password}`;
    }
    if (data?.role !== undefined) user.role = data.role;
    if (data?.role_id !== undefined) user.role_id = data.role_id;
    if (data?.sector_id !== undefined) user.sector_id = data.sector_id || null;
    if (data?.active !== undefined) user.active = !!data.active;

    return toUserRecord(user);
  }

  async setPermissions(
    id: string,
    permissions: readonly PermissionOverride[],
  ): Promise<PermissionOverride[]> {
    const user = this.#users.get(id);
    if (!user) throw new RouteError(404, "Usuário não encontrado");
    if (!isOverrideList(permissions)) {
      throw new RouteError(400, "Permissões devem ser uma lista");
    }

    const rows: PermissionOverride[] = [];
    for (const row of permissions) {
      if (!KNOWN_PERMISSIONS.has(row.permission)) {
        throw new RouteError(400, `Permissão desconhecida: ${row.permission}`);
      }
      rows.push({ permission: row.permission, granted: !!row.granted });
    }

    user.permissions = rows;
    return rows;
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

  async remove(id: string): Promise<void> {
    const user = this.#users.get(id);
    if (!user) throw new RouteError(404, "Usuário não encontrado");
    this.#users.delete(id);
    if (user.username) {
      this.#usernameIndex.delete(user.username);
    }
  }
}

/** Monta o registro com os defaults que o Postgres derivaria do cargo/banco. */
function buildUser(
  id: string,
  username: string,
  data: UsersSeedUserInput | CreateUserInput,
): StoredUser {
  const role = data.role || "attendant";
  return {
    id,
    username,
    full_name: data.full_name || "Test User",
    role,
    // Sem `roles` em memória o id do cargo é a própria chave.
    role_id: role,
    role_name: null,
    role_built_in: role === "admin" || role === "attendant",
    guiche_id: DEFAULT_GUICHE,
    sector_id: data.sector_id || null,
    active: data.active ?? true,
    permissions: [],
  };
}
