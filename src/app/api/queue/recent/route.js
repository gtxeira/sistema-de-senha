import { queue } from "@/lib/repositories";

/**
 * GET /api/queue/recent?sector=farmacia&limit=30
 * Returns recent queue calls for a sector.
 * Used as polling fallback when SSE is unavailable.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get("sector");
  const limit = parseInt(searchParams.get("limit") || "30", 10);

  if (!sector || !["farmacia", "recepcao"].includes(sector)) {
    return Response.json(
      { error: "Invalid sector. Use 'farmacia' or 'recepcao'." },
      { status: 400 },
    );
  }

  try {
    const calls = await queue.getRecentCalls(sector, limit);
    return Response.json({ calls });
  } catch (error) {
    return Response.json({ calls: [], error: error.message }, { status: 500 });
  }
}
