import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallType } from '@/shared/constants';
import {
  SECTORS,
  GUICHES,
  QUEUE_KEY,
  formatQueueNumber,
  nextQueueNumber,
  getInitialState,
  readQueueState,
  saveQueueState,
  invalidateQueueState,
  normalizeQueue,
  clearHistoryFromNewDay,
  cleanHistory,
  reconcileQueueFromCalls,
  subscribeQueue,
  withQueueLock,
  getQueueSnapshot,
  NO_PASSWORD,
} from '@/client/queue/queue';
import { addDays, dayKey as dayKeyBrt, startOfDay } from '@/shared/time';
import type {
  CurrentPassword,
  QueueEntry,
  QueueHistoryEntry,
  QueueState,
} from '@/client/queue/queue';

/** Entrada de histórico pronta — `type`/`time` são obrigatórios no tipo. */
const call = (
  number: number,
  type: CallType = 'normal',
  time = '14:30',
): QueueHistoryEntry => ({ number, type, time });

/**
 * `QueueEntry` é readonly: em vez de mutar, o teste monta um estado novo —
 * o mesmo que o código de produção faz ao passar para `saveQueueState`.
 */
function withEntry(
  state: QueueState,
  sector: string,
  patch: Partial<QueueEntry>,
): QueueState {
  return { ...state, [sector]: { ...state[sector], ...patch } };
}

/**
 * Um valor que o `JSON.parse` devolveu: existe em produção (storage/SSE)
 * mas não cabe no tipo. É o que os guardas de `cleanHistory` protegem.
 */
function untypedJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

describe('SECTORS / GUICHES / keys', () => {
  it('define os dois setores esperados', () => {
    expect(Object.keys(SECTORS)).toEqual(['farmacia', 'recepcao']);
    expect(SECTORS.farmacia.name).toBe('Farmácia');
    expect(SECTORS.recepcao.name).toBe('Recepção Saúde');
  });

  it('define os guichês', () => {
    expect(GUICHES.map((g) => g.id)).toEqual([
      'none',
      'guiche-1',
      'guiche-2',
      'guiche-3',
      'guiche-4',
    ]);
  });

  it('expõe as chaves de storage', () => {
    expect(QUEUE_KEY).toBe('saude-queue-state');
  });
});

describe('nextQueueNumber', () => {
  it('incrementa de forma simples', () => {
    expect(nextQueueNumber(0)).toBe(1);
    expect(nextQueueNumber(5)).toBe(6);
  });

  it('volta para 0 após 999', () => {
    expect(nextQueueNumber(998)).toBe(999);
    expect(nextQueueNumber(999)).toBe(0);
    expect(nextQueueNumber(1000)).toBe(0);
  });

  it('trata valor ausente como 0 (primeira senha = 000)', () => {
    expect(nextQueueNumber()).toBe(0);
    expect(nextQueueNumber(null)).toBe(0);
    expect(nextQueueNumber(undefined)).toBe(0);
  });
});

describe('formatQueueNumber', () => {
  it('prefixa normal com N', () => {
    expect(formatQueueNumber(1, 'normal')).toBe('N001');
    expect(formatQueueNumber(42)).toBe('N042');
  });

  it('prefixa preferencial com P (aceita os dois nomes)', () => {
    expect(formatQueueNumber(7, 'preferencial')).toBe('P007');
    expect(formatQueueNumber(7, 'preferential')).toBe('P007');
  });

  it("trata 1000 como string '1000'", () => {
    expect(formatQueueNumber(1000, 'normal')).toBe('N1000');
    expect(formatQueueNumber(1000, 'preferencial')).toBe('P1000');
  });

  it("retorna '---' para null/undefined (sem senha)", () => {
    expect(formatQueueNumber(null, 'normal')).toBe('N---');
    expect(formatQueueNumber(null, 'preferencial')).toBe('P---');
    expect(formatQueueNumber(undefined, 'normal')).toBe('N---');
    expect(formatQueueNumber(undefined, 'preferencial')).toBe('P---');
  });
});

