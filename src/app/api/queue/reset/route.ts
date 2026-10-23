import type { SectorId } from '@/shared/constants';
import type { ResetRequestBody } from '@/shared/types/api';

import { NextResponse } from 'next/server';

import { assertSectorAccess, requirePermission } from '@/server/http/api-auth';
import { resetSectors } from '@/server/services/queue-service';
import { ALL_SECTORS, isSectorId, SECTORS } from '@/shared/constants';
import { errorMessage, errorStatus } from '@/shared/errors';
import { readJson } from '@/shared/json';
import { QUEUE_RESET } from '@/shared/permissions';

/* ─────────────────────────────────────────────────
   POST — reseta a sequência de senhas de um setor
   Body: { sector: "farmacia"|"recepcao"|"all" }
   Exige a permissão `filas.resetar` + escopo de escrita em CADA setor
   alvo (o reset é destrutivo e vale para todos os dispositivos
   conectados via SSE).
───────────────────────────────────────────────── */
export async function POST(request: Request) {
  try {
    const { error, session } = await requirePermission(QUEUE_RESET);
    if (error) return error;

    const { sector } = await readJson<ResetRequestBody>(request);

    if (!sector) {
      return NextResponse.json(
        { error: 'Setor não informado.' },
        { status: 400 },
      );
    }

    const rawSectors: string[] =
      sector === ALL_SECTORS ? Object.keys(SECTORS) : [sector];

    const sectorsToReset: SectorId[] = [];
    for (const rawSector of rawSectors) {
      if (!isSectorId(rawSector)) {
        return NextResponse.json({ error: 'Setor inválido.' }, { status: 400 });
      }
      sectorsToReset.push(rawSector);
    }

    // "all" expande e cai na mesma regra: sem escopo de escrita em todos
    // os setores, o reset é negado (nada de rebaixar silenciosamente).
    for (const targetSector of sectorsToReset) {
      const scope = assertSectorAccess(session, targetSector, 'write');
      if (scope.error) return scope.error;
    }

    const result = await resetSectors(sectorsToReset);

    return NextResponse.json({
      sectors: result.sectors,
      success: true,
    });
  } catch (error) {
    const status = errorStatus(error, 0);
    if (status) {
      return NextResponse.json({ error: errorMessage(error) }, { status });
    }
    return NextResponse.json(
      { error: 'Não foi possível zerar a fila.' },
      { status: 500 },
    );
  }
}
