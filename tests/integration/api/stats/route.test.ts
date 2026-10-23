import type { StatsBody } from '@/shared/types/api';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readJson } from '@/shared/json';
import { cleanupQueueTestData } from '../../postgres-setup';

async function importRoute() {
  return import('@/app/api/stats/route');
}

async function importQueueRepo() {
  const mod = await import('@/server/repositories');
  return mod.queue;
}

describe('/api/stats — integration', () => {
  beforeEach(async () => {
    await cleanupQueueTestData();
  });

  afterEach(async () => {
    await cleanupQueueTestData();
  });

  describe('GET', () => {
    it('retorna estrutura vazia quando não há dados', async () => {
      const { GET } = await importRoute();
      const req = new Request('http://localhost/api/stats');
      const res = await GET(req);
      const body = await readJson<StatsBody>(res);

      expect(res.status).toBe(200);
      expect(body.summary).toBeDefined();
      expect(body.summary.total).toBe(0);
      expect(body.calls).toEqual([]);
      expect(body.pagination).toEqual({
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 1,
      });
    });

    it('retorna estatísticas com chamadas reais', async () => {
      const repo = await importQueueRepo();
      await repo.saveCall({
        sector: 'farmacia',
        number: 1,
        numberStr: 'N001',
        sequenceType: 'normal',
        callType: 'normal',
        attendantId: null,
      });
      await repo.saveCall({
        sector: 'farmacia',
        number: 2,
        numberStr: 'N002',
        sequenceType: 'normal',
        callType: 'normal',
        attendantId: null,
      });
      await repo.saveCall({
        sector: 'recepcao',
        number: 1,
        numberStr: 'N001',
        sequenceType: 'normal',
        callType: 'normal',
        attendantId: null,
      });

      const { GET } = await importRoute();
      const req = new Request('http://localhost/api/stats');
      const res = await GET(req);
      const body = await readJson<StatsBody>(res);

      expect(body.summary.total).toBe(3);
      expect(body.summary.normal).toBe(3);
      expect(body.summary.preferencial).toBe(0);
    });

    it('pagina o histórico no servidor', async () => {
      const repo = await importQueueRepo();
      for (let number = 1; number <= 3; number++) {
        await repo.saveCall({
          sector: 'farmacia',
          number,
          numberStr: `N00${number}`,
          sequenceType: 'normal',
          callType: 'normal',
          attendantId: null,
        });
      }

      const { GET } = await importRoute();
      const res = await GET(
        new Request('http://localhost/api/stats?page=2&pageSize=2'),
      );
      const body = await readJson<StatsBody>(res);

      expect(body.pagination).toEqual({
        page: 2,
        pageSize: 2,
        total: 3,
        totalPages: 2,
      });
      // Só a página atravessa a rede — não as 3 linhas.
      expect(body.calls).toHaveLength(1);
    });

    it('clampa page e pageSize', async () => {
      const { GET } = await importRoute();
      const res = await GET(
        new Request('http://localhost/api/stats?page=0&pageSize=999'),
      );
      const body = await readJson<StatsBody>(res);

      expect(body.pagination.page).toBe(1);
      expect(body.pagination.pageSize).toBe(100);
    });

    it('filtra por setor', async () => {
      const repo = await importQueueRepo();
      await repo.saveCall({
        sector: 'farmacia',
        number: 1,
        numberStr: 'N001',
        sequenceType: 'normal',
        callType: 'normal',
        attendantId: null,
      });
      await repo.saveCall({
        sector: 'recepcao',
        number: 1,
        numberStr: 'N001',
        sequenceType: 'normal',
        callType: 'normal',
        attendantId: null,
      });

      const { GET } = await importRoute();
      const req = new Request('http://localhost/api/stats?sector=farmacia');
      const res = await GET(req);
      const body = await readJson<StatsBody>(res);

      expect(body.summary.total).toBe(1);
      expect(body.pagination.total).toBe(1);
      expect(body.calls).toHaveLength(1);
      expect(body.calls[0].sector_id).toBe('farmacia');
    });

    it('limita days entre 1 e 90', async () => {
      const { GET } = await importRoute();

      const resLow = await GET(
        new Request('http://localhost/api/stats?days=0'),
      );
      const bodyLow = await readJson<StatsBody>(resLow);
      expect(bodyLow.days).toBeGreaterThanOrEqual(1);

      const resHigh = await GET(
        new Request('http://localhost/api/stats?days=999'),
      );
      const bodyHigh = await readJson<StatsBody>(resHigh);
      expect(bodyHigh.days).toBeLessThanOrEqual(90);

      const resDefault = await GET(new Request('http://localhost/api/stats'));
      const bodyDefault = await readJson<StatsBody>(resDefault);
      expect(bodyDefault.days).toBeGreaterThanOrEqual(29);
      expect(bodyDefault.days).toBeLessThanOrEqual(31);
    });

    it('conta chamadas de hoje (today)', async () => {
      const repo = await importQueueRepo();
      await repo.saveCall({
        sector: 'farmacia',
        number: 1,
        numberStr: 'N001',
        sequenceType: 'normal',
        callType: 'normal',
        attendantId: null,
      });

      const { GET } = await importRoute();
      const req = new Request('http://localhost/api/stats');
      const res = await GET(req);
      const body = await readJson<StatsBody>(res);

      expect(body.summary.total).toBe(1);
    });

    it('retorna a página do histórico', async () => {
      const repo = await importQueueRepo();
      await repo.saveCall({
        sector: 'farmacia',
        number: 1,
        numberStr: 'N001',
        sequenceType: 'normal',
        callType: 'normal',
        attendantId: null,
      });

      const { GET } = await importRoute();
      const req = new Request('http://localhost/api/stats');
      const res = await GET(req);
      const body = await readJson<StatsBody>(res);

      expect(body.calls.length).toBeGreaterThan(0);
      expect(body.calls[0]).toHaveProperty('id');
      expect(body.calls[0]).toHaveProperty('number');
      expect(body.calls[0]).toHaveProperty('type');
      // O INSTANTE (ISO), não "HH:mm".
      expect(body.calls[0]).toHaveProperty('createdAt');
    });

    it('filtra por tipo sem alterar o resumo', async () => {
      const repo = await importQueueRepo();
      await repo.saveCall({
        sector: 'farmacia',
        number: 1,
        numberStr: 'N001',
        sequenceType: 'normal',
        callType: 'normal',
        attendantId: null,
      });
      await repo.saveCall({
        sector: 'farmacia',
        number: 1,
        numberStr: 'P001',
        sequenceType: 'preferencial',
        callType: 'preferential',
        attendantId: null,
      });

      const { GET } = await importRoute();
      const res = await GET(
        new Request('http://localhost/api/stats?type=preferencial'),
      );
      const body = await readJson<StatsBody>(res);

      // Cards: janela inteira.
      expect(body.summary.total).toBe(2);
      expect(body.summary.preferencial).toBe(1);

      // Tabela: só o tipo pedido.
      expect(body.pagination.total).toBe(1);
      expect(body.calls).toHaveLength(1);
      expect(body.calls[0].type).toBe('preferencial');
    });

    it('ignora type inválido', async () => {
      const repo = await importQueueRepo();
      await repo.saveCall({
        sector: 'farmacia',
        number: 1,
        numberStr: 'N001',
        sequenceType: 'normal',
        callType: 'normal',
        attendantId: null,
      });

      const { GET } = await importRoute();
      const res = await GET(
        new Request('http://localhost/api/stats?type=qualquer'),
      );
      const body = await readJson<StatsBody>(res);

      expect(body.pagination.total).toBe(1);
      expect(body.calls).toHaveLength(1);
    });
  });
});
