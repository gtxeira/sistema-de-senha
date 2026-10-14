"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import {
  callNextNumber,
  formatQueueNumber,
  getQueueSnapshot,
  getServerQueueSnapshot,
  getServerSessionSnapshot,
  getSessionSnapshot, nextQueueNumber,
  normalizeQueue,
  readQueueState,
  reconcileQueueFromCalls,
  saveQueueState,
  subscribeQueue,
  subscribeSession,
} from "@/lib/queue";
import { SECTORS, CALL_TYPES, TYPE_FIELDS, TYPE_LABELS, HISTORY_LIMITS, PAGE_SIZES, DEFAULT_SECTOR, DEFAULT_NAME, KEYBOARD_SHORTCUTS, API_ROUTES, isSectorId, getSector } from "@/lib/constants";
import type { CallType, SectorId } from "@/lib/constants";
import { SECTORS_VIEW_ALL, hasPermission } from "@/lib/permissions";
import { useQueueEvents } from "@/lib/hooks/useQueueEvents";
import { SidebarLayout } from "@/components/SidebarLayout/SidebarLayout";
import { convertToBrazilTimeString } from "@/lib/date-utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Pagination } from "@/components/pagination";
import { cn } from "@/lib/utils";

const HISTORY_LIMIT = HISTORY_LIMITS.painel;
const ITEMS_PER_PAGE = PAGE_SIZES.painel;

/* ── Estilos (eram classes do Painel.module.css, migrado na etapa 4
     da Fase 2) ── */

/** Rótulo cinza em versalete dos cartões (`.label`). */
const labelStyle =
  "text-[10px] font-extrabold tracking-[1.25px] text-[#7990a1]";
/** Cartão branco de borda 14px (`.currentCard`, `.actionsCard`, `.recent`);
    o padding estreita no responsive de 560px. */
const cardStyle =
  "rounded-[14px] border border-[#dde9ed] bg-white p-7 max-[560px]:px-[17px] max-[560px]:py-[21px]";
/** Linha do topo dos cartões (`.cardTop`). */
const cardTopStyle = "flex items-start justify-between";
/** Faixa "AO VIVO" (`.live`); o pulso usa o token `--animate-live-pulse`
    do globals.css, com os keyframes/tempos do módulo antigo. */
const liveStyle =
  "flex items-center gap-1.5 text-[10px] font-extrabold tracking-[1px] text-[#159883]";
/** Base comum dos botões CHAMAR NORMAL/PREFERENCIAL (`.normalButton`,
    `.priorityButton`); a elevação do hover não vale quando desabilitado
    (daí `enabled:`), e `border-current` reproduz o `border: 0` antigo. */
const callButtonStyle =
  "flex h-auto w-full items-center justify-between gap-1.5 rounded-[10px] px-5! py-[18px] text-[16px] font-extrabold transition-[transform,box-shadow] duration-[120ms] enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] disabled:cursor-wait disabled:opacity-60";
const callButtonSmallStyle = "text-[12px] font-semibold opacity-80";

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

