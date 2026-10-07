import { prisma } from "@/lib/prisma-client";
import type { Prisma } from "@/generated/prisma/client";
import {
  routeError,
  errorCode,
  errorStatus,
  errorMessage,
} from "./utils";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import type {
  CreateRoleInput,
  RoleRecord,
  RolesRepository,
  UpdateRoleInput,
} from "./types";

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);
const KEY_REGEX = /^[a-z][a-z0-9-]*$/;

/** Linha de cargo como o Prisma devolve — com ou sem `permissions` junto. */
interface RoleRow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly built_in: boolean;
  readonly permissions?: ReadonlyArray<{ readonly permission: string }> | null;
}

/**
 * `Array.isArray` tem assinatura `arg is any[]` e estreita o parâmetro para
 * `any[]`, jogando a validação seguinte no `any`. Com o elemento declarado a
 * guarda continua cobrindo o caso não-array e o resto permanece tipado.
 */
function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value);
}

/**
 * Valida e normaliza uma lista de chaves de permissão contra o registro
 * fixo em `src/lib/permissions.ts`.
 * @returns `null` quando `permissions` não foi informado
 * @throws 400 para chave desconhecida
 */
function validatePermissions(
  permissions: readonly string[] | undefined,
): string[] | null {
  if (permissions === undefined) return null;
  if (!isStringList(permissions)) {
    throw routeError(400, "Permissões devem ser uma lista de chaves");
  }
  const unique = [...new Set(permissions)];
  for (const permission of unique) {
    if (!PERMISSION_SET.has(permission)) {
      throw routeError(400, `Permissão desconhecida: ${permission}`);
    }
  }
  return unique;
}

function shapeRole(role: RoleRow): RoleRecord {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    built_in: role.built_in,
    permissions: (role.permissions ?? []).map((p) => p.permission),
  };
}

/**
 * Repositório de cargos e das permissões efetivas de usuários.
 *
 * As chaves de permissão em si não são dados — vivem em
 * `src/lib/permissions.ts`. Aqui só gravamos as atribuições.
 */
export class PostgresRolesRepository implements RolesRepository {
  /** Lista todos os cargos com suas permissões. */
  async list(): Promise<RoleRecord[]> {
    const roles = await prisma.roles.findMany({
      include: { permissions: true },
      orderBy: [{ built_in: "desc" }, { created_at: "asc" }],
    });
    return roles.map(shapeRole);
  }

  /** Busca um cargo pela chave. */
  async getByKey(key: string): Promise<RoleRecord | null> {
    const role = await prisma.roles.findUnique({
      where: { key },
      include: { permissions: true },
    });
    return role ? shapeRole(role) : null;
  }

  async create(data: CreateRoleInput): Promise<RoleRecord> {
    const key = String(data?.key || "").trim().toLowerCase();
    const name = String(data?.name || "").trim();
    const permissions = validatePermissions(data?.permissions) ?? [];

    if (!KEY_REGEX.test(key)) {
      throw routeError(400, "Chave do cargo deve ser minúscula sem espaços (ex.: coordenador)");
    }
    if (!name) {
      throw routeError(400, "Nome do cargo é obrigatório");
    }

    try {
      const role = await prisma.roles.create({
        data: {
          key,
          name,
          description: data?.description || null,
          permissions: {
            create: permissions.map((permission) => ({ permission })),
          },
        },
        include: { permissions: true },
      });
      return shapeRole(role);
    } catch (err) {
      if (errorCode(err) === "P2002") throw routeError(409, "Já existe um cargo com essa chave");
      throw routeError(errorStatus(err), errorMessage(err, "Erro ao criar cargo"));
    }
  }

  /**
   * Atualiza nome/descrição/permissões de um cargo.
   * Cargos built-in (admin/attendant) são imutáveis — sem eles o sistema
   * poderia se auto-trancar.
   */
  async update(id: string, data: UpdateRoleInput): Promise<RoleRecord> {
    const current = await prisma.roles.findUnique({ where: { id } });
    if (!current) throw routeError(404, "Cargo não encontrado");
    if (current.built_in) {
      throw routeError(403, "Cargos do sistema não podem ser editados");
    }

    const permissions = validatePermissions(data?.permissions);
    const values: Prisma.rolesUpdateInput = {};
    if (data?.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw routeError(400, "Nome do cargo é obrigatório");
      values.name = name;
    }
    if (data?.description !== undefined) values.description = data.description || null;

    try {
      const role = await prisma.$transaction(async (tx) => {
        await tx.roles.update({ where: { id }, data: values });
        if (permissions) {
          await tx.role_permissions.deleteMany({ where: { role_id: id } });
          if (permissions.length) {
            await tx.role_permissions.createMany({
              data: permissions.map((permission) => ({ role_id: id, permission })),
            });
          }
        }
        const fresh = await tx.roles.findUnique({
          where: { id },
          include: { permissions: true },
        });
        // Inalcançável (o acabamos de atualizar), mas deixa o null fora do tipo.
        if (!fresh) throw routeError(404, "Cargo não encontrado");
        return fresh;
      });
      return shapeRole(role);
    } catch (err) {
      if (errorCode(err) === "P2002") throw routeError(409, "Já existe um cargo com essa chave");
      throw routeError(errorStatus(err), errorMessage(err, "Erro ao atualizar cargo"));
    }
  }

  /** Remove um cargo (apaga em cascata suas permissões). */
  async remove(id: string): Promise<void> {
    const current = await prisma.roles.findUnique({ where: { id } });
    if (!current) throw routeError(404, "Cargo não encontrado");
    if (current.built_in) {
      throw routeError(403, "Cargos do sistema não podem ser excluídos");
    }

    try {
      await prisma.roles.delete({ where: { id } });
    } catch (err) {
      // FK users_role_id_fkey (ON DELETE RESTRICT)
      if (errorCode(err) === "P2003") {
        throw routeError(409, "Cargo em uso por usuários — troque o cargo deles antes de excluir");
      }
      if (errorCode(err) === "P2025") throw routeError(404, "Cargo não encontrado");
      throw routeError(errorStatus(err), errorMessage(err, "Erro ao excluir cargo"));
    }
  }
}
