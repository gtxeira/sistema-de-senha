import { NextResponse } from 'next/server';
import { resetSectors } from '@/server/services/queue-service';
import { errorMessage, errorStatus } from '@/shared/errors';
import { assertSectorAccess, requirePermission } from '@/server/http/api-auth';
import { QUEUE_RESET } from '@/shared/permissions';
import { readJson } from '@/shared/json';
import type { ResetRequestBody } from '@/shared/types/api';
import { SECTORS, ALL_SECTORS, isSectorId } from '@/shared/constants';
import type { SectorId } from '@/shared/constants';

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
      success: true,
      sectors: result.sectors,
    });
  } catch (err) {
    const status = errorStatus(err, 0);
    if (status) {
      return NextResponse.json({ error: errorMessage(err) }, { status });
    }
    return NextResponse.json(
      { error: 'Não foi possível zerar a fila.' },
      { status: 500 },
    );
  }
}
