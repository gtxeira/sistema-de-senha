import { createAuthClient, isSupabaseConfigured } from "../../../lib/supabase";
import {
  isSupabaseAdminConfigured,
  supabaseAdmin,
} from "../../../lib/supabase-admin";

export async function POST(request) {
  if (!isSupabaseConfigured) {
    return Response.json(
      { error: "Supabase não está configurado." },
      { status: 503 },
    );
  }

  const supabase = createAuthClient();
  if (!supabase) {
    return Response.json(
      { error: "Supabase não está configurado." },
      { status: 503 },
    );
  }

  try {
    const { login, password } = await request.json();
    const username = String(login || "").trim().toLowerCase();

    if (!/^[a-z0-9]+(?:[._][a-z0-9]+)*$/.test(username)) {
      return Response.json(
        { error: "Usuário inválido." },
        { status: 400 },
      );
    }

    // Estratégia 1: buscar email pelo username no profiles (via admin)
    // Estratégia 2: fallback direto com email padrão
    // Estratégia 3: fallback com username como email local
    let loginEmail = `${username}@central-atendimento.local`;

    if (isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        // Tenta achar o perfil pelo username
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .ilike("username", username)
          .maybeSingle();

        if (profile?.id) {
          // Busca o email real no Auth
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(profile.id);
          if (authUser?.user?.email) {
            loginEmail = authUser.user.email;
          }
        }
      } catch {
        // Falha silenciosa — usa o email padrão como fallback
      }
    }

    // Tenta login com o email resolvido
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (error || !data?.user) {
      return Response.json(
        { error: "Login ou senha inválidos." },
        { status: 401 },
      );
    }

    // Busca perfil do usuário autenticado
    const profileClient = isSupabaseAdminConfigured && supabaseAdmin
      ? supabaseAdmin
      : supabase;

    const { data: userProfile, error: profileError } = await profileClient
      .from("profiles")
      .select("full_name, role, sector_id, guiche_id, active")
      .eq("id", data.user.id)
      .single();

    if (profileError || !userProfile?.active) {
      console.error("Login: perfil bloqueado", {
        userId: data.user.id,
        usingAdmin: !!(isSupabaseAdminConfigured && supabaseAdmin),
        profileError: profileError?.message,
        profileError_code: profileError?.code,
        active: userProfile?.active,
      });
      return Response.json(
        { error: "Usuário sem acesso ativo." },
        { status: 403 },
      );
    }

    return Response.json({
      id: data.user.id,
      name: userProfile.full_name,
      initials: userProfile.full_name
        .split(/\s+/)
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
      role: userProfile.role,
      sector: userProfile.sector_id,
      guiche: userProfile.guiche_id || "none",
    });
  } catch {
    return Response.json(
      { error: "Não foi possível validar o acesso." },
      { status: 400 },
    );
  }
}
