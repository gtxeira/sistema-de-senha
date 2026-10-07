import { NextResponse } from "next/server";
import { queue } from "@/lib/repositories";
import { eventManager } from "@/lib/event-manager";
import {
  errorMessage,
  errorStatus,
  formatNumberString,
  normalizeCallType,
} from "@/lib/repositories/utils";
import { assertSectorAccess, requirePermission } from "@/lib/api-auth";
import { QUEUE_CALL } from "@/lib/permissions";
import { readJson } from "@/lib/json";
import type { CallRequestBody } from "@/types/api";
import { LOCALE, isSectorId } from "@/lib/constants";

/* ─────────────────────────────────────────────────
   POST — chama próxima senha de um setor
   Fluxo:
   1. Valida setor, permissão e escopo do setor
   2. Obtém próximo número
   3. Formata número (N001, P002, etc.)
   4. Salva chamada no banco
   5. Retorna número e tipo
───────────────────────────────────────────────── */
export async function POST(request: Request) {
  try {
    const { session, error } = await requirePermission(QUEUE_CALL);
    if (error) return error;

    const body = await readJson<CallRequestBody>(request);
    const { sector, type } = body;

    // Validate sector (o predicado também estreita para SectorId)
    if (!isSectorId(sector)) {
      return NextResponse.json(
        { error: "Setor não informado." },
        { status: 400 }
      );
    }

    const scope = assertSectorAccess(session, sector, "write");
    if (scope.error) return scope.error;

    // Normalize type
    const { sequenceType, callType } = normalizeCallType(type);

    // Get next number
    const nextResult = await queue.nextNumber(sector, sequenceType);
    const nextNum = nextResult.number;
    const isWraparound = nextResult.wraparound || false;
    const numberStr = formatNumberString(nextNum, sequenceType);

    const attendantId = session.user.id;

    // Save the call
    const saved = await queue.saveCall({
      sector,
      number: nextNum,
      numberStr,
      sequenceType,
      callType,
      attendantId,
    });

    // Emit realtime event for monitors, stamped with the sector's reset marker
    // so clients can tell whether their local replica predates a reset.
    const resetAt = await queue.getSectorResetAt(sector);
    const callEvent = {
      id: saved.id,
      number: nextNum,
      type: sequenceType,
      wraparound: isWraparound,
      time: new Intl.DateTimeFormat(LOCALE, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date()),
    };
    eventManager.emitQueueCall(
      sector,
      callEvent,
      resetAt ? resetAt.toISOString() : null,
    );

    return NextResponse.json({
      success: true,
      number: nextNum,
      numberStr,
      type: sequenceType,
      wraparound: isWraparound,
    });
  } catch (err) {
    const status = errorStatus(err, 0);
    const message = errorMessage(err);
    if (
      status === 503 ||
      message.includes("not configured") ||
      message.includes("Não configurado")
    ) {
      return NextResponse.json(
        { error: message, useLocal: true },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: message || "Erro ao chamar próxima senha" },
      { status: status || 500 }
    );
  }
}
