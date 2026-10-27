import 'server-only';

import type { Prisma } from '@/server/generated/prisma/client';
import type { Permission, PermissionOverride } from '@/shared/permissions';
import type {
  CreateUserInput,
  UpdateUserInput,
  UserRecord,
  UsersRepository,
} from './types';

import bcrypt from 'bcryptjs';

import { prisma } from '@/server/db/prisma-client';
import { routeError } from '@/server/http/errors';
import { BCRYPT_SALT_ROUNDS, DEFAULT_ROLE } from '@/shared/constants';
import { errorCode, errorMessage, errorStatus } from '@/shared/errors';
import { generateEmail } from '@/shared/format';
import {
  ALL_PERMISSIONS,
  computeEffectivePermissions,
} from '@/shared/permissions';
import { isValidUsername } from '@/shared/validation';

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

/**
 * `Array.isArray` tem assinatura `arg is any[]`; declarar o elemento evita que
 * a validação de cada override caia no `any`.
 */
function isOverrideList(
  value: unknown,
): value is readonly PermissionOverride[] {
  return Array.isArray(value);
}

/**
 * Resolve o cargo de um usuário a partir dos formatos aceitos na API:
 * `role_id` (preferido) ou `role` (chave legada, ex.: "attendant").
 * @returns id do cargo ou null quando não informado
 */
async function resolveRoleId(data: {
  readonly role?: string;
  readonly role_id?: string;
}): Promise<string> {
  if (data.role_id) return String(data.role_id);
  const key = data.role ? String(data.role) : DEFAULT_ROLE;
  const found = await prisma.roles.findUnique({ where: { key } });
  if (!found) throw routeError(400, `Cargo inválido: ${key}`);
  return found.id;
}

/** Valida e normaliza overrides de permissão de um usuário. */
function validateOverrides(
  permissions: readonly PermissionOverride[] | undefined,
): PermissionOverride[] | null {
  if (permissions === undefined) return null;
  if (!isOverrideList(permissions)) {
    throw routeError(400, 'Permissões devem ser uma lista');
  }
  const seen = new Map<string, boolean>();
  for (const row of permissions) {
    if (!PERMISSION_SET.has(row?.permission)) {
      throw routeError(400, `Permissão desconhecida: ${row?.permission}`);
    }
    seen.set(row.permission, !!row.granted);
  }
  return [...seen].map(([permission, granted]) => ({ granted, permission }));
}

const USER_SELECT = {
  id: true,
  active: true,
  full_name: true,
  guiche_id: true,
  permissions: { select: { granted: true, permission: true } },
  role: { select: { name: true, built_in: true, key: true } },
  role_id: true,
  sector_id: true,
  username: true,
};

export class PostgresUsersRepository implements UsersRepository {
  async create(
    data: CreateUserInput,
  ): Promise<{ success: true; user: UserRecord }> {
    const { full_name, password, sector_id, username: rawUsername } = data;
    const username = String(rawUsername || '')
      .trim()
      .toLowerCase();

    if (!isValidUsername(username) || !password || !full_name) {
      throw routeError(
        400,
        'Usuário (nome.sobrenome), senha e nome completo são obrigatórios',
      );
    }

    const roleId = await resolveRoleId(data);
    const overrides = validateOverrides(data?.permissions) ?? [];
    const email = generateEmail(username);
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    try {
      const user = await prisma.users.create({
        data: {
          active: data?.active ?? true,
          email,
          full_name,
          password_hash: passwordHash,
          role_id: roleId,
          sector_id: sector_id || null,
          username,
          ...(overrides.length
            ? { permissions: { create: overrides.map((o) => ({ ...o })) } }
            : {}),
        },
        select: USER_SELECT,
      });

      return { success: true, user: shapeUser(user) };
    } catch (error) {
      if (errorCode(error) === 'P2002') {
        throw routeError(409, 'Nome de usuário já existe');
      }
      if (errorCode(error) === 'P2003') {
        throw routeError(400, 'Cargo inválido');
      }
      throw routeError(
        errorStatus(error),
        errorMessage(error, 'Erro ao criar usuário'),
      );
    }
  }

  /**
   * Permissões efetivas (cargo ∪ grants − denials) para o login/refresh.
   * @returns `null` se o usuário não existir
   */
  async getEffectivePermissions(id: string): Promise<Permission[] | null> {
    const user = await prisma.users.findUnique({
      include: {
        permissions: true,
        role: { include: { permissions: true } },
      },
      where: { id },
    });
    if (!user) return null;
    return computeEffectivePermissions(
      user.role.permissions.map((p) => p.permission),
      user.permissions,
    );
  }

