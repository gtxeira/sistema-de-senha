import { NextResponse } from "next/server";
import { users } from "@/lib/repositories";
import { requirePermission } from "@/lib/api-auth";
import { errorMessage, errorStatus } from "@/lib/repositories/utils";
import {
  USERS_CREATE,
  USERS_DELETE,
  USERS_EDIT,
  USERS_VIEW,
} from "@/lib/permissions";
import { readJson } from "@/lib/json";
import type { CreateUserRequest, UserPatchBody } from "@/types/api";

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

    const userList = await users.list();
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
    const result = await users.create(body);
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

    // Proteção contra auto-lockout: ninguém altera a própria situação/cargo.
    if (id === session.user.id && (body.active !== undefined || body.role_id !== undefined || body.role !== undefined)) {
      return NextResponse.json(
        { error: "Você não pode alterar o próprio cargo ou situação." },
        { status: 400 }
      );
    }

    const { permissions, ...data } = body;
    if (Object.keys(data).length > 1) {
      await users.update(id, data);
    }
    if (permissions !== undefined) {
      await users.setPermissions(id, permissions);
    }
    // Re-busca depois de aplicar os overrides (o update sozinho devolveria
    // as linhas antigas de permissões).
    const user = (await users.list()).find((u) => u.id === id);
    if (!user) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, user });
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

    if (id === session.user.id) {
      return NextResponse.json(
        { error: "Você não pode excluir o próprio usuário." },
        { status: 400 }
      );
    }

    await users.remove(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err, "Erro ao excluir usuário") },
      { status: errorStatus(err, 500) }
    );
  }
}
