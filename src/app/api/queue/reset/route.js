import { NextResponse } from "next/server";
import { queue } from "@/lib/repositories";
import { eventManager } from "@/lib/event-manager";
import { assertSectorAccess, requirePermission } from "@/lib/api-auth";
import { QUEUE_RESET } from "@/lib/permissions.js";
import { SECTORS, ALL_SECTORS } from "@/lib/constants.js";

/* ─────────────────────────────────────────────────
   POST — reseta a sequência de senhas de um setor
   Body: { sector: "farmacia"|"recepcao"|"all" }
   Exige a permissão `filas.resetar` + escopo de escrita em CADA setor
   alvo (o reset é destrutivo e vale para todos os dispositivos
   conectados via SSE).
───────────────────────────────────────────────── */
export async function POST(request) {
  try {
    const { session, error } = await requirePermission(QUEUE_RESET);
    if (error) return error;

    const { sector } = await request.json();

    if (!sector) {
      return NextResponse.json(
        { error: "Setor não informado." },
        { status: 400 }
      );
    }

    const sectorsToReset =
      sector === ALL_SECTORS ? Object.keys(SECTORS) : [sector];

    if (!sectorsToReset.every((s) => Object.hasOwn(SECTORS, s))) {
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
    if (err.status) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: "Não foi possível zerar a fila." },
      { status: 500 }
    );
  }
}
