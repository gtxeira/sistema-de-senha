import { NextResponse } from "next/server";
import {
  createRole,
  listRoles,
  removeRole,
  updateRole,
} from "@/server/services/roles-service";
import { requirePermission } from "@/server/http/api-auth";
import { errorMessage, errorStatus } from "@/shared/errors";
import { ROLES_MANAGE, USERS_VIEW } from "@/shared/permissions";
import { readJson } from "@/shared/json";
import type { CreateRoleRequest, RolePatchBody } from "@/shared/types/api";

/* ─────────────────────────────────────────────────
   Cargos e permissões (RBAC).

   GET lista os cargos: exige `usuarios.ver` porque a matriz fica dentro
   da tela de usuários. Criar/editar/excluir exige `cargos.gerenciar`.
   Os cargos built-in (admin/attendant) são imutáveis — o repositório
   rejeita, aqui só traduzimos o erro.
───────────────────────────────────────────────── */

export async function GET() {
  try {
    const { error } = await requirePermission(USERS_VIEW);
    if (error) return error;

    const roleList = await listRoles();
    return NextResponse.json({ roles: roleList });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err, "Erro ao listar cargos") },
      { status: errorStatus(err, 500) }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { error } = await requirePermission(ROLES_MANAGE);
    if (error) return error;

    const body = await readJson<CreateRoleRequest>(request);
    const role = await createRole(body);
    return NextResponse.json({ success: true, role });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err, "Erro ao criar cargo") },
      { status: errorStatus(err, 500) }
    );
  }
}

/**
 * PATCH — atualiza nome/descrição/permissões de um cargo.
 * Body: { id, name?, description?, permissions?: string[] }
 * (substituição completa do conjunto, não merge)
 */
export async function PATCH(request: Request) {
  try {
    const { error } = await requirePermission(ROLES_MANAGE);
    if (error) return error;

    const body = await readJson<RolePatchBody>(request);
    if (!body?.id) {
      return NextResponse.json(
        { error: "ID do cargo é obrigatório" },
        { status: 400 }
      );
    }

    const role = await updateRole(body.id, body);
    return NextResponse.json({ success: true, role });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err, "Erro ao atualizar cargo") },
      { status: errorStatus(err, 500) }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { error } = await requirePermission(ROLES_MANAGE);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "ID do cargo é obrigatório" },
        { status: 400 }
      );
    }

    await removeRole(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err, "Erro ao excluir cargo") },
      { status: errorStatus(err, 500) }
    );
  }
}