describe('getInitialState', () => {
  it('retorna estado com null (sem senha) e historyDate de hoje', () => {
    const state = getInitialState();
    expect(state.farmacia.normalCurrent).toBeNull();
    expect(state.farmacia.priorityCurrent).toBeNull();
    expect(state.farmacia.history).toEqual([]);
    expect(state.farmacia.historyDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(state.recepcao.normalCurrent).toBeNull();
  });
});

describe('normalizeQueue', () => {
  it('preenche defaults (null = sem senha) quando faltam campos', () => {
    expect(normalizeQueue(undefined)).toEqual({
      normalCurrent: null,
      priorityCurrent: null,
      history: [],
      historyDate: expect.any(String) as string,
    });
  });

  it("suporta o campo legado 'current'", () => {
    const q = normalizeQueue({ current: 12, history: [call(1)] });
    expect(q.normalCurrent).toBe(12);
    expect(q.priorityCurrent).toBeNull();
  });
});

describe('readQueueState / saveQueueState / invalidateQueueState', () => {
  // O dia do APP (BRT) — não o dia da máquina que roda o teste.
  const todayKey = dayKeyBrt(new Date());

  it('retorna estado inicial quando storage vazio', () => {
    const state = readQueueState();
    expect(state.farmacia.normalCurrent).toBeNull();
    expect(state.farmacia.historyDate).toBe(todayKey);
  });

  it('salva e relê o estado', () => {
    const state = withEntry(getInitialState(), 'farmacia', {
      normalCurrent: 44,
    });
    saveQueueState(state);

    const read = readQueueState();
    expect(read.farmacia.normalCurrent).toBe(44);
  });

  it("dispatch de 'queue-updated' ao salvar", () => {
    const spy = vi.spyOn(window, 'dispatchEvent');
    saveQueueState(getInitialState());
    expect(spy).toHaveBeenCalled();
    const evt = spy.mock.calls[0][0];
    expect(evt.type).toBe('queue-updated');
    spy.mockRestore();
  });

  it('invalidateQueueState zera o setor indicado', () => {
    let state = getInitialState();
    state = withEntry(state, 'farmacia', {
      normalCurrent: 10,
      priorityCurrent: 7,
      history: [call(10)],
    });
    state = withEntry(state, 'recepcao', {
      normalCurrent: 22,
      history: [call(22)],
    });
    saveQueueState(state);

    invalidateQueueState('farmacia');
    const read = readQueueState();

    expect(read.farmacia.normalCurrent).toBeNull();
    expect(read.farmacia.priorityCurrent).toBeNull();
    expect(read.farmacia.history).toEqual([]);
    // Outros setores não são tocados.
    expect(read.recepcao.normalCurrent).toBe(22);
    expect(read.recepcao.history).toHaveLength(1);
  });

  it('invalidateQueueState sem setor zera todos', () => {
    let state = getInitialState();
    state = withEntry(state, 'farmacia', { normalCurrent: 10 });
    state = withEntry(state, 'recepcao', { normalCurrent: 22 });
    saveQueueState(state);

    invalidateQueueState();
    const read = readQueueState();

    expect(read.farmacia.normalCurrent).toBeNull();
    expect(read.recepcao.normalCurrent).toBeNull();
  });

  it("invalidateQueueState mantém o '---' (NO_PASSWORD) em ambos os campos", () => {
    saveQueueState(
      withEntry(getInitialState(), 'farmacia', {
        normalCurrent: 10,
        priorityCurrent: 3,
        history: [call(10)],
      }),
    );

    invalidateQueueState('farmacia');
    const q = normalizeQueue(readQueueState().farmacia);

    // `---` na UI vem de `normalCurrent === NO_PASSWORD` (o formatador do
    // monitor, `formatMonitorNumber`, devolve "---" para null). Abreviado
    // aqui: N- é o prefixo de `formatQueueNumber`, não o placeholder da tela.
    expect(q.normalCurrent).toBe(NO_PASSWORD);
    expect(q.priorityCurrent).toBe(NO_PASSWORD);
    expect(formatQueueNumber(q.normalCurrent, 'normal')).toBe('N---');
  });

  it('invalidateQueueState invalida o memo do snapshot', () => {
    const state = withEntry(getInitialState(), 'farmacia', {
      normalCurrent: 10,
    });
    saveQueueState(state);

    // Memoriza com normalCurrent = 10.
    expect(getQueueSnapshot().farmacia.normalCurrent).toBe(10);

    invalidateQueueState('farmacia');

    // Sem a limpeza do memo, isto devolveria o snapshot antigo.
    expect(getQueueSnapshot().farmacia.normalCurrent).toBeNull();
  });

  it("invalidateQueueState emite 'queue-updated' para a própria aba", () => {
    saveQueueState(getInitialState());
    const spy = vi.spyOn(window, 'dispatchEvent');

    invalidateQueueState('farmacia');

    const events = spy.mock.calls.map((c) => c[0].type);
    expect(events).toContain('queue-updated');
    spy.mockRestore();
  });

  it("invalidateQueueState escreve a chave (outras abas recebem 'storage')", () => {
    saveQueueState(getInitialState());
    invalidateQueueState('farmacia');

    // A chave precisa continuar existindo para que a leitura das outras abas
    // não caia num estado vazio.
    expect(window.localStorage.getItem(QUEUE_KEY)).not.toBeNull();
  });

  it('ignora setor desconhecido e zera todos', () => {
    let state = getInitialState();
    state = withEntry(state, 'farmacia', { normalCurrent: 10 });
    state = withEntry(state, 'recepcao', { normalCurrent: 22 });
    saveQueueState(state);

    invalidateQueueState('setor-inexistente');
    const read = readQueueState();

    expect(read.farmacia.normalCurrent).toBeNull();
    expect(read.recepcao.normalCurrent).toBeNull();
  });
});

describe('clearHistoryFromNewDay', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('limpa histórico quando a data mudou', () => {
    const oldDate = '2020-01-01';
    const state = {
      farmacia: {
        normalCurrent: 5,
        priorityCurrent: 2,
        history: [call(1)],
        historyDate: oldDate,
      },
    };
    const next = clearHistoryFromNewDay(state);
    expect(next.farmacia.history).toEqual([]);
    expect(next.farmacia.normalCurrent).toBe(5);
    expect(next.farmacia.historyDate).not.toBe(oldDate);
  });

  it('não altera estado quando a data é hoje', () => {
    const state = withEntry(getInitialState(), 'farmacia', {
      history: [call(1)],
    });
    const next = clearHistoryFromNewDay(state);
    expect(next.farmacia.history).toEqual([call(1)]);
  });
});

