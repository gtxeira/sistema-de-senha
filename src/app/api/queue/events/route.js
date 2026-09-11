import { eventManager } from "@/lib/event-manager";

const KEEPALIVE_INTERVAL = 30000; // 30 seconds

/**
 * GET /api/queue/events?sector=farmacia
 * Server-Sent Events endpoint for realtime queue updates.
 * Maintains an open connection and pushes events when new queue calls are made.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get("sector");

  if (!sector || !["farmacia", "recepcao"].includes(sector)) {
    return new Response("Invalid sector. Use 'farmacia' or 'recepcao'.", {
      status: 400,
    });
  }

  let unsubscribe;
  let keepaliveTimer;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection comment to establish the stream
      controller.enqueue(":connected\n\n");

      // Keepalive comments to prevent proxy/browser timeouts
      keepaliveTimer = setInterval(() => {
        try {
          controller.enqueue(":ping\n\n");
        } catch {
          // Controller may be closed
          clearInterval(keepaliveTimer);
        }
      }, KEEPALIVE_INTERVAL);

      // Subscribe to queue events for this sector
      unsubscribe = eventManager.subscribeToQueue(sector, (call) => {
        try {
          const data = JSON.stringify({ type: "call", call });
          controller.enqueue(`data: ${data}\n\n`);
        } catch {
          // Controller may be closed
        }
      });
    },
    cancel() {
      // Cleanup when client disconnects
      clearInterval(keepaliveTimer);
      unsubscribe?.();
    },
  });

  // Handle client disconnect via abort signal
  request.signal.addEventListener("abort", () => {
    clearInterval(keepaliveTimer);
    unsubscribe?.();
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
