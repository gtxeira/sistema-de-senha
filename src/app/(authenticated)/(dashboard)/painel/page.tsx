'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import { Bell, CheckCircle2, RotateCcw } from 'lucide-react';
import {
  callNextNumber,
  formatQueueNumber,
  getQueueSnapshot,
  getServerQueueSnapshot,
  nextQueueNumber,
  normalizeQueue,
  readQueueState,
  reconcileQueueFromCalls,
  saveQueueState,
  subscribeQueue,
} from '@/client/queue/queue';
import {
  SECTORS,
  CALL_TYPES,
  TYPE_FIELDS,
  TYPE_LABELS,
  HISTORY_LIMITS,
  PAGE_SIZES,
  DEFAULT_SECTOR,
  DEFAULT_NAME,
  KEYBOARD_SHORTCUTS,
  API_ROUTES,
  isSectorId,
  getSector,
} from '@/shared/constants';
import type { CallType, SectorId, SectorScope } from '@/shared/constants';
import { SECTORS_VIEW_ALL, hasPermission } from '@/shared/permissions';
import { useEffectiveSession } from '@/hooks/use-effective-session';
import { useQueueEvents } from '@/hooks/use-queue-events';
import { formatClock } from '@/shared/time';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pagination } from '@/components/pagination';
import { SectorSelect } from '@/components/sector-select';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/client/utils';
import { useSetDashboardLayoutInfo } from '@/hooks/use-set-dashboard-layout-info';

const HISTORY_LIMIT = HISTORY_LIMITS.painel;
const ITEMS_PER_PAGE = PAGE_SIZES.painel;

/* ── Estilos (eram classes do Painel.module.css, migrado na etapa 4
     da Fase 2) ── */

/** Rótulo cinza em versalete dos cartões (`.label`). */
const labelStyle =
  'text-[10px] font-extrabold tracking-[1.25px] text-[#7990a1]';
/** Cartão branco de borda 14px (`.currentCard`, `.actionsCard`, `.recent`);
    o padding estreita no responsive de 560px. */
const cardStyle =
  'rounded-[14px] border border-[#dde9ed] bg-white p-7 max-[560px]:px-[17px] max-[560px]:py-[21px]';
/** Linha do topo dos cartões (`.cardTop`). */
const cardTopStyle = 'flex items-start justify-between';
/** Faixa "AO VIVO" (`.live`); o pulso usa o token `--animate-live-pulse`
    do globals.css, com os keyframes/tempos do módulo antigo. */
const liveStyle =
  'flex items-center gap-1.5 text-[10px] font-extrabold tracking-[1px] text-[#159883]';
/** Base comum dos botões CHAMAR NORMAL/PREFERENCIAL (`.normalButton`,
    `.priorityButton`); a elevação do hover não vale quando desabilitado
    (daí `enabled:`), e `border-current` reproduz o `border: 0` antigo.
    O rótulo e a "próxima senha" empilham até `lg`: lado a lado eles
    estouravam o botão nos cards estreitos (uma coluna) e no grid de
    duas colunas. */
const callButtonStyle =
  'flex h-auto w-full flex-col items-start justify-center gap-1 rounded-[10px] px-4! py-4 text-[16px] font-extrabold transition-[transform,box-shadow] duration-[120ms] enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] disabled:cursor-wait disabled:opacity-60 lg:flex-row lg:items-center lg:justify-between lg:gap-1.5 lg:px-5! lg:py-[18px]';
