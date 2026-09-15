import { NextResponse } from "next/server";
import { users } from "@/lib/repositories";

/* ─────────────────────────────────────────────────
   GET — lista todos os usuários
───────────────────────────────────────────────── */
export async function GET() {
  try {
    const userList = await users.list();
    return NextResponse.json({ users: userList });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Erro ao listar usuários" },
      { status: err.status || 500 }
    );
  }
}

/* ─────────────────────────────────────────────────
   POST — cria novo usuário
───────────────────────────────────────────────── */
export async function POST(request) {
  try {
    const body = await request.json();
    const result = await users.create(body);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Erro ao criar usuário" },
      { status: err.status || 500 }
    );
  }
}

/* ─────────────────────────────────────────────────
   DELETE — remove usuário do Auth e Profile
───────────────────────────────────────────────── */
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID do usuário é obrigatório" },
        { status: 400 }
      );
    }

    await users.remove(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Erro ao excluir usuário" },
      { status: err.status || 500 }
    );
  }
}