import { vi } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: {
      id: 'c0f4795e-f467-4695-b479-5ef467c695a6',
      name: 'Dev Teste',
      email: 'dev@teste.com',
      role: 'admin',
    },
    expires: new Date(Date.now() + 2 * 86400000).toISOString(),
  }),
}));

/**
 * Integration test setup — cleanup and seed helpers for Supabase.
 *
 * These helpers use the Supabase admin client to interact with the real database.
 * They are only available when NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Whether Supabase is configured for integration tests.
 */
export const isSupabaseReady = Boolean(supabaseUrl && serviceKey);

/**
 * Get admin client for test operations.
 * @returns {import('@supabase/supabase-js').SupabaseClient|null}
 */
export function getAdminClient() {
  if (!isSupabaseReady) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Clean up test data from queue_calls and reset queue_sequences.
 * Uses a unique prefix to avoid affecting real data.
 */
export async function cleanupQueueTestData() {
  const db = getAdminClient();
  if (!db) return;

  // Delete test queue_calls (those with number_str starting with test prefix)
  await db.from("queue_calls").delete().like("number_str", "T%");

  // Reset sequences for test sectors
  for (const sector of ["farmacia", "recepcao"]) {
    for (const type of ["normal", "preferencial"]) {
      await db
        .from("queue_sequences")
        .update({ current_number: 0 })
        .eq("sector_id", sector)
        .eq("call_type", type);
    }
  }
}

/**
 * Seed a test user into profiles table.
 * @param {object} data
 * @returns {{ id: string, username: string }}
 */
export async function seedTestUser(data) {
  const db = getAdminClient();
  if (!db) throw new Error("Supabase not configured");

  const id = crypto.randomUUID();
  const username = data.username || `test.user.${Date.now()}`;

  // Insert into profiles
  const { error } = await db.from("profiles").insert({
    id,
    username,
    full_name: data.full_name || "Test User",
    role: data.role || "attendant",
    sector_id: data.sector_id || null,
  });

  if (error) throw error;

  return { id, username };
}

/**
 * Clean up test users from profiles table.
 * @param {string[]} usernames - usernames to delete
 */
export async function cleanupTestUsers(usernames) {
  const db = getAdminClient();
  if (!db || !usernames.length) return;

  await db.from("profiles").delete().in("username", usernames);
}

/**
 * Seed a test news item.
 * @param {object} data
 * @returns {{ id: number, title: string }}
 */
export async function seedTestNews(data) {
  const db = getAdminClient();
  if (!db) throw new Error("Supabase not configured");

  const { data: result, error } = await db
    .from("news")
    .insert({
      title: data.title || `Test News ${Date.now()}`,
      image_url: data.image || "https://fake.test/news.jpg",
      active: true,
    })
    .select("id, title")
    .single();

  if (error) throw error;

  return { id: result.id, title: result.title };
}

/**
 * Clean up test news items.
 * @param {number[]} ids
 */
export async function cleanupTestNews(ids) {
  const db = getAdminClient();
  if (!db || !ids.length) return;

  await db.from("news").delete().in("id", ids);
}