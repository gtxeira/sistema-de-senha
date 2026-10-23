import { NextResponse } from 'next/server';

import { assertSectorAccess, requireSession } from '@/server/http/api-auth';
import { getStats, parseStatsQuery } from '@/server/services/stats-service';
import { hasPermission, SECTORS_VIEW_ALL } from '@/shared/permissions';

/* ─────────────────────────────────────────────────
   GET — retorna estatísticas e histórico paginado
   Query params:
   - days: número de dias (padrão 30, máx 90)
   - sector: filtro por setor ("farmacia"|"recepcao")
   - type: filtro da TABELA ("normal"|"preferencial"); não afeta os cards
   - page: página 1-based (padrão 1; clampada em [1, totalPages])
   - pageSize: linhas por página (padrão 20, máx 100)
   Somente `/historico` consome esta rota, e ele é autenticado.
   Escopo: com `sector` → setor próprio ou `setores.todos.ver`;
   sem `sector` (agregado de todos) → exige `setores.todos.ver`.
───────────────────────────────────────────────── */
export async function GET(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  const query = parseStatsQuery(new URL(request.url).searchParams);

  if (query.sector) {
    const scope = assertSectorAccess(session, query.sector, 'read');
    if (scope.error) return scope.error;
  } else if (!hasPermission(session, SECTORS_VIEW_ALL)) {
    return NextResponse.json(
      { error: 'Acesso ao setor negado.', code: 'sector_forbidden' },
      { status: 403 },
    );
  }

  const stats = await getStats(query);
  return NextResponse.json(stats);
}