  /** List all users (com cargo e overrides de permissão) */
  async list(): Promise<UserRecord[]> {
    const users = await prisma.users.findMany({
      orderBy: { created_at: 'desc' },
      select: USER_SELECT,
    });

    const shapedUsers = users.map((user) => shapeUser(user));

    return shapedUsers.sort((a, b) => {
      const aIsAdmin = a.role === 'admin';
      const bIsAdmin = b.role === 'admin';

      if (aIsAdmin && !bIsAdmin) return -1;
      if (!aIsAdmin && bIsAdmin) return 1;
      return 0;
    });
  }

  /** Delete a user by id (overrides e refresh tokens caem em cascata) */
  async remove(id: string): Promise<void> {
    try {
      await prisma.users.delete({ where: { id } });
    } catch (error) {
      if (errorCode(error) === 'P2025') {
        throw routeError(404, 'Usuário não encontrado');
      }
      throw routeError(
        errorStatus(error),
        errorMessage(error, 'Erro ao excluir usuário'),
      );
    }
  }

  /**
   * Substitui os overrides de permissão do usuário (grants/denials).
   * @returns as overrides salvas
   */
  async setPermissions(
    id: string,
    permissions: readonly PermissionOverride[],
  ): Promise<PermissionOverride[]> {
    const overrides = validateOverrides(permissions) ?? [];

    try {
      await prisma.$transaction([
        prisma.user_permissions.deleteMany({ where: { user_id: id } }),
        ...(overrides.length
          ? [
              prisma.user_permissions.createMany({
                data: overrides.map((o) => ({ user_id: id, ...o })),
              }),
            ]
          : []),
      ]);
      return overrides;
    } catch (error) {
      if (errorCode(error) === 'P2025')
        throw routeError(404, 'Usuário não encontrado');
      throw routeError(
        errorStatus(error),
        errorMessage(error, 'Erro ao salvar permissões'),
      );
    }
  }

  /**
   * Atualiza dados de um usuário (senha opcional, cargo, setor, ativo).
   * @returns usuário atualizado (shape de `list()`)
   */
  async update(id: string, data: UpdateUserInput): Promise<UserRecord> {
    // `Unchecked` porque setamos as FKs diretamente (`role_id`, `sector_id`);
    // a variante cheia (`usersUpdateInput`) só expõe as relações (`role: {…}`).
    const values: Prisma.usersUncheckedUpdateInput = {};

    if (data?.full_name !== undefined) {
      const fullName = String(data.full_name).trim();
      if (!fullName) throw routeError(400, 'Nome completo é obrigatório');
      values.full_name = fullName;
    }
    if (data?.password !== undefined && data.password !== '') {
      if (String(data.password).length < 6) {
        throw routeError(400, 'Senha deve ter pelo menos 6 caracteres');
      }
      values.password_hash = await bcrypt.hash(
        String(data.password),
        BCRYPT_SALT_ROUNDS,
      );
    }
    if (data?.role_id !== undefined || data?.role !== undefined) {
      values.role_id = await resolveRoleId(data);
    }
    if (data?.sector_id !== undefined)
      values.sector_id = data.sector_id || null;
    if (data?.active !== undefined) values.active = !!data.active;

    if (!Object.keys(values).length) {
      throw routeError(400, 'Nada para atualizar');
    }

    try {
      const user = await prisma.users.update({
        data: values,
        select: USER_SELECT,
        where: { id },
      });
      return shapeUser(user);
    } catch (error) {
      if (errorCode(error) === 'P2025')
        throw routeError(404, 'Usuário não encontrado');
      if (errorCode(error) === 'P2003') throw routeError(400, 'Cargo inválido');
      throw routeError(
        errorStatus(error),
        errorMessage(error, 'Erro ao atualizar usuário'),
      );
    }
  }
}

/** O que o Prisma devolve para `USER_SELECT` — fonte única do shape achatado. */
type SelectedUser = Prisma.usersGetPayload<{ select: typeof USER_SELECT }>;

/** Achata o include de cargo/overrides no formato consumido pela UI. */
function shapeUser(user: SelectedUser): UserRecord {
  return {
    id: user.id,
    active: user.active,
    full_name: user.full_name,
    guiche_id: user.guiche_id,
    role_id: user.role_id,
    sector_id: user.sector_id,
    username: user.username,
    // `role` continua sendo a chave ("admin"|"attendant"|chave custom) —
    // é o que a UI de listagem e os testes de contrato consomem.
    permissions: user.permissions ?? [],
    role: user.role?.key ?? null,
    role_built_in: user.role?.built_in ?? false,
    role_name: user.role?.name ?? null,
  };
}