describe('subscribeQueue', () => {
  it('retorna função de unsubscribe', () => {
    const unsub = subscribeQueue(() => {});
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

describe('withQueueLock', () => {
  it('usa navigator.locks quando disponível', async () => {
    const request = vi
      .fn()
      .mockImplementation(async (_n: string, _o: unknown, cb: () => unknown) =>
        cb(),
      );
    navigator.locks.request = request;
    const result = await withQueueLock(async () => 'ok');
    expect(result).toBe('ok');
    expect(request).toHaveBeenCalledWith(
      'saude-queue-call',
      { mode: 'exclusive' },
      expect.any(Function),
    );
  });

  it('fallback: adquire lock e remove ao final', async () => {
    Object.defineProperty(navigator, 'locks', {
      value: undefined,
      configurable: true,
    });
    const cb = vi.fn().mockResolvedValue('done');
    const result = await withQueueLock(cb);
    expect(result).toBe('done');
    expect(window.localStorage.getItem('saude-queue-state-lock')).toBeNull();
  });

  it('fallback: espera lock expirado e não libera o de outros', async () => {
    Object.defineProperty(navigator, 'locks', {
      value: undefined,
      configurable: true,
    });
    vi.useFakeTimers();
    try {
      const lockKey = 'saude-queue-state-lock';
      window.localStorage.setItem(lockKey, `${Date.now() - 4000}:other-token`);
      let resolved = false;
      const p = withQueueLock(async () => {
        resolved = true;
        return 'won';
      });
      await p;
      expect(resolved).toBe(true);
      // lock de outro dono não foi removido indevidamente
      expect(window.localStorage.getItem(lockKey)).not.toBe('other-token');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getQueueSnapshot / getSessionSnapshot (cache)', () => {
  it('retorna mesma referência quando raw não muda', () => {
    const state = getInitialState();
    saveQueueState(state);
    const first = getQueueSnapshot();
    const second = getQueueSnapshot();
    expect(first).toBe(second);
  });

  it('invalida cache quando raw muda', () => {
    let state = withEntry(getInitialState(), 'farmacia', { normalCurrent: 1 });
    saveQueueState(state);
    const first = getQueueSnapshot();

    state = withEntry(state, 'farmacia', { normalCurrent: 2 });
    saveQueueState(state);
    const second = getQueueSnapshot();

    expect(first.farmacia.normalCurrent).toBe(1);
    expect(second.farmacia.normalCurrent).toBe(2);
    expect(first).not.toBe(second);
  });
});

/**
 * Espelha o `appDateKey` (module-private) de `queue.ts` — o dia-calendário
 * do APP (BRT), não o do device.
 */
function dayKey(offsetDays = 0) {
  return dayKeyBrt(addDays(new Date(), offsetDays));
}

/**
 * Instante ISO numa hora BRT do dia pedido — o dia gravado é o dia BRT.
 *
 * Parte da meia-noite BRT do dia (o instante que `startOfDay` devolve) e
 * soma as horas: no Brasil o offset é fixo em −03:00, então somar horas
 * reais avança o relógio-mural na mesma medida.
 */
function isoLocal(offsetDays = 0, hour = 12, minute = 0) {
  const midnight = startOfDay(addDays(new Date(), offsetDays));
  return new Date(
    midnight.getTime() + (hour * 60 + minute) * 60 * 1000,
  ).toISOString();
}

function seedSector(
  sector: string,
  {
    normalCurrent = null,
    priorityCurrent = null,
    history = [],
  }: {
    normalCurrent?: CurrentPassword;
    priorityCurrent?: CurrentPassword;
    history?: QueueHistoryEntry[];
  } = {},
): QueueState {
  const state = withEntry(getInitialState(), sector, {
    normalCurrent,
    priorityCurrent,
    history,
  });
  saveQueueState(state);
  return state;
}

describe('cleanHistory', () => {
  it('devolve [] para entrada não-array', () => {
    expect(cleanHistory(undefined)).toEqual([]);
    expect(cleanHistory(untypedJson<QueueHistoryEntry[]>('"nada"'))).toEqual(
      [],
    );
  });

  it('remove entradas sem número', () => {
    const broken = untypedJson<QueueHistoryEntry>('{"number":null}');
    expect(cleanHistory([broken, call(42)])).toEqual([call(42)]);
  });

  it('deduplica por número+tipo, mantendo a primeira ocorrência', () => {
    const history = [call(42), call(41), call(42)];
    expect(cleanHistory(history)).toEqual([call(42), call(41)]);
  });

  it('não deduplica números iguais de tipos diferentes', () => {
    const history = [call(42, 'normal'), call(42, 'preferencial')];
    expect(cleanHistory(history)).toHaveLength(2);
  });
});

describe('reconcileQueueFromCalls', () => {
  it('retrato vazio zera a senha atual e o histórico', () => {
    seedSector('farmacia', { normalCurrent: 42, history: [call(42)] });

    reconcileQueueFromCalls('farmacia', []);

    const state = readQueueState().farmacia;
    expect(state.normalCurrent).toBeNull();
    expect(state.priorityCurrent).toBeNull();
    expect(state.history).toEqual([]);
  });

  it('retrato vazio já limpo é no-op — não acorda quem está escutando', () => {
    const listener = vi.fn();
    window.addEventListener('queue-updated', listener);

    reconcileQueueFromCalls('farmacia', []);

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('queue-updated', listener);
  });

  it('adota a chamada mais nova como senha atual', () => {
    reconcileQueueFromCalls('farmacia', [call(40), call(39)]);

    const state = readQueueState().farmacia;
    expect(state.normalCurrent).toBe(40);
    expect(state.history).toHaveLength(2);
  });

  it('guarda de corrida: não regride quando o retrato já contém calls[0]', () => {
    // `callNextNumber` grava a senha atual ANTES de o servidor confirmar.
    seedSector('farmacia', { normalCurrent: 43, history: [call(42)] });

    // Retrato que partiu antes do commit: ainda não sabe da 43.
    reconcileQueueFromCalls('farmacia', [call(42), call(41)]);

    // Sem a guarda, `normalCurrent` voltaria 43 → 42.
    expect(readQueueState().farmacia.normalCurrent).toBe(43);
    // O histórico, sim, é reconciliado.
    expect(readQueueState().farmacia.history).toHaveLength(2);
  });

  it('adota quando outro dispositivo chamou mais novo', () => {
    seedSector('farmacia', { normalCurrent: 42, history: [call(42)] });

    reconcileQueueFromCalls('farmacia', [call(44), call(43), call(42)]);

    expect(readQueueState().farmacia.normalCurrent).toBe(44);
  });

  it('é idempotente — aplicar duas vezes é igual a aplicar uma', () => {
    const calls = [call(44), call(43)];

    reconcileQueueFromCalls('farmacia', calls);
    const first = readQueueState().farmacia;

    reconcileQueueFromCalls('farmacia', calls);
    const second = readQueueState().farmacia;

    expect(second).toEqual(first);
    expect(second.normalCurrent).toBe(44);
  });

  it('não toca o outro setor', () => {
    seedSector('farmacia');
    seedSector('recepcao', { normalCurrent: 77, history: [call(77)] });

    reconcileQueueFromCalls('farmacia', [call(40)]);

    expect(readQueueState().recepcao.normalCurrent).toBe(77);
    expect(readQueueState().recepcao.history).toHaveLength(1);
  });

  it('respeita historyLimit', () => {
    const calls = Array.from({ length: 10 }, (_, i) => call(50 - i));

    reconcileQueueFromCalls('farmacia', calls, { historyLimit: 3 });

    expect(readQueueState().farmacia.history).toHaveLength(3);
    expect(readQueueState().farmacia.history[0].number).toBe(50);
  });

  it("normaliza 'preferential' para 'preferencial'", () => {
    reconcileQueueFromCalls('farmacia', [
      { number: 5, type: 'preferential', time: '14:30' },
    ]);

    const state = readQueueState().farmacia;
    expect(state.priorityCurrent).toBe(5);
    expect(state.normalCurrent).toBeNull();
    expect(state.history[0].type).toBe('preferencial');
  });

  it('funde em vez de substituir — preserva entrada local ausente do servidor', () => {
    seedSector('farmacia', {
      normalCurrent: 43,
      history: [call(43), call(42)],
    });

    reconcileQueueFromCalls('farmacia', [call(42)]);

    expect(readQueueState().farmacia.history.map((h) => h.number)).toContain(
      43,
    );
  });

  it('invalida o memo do getQueueSnapshot', () => {
    seedSector('farmacia', { normalCurrent: 42, history: [call(42)] });
    expect(getQueueSnapshot().farmacia.normalCurrent).toBe(42);

    reconcileQueueFromCalls('farmacia', []);

    expect(getQueueSnapshot().farmacia.normalCurrent).toBeNull();
  });

  it('ignora setor desconhecido', () => {
    const listener = vi.fn();
    window.addEventListener('queue-updated', listener);

    reconcileQueueFromCalls('inexistente', [call(40)]);

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('queue-updated', listener);
  });

  it('aceita um retrato ausente (undefined) como vazio', () => {
    seedSector('farmacia', { normalCurrent: 42, history: [call(42)] });

    reconcileQueueFromCalls('farmacia', undefined);

    expect(readQueueState().farmacia.normalCurrent).toBeNull();
  });

  it('não ressuscita o histórico de ontem após a virada do dia', () => {
    const state = getInitialState();
    state.farmacia = {
      ...state.farmacia,
      normalCurrent: 40,
      history: [call(40)],
      historyDate: dayKey(-1),
    };
    saveQueueState(state);

    // O retrato do servidor ainda traz as chamadas de ontem: `getRecentCalls`
    // filtra por `reset_at`, não por dia.
    reconcileQueueFromCalls('farmacia', [
      { ...call(40), createdAt: isoLocal(-1, 14, 30) },
      { ...call(39), createdAt: isoLocal(-1, 14, 0) },
    ]);

    // `clearHistoryFromNewDay` limpa só o histórico e PRESERVA os contadores.
    // Ressuscitar o histórico de ontem desfaria essa decisão.
    expect(readQueueState().farmacia.history).toEqual([]);
    expect(readQueueState().farmacia.normalCurrent).toBe(40);
  });

  it('atravessando a meia-noite ligado, mantém só as chamadas de hoje', () => {
    const state = getInitialState();
    state.farmacia = {
      ...state.farmacia,
      normalCurrent: 40,
      history: [call(40)],
      historyDate: dayKey(-1),
    };
    saveQueueState(state);

    // Chegou a primeira chamada do dia por SSE — o retrato agora traz o dia
    // novo e as de ontem (`getRecentCalls` filtra por `reset_at`).
    reconcileQueueFromCalls('farmacia', [
      { ...call(41), createdAt: isoLocal(0, 12) },
      { ...call(40), createdAt: isoLocal(-1, 14, 30) },
      { ...call(39), createdAt: isoLocal(-1, 14, 0) },
    ]);

    expect(readQueueState().farmacia.history.map((h) => h.number)).toEqual([
      41,
    ]);
    expect(readQueueState().farmacia.normalCurrent).toBe(41);
    expect(readQueueState().farmacia.historyDate).toBe(dayKey(0));
  });

  it('classifica o retrato pelo dia BRT do createdAt, não pelo dia UTC', () => {
    // 00:30 do dia BRT, expresso em UTC. Quem está a leste de UTC veria a
    // data gravada no dia anterior, e comparar o prefixo do ISO
    // descartaria a chamada.
    const brtMorning = new Date(
      startOfDay(new Date()).getTime() + 30 * 60 * 1000,
    );

    reconcileQueueFromCalls('farmacia', [
      { ...call(41), createdAt: brtMorning.toISOString() },
      { ...call(40), createdAt: isoLocal(-1, 12) },
    ]);

    expect(readQueueState().farmacia.history.map((h) => h.number)).toEqual([
      41,
    ]);
  });

  it('descarta do histórico a chamada de ontem BRT', () => {
    // 23:30 de ONTEM em BRT é 02:30 UTC de hoje — o prefixo do ISO diria
    // "hoje", mas o dia BRT é o de ontem.
    const yesterdayLate = new Date(
      startOfDay(addDays(new Date(), -1)).getTime() +
        23 * 60 * 60 * 1000 +
        30 * 60 * 1000,
    );

    reconcileQueueFromCalls('farmacia', [
      { ...call(40), createdAt: yesterdayLate.toISOString() },
    ]);

    expect(readQueueState().farmacia.history).toEqual([]);
  });
});
