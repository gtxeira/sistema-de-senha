"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Filter,
} from "lucide-react";
import {
  formatQueueNumber,
  getServerSessionSnapshot,
  getSessionSnapshot,
  subscribeSession, TYPE_LABELS,
} from "@/lib/queue";
import { SECTORS, CALL_TYPES, PAGE_SIZES, DEFAULT_SECTOR, getSector } from "@/lib/constants";
import { readJson } from "@/lib/json";
import type { QueueStats } from "@/lib/repositories/types";
import { SECTORS_VIEW_ALL, hasPermission } from "@/lib/permissions";
import { SidebarLayout } from "@/components/SidebarLayout/SidebarLayout";
import { convertToBrazilTimeString } from "@/lib/date-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem, SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FilterGroup } from "@/components/filter-group";
import { Pagination } from "@/components/pagination";
import { StatCard } from "@/components/stat-card";
import { cn } from "@/lib/utils";

const ITEMS_PER_PAGE = PAGE_SIZES.historico;

/* ── Estilos (eram classes do Historico.module.css, migrado na etapa 5
     da Fase 2) ── */

/** Rótulo cinza em versalete (`.label`). */
const labelStyle =
  "text-[10px] font-extrabold tracking-[1.25px] text-[#7990a1]";
/** Número da senha na linha (`.tableRow strong`). */
const rowStrongStyle = "text-[17px] font-extrabold tracking-[1px] text-[#163b52]";

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

