import { NextResponse } from "next/server";
import { read } from "@/lib/repositories";
import { assertSectorAccess, requireSession } from "@/lib/api-auth";
import { hasPermission, SECTORS_VIEW_ALL } from "@/lib/permissions";
import { MIN_DAYS, MAX_DAYS, DEFAULT_DAYS, CALL_TYPES } from "@/lib/constants";
import { normalizePage, normalizePageSize } from "@/lib/repositories/utils";
import { sanitizeNull } from "@/lib/sanitization";

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

  const url = new URL(request.url);
  const days = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Number(url.searchParams.get("days")) || DEFAULT_DAYS));
  const sector = sanitizeNull(url.searchParams.get("sector")) || null;

  // Tipo inválido é IGNORADO (não vira 400): o filtro é opcional e a
  // tabela simplesmente mostra todos. `preferential` é a grafia antiga
  // da API e continua aceita.
  const typeParam = sanitizeNull(url.searchParams.get("type"));
  const type =
    typeParam === CALL_TYPES.PREFERENCIAL || typeParam === CALL_TYPES.PREFERENTIAL
      ? CALL_TYPES.PREFERENCIAL
      : typeParam === CALL_TYPES.NORMAL
        ? CALL_TYPES.NORMAL
        : null;

  const page = normalizePage(Number(url.searchParams.get("page")));
  const pageSize = normalizePageSize(Number(url.searchParams.get("pageSize")));

  if (sector) {
    const scope = assertSectorAccess(session, sector, "read");
    if (scope.error) return scope.error;
  } else if (!hasPermission(session, SECTORS_VIEW_ALL)) {
    return NextResponse.json(
      { error: "Acesso ao setor negado.", code: "sector_forbidden" },
      { status: 403 }
    );
  }

  try {
    const stats = await read.getStats({ days, sector, type, page, pageSize });
    return NextResponse.json(stats);
  } catch {
    // On error, return empty structure to avoid breaking admin UI
    return NextResponse.json({
      days,
      summary: { total: 0, today: 0, preferencial: 0, normal: 0 },
      calls: [],
      pagination: { page, pageSize, total: 0, totalPages: 1 },
      noDb: true,
    });
  }
}
