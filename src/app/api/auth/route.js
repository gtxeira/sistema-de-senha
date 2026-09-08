import { NextResponse } from "next/server";
import { auth } from "@/lib/repositories";

/* ─────────────────────────────────────────────────
   GET — lista todos os usuários (deprecated, mantido por compatibilidade)
   Este endpoint não é mais usado pelo frontend mas mantido para não quebrar
   possíveis integrações externas
───────────────────────────────────────────────── */
export async function GET() {
  // This endpoint is deprecated but kept for backward compatibility
  // It now returns empty array as the functionality moved to /api/users
  return NextResponse.json({ users: [] });
}

/* ─────────────────────────────────────────────────
   POST — autentica usuário e retorna perfil
   Fluxo:
   1. Valida username (nome.sobrenome) e senha
   2. Resolve email (via admin lookup se configurado, senão padrão)
   3. Faz login no Supabase Auth
   4. Busca perfil no Supabase (via admin se disponível, senão anon)
   5. Verifica se perfil está ativo
   6. Retorna dados do usuário
───────────────────────────────────────────────── */
export async function POST(request) {
  try {
    const body = await request.json();
    const { login, password } = body;

    if (!login || !password) {
      return NextResponse.json(
        { error: "Usuário (nome.sobrenome) e senha são obrigatórios" },
        { status: 400 }
      );
    }

    const userData = await auth.login(login, password);
    
    return NextResponse.json({
      id: userData.id,
      name: userData.name,
      initials: userData.initials,
      role: userData.role,
      sector: userData.sector,
      guiche: userData.guiche,
    });
  } catch (err) {
    // Handle typed errors from repository
    if (err.status) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status }
      );
    }
    
    // Handle unexpected errors
    console.error("Erro em /api/auth:", err);
    return NextResponse.json(
      { error: "Não foi possível validar o acesso." },
      { status: 400 }
    );
  }
}