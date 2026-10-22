import { APP_TIMEZONE, LOCALE } from "./constants";

/* ─────────────────────────────────────────────────────────────
   time.ts — dono único do tempo do sistema.

   A regra do sistema é uma só:

     • o banco guarda INSTANTES em UTC (TIMESTAMPTZ);
     • o wire (API + SSE) carrega INSTANTES em ISO-8601;
     • a EXIBIÇÃO e a CONTAGEM por dia acontecem em America/Sao_Paulo,
       e só aqui.

   Este módulo é o único lugar do `src/` onde `Intl.DateTimeFormat`
   pode aparecer — a guarda em `tests/unit/lib/time-guard.test.ts`
   falha a build se alguém criar um formatador fora daqui. O motivo
   é concreto: um formatador sem `timeZone` usa o fuso do PROCESSO, e
   o processo roda em UTC no Docker e em São Paulo no dev — o mesmo
   código exibia horários diferentes em dev e em prod.

   Nada aqui depende do fuso ambiente: todas as conversões passam
   pelo `timeZone` explícito.
   ───────────────────────────────────────────────────────────── */

/** O que o módulo aceita como "instante". */
export type DateInput = Date | string | number;

/** Relógio-mural de um instante, já no fuso pedido. */
interface ZonedParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/** Janela de dias-calendário, em instantes UTC. */
export interface DayWindow {
  /** Inclusivo — primeira chamada dentro da janela. */
  readonly since: Date;
  /** Exclusivo — o instante da meia-noite BRT do dia seguinte. */
  readonly until: Date;
}

/* ─── Internos ───────────────────────────────────────────────── */

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Converte para `Date` validando.
 *
 * @throws RangeError quando o valor não é uma data válida — quem chama
 * decide se quer tratar o caso (ver `dayKeyOrNull`).
 */
