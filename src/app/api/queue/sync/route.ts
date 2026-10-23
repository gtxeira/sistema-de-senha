import { NextResponse } from "next/server";
import { queue } from "@/server/repositories";
import { errorMessage, errorStatus } from "@/shared/errors";
import { formatNumberString, normalizeCallType } from "@/shared/queue-format";
import { assertSectorAccess, requirePermission } from "@/server/http/api-auth";
import { QUEUE_SYNC } from "@/shared/permissions";
import { readJson } from "@/shared/json";
import type { SyncRequestBody } from "@/shared/types/api";
import { SECTORS, MIN_QUEUE_NUMBER, MAX_QUEUE_NUMBER, isSectorId } from "@/shared/constants";

/* ─────────────────────────────────────────────────
   POST — sincroniza a fila para um número específico
   Body: { sector, type, nextNumber }
   Exige a permissão `filas.sincronizar` + escopo de escrita no setor:
   fixa a numeração de toda a fila do setor.
───────────────────────────────────────────────── */
export async function POST(request: Request) {
  try {
    const { session, error } = await requirePermission(QUEUE_SYNC);
    if (error) return error;

    const body = await readJson<SyncRequestBody>(request);
    const { sector, type, nextNumber } = body;

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
    const { sequenceType } = normalizeCallType(type);

    // Validate nextNumber
    const num = Number(nextNumber);
    if (!Number.isInteger(num) || num < MIN_QUEUE_NUMBER || num > MAX_QUEUE_NUMBER) {
      return NextResponse.json(
        { error: `Número inválido. Use um valor entre ${MIN_QUEUE_NUMBER} e ${MAX_QUEUE_NUMBER}.` },
        { status: 400 }
      );
    }

    // Set the next number in the database
    await queue.setNextNumber(sector, sequenceType, num);

    // Format for response
    const numberStr = formatNumberString(num, sequenceType);

    return NextResponse.json({
      success: true,
      sector,
      type: sequenceType,
      nextNumber: num,
      numberStr,
      message: `Próxima senha de ${SECTORS[sector]?.name || sector}: ${numberStr}`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err, "Erro ao sincronizar fila") },
      { status: errorStatus(err, 500) }
    );
  }
}
