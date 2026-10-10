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
  subscribeSession,
} from "@/lib/queue";
import { SECTORS, CALL_TYPES, PAGE_SIZES, DEFAULT_SECTOR, getSector } from "@/lib/constants";
import { readJson } from "@/lib/json";
import type { QueueStats } from "@/lib/repositories/types";
import { SECTORS_VIEW_ALL, hasPermission } from "@/lib/permissions";
import { SidebarLayout } from "@/components/SidebarLayout/SidebarLayout";
import { convertToBrazilTimeString } from "@/lib/date-utils";

const ITEMS_PER_PAGE = PAGE_SIZES.historico;

/* ── Estilos (eram classes do Historico.module.css, migrado na etapa 5
     da Fase 2) ── */

/** Rótulo cinza em versalete (`.label`). */
const labelStyle =
  "text-[10px] font-extrabold tracking-[1.25px] text-[#7990a1]";
/** Campo de filtro (`.filterGroup`): no responsive de 560px vira
    coluna full-width (`min-width: unset` via valor arbitrário). */
const filterGroupStyle =
  "flex min-w-[140px] flex-col gap-[5px] max-[560px]:min-w-[unset] max-[560px]:w-full";
/** `<select>` de filtro (`.filterGroup select`). */
const filterSelectStyle =
  "rounded-[6px] border border-[#cddde5] bg-white px-2.5 py-[9px] text-[13px] text-[#1a3d55] outline-[#1678a0]";
/** Cabeçalho da tabela (`.tableHead`): no responsive de 560px a 4ª
    coluna (SETOR) some e as colunas reencaixam em 3. */
const tableHeadStyle =
  "mb-1 grid grid-cols-[0.7fr_1fr_1.2fr_1fr] gap-3 rounded-[6px] bg-[#f0f6f9] px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-[1px] text-[#7a9aad] max-[560px]:grid-cols-[0.7fr_1fr_1fr] max-[560px]:[&>span:nth-child(4)]:hidden";
