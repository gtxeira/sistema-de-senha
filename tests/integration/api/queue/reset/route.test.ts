import type { QueueResetBody } from '@/shared/types/api';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { eventManager } from '@/server/realtime/event-manager';
import { readJson } from '@/shared/json';
import { routeRequest } from '../../../../helpers/http';
import {
  cleanupQueueTestData,
  prisma,
  seedTestQueueSequence,
} from '../../../postgres-setup';

async function importRoute() {
  return import('@/app/api/queue/reset/route');
}

const RESET_URL = 'http://localhost/api/queue/reset';

describe('/api/queue/reset — integration', () => {
  beforeEach(async () => {
    await cleanupQueueTestData();
  });

  afterEach(async () => {
    await cleanupQueueTestData();
  });

  describe('POST', () => {
    it('retorna 400 sem setor', async () => {
      const { POST } = await importRoute();
      const res = await POST(routeRequest(RESET_URL, {}));

      expect(res.status).toBe(400);
    });

    it('retorna 400 com setor inválido', async () => {
      const { POST } = await importRoute();
      const res = await POST(routeRequest(RESET_URL, { sector: 'invalido' }));

      expect(res.status).toBe(400);
    });

    it('reseta setor único', async () => {
      await seedTestQueueSequence('farmacia', 'normal', 5);

      const { POST } = await importRoute();
      const res = await POST(routeRequest(RESET_URL, { sector: 'farmacia' }));
      const body = await readJson<QueueResetBody>(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.sectors).toEqual(['farmacia']);

      const seq = await prisma.queue_sequences.findUnique({
        where: {
          sector_id_call_type: { sector_id: 'farmacia', call_type: 'normal' },
        },
      });
      expect(seq?.current_number).toBe(-1);
    });

    it("reseta todos os setores com 'all'", async () => {
      await seedTestQueueSequence('farmacia', 'normal', 5);
      await seedTestQueueSequence('recepcao', 'normal', 3);

      const { POST } = await importRoute();
      const res = await POST(routeRequest(RESET_URL, { sector: 'all' }));
      const body = await readJson<QueueResetBody>(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.sectors).toEqual(['farmacia', 'recepcao']);

      const farmaciaSeq = await prisma.queue_sequences.findUnique({
        where: {
          sector_id_call_type: { sector_id: 'farmacia', call_type: 'normal' },
        },
      });
      const recepcaoSeq = await prisma.queue_sequences.findUnique({
        where: {
          sector_id_call_type: { sector_id: 'recepcao', call_type: 'normal' },
        },
      });
      expect(farmaciaSeq?.current_number).toBe(-1);
      expect(recepcaoSeq?.current_number).toBe(-1);
    });

    it('retorna success: true e lista de setores resetados', async () => {
      const { POST } = await importRoute();
      const res = await POST(routeRequest(RESET_URL, { sector: 'farmacia' }));
      const body = await readJson<QueueResetBody>(res);

      expect(body).toEqual({ success: true, sectors: ['farmacia'] });
    });

    it('grava o marcador de reset no setor', async () => {
      const { POST } = await importRoute();
      await POST(routeRequest(RESET_URL, { sector: 'farmacia' }));

      const sector = await prisma.sectors.findUnique({
        where: { id: 'farmacia' },
        select: { reset_at: true },
      });
      expect(sector?.reset_at).toBeInstanceOf(Date);
    });

    it('emite evento de reset para os assinantes do setor', async () => {
      const { POST } = await importRoute();

      // `!`: atribuído só dentro do callback.
      let received!: string | null;
      const unsubscribe = eventManager.subscribeToReset(
        'farmacia',
        (resetAt) => {
          received = resetAt;
        },
      );

      try {
        await POST(routeRequest(RESET_URL, { sector: 'farmacia' }));

        expect(received).not.toBeNull();
        expect(typeof received).toBe('string');
        // `String()` apenas para o `new Date`: as asserções acima já
        // garantiram que não é `null` — e, se forem, o teste falha antes.
        expect(new Date(String(received)).toString()).not.toBe('Invalid Date');
      } finally {
        unsubscribe();
      }
    });

    it("'all' emite reset em cada setor", async () => {
      const { POST } = await importRoute();

      const seen: Array<[string, string | null]> = [];
      const unsubF = eventManager.subscribeToReset('farmacia', (at) =>
        seen.push(['farmacia', at]),
      );
      const unsubR = eventManager.subscribeToReset('recepcao', (at) =>
        seen.push(['recepcao', at]),
      );

      try {
        await POST(routeRequest(RESET_URL, { sector: 'all' }));

        expect(seen.map(([s]) => s).sort()).toEqual(['farmacia', 'recepcao']);
      } finally {
        unsubF();
        unsubR();
      }
    });

    it('não emite quando a requisição é rejeitada', async () => {
      const { POST } = await importRoute();

      let called = false;
      const unsubscribe = eventManager.subscribeToReset('farmacia', () => {
        called = true;
      });

      try {
        await POST(routeRequest(RESET_URL, { sector: 'invalido' }));
        expect(called).toBe(false);
      } finally {
        unsubscribe();
      }
    });
  });
});
