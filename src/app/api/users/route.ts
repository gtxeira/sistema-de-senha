import type { CreateUserRequest, UserPatchBody } from '@/shared/types/api';

import { NextResponse } from 'next/server';

import { requirePermission } from '@/server/http/api-auth';
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
} from '@/server/services/users-service';
import { errorMessage, errorStatus } from '@/shared/errors';
import { readJson } from '@/shared/json';
import {
  USERS_CREATE,
  USERS_DELETE,
  USERS_EDIT,
  USERS_VIEW,
} from '@/shared/permissions';

/* ─────────────────────────────────────────────────
   Gestão de usuários: cada operação exige a permissão
   correspondente (usuarios.ver/criar/editar/excluir).
   Sem essa barreira, qualquer requisição anônima poderia criar uma conta
   privilegiada ou apagar contas existentes.
───────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────
   DELETE — remove usuário do banco
───────────────────────────────────────────────── */
export async function DELETE(request: Request) {
  try {
    const { error, session } = await requirePermission(USERS_DELETE);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'ID do usuário é obrigatório' },
        { status: 400 },
      );
    }

    const result = await deleteUser(id, session.user.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, 'Erro ao excluir usuário') },
      { status: errorStatus(error, 500) },
    );
  }
}

/* ─────────────────────────────────────────────────
   GET — lista todos os usuários (com cargo e overrides)
───────────────────────────────────────────────── */
export async function GET() {
  try {
    const { error } = await requirePermission(USERS_VIEW);
    if (error) return error;

    const userList = await listUsers();
    return NextResponse.json({ users: userList });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, 'Erro ao listar usuários') },
      { status: errorStatus(error, 500) },
    );
  }
}

/* ─────────────────────────────────────────────────
   PATCH — edita usuário (dados, cargo, situação e overrides de permissão)
   Body: { id, full_name?, password?, role_id?/role?, sector_id?, active?,
           permissions?: [{permission, granted}] }
───────────────────────────────────────────────── */
export async function PATCH(request: Request) {
  try {
    const { error, session } = await requirePermission(USERS_EDIT);
    if (error) return error;

    const body = await readJson<UserPatchBody>(request);
    const id = body?.id;
    if (!id) {
      return NextResponse.json(
        { error: 'ID do usuário é obrigatório' },
        { status: 400 },
      );
    }

    const result = await updateUser(id, body, session.user.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, 'Erro ao atualizar usuário') },
      { status: errorStatus(error, 500) },
    );
  }
}

/* ─────────────────────────────────────────────────
   POST — cria novo usuário
───────────────────────────────────────────────── */
export async function POST(request: Request) {
  try {
    const { error } = await requirePermission(USERS_CREATE);
    if (error) return error;

    const body = await readJson<CreateUserRequest>(request);
    const result = await createUser(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, 'Erro ao criar usuário') },
      { status: errorStatus(error, 500) },
    );
  }
}