function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Data inválida: ${String(value)}`);
  }
  return date;
}

/**
 * Formatadores em cache.
 *
 * `Intl.DateTimeFormat` é caro de construir e o módulo é chamado em
 * laços (cada linha de uma tabela). O cache é por fuso — o sistema
 * usa um só, mas a assinatura aceita outros para teste.
 */
const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const clockFormatters = new Map<string, Intl.DateTimeFormat>();
const clockSecondsFormatters = new Map<string, Intl.DateTimeFormat>();
const dayFormatters = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const longDateFormatters = new Map<string, Intl.DateTimeFormat>();

function cached(
  store: Map<string, Intl.DateTimeFormat>,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let formatter = store.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE, { ...options, timeZone });
    store.set(key, formatter);
  }
  return formatter;
}

/**
 * Relógio-mural de um instante no fuso pedido.
 *
 * `en-US` + `formatToParts` é o jeito mais portável de obter as peças
 * do calendário sem depender do `hour12`/`hourCycle` do locale (pt-BR
 * tem ciclo de 12h; `en-US` com `h23` dá sempre 00–23).
 */
function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = cached(partsFormatters, timeZone, {
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const part of formatter.formatToParts(date)) {
    switch (part.type) {
      case "year":
        year = Number(part.value);
        break;
      case "month":
        month = Number(part.value);
        break;
      case "day":
        day = Number(part.value);
        break;
      case "hour":
        hour = Number(part.value);
        break;
      case "minute":
        minute = Number(part.value);
        break;
      case "second":
        second = Number(part.value);
        break;
      default:
        break;
    }
  }

  return { year, month, day, hour, minute, second };
}

/**
 * Offset do fuso (em ms) no instante dado.
 *
 * Positivo a leste de UTC, negativo a oeste. É a diferença entre o
 * relógio-mural do fuso e o UTC — calculada SEM `getTimezoneOffset()`,
 * que é o fuso do PROCESSO e não o do fuso pedido.
 */
function tzOffsetMs(date: Date, timeZone: string): number {
  const wall = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  // Trunca os milissegundos: o relógio-mural não os tem.
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Converte um relógio-mural do fuso no instante UTC correspondente.
 *
 * O caminho direto seria `wall - offset`, mas o offset depende do
 * próprio instante (é o que muda na virada de DST). A iteração
 * resolve: começa pelo offset no palpite e refaz o cálculo com o
 * offset do instante obtido, até estabilizar.
 */
function wallToInstant(
  wall: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string,
): Date {
  // `Date.UTC` normaliza dia/month overflow (dia 32 vira dia 1 do mês
  // seguinte) — é o que faz `addDays` funcionar sem aritmética de calendário.
  const guess = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );

  let timestamp = guess;
  for (let i = 0; i < 3; i++) {
    const next = guess - tzOffsetMs(new Date(timestamp), timeZone);
    if (next === timestamp) break;
    timestamp = next;
  }

  return new Date(timestamp);
}

/* ─── Calendário ─────────────────────────────────────────────── */

/**
 * Dia-calendário do instante, no fuso do app.
 *
 * @returns `"YYYY-MM-DD"`.
 *
 * É a chave que decide a que dia uma chamada pertence. Para o Brasil
 * (UTC−03:00), uma chamada às 00:00 UTC já é do dia ANTERIOR — e é
 * exatamente aí que o "hoje" do histórico virava no horário errado.
 */
export function dayKey(value: DateInput, timeZone: string = APP_TIMEZONE): string {
  const wall = zonedParts(toDate(value), timeZone);
  return `${wall.year}-${pad2(wall.month)}-${pad2(wall.day)}`;
}

/** Como `dayKey`, mas devolve `null` em vez de lançar para data inválida. */
export function dayKeyOrNull(
  value: DateInput | null | undefined,
  timeZone: string = APP_TIMEZONE,
): string | null {
  if (value === null || value === undefined) return null;
  try {
    return dayKey(value, timeZone);
  } catch {
    return null;
  }
}

/**
 * Instante UTC da meia-noite do dia do valor, no fuso do app.
 *
 * É o que "começa o dia" significa para o sistema: o filtro "Hoje" e
 * o contador "Atendimentos hoje" cortam por aqui.
 */
export function startOfDay(
  value: DateInput,
  timeZone: string = APP_TIMEZONE,
): Date {
  const wall = zonedParts(toDate(value), timeZone);
  return wallToInstant(
    { ...wall, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
}

/**
 * Instante UTC da meia-noite do dia SEGUINTE — limite exclusivo do dia.
 */
export function endOfDay(
  value: DateInput,
  timeZone: string = APP_TIMEZONE,
): Date {
  return startOfDay(addDays(value, 1, timeZone), timeZone);
}

/**
 * Soma de dias-calendário no fuso do app.
 *
 * Preserva o relógio-mural: somar 1 dia em São Paulo às 23:30 dá
 * 23:30 do dia seguinte, e não 24 horas depois (que cairia no dia
 * extra em DST).
 */
export function addDays(
  value: DateInput,
  days: number,
  timeZone: string = APP_TIMEZONE,
): Date {
  const wall = zonedParts(toDate(value), timeZone);
  return wallToInstant({ ...wall, day: wall.day + days }, timeZone);
}

/**
 * Janela dos últimos `days` dias-calendário, em BRT.
 *
 * `days: 1` → o dia de hoje (da meia-noite BRT de hoje até a meia-noite
 * BRT de amanhã). `days: 7` → dos últimos 7 dias-calendário, contando
 * hoje. Não é "agora menos N×24h": a diferença aparece em tudo que
 * importa aqui (virada do dia, horário de verão, fim de semana).
 */
export function dayWindow(
  days: number,
  now: DateInput = new Date(),
  timeZone: string = APP_TIMEZONE,
): DayWindow {
  const count = Math.max(1, Math.floor(days));
  const firstDay = addDays(now, -(count - 1), timeZone);
  return {
    since: startOfDay(firstDay, timeZone),
    until: endOfDay(now, timeZone),
  };
}

/* ─── Exibição ───────────────────────────────────────────────── */

/**
 * Placeholder para data ilegível.
 *
 * A exibição nunca derruba a página: um `createdAt` corrompido (o
 * `localStorage` aceita qualquer string) mostra "—" em vez de estourar
 * o render.
 */
const INVALID_DATE = "—";

/**
 * Formata, tolerando data inválida.
 *
 * As funções de CÁLCULO (`dayKey`, `startOfDay`, `dayWindow`) são
 * estritas de propósito — uma data inválida ali é erro de
 * programação. Já as de EXIBIÇÃO alimentam a UI e não podem jogar.
 */
function safeFormat(
  formatter: Intl.DateTimeFormat,
  value: DateInput,
  fallback: string = INVALID_DATE,
): string {
  try {
    return formatter.format(toDate(value));
  } catch {
    return fallback;
  }
}

/** `"HH:mm"` no fuso do app. */
export function formatClock(
  value: DateInput,
  timeZone: string = APP_TIMEZONE,
): string {
  return safeFormat(
    cached(clockFormatters, timeZone, {
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
    }),
    value,
  );
}

/** `"HH:mm:ss"` no fuso do app — o relógio do cabeçalho. */
export function formatClockSeconds(
  value: DateInput,
  timeZone: string = APP_TIMEZONE,
): string {
  return safeFormat(
    cached(clockSecondsFormatters, timeZone, {
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    value,
  );
}

/** `"dd/MM/yyyy"` no fuso do app. */
export function formatDay(
  value: DateInput,
  timeZone: string = APP_TIMEZONE,
): string {
  return safeFormat(
    cached(dayFormatters, timeZone, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    value,
  );
}

/** `"dd/MM/yyyy, HH:mm"` no fuso do app. */
export function formatDateTime(
  value: DateInput,
  timeZone: string = APP_TIMEZONE,
): string {
  return safeFormat(
    cached(dateTimeFormatters, timeZone, {
      hourCycle: "h23",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    value,
  );
}

/** `"QUINTA-FEIRA, 22 DE OUTUBRO DE 2026"` no fuso do app. */
export function formatLongDate(
  value: DateInput,
  timeZone: string = APP_TIMEZONE,
): string {
  return safeFormat(
    cached(longDateFormatters, timeZone, {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    value,
  ).toUpperCase();
}