/** Linha da tabela (`.tableRow`) — mesmo responsive do cabeçalho. */
const tableRowStyle =
  "grid grid-cols-[0.7fr_1fr_1.2fr_1fr] items-center gap-3 border-b border-b-[#edf2f5] p-3 text-[12px] text-[#5a7a8a] max-[560px]:grid-cols-[0.7fr_1fr_1fr] max-[560px]:[&>span:nth-child(4)]:hidden";
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
            <select
              className="cursor-pointer rounded-[7px] border border-[#cfdee8] bg-white px-[13px] py-[10px] text-[12px] font-bold text-[#236681] outline-[#1678a0]"
              value={activeSector}
              onChange={(e) => {
                setActiveSector(e.target.value);
                setPage(1);
                setLoading(true);
              }}
            >
              {Object.values(SECTORS).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </>
      }
    >
      {/* ── Filtros ── */}
      <div className="mt-7 flex flex-wrap items-end gap-3 rounded-[12px] border border-[#dde9ed] bg-white px-5 py-[18px] max-[560px]:flex-col max-[560px]:items-stretch">
        <div className={filterGroupStyle}>
          <label className="text-[10px] font-extrabold uppercase tracking-[1px] text-[#7a9aad]">Período</label>
          <select
            className={filterSelectStyle}
            value={filterDays}
            onChange={(e) => { setFilterDays(e.target.value); setPage(1); }}
          >
            <option value="1">Hoje</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
        </div>
        <div className={filterGroupStyle}>
          <label className="text-[10px] font-extrabold uppercase tracking-[1px] text-[#7a9aad]">Tipo</label>
          <select
            className={filterSelectStyle}
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
          >
            <option value="">Todos</option>
            <option value="normal">Normal</option>
            <option value="preferencial">Preferencial</option>
          </select>
        </div>
        <button
          className="flex cursor-pointer items-center gap-1.5 self-end rounded-[7px] border-current bg-[#1678a0] px-[18px] py-2.5 text-[12px] font-extrabold text-white transition-[background-color] duration-[150ms] hover:bg-[#1389b8] max-[560px]:w-full max-[560px]:justify-center"
          type="button"
          onClick={() => fetchStats()}
        >
          <Filter size={14} /> Filtrar
        </button>
      </div>

      {/* ── Stats ── */}
      {stats && (
        <div className="mt-6 grid grid-cols-4 gap-3.5 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
          <article className="rounded-[10px] border border-[#dde9ed] bg-white px-5 py-[18px]">
            <strong className="block text-[32px] font-black leading-none text-[#0d5e7e]">{stats.summary?.total ?? 0}</strong>
            <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-[0.5px] text-[#7a9aad]">Total no período</span>
          </article>
          <article className="rounded-[10px] border border-[#dde9ed] bg-white px-5 py-[18px]">
            <strong className="block text-[32px] font-black leading-none text-[#0d5e7e]">{stats.summary?.today ?? 0}</strong>
            <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-[0.5px] text-[#7a9aad]">Atendimentos hoje</span>
          </article>
          <article className="rounded-[10px] border border-[#dde9ed] bg-white px-5 py-[18px]">
            <strong className="block text-[32px] font-black leading-none text-[#1678a0]">{stats.summary?.normal ?? 0}</strong>
            <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-[0.5px] text-[#7a9aad]">Senhas normais</span>
          </article>
          <article className="rounded-[10px] border border-[#dde9ed] bg-white px-5 py-[18px]">
            <strong className="block text-[32px] font-black leading-none text-[#b85c00]">{stats.summary?.preferencial ?? 0}</strong>
            <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-[0.5px] text-[#7a9aad]">Preferenciais</span>
          </article>
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
            <div className="flex flex-col">
              <div className={tableHeadStyle}>
                <span>SENHA</span>
                <span>TIPO</span>
                <span>HORÁRIO</span>
                <span>SETOR</span>
              </div>
              {pagedCalls.map((item, index) => (
                <div
                  className={tableRowStyle}
                  key={`${item.id || item.number}-${index}`}
                >
                  <strong className={rowStrongStyle}>{formatQueueNumber(item.number, item.type)}</strong>
                  <span className={item.type === CALL_TYPES.PREFERENCIAL
                    ? "inline-block rounded-[4px] bg-[#fff3e0] px-2.5 py-1 text-[10px] font-extrabold tracking-[0.5px] text-[#b85c00]"
                    : "inline-block rounded-[4px] bg-[#e6f4f9] px-2.5 py-1 text-[10px] font-extrabold tracking-[0.5px] text-[#1678a0]"}
                  >
                    {item.type === CALL_TYPES.PREFERENCIAL ? "Preferencial" : "Normal"}
                  </span>
                  <span>{item.time}</span>
                  <span className="inline-block rounded-[4px] bg-[#f0f6f9] px-2.5 py-1 text-[10px] font-bold text-[#4a6a7a]">
                    {getSector(item.sector_id)?.shortName || item.sector_id || "—"}
                  </span>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-[18px] flex items-center justify-center gap-4 border-t border-t-[#edf2f5] pt-4">
                <button
                  type="button"
                  className="rounded-[6px] border border-[#cfdee8] bg-white px-3.5 py-2 text-[12px] font-bold text-[#3a6a80] transition-[background-color,border-color] duration-[120ms] enabled:hover:border-[#1678a0] enabled:hover:bg-[#f0f6f9] disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Anterior
                </button>
                <span className="text-[12px] font-semibold text-[#7a9aad]">
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  className="rounded-[6px] border border-[#cfdee8] bg-white px-3.5 py-2 text-[12px] font-bold text-[#3a6a80] transition-[background-color,border-color] duration-[120ms] enabled:hover:border-[#1678a0] enabled:hover:bg-[#f0f6f9] disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima →
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </SidebarLayout>
  );
}
