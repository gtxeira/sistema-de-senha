import { NextResponse } from "next/server";
import { roles } from "@/lib/repositories";
import { requirePermission } from "@/lib/api-auth";
import { ROLES_MANAGE, USERS_VIEW } from "@/lib/permissions.js";

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

    const roleList = await roles.list();
    return NextResponse.json({ roles: roleList });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Erro ao listar cargos" },
      { status: err.status || 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { error } = await requirePermission(ROLES_MANAGE);
    if (error) return error;

    const body = await request.json();
    const role = await roles.create(body);
    return NextResponse.json({ success: true, role });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Erro ao criar cargo" },
      { status: err.status || 500 }
    );
  }
}

/**
 * PATCH — atualiza nome/descrição/permissões de um cargo.
 * Body: { id, name?, description?, permissions?: string[] }
 * (substituição completa do conjunto, não merge)
 */
export async function PATCH(request) {
  try {
    const { error } = await requirePermission(ROLES_MANAGE);
    if (error) return error;

    const body = await request.json();
    if (!body?.id) {
      return NextResponse.json(
        { error: "ID do cargo é obrigatório" },
        { status: 400 }
      );
    }

    const role = await roles.update(body.id, body);
    return NextResponse.json({ success: true, role });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Erro ao atualizar cargo" },
      { status: err.status || 500 }
    );
  }
}

export async function DELETE(request) {
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

    await roles.remove(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Erro ao excluir cargo" },
      { status: err.status || 500 }
    );
  }
}
