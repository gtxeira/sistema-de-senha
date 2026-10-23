import { describe, it, expect, afterEach } from 'vitest';
import {
  addDays,
  dayKey,
  dayKeyOrNull,
  dayWindow,
  endOfDay,
  formatClock,
  formatClockSeconds,
  formatDateTime,
  formatDay,
  formatLongDate,
  startOfDay,
} from '@/shared/time';
import { APP_TIMEZONE } from '@/shared/constants';

/**
 * O sistema inteiro trabalha em America/Sao_Paulo (UTC−03:00).
 *
 * Os instantes de referência são escolhidos para cair em cima das
 * bordas: 2026-10-22T13:00Z é 10:00 BRT de 22/10/2026, e
 * 2026-10-22T00:00Z é 21:00 BRT de 21/10/2026 — ou seja, o dia ANTERIOR.
 */
const NOW = '2026-10-22T13:00:00.000Z';

describe('dayKey — o dia é o do Brasil, não o do UTC', () => {
  it('meia-noite UTC já é o dia ANTERIOR em BRT', () => {
    expect(dayKey('2026-10-22T00:00:00.000Z')).toBe('2026-10-21');
  });

  it('a última hora do dia BRT ainda é o dia anterior', () => {
    expect(dayKey('2026-10-22T02:59:59.999Z')).toBe('2026-10-21');
  });

  it('03:00 UTC é a meia-noite BRT — o dia começa', () => {
    expect(dayKey('2026-10-22T03:00:00.000Z')).toBe('2026-10-22');
  });

  it('aceita Date, string e número', () => {
    expect(dayKey(new Date(NOW))).toBe('2026-10-22');
    expect(dayKey(NOW)).toBe('2026-10-22');
    expect(dayKey(Date.parse(NOW))).toBe('2026-10-22');
  });

  it('dayKeyOrNull devolve null em vez de lançar', () => {
    expect(dayKeyOrNull('lixo')).toBeNull();
    expect(dayKeyOrNull(null)).toBeNull();
    expect(dayKeyOrNull(undefined)).toBeNull();
    expect(dayKeyOrNull(NOW)).toBe('2026-10-22');
  });
});

describe('startOfDay / endOfDay — a meia-noite do Brasil', () => {
  it('startOfDay devolve o instante da meia-noite BRT', () => {
    expect(startOfDay(NOW).toISOString()).toBe('2026-10-22T03:00:00.000Z');
  });

  it('startOfDay de um instante antes da meia-noite BRT é o dia anterior', () => {
    expect(startOfDay('2026-10-22T00:00:00.000Z').toISOString()).toBe(
      '2026-10-21T03:00:00.000Z',
    );
  });

  it('endOfDay é a meia-noite BRT do dia seguinte', () => {
    expect(endOfDay(NOW).toISOString()).toBe('2026-10-23T03:00:00.000Z');
  });
});

describe('addDays — soma de dia-calendário, não de 24h', () => {
  it('soma preservando o relógio-mural', () => {
    expect(addDays(NOW, 1).toISOString()).toBe('2026-10-23T13:00:00.000Z');
    expect(addDays(NOW, -1).toISOString()).toBe('2026-10-21T13:00:00.000Z');
  });

  it('vira o mês', () => {
    expect(addDays('2026-10-31T13:00:00.000Z', 1).toISOString()).toBe(
      '2026-11-01T13:00:00.000Z',
    );
  });
});

describe("dayWindow — 'Hoje' é o dia de hoje", () => {
  it('days=1 cobre exatamente o dia BRT de hoje', () => {
    const window = dayWindow(1, NOW);
    expect(window.since.toISOString()).toBe('2026-10-22T03:00:00.000Z');
    expect(window.until.toISOString()).toBe('2026-10-23T03:00:00.000Z');
  });

  it('days=7 começa na meia-noite BRT de 6 dias atrás', () => {
    const window = dayWindow(7, NOW);
    expect(window.since.toISOString()).toBe('2026-10-16T03:00:00.000Z');
    expect(window.until.toISOString()).toBe('2026-10-23T03:00:00.000Z');
  });

  it("não é 'agora menos N×24h'", () => {
    // A janela de "Hoje" começa na meia-noite BRT de hoje — 20:00 de
    // ontem (BRT) já está fora, embora "agora menos 24h" a incluísse.
    const window = dayWindow(1, NOW);
    expect(window.since.getTime()).toBeGreaterThan(
      Date.parse('2026-10-21T13:00:00.000Z'),
    );
  });

  it('o `until` é exclusivo: a meia-noite do dia seguinte não entra', () => {
    const window = dayWindow(1, NOW);
    expect(window.until.getTime()).toBe(Date.parse('2026-10-23T03:00:00.000Z'));
  });
});

describe('formatação — sempre em BRT', () => {
  it('formatClock mostra a hora BRT (UTC−3)', () => {
    expect(formatClock('2026-10-22T14:30:00.000Z')).toBe('11:30');
  });

  it('formatClockSeconds mostra a hora com segundos', () => {
    expect(formatClockSeconds('2026-10-22T14:30:07.000Z')).toBe('11:30:07');
  });

  it('formatDay mostra a data BRT', () => {
    // 02:00 UTC = 23:00 de 21/10 em BRT.
    expect(formatDay('2026-10-22T02:00:00.000Z')).toBe('21/10/2026');
  });

  it('formatDateTime junta data e hora', () => {
    expect(formatDateTime('2026-10-22T14:30:00.000Z')).toBe(
      '22/10/2026, 11:30',
    );
  });

  it('formatLongDate traz o dia da semana em maiúsculas', () => {
    expect(formatLongDate('2026-10-22T14:30:00.000Z')).toBe(
      'QUINTA-FEIRA, 22 DE OUTUBRO DE 2026',
    );
  });

  it("data ilegível vira '—' em vez de derrubar a tela", () => {
    // O `localStorage` aceita qualquer string: uma tela não pode
    // quebrar por causa de um `createdAt` corrompido.
    expect(formatClock('lixo')).toBe('—');
    expect(formatDay('lixo')).toBe('—');
    expect(formatDateTime('lixo')).toBe('—');
    expect(formatLongDate('lixo')).toBe('—');
    expect(formatClockSeconds('lixo')).toBe('—');
  });
});

describe('independência do fuso da máquina', () => {
  const original = process.env.TZ;

  afterEach(() => {
    process.env.TZ = original;
  });

  it('dá o mesmo resultado com a máquina em UTC', () => {
    process.env.TZ = 'UTC';
    expect(dayKey('2026-10-22T00:00:00.000Z')).toBe('2026-10-21');
    expect(formatClock('2026-10-22T14:30:00.000Z')).toBe('11:30');
    expect(dayWindow(1, NOW).since.toISOString()).toBe(
      '2026-10-22T03:00:00.000Z',
    );
  });

  it('dá o mesmo resultado com a máquina em Tóquio', () => {
    process.env.TZ = 'Asia/Tokyo';
    expect(dayKey('2026-10-22T00:00:00.000Z')).toBe('2026-10-21');
    expect(formatClock('2026-10-22T14:30:00.000Z')).toBe('11:30');
    expect(dayWindow(1, NOW).since.toISOString()).toBe(
      '2026-10-22T03:00:00.000Z',
    );
  });

  it('o fuso do app é o único que importa', () => {
    expect(APP_TIMEZONE).toBe('America/Sao_Paulo');
  });
});
