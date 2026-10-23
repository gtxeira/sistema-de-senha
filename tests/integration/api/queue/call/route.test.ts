import type { QueueCallEvent } from '@/server/realtime/event-manager';
import type { QueueCallBody } from '@/shared/types/api';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { eventManager } from '@/server/realtime/event-manager';
import { readJson } from '@/shared/json';
import { routeRequest } from '../../../../helpers/http';
import {
  cleanupQueueTestData,
  cleanupTestUsers,
  seedTestUser,
} from '../../../postgres-setup';

const MOCK_USER_ID = 'c0f4795e-f467-4695-b479-5ef467c695a6';
const MOCK_USERNAME = 'test.attendant.call';

async function importQueueRepo() {
  const mod = await import('@/server/repositories');
  return mod.queue;
}

async function importRoute() {
  return import('@/app/api/queue/call/route');
}

describe('/api/queue/call — integration', () => {
  beforeEach(async () => {
    await cleanupQueueTestData();
    await seedTestUser({ id: MOCK_USER_ID, username: MOCK_USERNAME });
  });

  afterEach(async () => {
    await cleanupQueueTestData();
    await cleanupTestUsers([MOCK_USERNAME]);
  });

  describe('POST', () => {
    it('retorna 400 sem setor', async () => {
      const { POST } = await importRoute();
      const req = routeRequest('http://localhost/api/queue/call', {
        type: 'normal',
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it('retorna 400 com setor inválido', async () => {
      const { POST } = await importRoute();
      const req = routeRequest('http://localhost/api/queue/call', {
        sector: 'invalido',
        type: 'normal',
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it('chama com sucesso (farmacia, normal) e persiste no banco', async () => {
      const { POST } = await importRoute();
      const req = routeRequest('http://localhost/api/queue/call', {
        attendantId: null,
        sector: 'farmacia',
        type: 'normal',
      });
      const res = await POST(req);
      const body = await readJson<QueueCallBody>(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.number).toBe(0);
      expect(body.numberStr).toBe('N000');
      expect(body.type).toBe('normal');

      const repo = await importQueueRepo();
      const calls = await repo.getRecentCalls('farmacia');
      expect(calls.length).toBe(1);
      expect(calls[0].number).toBe(0);
      expect(calls[0].type).toBe('normal');
    });

    it('chama com sucesso (recepcao, preferencial) e persiste', async () => {
      const { POST } = await importRoute();
      const req = routeRequest('http://localhost/api/queue/call', {
        attendantId: null,
        sector: 'recepcao',
        type: 'preferencial',
      });
      const res = await POST(req);
      const body = await readJson<QueueCallBody>(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.number).toBe(0);
      expect(body.type).toBe('preferencial');

      const repo = await importQueueRepo();
      const calls = await repo.getRecentCalls('recepcao');
      expect(calls.length).toBe(1);
      expect(calls[0].type).toBe('preferencial');
    });

    it('retorna próximo número sequencial', async () => {
      const { POST } = await importRoute();

      for (let i = 0; i < 3; i++) {
        const req = routeRequest('http://localhost/api/queue/call', {
          attendantId: null,
          sector: 'farmacia',
          type: 'normal',
        });
        const res = await POST(req);
        const body = await readJson<QueueCallBody>(res);
        expect(body.number).toBe(i);
      }
    });

    it('inclui attendantId quando fornecido', async () => {
      const attendantId = '12345678-1234-1234-1234-123456789abc';
      const { POST } = await importRoute();
      const req = routeRequest('http://localhost/api/queue/call', {
        attendantId,
        sector: 'farmacia',
        type: 'normal',
      });
      const res = await POST(req);
      const body = await readJson<QueueCallBody>(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('emite evento realtime', async () => {
      // `!`: atribuído só dentro do callback — sem o initializer o TS estreita
      // a variável para `null` e `receivedEvent?.number` vira `never`.
      let receivedEvent!: QueueCallEvent | null;
      const unsubscribe = eventManager.subscribeToQueue('farmacia', (call) => {
        receivedEvent = call;
      });

      try {
        const { POST } = await importRoute();
        const req = routeRequest('http://localhost/api/queue/call', {
          attendantId: null,
          sector: 'farmacia',
          type: 'normal',
        });
        await POST(req);

        expect(receivedEvent).not.toBeNull();
        expect(receivedEvent?.number).toBe(0);
        expect(receivedEvent?.type).toBe('normal');
        expect(receivedEvent?.createdAt).toBeDefined();
        // O evento carrega o INSTANTE (ISO), não "HH:mm" — quem formata
        // em BRT é o cliente.
        expect(Number.isNaN(Date.parse(receivedEvent?.createdAt ?? ''))).toBe(
          false,
        );
      } finally {
        unsubscribe();
      }
    });

    it('o evento carrega o marcador de reset do setor', async () => {
      let receivedResetAt!: null | string;
      const unsubscribe = eventManager.subscribeToQueue(
        'farmacia',
        (_call, resetAt) => {
          receivedResetAt = resetAt;
        },
      );

      try {
        // Setor nunca resetado → marcador nulo.
        const { POST } = await importRoute();
        await POST(
          routeRequest('http://localhost/api/queue/call', {
            attendantId: null,
            sector: 'farmacia',
            type: 'normal',
          }),
        );
        expect(receivedResetAt).toBeNull();

        // Após um reset, o evento deve carregar o novo marcador para que o
        // cliente consiga invalidar a réplica local.
        const repo = await importQueueRepo();
        await repo.resetSector('farmacia');

        await POST(
          routeRequest('http://localhost/api/queue/call', {
            attendantId: null,
            sector: 'farmacia',
            type: 'normal',
          }),
        );

        expect(typeof receivedResetAt).toBe('string');
        expect(new Date(String(receivedResetAt)).toString()).not.toBe(
          'Invalid Date',
        );
      } finally {
        unsubscribe();
      }
    });
  });

  describe('fluxo completo', () => {
    it('chamar 3 vezes → verificar sequência 0, 1, 2', async () => {
      const { POST } = await importRoute();

      const results = [];
      for (let i = 0; i < 3; i++) {
        const req = routeRequest('http://localhost/api/queue/call', {
          attendantId: null,
          sector: 'farmacia',
          type: 'normal',
        });
        const res = await POST(req);
        const body = await readJson<QueueCallBody>(res);
        results.push(body);
      }

      expect(results[0].number).toBe(0);
      expect(results[1].number).toBe(1);
      expect(results[2].number).toBe(2);

      const repo = await importQueueRepo();
      const calls = await repo.getRecentCalls('farmacia');
      expect(calls).toHaveLength(3);
      expect(calls.map((c) => c.number)).toEqual([2, 1, 0]);
    });
  });
});
