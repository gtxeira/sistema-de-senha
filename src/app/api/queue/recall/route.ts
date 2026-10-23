import { NextResponse } from "next/server";
import { recallLast } from "@/server/services/queue-service";
import { errorMessage, errorStatus } from "@/shared/errors";
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

    const result = await recallLast(sector);

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err, "Erro ao repetir senha") },
      { status: errorStatus(err, 500) }
    );
  }
}
