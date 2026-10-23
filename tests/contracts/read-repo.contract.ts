import type { ReadRepository } from '@/server/repositories/types';

import { beforeEach, describe, expect, it } from 'vitest';

/** Fábrica devolvida por quem invoca o contrato. */
export interface ReadRepoContext {
  readonly repo: ReadRepository;
  /** Retorna o que foi inserido — o contrato ignora o valor. */
  readonly seedCalls: (calls: readonly SeedCall[]) => unknown;
}

/**
 * Linha de entrada para o seed de chamadas — mais solta que o registro gravado:
 * `created_at` é opcional (o seed preenche com "agora") e `type` é `string`
 * porque o contrato valida agregação por valor, não por tipo literal.
 */
export interface SeedCall {
  readonly number: number;
  readonly sector: string;
  readonly type: string;
  readonly created_at?: Date | string;
}

/**
 * ReadRepository contract — shared test suite.
 * Pass a factory that returns { repo, seedCalls }.
 * seedCalls is an async function that inserts test data and returns the inserted records.
 */
export function readRepoContract(
  createRepo: () => Promise<ReadRepoContext> | ReadRepoContext,
): void {
  describe('ReadRepository contract', () => {
    let repo: ReadRepository;
    let seedCalls: ReadRepoContext['seedCalls'];

    beforeEach(async () => {
      const ctx = await createRepo();
      repo = ctx.repo;
      seedCalls = ctx.seedCalls;
    });

    describe('getStats()', () => {
      it('retorna estrutura válida com campos obrigatórios', async () => {
        const stats = await repo.getStats();
        expect(stats).toHaveProperty('days');
        expect(stats).toHaveProperty('summary');
        expect(stats).toHaveProperty('calls');
        expect(stats.pagination).toEqual({
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 1,
        });
      });

      it('summary.total é soma de preferencial + normal', async () => {
        await seedCalls([
          { sector: 'farmacia', type: 'normal', number: 1 },
          { sector: 'farmacia', type: 'preferencial', number: 1 },
          { sector: 'recepcao', type: 'normal', number: 1 },
        ]);
        const stats = await repo.getStats();
        expect(stats.summary.total).toBe(
          stats.summary.preferencial + stats.summary.normal,
        );
      });

      it('filtra por sector quando informado', async () => {
        await seedCalls([
          { sector: 'farmacia', type: 'normal', number: 1 },
          { sector: 'recepcao', type: 'normal', number: 1 },
          { sector: 'recepcao', type: 'normal', number: 2 },
        ]);
        const stats = await repo.getStats({ sector: 'farmacia' });
        expect(stats.summary.total).toBe(1);
      });

      it('pagina no servidor: pageSize limita e total conta a janela', async () => {
        // `created_at` distintos: em empate a ordem depende do `id` (uuid no
        // Postgres, string sequencial no in-memory) — o contrato não afirma
        // ordem nesse caso.
        const calls = Array.from({ length: 5 }, (_, i) => ({
          sector: 'farmacia',
          type: 'normal',
          number: i + 1,
          created_at: `2026-10-22T1${i}:00:00.000Z`,
        }));
        await seedCalls(calls);

        const stats = await repo.getStats({
          days: 30,
          pageSize: 2,
          now: new Date('2026-10-22T23:00:00.000Z'),
        });

        expect(stats.calls).toHaveLength(2);
        expect(stats.pagination).toEqual({
          page: 1,
          pageSize: 2,
          total: 5,
          totalPages: 3,
        });
        // Mais recente primeiro.
        expect(stats.calls.map((c) => c.number)).toEqual([5, 4]);

        const page2 = await repo.getStats({
          days: 30,
          pageSize: 2,
          page: 2,
          now: new Date('2026-10-22T23:00:00.000Z'),
        });
        expect(page2.pagination.page).toBe(2);
        expect(page2.calls.map((c) => c.number)).toEqual([3, 2]);
      });

      it('página além do fim é clampada na última', async () => {
        await seedCalls(
          Array.from({ length: 3 }, (_, i) => ({
            sector: 'farmacia',
            type: 'normal',
            number: i + 1,
            created_at: `2026-10-22T1${i}:00:00.000Z`,
          })),
        );

        const stats = await repo.getStats({
          days: 30,
          pageSize: 2,
          page: 99,
          now: new Date('2026-10-22T23:00:00.000Z'),
        });

        expect(stats.pagination.page).toBe(2);
        expect(stats.pagination.totalPages).toBe(2);
        expect(stats.calls).toHaveLength(1);
      });

      it('normaliza pageSize (default 20, teto 100)', async () => {
        const fallback = await repo.getStats();
        expect(fallback.pagination.pageSize).toBe(20);

        const capped = await repo.getStats({ pageSize: 9_999 });
        expect(capped.pagination.pageSize).toBe(100);
      });

      it('filtro de tipo afeta a tabela, mas não o resumo', async () => {
        await seedCalls([
          {
            sector: 'farmacia',
            type: 'normal',
            number: 1,
            created_at: '2026-10-22T13:00:00.000Z',
          },
          {
            sector: 'farmacia',
            type: 'preferencial',
            number: 1,
            created_at: '2026-10-22T14:00:00.000Z',
          },
          {
            sector: 'farmacia',
            type: 'preferencial',
            number: 2,
            created_at: '2026-10-22T15:00:00.000Z',
          },
        ]);

        const stats = await repo.getStats({
          days: 30,
          type: 'preferencial',
          now: new Date('2026-10-22T23:00:00.000Z'),
        });

        // Cards: janela inteira, sem o filtro.
        expect(stats.summary.total).toBe(3);
        expect(stats.summary.preferencial).toBe(2);
        expect(stats.summary.normal).toBe(1);

        // Tabela: só o tipo pedido.
        expect(stats.pagination.total).toBe(2);
        expect(stats.calls.every((c) => c.type === 'preferencial')).toBe(true);
        expect(stats.calls.map((c) => c.number)).toEqual([2, 1]);
      });

      it('calls têm formato correto', async () => {
        await seedCalls([{ sector: 'farmacia', type: 'normal', number: 1 }]);
        const stats = await repo.getStats();
        if (stats.calls.length > 0) {
          const call = stats.calls[0];
          expect(call).toHaveProperty('id');
          expect(call).toHaveProperty('number');
          expect(call).toHaveProperty('type');
          // O INSTANTE (ISO), não "HH:mm": um horário sem data não diz de
          // que dia a chamada foi.
          expect(call).toHaveProperty('createdAt');
          expect(typeof call.number).toBe('number');
          expect(Number.isNaN(Date.parse(call.createdAt))).toBe(false);
        }
      });

      it('summary.today conta o dia BRT, não o dia UTC', async () => {
        // 02:30 UTC = 23:30 do dia ANTERIOR em BRT (UTC−03:00).
        const yesterdayBrt = '2026-10-21T02:30:00.000Z';
        // 13:00 UTC = 10:00 de HOJE em BRT.
        const todayBrt = '2026-10-22T13:00:00.000Z';

        await seedCalls([
          {
            sector: 'farmacia',
            type: 'normal',
            number: 1,
            created_at: yesterdayBrt,
          },
          {
            sector: 'farmacia',
            type: 'normal',
            number: 2,
            created_at: todayBrt,
          },
        ]);

        const stats = await repo.getStats({
          days: 30,
          now: new Date('2026-10-22T16:00:00.000Z'),
        });

        // Só a chamada das 13:00 UTC pertence a "hoje" (BRT).
        expect(stats.summary.today).toBe(1);
        expect(stats.summary.total).toBe(2);
      });

      it("a janela de 'Hoje' é o dia-calendário BRT", async () => {
        // 02:30 UTC = 23:30 de ONTEM em BRT → fora da janela de "Hoje".
        const yesterdayBrt = '2026-10-21T02:30:00.000Z';
        const todayBrt = '2026-10-22T13:00:00.000Z';

        await seedCalls([
          {
            sector: 'farmacia',
            type: 'normal',
            number: 1,
            created_at: yesterdayBrt,
          },
          {
            sector: 'farmacia',
            type: 'normal',
            number: 2,
            created_at: todayBrt,
          },
        ]);

        const stats = await repo.getStats({
          days: 1,
          now: new Date('2026-10-22T16:00:00.000Z'),
        });

        expect(stats.summary.total).toBe(1);
        expect(stats.calls).toHaveLength(1);
        expect(stats.calls[0].number).toBe(2);
      });

      it('`since` é inclusivo e `until` é exclusivo', async () => {
        const t0 = '2026-10-22T13:00:00.000Z';
        const t1 = '2026-10-22T14:00:00.000Z';

        await seedCalls([
          { sector: 'farmacia', type: 'normal', number: 1, created_at: t0 },
          { sector: 'farmacia', type: 'normal', number: 2, created_at: t1 },
        ]);

        const stats = await repo.getStats({
          since: new Date(t0),
          // Exclusivo: a chamada DAS 14:00 não entra — é o limite da
          // meia-noite BRT do dia seguinte, que não pertence ao dia.
          until: new Date(t1),
          now: new Date('2026-10-22T16:00:00.000Z'),
        });

        expect(stats.summary.total).toBe(1);
        expect(stats.calls).toHaveLength(1);
        expect(stats.calls[0].number).toBe(1);
      });

      it("`until: null` significa 'sem limite superior'", async () => {
        const t0 = '2026-10-22T13:00:00.000Z';
        const t1 = '2026-10-22T14:00:00.000Z';

        await seedCalls([
          { sector: 'farmacia', type: 'normal', number: 1, created_at: t0 },
          { sector: 'farmacia', type: 'normal', number: 2, created_at: t1 },
        ]);

        const stats = await repo.getStats({
          since: new Date(t0),
          until: null,
          now: new Date('2026-10-22T16:00:00.000Z'),
        });

        expect(stats.summary.total).toBe(2);
      });
    });
  });
}
