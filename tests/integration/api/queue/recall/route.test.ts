import type { QueueCallEvent } from '@/server/realtime/event-manager';
import type { QueueRecallBody } from '@/shared/types/api';

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
const MOCK_USERNAME = 'test.attendant.recall';

async function importCallRoute() {
  return import('@/app/api/queue/call/route');
}

async function importRecallRoute() {
  return import('@/app/api/queue/recall/route');
}

describe('/api/queue/recall — integration', () => {
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
      const { POST } = await importRecallRoute();
      const req = routeRequest('http://localhost/api/queue/recall', {});
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it('retorna 400 com setor inválido', async () => {
      const { POST } = await importRecallRoute();
      const req = routeRequest('http://localhost/api/queue/recall', {
        sector: 'invalido',
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it('retorna 404 quando não há chamadas anteriores', async () => {
      const { POST } = await importRecallRoute();
      const req = routeRequest('http://localhost/api/queue/recall', {
        sector: 'farmacia',
      });
      const res = await POST(req);

      expect(res.status).toBe(404);
    });

    it('retorna 200 com sucesso e dados da última chamada', async () => {
      const { POST: callPOST } = await importCallRoute();
      const callReq = routeRequest('http://localhost/api/queue/recall', {
        attendantId: null,
        sector: 'farmacia',
        type: 'normal',
      });
      await callPOST(callReq);

      const { POST } = await importRecallRoute();
      const req = routeRequest('http://localhost/api/queue/recall', {
        sector: 'farmacia',
      });
      const res = await POST(req);
      const body = await readJson<QueueRecallBody>(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.number).toBe(0);
      expect(body.type).toBe('normal');
    });

    it('emite evento emitQueueRecall (não emitQueueCall)', async () => {
      const { POST: callPOST } = await importCallRoute();
      const callReq = routeRequest('http://localhost/api/queue/recall', {
        attendantId: null,
        sector: 'farmacia',
        type: 'normal',
      });
      await callPOST(callReq);

      // Dois problemas com `let x = null` / `let x!`: o initializer com `null`
      // estreita a leitura para `null` (`?.number` vira `never`) e o `!` não
      // inicializa em runtime (`toBeNull()` veria `undefined`). Um objeto
      // tipado satisfaz os dois e é o que os callbacks preenchem.
      const received: {
        call: QueueCallEvent | null;
        recall: QueueCallEvent | null;
      } = { call: null, recall: null };

      const unsubCall = eventManager.subscribeToQueue('farmacia', (call) => {
        received.call = call;
      });
      const unsubRecall = eventManager.subscribeToRecall('farmacia', (call) => {
        received.recall = call;
      });

      try {
        const { POST } = await importRecallRoute();
        const req = routeRequest('http://localhost/api/queue/recall', {
          sector: 'farmacia',
        });
        await POST(req);

        expect(received.call).toBeNull();
        expect(received.recall).not.toBeNull();
        expect(received.recall?.number).toBe(0);
        expect(received.recall?.type).toBe('normal');
        expect(received.recall?.createdAt).toBeDefined();
        // O INSTANTE da chamada repetida, em ISO — não "HH:mm".
        expect(Number.isNaN(Date.parse(received.recall?.createdAt ?? ''))).toBe(
          false,
        );
      } finally {
        unsubCall();
        unsubRecall();
      }
    });

    it('retorna o número e tipo da última chamada', async () => {
      const { POST: callPOST } = await importCallRoute();

      const callReq1 = routeRequest('http://localhost/api/queue/recall', {
        attendantId: null,
        sector: 'farmacia',
        type: 'normal',
      });
      await callPOST(callReq1);

      const callReq2 = routeRequest('http://localhost/api/queue/recall', {
        attendantId: null,
        sector: 'farmacia',
        type: 'preferencial',
      });
      await callPOST(callReq2);

      const { POST } = await importRecallRoute();
      const req = routeRequest('http://localhost/api/queue/recall', {
        sector: 'farmacia',
      });
      const res = await POST(req);
      const body = await readJson<QueueRecallBody>(res);

      expect(res.status).toBe(200);
      expect(body.number).toBe(0);
      expect(body.type).toBe('preferencial');
    });
  });
});
