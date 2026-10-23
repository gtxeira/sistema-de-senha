'use client';

import type { SectorScope } from '@/shared/constants';
import type { QueueStats } from '@/shared/types/domain';

import { Filter } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { formatQueueNumber, TYPE_LABELS } from '@/client/queue/queue';
import { cn } from '@/client/utils';
import { FilterGroup } from '@/components/filter-group';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SectorSelect } from '@/components/sector-select';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useEffectiveSession } from '@/hooks/use-effective-session';
import { useSetDashboardLayoutInfo } from '@/hooks/use-set-dashboard-layout-info';
import {
  ALL_SECTORS,
  CALL_TYPES,
  DEFAULT_SECTOR,
  getSector,
  getSectorScope,
  isSectorId,
  PAGE_SIZES,
  SECTORS,
} from '@/shared/constants';
import { readJson } from '@/shared/json';
import { hasPermission, SECTORS_VIEW_ALL } from '@/shared/permissions';
import { formatClock, formatDay } from '@/shared/time';

const ITEMS_PER_PAGE = PAGE_SIZES.historico;

/** Filtros efetivamente aplicados à consulta (o que o "Filtrar" confirmou). */
interface AppliedFilters {
  readonly days: string;
  readonly type: string;
}

/**
 * URL do histórico. A paginação é do servidor: `page`/`pageSize` vão na
 * query e a resposta traz só a página — nunca a janela inteira.
 */
function statsUrl(
  filters: AppliedFilters,
  scope: SectorScope,
  page: number,
): string {
  const params = new URLSearchParams({
    days: filters.days,
    page: String(page),
    pageSize: String(ITEMS_PER_PAGE),
  });
  // "Todos" = visão agregada: a API lê a ausência de `sector` como
  // "todos os setores" (e exige `setores.todos.ver`).
  if (scope !== ALL_SECTORS) params.set('sector', scope);
  if (filters.type) params.set('type', filters.type);
  return `/api/stats?${params}`;
}

/* ── Estilos (eram classes do Historico.module.css, migrado na etapa 5
     da Fase 2) ── */

/** Rótulo cinza em versalete (`.label`). */
const labelStyle =
  'text-[10px] font-extrabold tracking-[1.25px] text-[#7990a1]';
