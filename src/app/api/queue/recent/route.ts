import { getRecent } from "@/server/services/queue-service";
import { assertSectorAccess, requireSession } from "@/server/http/api-auth";
import { DEFAULT_RECENT_LIMIT, isSectorId } from "@/shared/constants";

/**
 * GET /api/queue/recent?sector=farmacia&limit=30
 * Returns recent queue calls for a sector, plus the sector's reset marker.
 * Used as polling fallback when SSE is unavailable.
 *
 * The `resetAt` marker lets clients detect a reset performed on another device.
 * Calls made before the last reset are excluded — those rows survive the reset
 * (so `/historico` keeps working) but must never be replayed into a monitor.
 *
 * Escopo: leitura exige setor próprio ou `setores.todos.ver`.
 */
export async function GET(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const sector = searchParams.get("sector");
  const limit = parseInt(searchParams.get("limit") || String(DEFAULT_RECENT_LIMIT), 10);

  if (!isSectorId(sector)) {
    return Response.json(
      { error: "Invalid sector." },
      { status: 400 },
    );
  }

  const scope = assertSectorAccess(session, sector, "read");
  if (scope.error) return scope.error;

  try {
    const result = await getRecent(sector, limit);
    return Response.json(result);
  } catch {
    return Response.json(
      { calls: [], resetAt: null, error: "Não foi possível carregar a fila." },
      { status: 500 },
    );
  }
}