export default function PainelPage() {
  const router    = useRouter();
  const isClient  = useIsClient();

  const session = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSessionSnapshot
  );
  const state = useSyncExternalStore(
    subscribeQueue,
    getQueueSnapshot,
    getServerQueueSnapshot
  );

  const [notice, setNotice]       = useState("Pronto para o próximo atendimento");
  const [calling, setCalling]     = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  // Sem escopo de "todos os setores", a sessão trava no próprio setor
  const canViewAllSectors = hasPermission(session, SECTORS_VIEW_ALL);
  const sessionSector = session?.sector;
  const initialSector: SectorId =
    !canViewAllSectors && isSectorId(sessionSector) ? sessionSector : DEFAULT_SECTOR;

  const [activeSector, setActiveSector] = useState<SectorId>(initialSector);

  const handleSectorChange = (newSector: string) => {
    // O Select só monta opções de SECTORS; o predicado é o que dá ao TS o
    // estreitamento que `Object.hasOwn` não dá.
    if (!isSectorId(newSector)) return;
    setActiveSector(newSector);
    setHistoryPage(1); // Mapeia a redefinição da página no evento de troca
  };

  // `normalizeQueue` devolve um objeto novo a cada render, então reconstruir
  // com o histórico convertido é equivalente (e imutável) ao mutar `.history`.
  const baseQueue = normalizeQueue(state[activeSector]);
  const current = {
    ...baseQueue,
    history: baseQueue.history.map((h) => ({
      ...h,
      time: convertToBrazilTimeString(h.time),
    })),
  };

  const sectorInfo = getSector(activeSector) ?? SECTORS.farmacia;

  const { calls, lastCall } = useQueueEvents(activeSector);
  const lastCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    const storedSession = getSessionSnapshot();
    if (!storedSession) { router.push("/login"); }
  }, [router]);

  useEffect(() => {
    if (!activeSector || calls == null) return;
    reconcileQueueFromCalls(activeSector, calls, { historyLimit: HISTORY_LIMIT });
  }, [calls, activeSector]);

  useEffect(() => {
    if (!lastCall || !activeSector) return;
    const callKey = `${lastCall.id || lastCall.number}-${lastCall.type}`;
    if (lastCallIdRef.current === callKey) return;
    lastCallIdRef.current = callKey;

    const latestState = readQueueState();
    const latest = normalizeQueue(latestState[activeSector]);
    const callType = lastCall.type === CALL_TYPES.PREFERENCIAL ? CALL_TYPES.PREFERENCIAL : CALL_TYPES.NORMAL;
    const field = callType === CALL_TYPES.PREFERENCIAL ? TYPE_FIELDS.preferencial : TYPE_FIELDS.normal;

    if (
      latest.history.length > 0 &&
      latest.history[0].number === lastCall.number &&
      latest.history[0].type === callType
    ) return;

    saveQueueState({
      ...latestState,
      [activeSector]: {
        ...latest,
        [field]: lastCall.number,
        history: [
          { number: lastCall.number, type: callType, time: lastCall.time },
          ...latest.history,
        ].slice(0, HISTORY_LIMIT),
      },
    });
  }, [lastCall, activeSector]);

  const callNext = useCallback(async (type: CallType) => {
    if (calling) return;
    setCalling(true);

    const result = await callNextNumber({ sector: activeSector, type });

    if (result.ok) {
      setNotice(type === CALL_TYPES.PREFERENCIAL ? "Senha preferencial chamada" : "Senha normal chamada");
    } else {
      setNotice(result.error);
    }

    setCalling(false);
  }, [calling, activeSector]);

  const reCall = useCallback(async () => {
    const lastItem = current.history[0];
    if (!lastItem) { setNotice("Nenhuma senha anterior para chamar."); return; }
    setNotice("Repetindo chamada...");
    try {
      await fetch(API_ROUTES.QUEUE_RECALL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector: activeSector }),
      });
      setNotice(`Chamando novamente: ${formatQueueNumber(lastItem.number, lastItem.type)}`);
    } catch {
      setNotice("Erro ao repetir chamada.");
    }
  }, [current.history, activeSector]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // `event.target` é `EventTarget | null`: sem o `instanceof` não há
      // `tagName` para ler (e alvos não-elementares seguem sem atalho).
      if (
        event.target instanceof HTMLElement &&
        KEYBOARD_SHORTCUTS.INPUT_TAGS.includes(event.target.tagName)
      )
        return;
      const key          = event.key.toLowerCase();
      const normalCall   = KEYBOARD_SHORTCUTS.NORMAL_CALL.map(k => k.toLowerCase()).includes(key);
      const priorityCall = KEYBOARD_SHORTCUTS.PRIORITY_CALL.map(k => k.toLowerCase()).includes(key);
      const recallCall   = ["b",".",  "f5","escape"].includes(key);
      if (recallCall)   { event.preventDefault(); void reCall(); return; }
      if (!normalCall && !priorityCall) return;
      event.preventDefault();
      void callNext(priorityCall ? "preferencial" : "normal");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [callNext, reCall]);

  if (!isClient) return null;

  return (
    <SidebarLayout
      activeRoute="painel"
      session={session}
      sectorInfo={sectorInfo}
      eyebrow="PAINEL DE ATENDIMENTO"
      title={`Olá, ${session?.name || DEFAULT_NAME}`}
      subtitle="Controle as chamadas da sua unidade em tempo real."
      headerActions={
        <>
          {canViewAllSectors && (
            <Select
              value={activeSector}
              onValueChange={(v) => { if (v !== null) handleSectorChange(v); }}
              items={Object.fromEntries(Object.values(SECTORS).map((s) => [s.id, s.name]))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Setores</SelectLabel>

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
      <div className="mt-8 grid grid-cols-2 gap-5 max-[900px]:grid-cols-1">
        <section className={`${cardStyle} flex flex-col gap-4`}>
          <div className={cardTopStyle}>
            <div>
              <span className={labelStyle}>ÚLTIMA SENHA CHAMADA</span>
              <p className="mt-1 text-[15px] font-extrabold text-[#23445b]">{sectorInfo.name}</p>
            </div>
            <span className={liveStyle}>
              <i className="inline-block size-2 rounded-[50%] bg-[#159883] animate-live-pulse" /> AO VIVO
            </span>
          </div>
          <div className="text-[64px] font-black leading-none tracking-[2px] text-[#0b3555]">
            {current.history[0]
              ? formatQueueNumber(current.history[0].number, current.history[0].type)
              : formatQueueNumber(null, "normal")}
          </div>
          <p className={cn(
            'text-[12px] font-extrabold tracking-[1.5px] text-[#1972a0]',
            current.history[0]?.type === CALL_TYPES.PREFERENCIAL && 'text-[#ef4444]'
          )}>
            {current.history[0]?.type === CALL_TYPES.PREFERENCIAL
              ? "ATENDIMENTO PREFERENCIAL" : "ATENDIMENTO NORMAL"}
          </p>
          <Alert className="border-[#a8dbb9] bg-[#eaf7ef] text-[#1a6b3a]">
            <CheckCircle2 />
            <AlertDescription className="font-semibold text-[#1a6b3a]">{notice}</AlertDescription>
          </Alert>
        </section>

        <section className={`${cardStyle} flex flex-col gap-3`}>
          <div className={cardTopStyle}>
            <div>
              <span className={labelStyle}>PRÓXIMA CHAMADA</span>
              <h2 className="font-bold">Escolha o tipo de atendimento</h2>
            </div>
            <Badge variant="secondary">{current.history.length} hoje</Badge>
          </div>

          <Button
            className={cn(callButtonStyle, 'bg-[#1972a0] text-white hover:bg-[#1972a0]/90')}
            disabled={calling}
            onClick={() => void callNext(CALL_TYPES.NORMAL)}
          >
            <span className="flex items-center gap-1.5">
              <Bell data-icon="inline-start" className="size-6" /> {calling ? "CHAMANDO..." : "CHAMAR NORMAL"}
            </span>

            <small className={callButtonSmallStyle}>
              Próxima senha: {formatQueueNumber(nextQueueNumber(current.normalCurrent), "normal")}
            </small>
          </Button>

          <Button
            className={cn(callButtonStyle, 'bg-[#ef4444] text-white hover:bg-[#ef4444]/90')}
            disabled={calling}
            onClick={() => void callNext(CALL_TYPES.PREFERENCIAL)}
          >
            <span className="flex items-center gap-1.5">
              <Bell data-icon="inline-start" className="size-6" /> {calling ? "CHAMANDO..." : "CHAMAR PREFERENCIAL"}
            </span>

            <small className={callButtonSmallStyle}>
              Próxima senha: {formatQueueNumber(nextQueueNumber(current.priorityCurrent), "preferencial")}
            </small>
          </Button>

          <Button
            variant="outline"
            className={cn(callButtonStyle, 'h-auto px-5 py-3 font-medium')}
            disabled={calling}
            onClick={() => void reCall()}
          >
            <span className="flex items-center gap-1.5">
              <RotateCcw data-icon="inline-start" className="size-6" />
              CHAMAR NOVAMENTE
            </span>
          </Button>
        </section>
      </div>

      <section className={`${cardStyle} mt-8`}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <span className={labelStyle}>ÚLTIMAS CHAMADAS</span>
            <h2 className="font-bold">Histórico recente</h2>
          </div>

          <Link
            href="/historico"
            className={buttonVariants({ variant: "link", size: "sm" })}
          >
            Ver histórico completo →
          </Link>
        </div>
        {current.history.length === 0 ? (
          <p className="p-6 text-center text-[13px] text-[#9ab0bc]">Nenhuma chamada registrada ainda.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[0.8fr]">Senha</TableHead>
                  <TableHead className="w-[1.2fr]">Tipo</TableHead>
                  <TableHead className="w-[1fr] max-[560px]:hidden">Horário</TableHead>
                  <TableHead className="w-[1fr]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {current.history
                  .slice((historyPage - 1) * ITEMS_PER_PAGE, historyPage * ITEMS_PER_PAGE)
                  .map((item, index) => (
                    <TableRow key={`${item.number}-${item.type}-${item.time}-${(historyPage - 1) * ITEMS_PER_PAGE + index}`}>
                      <TableCell>
                        <strong className="text-[17px] font-extrabold tracking-[1px] text-[#163b52]">{formatQueueNumber(item.number, item.type)}</strong>
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
                      <TableCell className="max-[560px]:hidden">{item.time}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.25 font-bold text-[#159883]"><CheckCircle2 size={15} /> Chamada</span>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            {current.history.length > ITEMS_PER_PAGE && (
              <Pagination
                page={historyPage}
                totalPages={Math.ceil(current.history.length / ITEMS_PER_PAGE)}
                onPageChange={setHistoryPage}
              />
            )}
          </>
        )}
      </section>
    </SidebarLayout>
  );
};
