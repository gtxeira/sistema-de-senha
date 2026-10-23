import type { Unsubscribe } from '@/server/realtime/event-manager';

import { assertSectorAccess, requireSession } from '@/server/http/api-auth';
import { eventManager } from '@/server/realtime/event-manager';
import {
  isSectorId,
  KEEPALIVE_INTERVAL,
  MAX_SSE_CONNECTIONS_PER_SECTOR,
  SSE_EVENT_TYPES,
} from '@/shared/constants';

/**
 * GET /api/queue/events?sector=farmacia
 * Server-Sent Events endpoint for realtime queue updates.
 * Maintains an open connection and pushes events when new queue calls are made.
 *
 * EventSource is same-origin, so the session cookie travels with the request and
 * monitors keep receiving their stream while unauthenticated callers do not.
 *
 * Escopo: checado na abertura da conexão (setor próprio ou
 * `setores.todos.ver`). Stream já aberto não é revalidado — revogações
 * valem para novas conexões.
 */
export async function GET(request: Request) {
  const { error, session } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const sector = searchParams.get('sector');

  if (!isSectorId(sector)) {
    return new Response('Invalid sector.', {
      status: 400,
    });
  }

  const scope = assertSectorAccess(session, sector, 'read');
  if (scope.error) return scope.error;

  // Reject before opening a stream so an over-limit caller never holds a file
  // descriptor or a keepalive timer.
  if (
    eventManager.getSubscriberCount(sector) >= MAX_SSE_CONNECTIONS_PER_SECTOR
  ) {
    return new Response('Too many connections.', {
      headers: { 'Retry-After': '5' },
      status: 429,
    });
  }

  let unsubscribeCalls: Unsubscribe | undefined;
  let unsubscribeRecalls: Unsubscribe | undefined;
  let unsubscribeResets: Unsubscribe | undefined;
  let keepaliveTimer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    cancel() {
      // Cleanup when client disconnects
      clearInterval(keepaliveTimer);
      unsubscribeCalls?.();
      unsubscribeRecalls?.();
      unsubscribeResets?.();
    },
    start(controller) {
      // Send initial connection comment to establish the stream
      controller.enqueue(':connected\n\n');

      // Keepalive comments to prevent proxy/browser timeouts
      keepaliveTimer = setInterval(() => {
        try {
          controller.enqueue(':ping\n\n');
        } catch {
          // Controller may be closed
          clearInterval(keepaliveTimer);
        }
      }, KEEPALIVE_INTERVAL);

      // Subscribe to queue calls for this sector
      unsubscribeCalls = eventManager.subscribeToQueue(
        sector,
        (call, resetAt) => {
          try {
            const data = JSON.stringify({
              call,
              resetAt,
              type: SSE_EVENT_TYPES.CALL,
            });
            controller.enqueue(`data: ${data}\n\n`);
          } catch {
            // Controller may be closed
          }
        },
      );

      // Subscribe to queue recalls for this sector
      unsubscribeRecalls = eventManager.subscribeToRecall(
        sector,
        (call, resetAt) => {
          try {
            const data = JSON.stringify({
              call,
              resetAt,
              type: SSE_EVENT_TYPES.RECALL,
            });
            controller.enqueue(`data: ${data}\n\n`);
          } catch {
            // Controller may be closed
          }
        },
      );

      // Subscribe to queue resets for this sector
      unsubscribeResets = eventManager.subscribeToReset(sector, (resetAt) => {
        try {
          const data = JSON.stringify({
            resetAt,
            type: SSE_EVENT_TYPES.RESET,
          });
          controller.enqueue(`data: ${data}\n\n`);
        } catch {
          // Controller may be closed
        }
      });
    },
  });

  // Handle client disconnect via abort signal
  request.signal.addEventListener('abort', () => {
    clearInterval(keepaliveTimer);
    unsubscribeCalls?.();
    unsubscribeRecalls?.();
    unsubscribeResets?.();
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
