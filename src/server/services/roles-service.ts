import 'server-only';

import type {
  CreateRoleInput,
  RoleRecord,
  UpdateRoleInput,
} from '@/shared/types/domain';

import { roles } from '@/server/repositories';

/**
 * Use cases de cargos.
 *
 * A validação de chave/permissões e a imutabilidade dos cargos built-in
 * continuam no repositório; o serviço existe para a rota não conhecer o
 * singleton de dados e para permitir reutilização por outras entradas.
 */

export function listRoles(): Promise<RoleRecord[]> {
  return roles.list();
}

export function createRole(data: CreateRoleInput): Promise<RoleRecord> {
  return roles.create(data);
}

export function updateRole(
  id: string,
  data: UpdateRoleInput,
): Promise<RoleRecord> {
  return roles.update(id, data);
}

export function removeRole(id: string): Promise<void> {
  return roles.remove(id);
}