const callButtonSmallStyle = 'text-[12px] font-semibold opacity-80';

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export default function PainelPage() {
  const isClient = useIsClient();

  const session = useEffectiveSession();
  const state = useSyncExternalStore(
    subscribeQueue,
    getQueueSnapshot,
    getServerQueueSnapshot,
  );

  const [notice, setNotice] = useState('Pronto para o próximo atendimento');
  const [calling, setCalling] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  // Sem escopo de "todos os setores", a sessão trava no próprio setor
  const canViewAllSectors = hasPermission(session, SECTORS_VIEW_ALL);
  const sessionSector = session?.sector;
  const initialSector: SectorId =
    !canViewAllSectors && isSectorId(sessionSector)
      ? sessionSector
      : DEFAULT_SECTOR;

  const [activeSector, setActiveSector] = useState<SectorId>(initialSector);

  const handleSectorChange = (scope: SectorScope) => {
    // O painel opera uma fila por vez: "Todos" não faz sentido aqui.
    // O predicado é o que dá ao TS o estreitamento que `Object.hasOwn` não dá.
    if (!isSectorId(scope)) return;
    setActiveSector(scope);
    setHistoryPage(1); // Mapeia a redefinição da página no evento de troca
  };

  // `normalizeQueue` devolve um objeto novo a cada render, então reconstruir
  // com o histórico convertido é equivalente (e imutável) ao mutar `.history`.
  // A exibição sai do INSTANTE, em BRT; o `time` das entradas legadas
  // (sem `createdAt`) é usado como está.
  const baseQueue = normalizeQueue(state[activeSector]);
  const current = {
    ...baseQueue,
    history: baseQueue.history.map((h) => ({
      ...h,
      time: h.createdAt ? formatClock(h.createdAt) : (h.time ?? '—'),
    })),
  };

  const sectorInfo = getSector(activeSector) ?? SECTORS.farmacia;

  const { calls, lastCall } = useQueueEvents(activeSector);
  const lastCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeSector || calls == null) return;
    reconcileQueueFromCalls(activeSector, calls, {
      historyLimit: HISTORY_LIMIT,
    });
  }, [calls, activeSector]);

  useEffect(() => {
    if (!lastCall || !activeSector) return;
    const callKey = `${lastCall.id || lastCall.number}-${lastCall.type}`;
    if (lastCallIdRef.current === callKey) return;
    lastCallIdRef.current = callKey;

    const latestState = readQueueState();
    const latest = normalizeQueue(latestState[activeSector]);
    const callType =
      lastCall.type === CALL_TYPES.PREFERENCIAL
        ? CALL_TYPES.PREFERENCIAL
        : CALL_TYPES.NORMAL;
    const field =
      callType === CALL_TYPES.PREFERENCIAL
        ? TYPE_FIELDS.preferencial
        : TYPE_FIELDS.normal;

    if (
      latest.history.length > 0 &&
      latest.history[0].number === lastCall.number &&
      latest.history[0].type === callType
    )
      return;

    saveQueueState({
      ...latestState,
      [activeSector]: {
        ...latest,
        [field]: lastCall.number,
        history: [
          {
            number: lastCall.number,
            type: callType,
            time: formatClock(lastCall.createdAt),
            createdAt: lastCall.createdAt,
          },
          ...latest.history,
        ].slice(0, HISTORY_LIMIT),
      },
    });
  }, [lastCall, activeSector]);

  const callNext = useCallback(
    async (type: CallType) => {
      if (calling) return;
      setCalling(true);

      const result = await callNextNumber({ sector: activeSector, type });

      if (result.ok) {
        setNotice(
          type === CALL_TYPES.PREFERENCIAL
            ? 'Senha preferencial chamada'
            : 'Senha normal chamada',
        );
      } else {
        setNotice(result.error);
      }

      setCalling(false);
    },
    [calling, activeSector],
  );

  const reCall = useCallback(async () => {
    const lastItem = current.history[0];
    if (!lastItem) {
      setNotice('Nenhuma senha anterior para chamar.');
      return;
    }
    setNotice('Repetindo chamada...');
    try {
      await fetch(API_ROUTES.QUEUE_RECALL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sector: activeSector }),
      });
      setNotice(
        `Chamando novamente: ${formatQueueNumber(lastItem.number, lastItem.type)}`,
      );
    } catch {
      setNotice('Erro ao repetir chamada.');
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
      const key = event.key.toLowerCase();
      const normalCall = KEYBOARD_SHORTCUTS.NORMAL_CALL.map((k) =>
        k.toLowerCase(),
      ).includes(key);
      const priorityCall = KEYBOARD_SHORTCUTS.PRIORITY_CALL.map((k) =>
        k.toLowerCase(),
      ).includes(key);
      const recallCall = ['b', '.', 'f5', 'escape'].includes(key);
      if (recallCall) {
        event.preventDefault();
        void reCall();
        return;
      }
      if (!normalCall && !priorityCall) return;
      event.preventDefault();
      void callNext(priorityCall ? 'preferencial' : 'normal');
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [callNext, reCall]);

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
            onValueChange={handleSectorChange}
          />
        )}
      </>
    ),
  });

  if (!isClient) return null;

  return (
    <>
      <PageHeader
        eyebrow="PAINEL DE ATENDIMENTO"
        title={`Olá, ${session?.name || DEFAULT_NAME}`}
        subtitle="Controle as chamadas da sua unidade em tempo real."
      />

      <div>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <section className={`${cardStyle} flex flex-col gap-4`}>
            <div className={cardTopStyle}>
              <div>
                <span className={labelStyle}>ÚLTIMA SENHA CHAMADA</span>
                <p className="mt-1 text-[15px] font-extrabold text-[#23445b]">
                  {sectorInfo.name}
                </p>
              </div>
              <span className={liveStyle}>
                <i className="inline-block size-2 animate-live-pulse rounded-[50%] bg-[#159883]" />{' '}
                AO VIVO
              </span>
            </div>
            <div className="text-[44px] leading-none font-black tracking-[2px] text-[#0b3555] sm:text-[64px]">
              {current.history[0]
                ? formatQueueNumber(
                    current.history[0].number,
                    current.history[0].type,
                  )
                : formatQueueNumber(null, 'normal')}
            </div>
            <p
              className={cn(
                'text-[12px] font-extrabold tracking-[1.5px] text-[#1972a0]',
                current.history[0]?.type === CALL_TYPES.PREFERENCIAL &&
                  'text-[#ef4444]',
              )}
            >
              {current.history[0]?.type === CALL_TYPES.PREFERENCIAL
                ? 'ATENDIMENTO PREFERENCIAL'
                : 'ATENDIMENTO NORMAL'}
            </p>
            <Alert className="border-[#a8dbb9] bg-[#eaf7ef] text-[#1a6b3a]">
              <CheckCircle2 />
              <AlertDescription className="font-semibold text-[#1a6b3a]">
                {notice}
              </AlertDescription>
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
              className={cn(
                callButtonStyle,
                'bg-[#1972a0] text-white hover:bg-[#1972a0]/90',
              )}
              disabled={calling}
              onClick={() => void callNext(CALL_TYPES.NORMAL)}
            >
              <span className="flex items-center gap-1.5">
                <Bell data-icon="inline-start" className="size-6" />{' '}
                {calling ? 'CHAMANDO...' : 'CHAMAR NORMAL'}
              </span>

              <small className={callButtonSmallStyle}>
                Próxima senha:{' '}
                {formatQueueNumber(
                  nextQueueNumber(current.normalCurrent),
                  'normal',
                )}
              </small>
            </Button>

            <Button
              className={cn(
                callButtonStyle,
                'bg-[#ef4444] text-white hover:bg-[#ef4444]/90',
              )}
              disabled={calling}
              onClick={() => void callNext(CALL_TYPES.PREFERENCIAL)}
            >
              <span className="flex items-center gap-1.5">
                <Bell data-icon="inline-start" className="size-6" />{' '}
                {calling ? 'CHAMANDO...' : 'CHAMAR PREFERENCIAL'}
              </span>

              <small className={callButtonSmallStyle}>
                Próxima senha:{' '}
                {formatQueueNumber(
                  nextQueueNumber(current.priorityCurrent),
                  'preferencial',
                )}
              </small>
            </Button>

            <Button
              variant="outline"
              className={cn(callButtonStyle, 'h-auto font-medium lg:py-3')}
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
              className={buttonVariants({ variant: 'link', size: 'sm' })}
            >
              Ver histórico completo →
            </Link>
          </div>
          {current.history.length === 0 ? (
            <p className="p-6 text-center text-[13px] text-[#9ab0bc]">
              Nenhuma chamada registrada ainda.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[0.8fr]">Senha</TableHead>
                    <TableHead className="w-[1.2fr]">Tipo</TableHead>
                    <TableHead className="w-[1fr] max-[560px]:hidden">
                      Horário
                    </TableHead>
                    <TableHead className="w-[1fr]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {current.history
                    .slice(
                      (historyPage - 1) * ITEMS_PER_PAGE,
                      historyPage * ITEMS_PER_PAGE,
                    )
                    .map((item, index) => (
                      <TableRow
                        key={`${item.number}-${item.type}-${item.time}-${(historyPage - 1) * ITEMS_PER_PAGE + index}`}
                      >
                        <TableCell>
                          <strong className="text-[17px] font-extrabold tracking-[1px] text-[#163b52]">
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
                        <TableCell className="max-[560px]:hidden">
                          {item.time}
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.25 font-bold text-[#159883]">
                            <CheckCircle2 size={15} /> Chamada
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
              {current.history.length > ITEMS_PER_PAGE && (
                <Pagination
                  page={historyPage}
                  totalPages={Math.ceil(
                    current.history.length / ITEMS_PER_PAGE,
                  )}
                  onPageChange={setHistoryPage}
                />
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
