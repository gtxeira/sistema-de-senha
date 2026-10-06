import { prisma } from "@/lib/prisma-client.js";
import { routeError } from "./utils.js";
import { ALL_PERMISSIONS } from "@/lib/permissions.js";

const PERMISSION_SET = new Set(ALL_PERMISSIONS);
const KEY_REGEX = /^[a-z][a-z0-9-]*$/;

/**
 * Valida e normaliza uma lista de chaves de permissão contra o registro
 * fixo em `src/lib/permissions.js`.
 * @param {unknown} permissions
 * @returns {string[]}
 * @throws {{status: number, message: string}} 400 para chave desconhecida
 */
function validatePermissions(permissions) {
  if (permissions === undefined) return null;
  if (!Array.isArray(permissions)) {
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

function shapeRole(role) {
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
 * `src/lib/permissions.js`. Aqui só gravamos as atribuições.
 */
export class RolesRepository {
  /**
   * Lista todos os cargos com suas permissões.
   * @returns {Promise<Array<{id: string, key: string, name: string,
   *   description: string|null, built_in: boolean, permissions: string[]}>>}
   */
  async list() {
    const roles = await prisma.roles.findMany({
      include: { permissions: true },
      orderBy: [{ built_in: "desc" }, { created_at: "asc" }],
    });
    return roles.map(shapeRole);
  }

  /**
   * Busca um cargo pela chave.
   * @param {string} key
   * @returns {Promise<object|null>} shape de `list()` ou null
   */
  async getByKey(key) {
    const role = await prisma.roles.findUnique({
      where: { key },
      include: { permissions: true },
    });
    return role ? shapeRole(role) : null;
  }

  /**
   * Cria um cargo.
   * @param {{key: string, name: string, description?: string|null,
   *   permissions?: string[]}} data
   * @returns {Promise<object>} shape de `list()`
   */
  async create(data) {
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
      if (err.code === "P2002") throw routeError(409, "Já existe um cargo com essa chave");
      throw routeError(err.status || 500, err.message || "Erro ao criar cargo");
    }
  }

  /**
   * Atualiza nome/descrição/permissões de um cargo.
   * Cargos built-in (admin/attendant) são imutáveis — sem eles o sistema
   * poderia se auto-trancar.
   * @param {string} id
   * @param {{name?: string, description?: string|null, permissions?: string[]}} data
   * @returns {Promise<object>} shape de `list()`
   */
  async update(id, data) {
    const current = await prisma.roles.findUnique({ where: { id } });
    if (!current) throw routeError(404, "Cargo não encontrado");
    if (current.built_in) {
      throw routeError(403, "Cargos do sistema não podem ser editados");
    }

    const permissions = validatePermissions(data?.permissions);
    const values = {};
    if (data?.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw routeError(400, "Nome do cargo é obrigatório");
      values.name = name;
    }
    if (data?.description !== undefined) values.description = data.description || null;

    try {
      const role = await prisma.$transaction(async (tx) => {
        const updated = await tx.roles.update({ where: { id }, data: values });
        if (permissions) {
          await tx.role_permissions.deleteMany({ where: { role_id: id } });
          if (permissions.length) {
            await tx.role_permissions.createMany({
              data: permissions.map((permission) => ({ role_id: id, permission })),
            });
          }
        }
        return tx.roles.findUnique({ where: { id }, include: { permissions: true } }) ?? updated;
      });
      return shapeRole(role);
    } catch (err) {
      if (err.code === "P2002") throw routeError(409, "Já existe um cargo com essa chave");
      throw routeError(err.status || 500, err.message || "Erro ao atualizar cargo");
    }
  }

  /**
   * Remove um cargo (apaga em cascata suas permissões).
   * @param {string} id
   * @returns {Promise<void>}
   */
  async remove(id) {
    const current = await prisma.roles.findUnique({ where: { id } });
    if (!current) throw routeError(404, "Cargo não encontrado");
    if (current.built_in) {
      throw routeError(403, "Cargos do sistema não podem ser excluídos");
    }

    try {
      await prisma.roles.delete({ where: { id } });
    } catch (err) {
      // FK users_role_id_fkey (ON DELETE RESTRICT)
      if (err.code === "P2003") {
        throw routeError(409, "Cargo em uso por usuários — troque o cargo deles antes de excluir");
      }
      if (err.code === "P2025") throw routeError(404, "Cargo não encontrado");
      throw routeError(err.status || 500, err.message || "Erro ao excluir cargo");
    }
  }
}
