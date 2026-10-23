import { NextResponse } from "next/server";
import { queue } from "@/server/repositories";
import { errorMessage, errorStatus } from "@/shared/errors";
import { eventManager } from "@/server/realtime/event-manager";
import { assertSectorAccess, requirePermission } from "@/server/http/api-auth";
import { QUEUE_RESET } from "@/shared/permissions";
import { readJson } from "@/shared/json";
import type { ResetRequestBody } from "@/shared/types/api";
import { SECTORS, ALL_SECTORS, isSectorId } from "@/shared/constants";

/* ─────────────────────────────────────────────────
   POST — reseta a sequência de senhas de um setor
   Body: { sector: "farmacia"|"recepcao"|"all" }
   Exige a permissão `filas.resetar` + escopo de escrita em CADA setor
   alvo (o reset é destrutivo e vale para todos os dispositivos
   conectados via SSE).
───────────────────────────────────────────────── */
export async function POST(request: Request) {
  try {
    const { session, error } = await requirePermission(QUEUE_RESET);
    if (error) return error;

    const { sector } = await readJson<ResetRequestBody>(request);

    if (!sector) {
      return NextResponse.json(
        { error: "Setor não informado." },
        { status: 400 }
      );
    }

    const sectorsToReset: string[] =
      sector === ALL_SECTORS ? Object.keys(SECTORS) : [sector];

    if (!sectorsToReset.every((s) => isSectorId(s))) {
      return NextResponse.json(
        { error: "Setor inválido." },
        { status: 400 }
      );
    }

    // "all" expande e cai na mesma regra: sem escopo de escrita em todos
    // os setores, o reset é negado (nada de rebaixar silenciosamente).
    for (const s of sectorsToReset) {
      const scope = assertSectorAccess(session, s, "write");
      if (scope.error) return scope.error;
    }

    // Reset each sector
    await Promise.all(sectorsToReset.map((s) => queue.resetSector(s)));

    // Notify every connected client. Emitting per sector lets each sector's own
    // stream carry the event, so `sector: "all"` propagates naturally.
    for (const s of sectorsToReset) {
      const resetAt = await queue.getSectorResetAt(s);
      eventManager.emitQueueReset(s, resetAt ? resetAt.toISOString() : null);
    }

    return NextResponse.json({
      success: true,
      sectors: sectorsToReset,
    });
  } catch (err) {
    const status = errorStatus(err, 0);
    if (status) {
      return NextResponse.json(
        { error: errorMessage(err) },
        { status }
      );
    }
    return NextResponse.json(
      { error: "Não foi possível zerar a fila." },
      { status: 500 }
    );
  }
}
