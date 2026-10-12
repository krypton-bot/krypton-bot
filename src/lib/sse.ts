import "server-only";

/**
 * Server-sent events response. `setup` gets a `send(data, event?)` and returns a cleanup function; cleanup runs when
 * the browser disconnects. A ping every 15s keeps proxies from closing an idle stream.
 */
export function sse(req: Request, setup: (send: (data: unknown, event?: string) => void) => () => void) {
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(c) {
      const send = (data: unknown, event?: string) => {
        try {
          c.enqueue(enc.encode(`${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const stop = setup(send);
      const ping = setInterval(() => {
        try {
          c.enqueue(enc.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 15_000);
      cleanup = () => {
        stop();
        clearInterval(ping);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          c.close();
        } catch {}
      });
    },
    cancel: () => cleanup(),
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
