import 'server-only';

import type { UserPatchBody } from '@/shared/types/api';
import type { CreateUserInput, UserRecord } from '@/shared/types/domain';

import { routeError } from '@/server/http/errors';
import { users } from '@/server/repositories';

/**
 * Use cases de usuários.
 *
 * As regras que não pertencem à persistência ficam aqui: ninguém pode
 * rebaixar/desativar a própria conta nem excluir a si mesmo. O repositório
 * continua responsável por hash de senha, validação de cargo e overrides.
 */

export function createUser(
  data: CreateUserInput,
): Promise<{ success: true; user: UserRecord }> {
  return users.create(data);
}

export async function deleteUser(
  id: string,
  actorId: string,
): Promise<{ success: true }> {
  if (id === actorId) {
    throw routeError(400, 'Você não pode excluir o próprio usuário.');
  }

  await users.remove(id);
  return { success: true };
}

export function listUsers(): Promise<UserRecord[]> {
  return users.list();
}

/**
 * Atualiza dados e/ou overrides do usuário.
 *
 * `body.id` já foi lido pela rota; `permissions` é aplicado à parte porque
 * vive em outra tabela. Depois da atualização, relê a lista para devolver o
 * usuário com os overrides novos — `update()` sozinho devolveria os antigos.
 */
export async function updateUser(
  id: string,
  body: UserPatchBody,
  actorId: string,
): Promise<{ success: true; user: UserRecord }> {
  // Proteção contra auto-lockout: ninguém altera a própria situação/cargo.
  if (
    id === actorId &&
    (body.active !== undefined ||
      body.role_id !== undefined ||
      body.role !== undefined)
  ) {
    throw routeError(400, 'Você não pode alterar o próprio cargo ou situação.');
  }

  const { permissions, ...data } = body;
  if (Object.keys(data).length > 1) {
    await users.update(id, data);
  }
  if (permissions !== undefined) {
    await users.setPermissions(id, permissions);
  }

  const user = (await users.list()).find((candidate) => candidate.id === id);
  if (!user) {
    throw routeError(404, 'Usuário não encontrado');
  }

  return { success: true, user };
}
