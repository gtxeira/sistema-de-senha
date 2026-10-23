import type { SyncRequestBody } from '@/shared/types/api';

import { NextResponse } from 'next/server';

import { assertSectorAccess, requirePermission } from '@/server/http/api-auth';
import { syncNext } from '@/server/services/queue-service';
import { isSectorId } from '@/shared/constants';
import { errorMessage, errorStatus } from '@/shared/errors';
import { readJson } from '@/shared/json';
import { QUEUE_SYNC } from '@/shared/permissions';

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
        { error: 'Setor não informado.' },
        { status: 400 },
      );
    }

    const scope = assertSectorAccess(session, sector, 'write');
    if (scope.error) return scope.error;

    const result = await syncNext({ sector, type, nextNumber });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, 'Erro ao sincronizar fila') },
      { status: errorStatus(error, 500) },
    );
  }
}
