import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Get admin-capable Supabase client
 * @returns {any|null}
 */
function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Validate username format (nome.sobrenome)
 * @param {string} username
 * @returns {boolean}
 */
function isValidUsername(username) {
  return /^[a-z0-9]+(?:[._][a-z0-9]+)*$/.test(username);
}

/**
 * Create typed error with status
 * @param {number} status
 * @param {string} message
 * @returns {{ status: number, message: string }}
 */
function routeError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export class UsersRepository {
  /**
   * List all users
   * @returns {Promise<Array<{
   *   id: string,
   *   username?: string,
   *   full_name: string,
   *   role: 'admin'|'attendant',
   *   sector_id: 'farmacia'|'recepcao'|null
   * }>>}
   */
  async list() {
    const adminClient = getAdminClient();
    if (!adminClient) {
      throw routeError(503, "Supabase não configurado");
    }

    try {
      const { data, error } = await adminClient
        .from("profiles")
        .select("id, username, full_name, role, sector_id")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      throw routeError(500, err.message || "Erro ao listar usuários");
    }
  }

  /**
   * Create a new user
   * @param {{
   *   username: string,
   *   password: string,
   *   full_name: string,
   *   role?: 'admin'|'attendant',
   *   sector_id?: 'farmacia'|'recepcao'|null
   * }} data
   * @returns {Promise<{
   *   success: boolean,
   *   user: {
   *     id: string,
   *     username: string,
   *     full_name: string,
   *     role: 'admin'|'attendant',
   *     sector_id: 'farmacia'|'recepcao'|null
   *   }
   * }>}
   * @throws {{ status: number, message: string }} on error
   */
  async create(data) {
    const adminClient = getAdminClient();
    if (!adminClient) {
      throw routeError(503, "Supabase não configurado");
    }

    const { username: rawUsername, password, full_name, role, sector_id } = data;
    const username = String(rawUsername || "")
      .trim()
      .toLowerCase();

    if (!isValidUsername(username) || !password || !full_name) {
      throw routeError(400, "Usuário (nome.sobrenome), senha e nome completo são obrigatórios");
    }

    try {
      // Create user in Auth
      const email = `${username}@central-atendimento.local`;
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) throw authError;

      // Create profile
      const { error: profileError } = await adminClient.from("profiles").insert({
        id: authData.user.id,
        username,
        full_name,
        role: role || "attendant",
        sector_id: sector_id || null,
      });

      if (profileError) {
        // Rollback: delete the auth user
        await adminClient.auth.admin.deleteUser(authData.user.id);
        throw profileError;
      }

      return {
        success: true,
        user: {
          id: authData.user.id,
          username,
          full_name,
          role: role || "attendant",
          sector_id,
        },
      };
    } catch (err) {
      throw routeError(err.status || 500, err.message || "Erro ao criar usuário");
    }
  }

  /**
   * Delete a user by id
   * @param {string} id
   * @returns {Promise<{ success: boolean }>}
   * @throws {{ status: number, message: string }} on error
   */
  async remove(id) {
    const adminClient = getAdminClient();
    if (!adminClient) {
      throw routeError(503, "Supabase não configurado");
    }

    try {
      // Remove profile
      const { error: profileError } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", id);

      if (profileError) throw profileError;

      // Remove from auth
      const { error: authError } = await adminClient.auth.admin.deleteUser(id);

      if (authError) throw authError;

      return { success: true };
    } catch (err) {
      throw routeError(err.status || 500, err.message || "Erro ao excluir usuário");
    }
  }
}