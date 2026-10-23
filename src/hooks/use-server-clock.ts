'use client';

import type { TimeBody } from '@/shared/types/api';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  API_ROUTES,
  CLOCK_INTERVAL,
  SERVER_TIME_SYNC_INTERVAL,
} from '@/shared/constants';
import { readJson } from '@/shared/json';
import { formatClock, formatClockSeconds, formatLongDate } from '@/shared/time';

/* ─────────────────────────────────────────────────
   useServerClock — relógio sincronizado com o servidor

   Fluxo de horário:
   1. Na montagem, busca GET /api/time para obter UTC do servidor
   2. Calcula offset = serverTime - Date.now() (diferença entre servidor e device)
   3. A cada SERVER_TIME_SYNC_INTERVAL (60s), recalcula o offset
   4. A cada CLOCK_INTERVAL (1s), exibe horário interpolado usando offset
   5. Formata em America/Sao_Paulo via `@/shared/time` (único dono do fuso)
   6. Se servidor indisponível, fallback para horário local (offset = 0)

   Isso garante que:
   - O horário exibido é sempre o horário do servidor (consistente entre dispositivos)
   - O display mostra America/Sao_Paulo independente do fuso do device
   - Não há chamadas excessivas ao servidor (apenas a cada 60s)
   - O relógio continua fluido entre sincronizações (interpolação local)
───────────────────────────────────────────────── */

export interface ServerClock {
  /** Mesma regra de `timeString`: vazia até montar. */
  readonly dateString: string;
  /** Hora interpolada (offset do servidor já aplicado). */
  readonly now: Date;
  /** false até a primeira sincronização bem-sucedida. */
  readonly synced: boolean;
  /** Mesma regra de `timeString`: vazia até montar. */
  readonly timeShort: string;
  /**
   * Horário formatado — **vazio até o componente montar**.
   *
   * O relógio do servidor e o do device podem divergir em segundos, e o
   * HTML do servidor é gerado antes da hidratação: exibir o horário no
   * primeiro render é um hydration mismatch garantido. Enquanto não
   * montou, a string fica vazia e a UI mostra o placeholder.
   */
  readonly timeString: string;
  /** Mesmo formato de `timeShort`, para quem quiser formatar outra data. */
  readonly formatTime: (date: Date) => string;
}

async function fetchServerTime(): Promise<number> {
  const res = await fetch(API_ROUTES.TIME, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch server time');
  const data = await readJson<TimeBody>(res);
  return new Date(data.serverTime).getTime();
}

function formatDate(date: Date): string {
  return formatLongDate(date);
}

/**
 * A formatação vive em `@/shared/time` — é lá que o fuso do app está
 * fixado. Este hook só cuida do OFFSET entre servidor e device.
 */
function formatTime(date: Date): string {
  return formatClockSeconds(date);
}

function formatTimeShort(date: Date): string {
  return formatClock(date);
}

/** Assinante vazio: o hook só precisa saber "já montou?". */
const emptySubscribe = () => () => {};

export function useServerClock(): ServerClock {
  const offsetRef = useRef(0);
  const syncedRef = useRef(false);
  const [now, setNow] = useState(() => new Date());
  const [synced, setSynced] = useState(false);
  const mounted = useHasMounted();

  const syncWithServer = useCallback(() => {
    void (async () => {
      try {
        const serverMs = await fetchServerTime();
        const localMs = Date.now();
        offsetRef.current = serverMs - localMs;
        syncedRef.current = true;
        setSynced(true);
      } catch {
        offsetRef.current = 0;
        syncedRef.current = false;
        setSynced(false);
      }
    })();
  }, []);

  useEffect(() => {
    // Sync inicial via microtask para evitar setState síncrono no effect
    void Promise.resolve().then(syncWithServer);

    const syncTimer = setInterval(syncWithServer, SERVER_TIME_SYNC_INTERVAL);
    const displayTimer = setInterval(() => {
      setNow(new Date(Date.now() + offsetRef.current));
    }, CLOCK_INTERVAL);

    return () => {
      clearInterval(syncTimer);
      clearInterval(displayTimer);
    };
  }, [syncWithServer]);

  return {
    now,
    synced,
    // Vazio até montar (ver `useHasMounted`): o HTML do servidor e o
    // primeiro render do client precisam ser idênticos, e o horário do
    // servidor não é determinístico.
    timeString: mounted ? formatTime(now) : '',
    dateString: mounted ? formatDate(now) : '',
    timeShort: mounted ? formatTimeShort(now) : '',
    formatTime: formatTimeShort,
  };
}

/**
 * `false` no servidor **e** na hidratação; `true` depois.
 *
 * O `useSyncExternalStore` é o que garante isso: durante a hidratação o
 * React usa o `getServerSnapshot` (o mesmo valor do servidor), e só
 * depois de hidratar ele passa a usar o `getSnapshot` — que é diferente,
 * então o React re-renderiza com o relógio real.
 */
function useHasMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
