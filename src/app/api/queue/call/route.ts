import type { CallRequestBody } from '@/shared/types/api';

import { NextResponse } from 'next/server';

import { assertSectorAccess, requirePermission } from '@/server/http/api-auth';
import { callNext } from '@/server/services/queue-service';
import { isSectorId } from '@/shared/constants';
import { errorMessage, errorStatus } from '@/shared/errors';
import { readJson } from '@/shared/json';
import { QUEUE_CALL } from '@/shared/permissions';

/* ─────────────────────────────────────────────────
   POST — chama próxima senha de um setor
   Fluxo:
   1. Valida setor, permissão e escopo do setor
   2. O serviço obtém o próximo número, formata, salva e emite o SSE
   3. Retorna número e tipo
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
        { error: 'Setor não informado.' },
        { status: 400 },
      );
    }

    const scope = assertSectorAccess(session, sector, 'write');
    if (scope.error) return scope.error;

    const result = await callNext({
      sector,
      type,
      attendantId: session.user.id,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const status = errorStatus(error, 0);
    const message = errorMessage(error);
    if (
      status === 503 ||
      message.includes('not configured') ||
      message.includes('Não configurado')
    ) {
      return NextResponse.json(
        { error: message, useLocal: true },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: message || 'Erro ao chamar próxima senha' },
      { status: status || 500 },
    );
  }
}