export default function HistoricoPage() {
  const router   = useRouter();
  const isClient = useIsClient();

  const session = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSessionSnapshot
  );

  // Sem escopo de "todos os setores", a sessão trava no próprio setor
  const canViewAllSectors = hasPermission(session, SECTORS_VIEW_ALL);
  const initialSector = (!canViewAllSectors && session?.sector)
    ? session.sector
    : DEFAULT_SECTOR;

  const [activeSector, setActiveSector] = useState(initialSector);

  const [filterDays, setFilterDays] = useState("30");
  const [filterType, setFilterType] = useState("");
  const [stats, setStats]           = useState<QueueStats | null>(null);
  // começa carregando: o effect de montagem busca sem setState síncrono
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);

  useEffect(() => {
    const stored = getSessionSnapshot();
    if (!stored) router.push("/login");
  }, [router]);

  const statsUrl = (days: string, sector: string) => {
    const params = new URLSearchParams({ days });
    if (sector) params.set("sector", sector);
    return `/api/stats?${params}`;
  };

  // Uso em handlers de evento (Filtrar): setState síncrono é permitido lá
  const fetchStats = (overrides: { days?: string; sector?: string } = {}) => {
    const days   = overrides.days !== undefined ? overrides.days : filterDays;
    const sector = overrides.sector !== undefined ? overrides.sector : activeSector;

    setLoading(true);
    fetch(statsUrl(days, sector))
      .then((r) => (r.ok ? readJson<QueueStats>(r) : null))
      .then((data) => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  // Carga inicial e troca de setor: setState só dentro de callbacks
  // assíncronos (regra set-state-in-effect). O "loading" e o reset de página
  // da troca são disparados pelo handler do seletor, antes deste effect.
  useEffect(() => {
    fetch(statsUrl(filterDays, activeSector))
      .then((r) => (r.ok ? readJson<QueueStats>(r) : null))
      .then((data) => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeSector]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isClient || !session) return null;

  const sectorInfo = getSector(activeSector) ?? SECTORS.farmacia;

  let allCalls = (stats?.recent || []).map((c) => ({
    ...c,
    time: convertToBrazilTimeString(c.time),
  }));

  if (filterType) {
    allCalls = allCalls.filter((c) => c.type === filterType);
  }

  const totalPages = Math.max(1, Math.ceil(allCalls.length / ITEMS_PER_PAGE));
  const pagedCalls = allCalls.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <SidebarLayout
      activeRoute="historico"
      session={session}
      sectorInfo={sectorInfo}
      eyebrow="HISTÓRICO DE ATENDIMENTOS"
      title="Histórico completo"
      subtitle="Consulte todas as chamadas de senhas realizadas."
      headerActions={
        <>
          {canViewAllSectors && (
            <Select
              value={activeSector}
              onValueChange={(v) => {
                if (v === null) return;
                setActiveSector(v);
                setPage(1);
                setLoading(true);
              }}
              items={{
                null: 'Todos',
                ...Object.fromEntries(Object.values(SECTORS).map((s) => [s.id, s.name]))
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Setores</SelectLabel>

                  <SelectItem value="null">Todos</SelectItem>

                  {Object.values(SECTORS).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </>
      }
    >
      {/* ── Filtros ── */}
      <div className="mt-7 flex flex-wrap items-end gap-3 rounded-[12px] border border-[#dde9ed] bg-white px-5 py-[18px] max-[560px]:flex-col max-[560px]:items-stretch">
        <FilterGroup label="Período" className="min-w-[140px] max-w-[280px] flex-1 max-[560px]:max-w-none">
          <Select
            value={filterDays}
            onValueChange={(v) => { if (v !== null) { setFilterDays(v); setPage(1); } }}
            items={{ "1": "Hoje", "7": "Últimos 7 dias", "30": "Últimos 30 dias", "90": "Últimos 90 dias" }}
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
        <FilterGroup label="Tipo" className="min-w-[140px] max-w-[280px] flex-1 max-[560px]:max-w-none">
          <Select
            value={filterType || "all"}
            onValueChange={(v) => { if (v !== null) { setFilterType(v === "all" ? "" : v); setPage(1); } }}
            items={{ all: "Todos", normal: "Normal", preferencial: "Preferencial" }}
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
          onClick={() => fetchStats()}
        >
          <Filter data-icon="inline-start" /> Filtrar
        </Button>
      </div>

      {/* ── Stats ── */}
      {stats && (
        <div className="mt-6 grid grid-cols-4 gap-3.5 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
          <StatCard value={stats.summary?.total ?? 0} label="Total no período" />
          <StatCard value={stats.summary?.today ?? 0} label="Atendimentos hoje" />
          <StatCard tone="normal" value={stats.summary?.normal ?? 0} label="Senhas normais" />
          <StatCard tone="preferencial" value={stats.summary?.preferencial ?? 0} label="Preferenciais" />
        </div>
      )}

      {/* ── Tabela ── */}
      <section className="mt-6 rounded-[14px] border border-[#dde9ed] bg-white p-7">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <span className={labelStyle}>REGISTROS</span>
            <h2 className="mt-1.75 text-[18px] font-bold">Chamadas de senhas</h2>
          </div>
        </div>

        {loading && <p className="p-8 text-center text-[13px] text-[#7a9aad]">Carregando...</p>}

        {!loading && pagedCalls.length === 0 && (
          <p className="p-8 text-center text-[13px] text-[#9ab0bc]">Nenhuma chamada encontrada para os filtros selecionados.</p>
        )}

        {!loading && pagedCalls.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[0.7fr]">Senha</TableHead>
                  <TableHead className="w-[1fr]">Tipo</TableHead>
                  <TableHead className="w-[1.2fr]">Horário</TableHead>
                  <TableHead className="w-[1fr] max-[560px]:hidden">Setor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedCalls.map((item, index) => (
                  <TableRow key={`${item.id || item.number}-${index}`}>
                    <TableCell>
                      <strong className={rowStrongStyle}>{formatQueueNumber(item.number, item.type)}</strong>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          item.type === CALL_TYPES.NORMAL && 'bg-[#1972a0]',
                          item.type === CALL_TYPES.PREFERENCIAL && 'bg-[#ef4444]/90'
                        )}
                      >
                        {item.type === CALL_TYPES.PREFERENCIAL ? TYPE_LABELS.preferencial : TYPE_LABELS.normal}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.time}</TableCell>
                    <TableCell className="max-[560px]:hidden">
                      <Badge variant="secondary">
                        {getSector(item.sector_id)?.shortName || item.sector_id || "—"}
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
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </section>
    </SidebarLayout>
  );
}
