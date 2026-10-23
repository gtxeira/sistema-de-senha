import { NextResponse } from "next/server";
import { queue } from "@/server/repositories";
import { errorMessage, errorStatus } from "@/shared/errors";
import { eventManager } from "@/server/realtime/event-manager";
import { assertSectorAccess, requirePermission } from "@/server/http/api-auth";
import { QUEUE_RECALL } from "@/shared/permissions";
import { readJson } from "@/shared/json";
import type { RecallRequestBody } from "@/shared/types/api";
import { isSectorId } from "@/shared/constants";

/* ─────────────────────────────────────────────────
   POST — repete a última senha chamada de um setor
   Emite evento SSE para os monitores reproduzirem o áudio.
───────────────────────────────────────────────── */
export async function POST(request: Request) {
  try {
    const { session, error } = await requirePermission(QUEUE_RECALL);
    if (error) return error;

    const body = await readJson<RecallRequestBody>(request);
    const { sector } = body;

    if (!isSectorId(sector)) {
      return NextResponse.json(
        { error: "Setor não informado." },
        { status: 400 }
      );
    }

    const scope = assertSectorAccess(session, sector, "write");
    if (scope.error) return scope.error;

    const resetAt = await queue.getSectorResetAt(sector);
    // Only calls made after the last reset are repeatable — the rows from
    // before it survive for /historico but no longer belong to the live queue.
    const calls = await queue.getRecentCalls(sector, 1, resetAt);
    if (!calls.length) {
      return NextResponse.json(
        { error: "Nenhuma senha anterior para repetir." },
        { status: 404 }
      );
    }

    const last = calls[0];

    const callEvent = {
      id: last.id,
      number: last.number,
      type: last.type,
      // O instante da chamada REPETIDA (o mesmo do retrato), não "agora":
      // o SSE descreve a senha, e quem formata em BRT é o cliente.
      createdAt: last.createdAt,
    };

    eventManager.emitQueueRecall(
      sector,
      callEvent,
      resetAt ? resetAt.toISOString() : null,
    );

    return NextResponse.json({
      success: true,
      number: last.number,
      type: last.type,
    });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err, "Erro ao repetir senha") },
      { status: errorStatus(err, 500) }
    );
  }
}
