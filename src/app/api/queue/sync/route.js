import { NextResponse } from "next/server";
import { queue } from "@/lib/repositories";
import { eventManager } from "@/lib/event-manager";
import { formatNumberString, normalizeCallType } from "@/lib/repositories/utils";
import { auth } from "@/auth";

/* ─────────────────────────────────────────────────
   POST — sincroniza a fila para um número específico
   Body: { sector, type, nextNumber }
───────────────────────────────────────────────── */
export const POST = auth(async function POST(request) {
  try {
    const body = await request.json();
    const { sector, type, nextNumber } = body;

    // Validate sector
    if (!sector || !["farmacia", "recepcao"].includes(sector)) {
      return NextResponse.json(
        { error: "Setor não informado." },
        { status: 400 }
      );
    }

    // Normalize type
    const { sequenceType } = normalizeCallType(type);

    // Validate nextNumber
    const num = Number(nextNumber);
    if (!Number.isInteger(num) || num < 1 || num > 999) {
      return NextResponse.json(
        { error: "Número inválido. Use um valor entre 1 e 999." },
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
      message: `Próxima senha de ${sector === "farmacia" ? "Farmácia" : "Recepção"}: ${numberStr}`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Erro ao sincronizar fila" },
      { status: err.status || 500 }
    );
  }
});
