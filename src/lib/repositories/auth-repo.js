import { createClient } from "@supabase/supabase-js";
import { isValidUsername, routeError, initials, generateEmail, getDefaultGuiche } from "./utils.js";
import { SUPABASE_AUTH_OPTIONS } from "../constants.js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Get admin-capable Supabase client for user management
 * @returns {any|null}
 */
function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, SUPABASE_AUTH_OPTIONS);
}

export class AuthRepository {
  /**
   * Resolve login username to email (using admin lookup when configured)
   * @param {string} username
   * @returns {Promise<string>}
   */
  async resolveLoginEmail(username) {
    const supabaseAdmin = getAdminClient();
    if (supabaseAdmin) {
      // Try to find user by username via admin
      const { data: profile, error } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("username", username)
        .maybeSingle();

      if (error && /invalid api key/i.test(String(error.message))) {
        throw routeError(503, "Supabase não configurado");
      }

      if (profile?.id) {
        // Get user email via admin
        const adminResult = await supabaseAdmin.auth.admin.getUserById(profile.id);
        const authUserError = adminResult.error;
        const authUser = adminResult.data?.user;

        if (authUserError || !authUser?.email) {
          throw routeError(401, "Login ou senha inválidos.");
        }

        return authUser.email;
      }
    }

    // Fallback: use default email pattern
    return generateEmail(username);
  }

  /**
   * Login with username and password
   * @param {string} login - username or "nome.sobrenome"
   * @param {string} password
   * @returns {Promise<{
   *   id: string,
   *   name: string,
   *   initials: string,
   *   role: 'admin'|'attendant',
   *   sector: 'farmacia'|'recepcao'|null,
   *   guiche: 'none'|'guiche-1'|'guiche-2'|'guiche-3'|'guiche-4'
   * }>}
   * @throws {{ status: number, message: string }} on error (400, 401, 403, 500, 503)
   */
  async login(login, password) {
    const username = String(login || "").trim().toLowerCase();

    if (!isValidUsername(username) || !password) {
      throw routeError(400, "Usuário (nome.sobrenome) e senha são obrigatórios");
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw routeError(503, "Supabase não configurado");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, SUPABASE_AUTH_OPTIONS);

    try {
      // Resolve email (tries admin lookup, falls back to default pattern)
      const loginEmail = await this.resolveLoginEmail(username);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (error || !data.user) {
        throw routeError(401, "Login ou senha inválidos.");
      }

      // Fetch profile
      const supabaseAdmin = getAdminClient();
      const profileClient = supabaseAdmin || supabase;
      const { data: profile, error: profileError } = await profileClient
        .from("profiles")
        .select("full_name, role, sector_id, guiche_id, active")
        .eq("id", data.user.id)
        .single();

      if (profileError || !profile?.active) {
        throw routeError(403, "Usuário sem acesso ativo.");
      }

      return {
        id: data.user.id,
        name: profile.full_name,
        initials: initials(profile.full_name),
        role: profile.role,
        sector: profile.sector_id,
        guiche: profile.guiche_id || getDefaultGuiche(),
      };
    } catch (err) {
      // Already a typed error (has .status)
      if (err.status) throw err;
      throw routeError(400, "Não foi possível validar o acesso.");
    }
  }
}