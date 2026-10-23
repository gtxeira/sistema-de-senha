import { NextResponse } from "next/server";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
} from "@/server/services/users-service";
import { requirePermission } from "@/server/http/api-auth";
import { errorMessage, errorStatus } from "@/shared/errors";
import {
  USERS_CREATE,
  USERS_DELETE,
  USERS_EDIT,
  USERS_VIEW,
} from "@/shared/permissions";
import { readJson } from "@/shared/json";
import type { CreateUserRequest, UserPatchBody } from "@/shared/types/api";

/* ─────────────────────────────────────────────────
   Gestão de usuários: cada operação exige a permissão
   correspondente (usuarios.ver/criar/editar/excluir).
   Sem essa barreira, qualquer requisição anônima poderia criar uma conta
   privilegiada ou apagar contas existentes.
───────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────
   GET — lista todos os usuários (com cargo e overrides)
───────────────────────────────────────────────── */
export async function GET() {
  try {
    const { error } = await requirePermission(USERS_VIEW);
    if (error) return error;

    const userList = await listUsers();
    return NextResponse.json({ users: userList });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err, "Erro ao listar usuários") },
      { status: errorStatus(err, 500) }
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
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err, "Erro ao criar usuário") },
      { status: errorStatus(err, 500) }
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
    const { session, error } = await requirePermission(USERS_EDIT);
    if (error) return error;

    const body = await readJson<UserPatchBody>(request);
    const id = body?.id;
    if (!id) {
      return NextResponse.json(
        { error: "ID do usuário é obrigatório" },
        { status: 400 }
      );
    }

    const result = await updateUser(id, body, session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err, "Erro ao atualizar usuário") },
      { status: errorStatus(err, 500) }
    );
  }
}

/* ─────────────────────────────────────────────────
   DELETE — remove usuário do banco
───────────────────────────────────────────────── */
export async function DELETE(request: Request) {
  try {
    const { session, error } = await requirePermission(USERS_DELETE);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID do usuário é obrigatório" },
        { status: 400 }
      );
    }

    const result = await deleteUser(id, session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err, "Erro ao excluir usuário") },
      { status: errorStatus(err, 500) }
    );
  }
}
