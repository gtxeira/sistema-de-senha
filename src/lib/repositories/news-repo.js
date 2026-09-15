import { isSupabaseConfigured, supabase } from "../supabase";
import { isSupabaseAdminConfigured, supabaseAdmin } from "../supabase-admin";

/**
 * Get appropriate database client (prefer admin for writes that need service role)
 * @returns {any}
 */
function getDb() {
  if (isSupabaseAdminConfigured && supabaseAdmin) return supabaseAdmin;
  if (isSupabaseConfigured && supabase) return supabase;
  return null;
}

/**
 * Build list of JWT candidates for Storage (from most to least privileged)
 * @returns {Array<string>}
 */
function getStorageJwtCandidates() {
  const candidates = [
    process.env.SUPABASE_SERVICE_JWT,
    process.env.SUPABASE_ANON_JWT,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ];
  // Filter: only accept classic JWTs (eyJ...) - Storage rejects sb_secret_*
  return candidates.filter(
    (k) => k && /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(k)
  );
}

/**
 * Attempt upload with each JWT candidate until one works
 * @param {string} fileName
 * @param {Buffer} buffer
 * @param {string} contentType
 * @returns {Promise<string>} public URL
 */
async function uploadToStorage(fileName, buffer, contentType) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const BUCKET = "news-images";
  const candidates = getStorageJwtCandidates();
  if (!supabaseUrl || candidates.length === 0) {
    throw new Error("Nenhuma chave JWT disponível para o Storage.");
  }
  let lastError = "";
  for (const jwt of candidates) {
    const res = await fetch(
      `${supabaseUrl}/storage/v1/object/${BUCKET}/${fileName}`,
      {
        method: "POST",
        headers: {
          apikey: jwt,
          Authorization: `Bearer ${jwt}`,
          "Content-Type": contentType,
          "x-upsert": "false",
        },
        body: buffer,
      }
    );
    if (res.ok) {
      return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${fileName}`;
    }
    lastError = await res.text().catch(() => res.statusText);
    // If not an auth problem, don't try next key
    if (!res.status.toString().startsWith("4")) break;
  }
  throw new Error(`Upload falhou: ${lastError}`);
}

/**
 * Delete file from Storage (best effort)
 * @param {string} filePath
 */
async function deleteFromStorage(filePath) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const BUCKET = "news-images";
  const candidates = getStorageJwtCandidates();
  if (!supabaseUrl || candidates.length === 0) return;
  for (const jwt of candidates) {
    const res = await fetch(
      `${supabaseUrl}/storage/v1/object/${BUCKET}/${filePath}`,
      {
        method: "DELETE",
        headers: { apikey: jwt, Authorization: `Bearer ${jwt}` },
      }
    );
    if (res.ok) return;
  }
}

/**
 * Validate allowed image types
 * @param {string} type
 * @returns {boolean}
 */
function isAllowedImageType(type) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
  return allowedTypes.includes(type);
}

/**
 * Validate file size (max 5MB)
 * @param {number} size
 * @returns {boolean}
 */
function isValidFileSize(size) {
  return size <= 5 * 1024 * 1024;
}

export class NewsRepository {
  /**
   * Create a news item (upload image + save to db)
   * @param {{ title: string, image: File }} data
   * @returns {Promise<{
   *   success: boolean,
   *   news: {
   *     id: string,
   *     title: string,
   *     image: string
   *   }
   * }>}
   * @throws {{ status: number, message: string }} on error
   */
  async create({ title, image }) {
    const db = getDb();
    if (!db) {
      throw { status: 503, message: "Banco não configurado." };
    }

    // Validate input
    if (!title || typeof title !== "string" || !(title = title.trim())) {
      throw { status: 400, message: "Informe um título." };
    }
    if (!image || typeof image === "string") {
      throw { status: 400, message: "Envie um arquivo de imagem." };
    }
    if (!isAllowedImageType(image.type)) {
      throw { status: 400, message: "Formato inválido. Use JPG, PNG, WEBP ou GIF." };
    }
    if (!isValidFileSize(image.size)) {
      throw { status: 400, message: "Imagem deve ter no máximo 5 MB." };
    }

    try {
      const ext = (image.name.split(".").pop() || "jpg").toLowerCase();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const buffer = Buffer.from(await image.arrayBuffer());

      // Upload to storage
      const imageUrl = await uploadToStorage(fileName, buffer, image.type);

      // Save to database
      const { data, error: dbError } = await db
        .from("news")
        .insert({ title, image_url: imageUrl })
        .select("id, title, image_url")
        .single();

      if (dbError) {
        // Rollback: delete from storage
        await deleteFromStorage(fileName);
        throw dbError;
      }

      return {
        success: true,
        news: {
          id: String(data.id),
          title: data.title,
          image: data.image_url,
        },
      };
    } catch (err) {
      // If it's already a typed error from upload/delete, rethrow
      if (err.status) throw err;
      throw { status: 500, message: err.message || "Erro ao salvar notícia." };
    }
  }

  /**
   * Delete a news item (soft delete + remove image)
   * @param {string} id
   * @returns {Promise<{ success: boolean }>}
   * @throws {{ status: number, message: string }} on error
   */
  async remove(id) {
    const db = getDb();
    if (!db) {
      throw { status: 503, message: "Banco não configurado." };
    }

    if (!Number.isInteger(id) || id < 1) {
      throw { status: 400, message: "ID inválido." };
    }

    try {
      // Fetch the record to get image_url
      const { data: row, error } = await db
        .from("news")
        .select("image_url")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;

      // Update to inactive
      const { error: updateError } = await db
        .from("news")
        .update({ active: false })
        .eq("id", id);
      if (updateError) throw updateError;

      // If image_url points to our bucket, delete from storage (best effort)
      if (row?.image_url?.includes(`/news-images/`)) {
        const filePath = row.image_url.split(`/news-images/`)[1];
        if (filePath) await deleteFromStorage(filePath);
      }

      return { success: true };
    } catch (err) {
      throw { status: err.status || 500, message: err.message || "Erro ao excluir." };
    }
  }

  /**
   * List active news (limited to 10, most recent first)
   * @returns {Promise<Array<{id: string, title: string, image: string}>>}
   */
  async listActive() {
    const db = getDb();
    if (!db) {
      // Return empty array when no DB configured
      return [];
    }

    try {
      const { data, error } = await db
        .from("news")
        .select("id, title, image_url")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        // If table doesn't exist (42P01), return empty array
        if (error.code === "42P01") return [];
        throw error;
      }

      return (data || []).map((item) => ({
        id: String(item.id),
        title: item.title,
        image: item.image_url,
      }));
    } catch (err) {
      // On any other error, return empty array to avoid breaking UI
      return [];
    }
  }
}