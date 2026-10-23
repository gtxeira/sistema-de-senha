import type { RecallRequestBody } from '@/shared/types/api';

import { NextResponse } from 'next/server';

import { assertSectorAccess, requirePermission } from '@/server/http/api-auth';
import { recallLast } from '@/server/services/queue-service';
import { isSectorId } from '@/shared/constants';
import { errorMessage, errorStatus } from '@/shared/errors';
import { readJson } from '@/shared/json';
import { QUEUE_RECALL } from '@/shared/permissions';

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
        { error: 'Setor não informado.' },
        { status: 400 },
      );
    }

    const scope = assertSectorAccess(session, sector, 'write');
    if (scope.error) return scope.error;

    const result = await recallLast(sector);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, 'Erro ao repetir senha') },
      { status: errorStatus(error, 500) },
    );
  }
}
