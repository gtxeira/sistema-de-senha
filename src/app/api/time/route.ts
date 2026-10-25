/* ─────────────────────────────────────────────────
   GET /api/time
   Retorna o horário atual do servidor em formato ISO 8601 (UTC).
   Usado pelo client para sincronizar relógios e exibir horários
   consistentes independentemente do fuso horário do dispositivo.

   Rota autenticada: só o dashboard e o monitor consomem o relógio, e
   ambos já exigem sessão. `requireSession` também barra token expirado/
   permissões stale — o client renova e repete a chamada pelo interceptor
   global de 401.

   Fluxo de horário:
   1. Servidor retorna UTC ISO via este endpoint
   2. Client sincroniza a cada ~60s (useServerClock hook)
   3. Display formata em America/Sao_Paulo (via `@/shared/time`)
   4. DB armazena em TIMESTAMPTZ(6) — UTC interno do PostgreSQL
───────────────────────────────────────────────── */
import { NextResponse } from 'next/server';

import { requireSession } from '@/server/http/api-auth';

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  return NextResponse.json({ serverTime: new Date().toISOString() });
}
