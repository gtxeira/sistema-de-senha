import type { ApiErrorBody, TimeBody } from '@/shared/types/api';

import { describe, expect, it } from 'vitest';

import { readJson } from '@/shared/json';
import { authMock } from '../../../helpers/auth-mock';

async function importRoute() {
  return import('@/app/api/time/route');
}

describe('/api/time — integration', () => {
  describe('GET', () => {
    it('retorna 200 com serverTime em formato ISO 8601', async () => {
      const { GET } = await importRoute();
      const res = await GET();
      const body = await readJson<TimeBody>(res);

      expect(res.status).toBe(200);
      expect(body.serverTime).toBeDefined();
      expect(typeof body.serverTime).toBe('string');
    });

    it('serverTime é uma data ISO válida', async () => {
      const { GET } = await importRoute();
      const before = Date.now();
      const res = await GET();
      const after = Date.now();
      const body = await readJson<TimeBody>(res);

      const serverTime = new Date(body.serverTime);
      expect(serverTime.getTime()).not.toBeNaN();
      expect(serverTime.getTime()).toBeGreaterThanOrEqual(before);
      expect(serverTime.getTime()).toBeLessThanOrEqual(after);
    });

    it('serverTime está dentro de alguns segundos do horário local', async () => {
      const { GET } = await importRoute();
      const localBefore = Date.now();
      const res = await GET();
      const localAfter = Date.now();
      const body = await readJson<TimeBody>(res);

      const serverMs = new Date(body.serverTime).getTime();
      const avgLocal = (localBefore + localAfter) / 2;

      // Diferença deve ser menor que 5 segundos (考虑网络延迟)
      expect(Math.abs(serverMs - avgLocal)).toBeLessThan(5000);
    });

    it("formato é ISO 8601 (contém 'T' e 'Z' ou offset)", async () => {
      const { GET } = await importRoute();
      const res = await GET();
      const body = await readJson<TimeBody>(res);

      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ ou com offset
      expect(body.serverTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('exige sessão autenticada', async () => {
      authMock.mockResolvedValueOnce(null);

      const { GET } = await importRoute();
      const res = await GET();
      const body = await readJson<ApiErrorBody>(res);

      expect(res.status).toBe(401);
      expect(body.code).toBe('unauthenticated');
    });

    it('recusa sessão com permissões stale (401 refresh_required)', async () => {
      const now = Date.now();
      authMock.mockResolvedValueOnce({
        expires: new Date(now + 15 * 60 * 1000).toISOString(),
        user: {
          id: 'u1',
          name: 'Teste',
          authAt: now,
          email: 'teste@local',
          guiche: 'none',
          permissions: [],
          permsAt: now - 16 * 60 * 1000,
          sector: null,
        },
      });

      const { GET } = await importRoute();
      const res = await GET();
      const body = await readJson<ApiErrorBody>(res);

      expect(res.status).toBe(401);
      expect(body.code).toBe('refresh_required');
    });
  });
});