/** Número da senha na linha (`.tableRow strong`). */
const rowStrongStyle =
  'text-[17px] font-extrabold tracking-[1px] text-[#163b52]';

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export default function HistoricoPage() {
  const isClient = useIsClient();

  const session = useEffectiveSession();

  // Sem escopo de "todos os setores", a sessão trava no próprio setor
  const canViewAllSectors = hasPermission(session, SECTORS_VIEW_ALL);
  const sessionSector = session?.sector;

  const initialSector: SectorScope = canViewAllSectors
    ? ALL_SECTORS
    : (!canViewAllSectors && isSectorId(sessionSector)
      ? sessionSector
      : DEFAULT_SECTOR);

  // Escopo ativo: um setor real ou "Todos" (visão agregada).
  const [activeSector, setActiveSector] = useState<SectorScope>(initialSector);

  const [filterDays, setFilterDays] = useState('30');
  const [filterType, setFilterType] = useState('');
  // Filtros confirmados no "Filtrar". A paginação e a troca de setor usam
  // ESTES, não os selects pendentes: senão "Próxima" aplicaria um filtro
  // que o usuário ainda não confirmou. Por isso os selects também não
  // resetam `page` — só o "Filtrar" (que busca) e a troca de setor.
  const [applied, setApplied] = useState<AppliedFilters>({
    days: '30',
    type: '',
  });
  const [stats, setStats] = useState<QueueStats | null>(null);
  // começa carregando: o effect de montagem busca sem setState síncrono
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Cancela a requisição anterior: cliques rápidos em Anterior/Próxima (ou
  // troca de setor) não podem deixar uma resposta antiga sobrescrever a nova.
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(
    (filters: AppliedFilters, targetPage: number) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;

      fetch(statsUrl(filters, activeSector, targetPage), {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? readJson<QueueStats>(r) : null))
        .then((data) => {
          if (controller.signal.aborted) return;
          setStats(data);
          // O servidor clampa em [1, totalPages]; refletir o valor efetivo
          // mantém "Página X de Y" coerente.
          if (data) setPage(data.pagination.page);
          setLoading(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setLoading(false);
        });
    },
    [activeSector],
  );

  // Carga inicial e troca de setor: setState só dentro de callbacks
  // assíncronos (regra set-state-in-effect). O "loading" e o reset de página
  // da troca são disparados pelo handler do seletor, antes deste effect.
  useEffect(() => {
    load(applied, 1);
  }, [activeSector]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aborta o que estiver em voo ao desmontar.
  useEffect(() => () => requestRef.current?.abort(), []);

  // "Todos" resolve para o pseudo-setor — a sidebar mostra "Todos os Setores"
  // em vez de cair num setor qualquer.
  const sectorInfo = getSectorScope(activeSector) ?? SECTORS.farmacia;

  // Publica o setor em foco e o seletor do cabeçalho. Fica **antes** do
  // `return null` do `isClient`: hook não pode ser chamado condicionalmente
  // (a regra `rules-of-hooks` acusa), e publicar antes do gate faz as ações
  // do cabeçalho aparecerem no primeiro render do client.
  useSetDashboardLayoutInfo({
    sectorInfo,
    headerActions: (
      <>
        {canViewAllSectors && (
          <SectorSelect
            value={activeSector}
            allowAll
            onValueChange={(v) => {
              setActiveSector(v);
              setPage(1);
              setLoading(true);
            }}
          />
        )}
      </>
    ),
  });

  if (!isClient || !session) return null;

  // O wire traz o INSTANTE (`createdAt`); a exibição é em BRT, no fuso do
  // app. A data só faz sentido quando o período cobre mais de um dia.
  //
  // `stats.calls` JÁ é a página filtrada e paginada no servidor: não há
  // mais `filter`/`slice` aqui — era isso que fazia "Histórico completo"
  // mentir (só as 200 mais recentes) e o filtro de tipo contar errado.
  const calls = (stats?.calls ?? []).map((c) => ({
    ...c,
    time: formatClock(c.createdAt),
    day: formatDay(c.createdAt),
  }));

  // "Hoje" já é todo do dia BRT — a coluna de data seria ruído. `stats.days`
  // é a janela efetiva que o servidor usou (não o select pendente).
  const showDayColumn = (stats?.days ?? Number(applied.days)) > 1;
  const totalPages = stats?.pagination?.totalPages ?? 1;

  return (
    <>
      <PageHeader
        eyebrow="HISTÓRICO DE ATENDIMENTOS"
        title="Histórico completo"
        subtitle={
          activeSector === ALL_SECTORS
            ? 'Consulte todas as chamadas de senhas realizadas em todos os setores.'
            : `Consulte todas as chamadas de senhas realizadas do setor ${sectorInfo.name}.`
        }
      />

      <div>
        {/* ── Filtros ── */}
        <div className="flex flex-wrap items-end gap-3 rounded-[12px] border border-[#dde9ed] bg-white px-5 py-[18px] max-[560px]:flex-col max-[560px]:items-stretch">
          <FilterGroup
            label="Período"
            className="max-w-[280px] min-w-[140px] flex-1 max-[560px]:max-w-none"
          >
            <Select
              value={filterDays}
              onValueChange={(v) => {
                if (v !== null) setFilterDays(v);
              }}
              items={{
                '1': 'Hoje',
                '7': 'Últimos 7 dias',
                '30': 'Últimos 30 dias',
                '90': 'Últimos 90 dias',
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Período</SelectLabel>
                  <SelectItem value="1">Hoje</SelectItem>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </FilterGroup>
          <FilterGroup
            label="Tipo"
            className="max-w-[280px] min-w-[140px] flex-1 max-[560px]:max-w-none"
          >
            <Select
              value={filterType || 'all'}
              onValueChange={(v) => {
                if (v !== null) setFilterType(v === 'all' ? '' : v);
              }}
              items={{
                all: 'Todos',
                normal: 'Normal',
                preferencial: 'Preferencial',
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Tipos de Fila</SelectLabel>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="preferencial">Preferencial</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </FilterGroup>
          <Button
            className="self-end max-[560px]:w-full"
            onClick={() => {
              const next: AppliedFilters = {
                days: filterDays,
                type: filterType,
              };
              setApplied(next);
              setPage(1);
              setLoading(true);
              load(next, 1);
            }}
          >
            <Filter data-icon="inline-start" /> Filtrar
          </Button>
        </div>

        {/* ── Stats ── */}
        {stats && (
          <div className="mt-6 grid grid-cols-4 gap-3.5 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
            <StatCard
              value={stats.summary?.total ?? 0}
              label="Total no período"
            />
            <StatCard
              value={stats.summary?.today ?? 0}
              label="Atendimentos hoje"
            />
            <StatCard
              tone="normal"
              value={stats.summary?.normal ?? 0}
              label="Senhas normais"
            />
            <StatCard
              tone="preferencial"
              value={stats.summary?.preferencial ?? 0}
              label="Preferenciais"
            />
          </div>
        )}

        {/* ── Tabela ── */}
        <section className="mt-6 rounded-[14px] border border-[#dde9ed] bg-white p-4 sm:p-7">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <span className={labelStyle}>REGISTROS</span>
              <h2 className="mt-1.75 text-[18px] font-bold">
                Chamadas de senhas
              </h2>
            </div>
          </div>

          {loading && (
            <p className="p-8 text-center text-[13px] text-[#7a9aad]">
              Carregando...
            </p>
          )}

          {!loading && calls.length === 0 && (
            <p className="p-8 text-center text-[13px] text-[#9ab0bc]">
              Nenhuma chamada encontrada para os filtros selecionados.
            </p>
          )}

          {!loading && calls.length > 0 && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[0.7fr]">Senha</TableHead>
                    <TableHead className="w-[1fr]">Tipo</TableHead>
                    <TableHead className="w-[1.2fr]">Horário</TableHead>
                    {showDayColumn && (
                      <TableHead className="w-[0.9fr]">Data</TableHead>
                    )}
                    <TableHead className="w-[1fr] max-[560px]:hidden">
                      Setor
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calls.map((item, index) => (
                    <TableRow key={`${item.id || item.number}-${index}`}>
                      <TableCell>
                        <strong className={rowStrongStyle}>
                          {formatQueueNumber(item.number, item.type)}
                        </strong>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            item.type === CALL_TYPES.NORMAL && 'bg-[#1972a0]',
                            item.type === CALL_TYPES.PREFERENCIAL &&
                              'bg-[#ef4444]/90',
                          )}
                        >
                          {item.type === CALL_TYPES.PREFERENCIAL
                            ? TYPE_LABELS.preferencial
                            : TYPE_LABELS.normal}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.time}</TableCell>
                      {showDayColumn && <TableCell>{item.day}</TableCell>}
                      <TableCell className="max-[560px]:hidden">
                        <Badge variant="secondary">
                          {getSector(item.sector_id)?.shortName ||
                            item.sector_id ||
                            '—'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={(next) => {
                    setPage(next);
                    setLoading(true);
                    load(applied, next);
                  }}
                />
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
