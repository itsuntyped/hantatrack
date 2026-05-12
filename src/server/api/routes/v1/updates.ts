import { Router, type Request, type Response } from "express";
import { apiConfig } from "../../config";
import { getMetadata } from "../../services/case-store";
import * as caseEvents from "../../services/case-events";
import { createLogger } from "../../../scraper/logger";
import {
  LIVE_UPDATE_EVENT_DATA_UPDATED,
  LIVE_UPDATE_EVENT_HELLO,
  type LiveUpdateEvent,
} from "../../../../shared/live-updates";

// GET /api/v1/updates — Server-Sent Events stream.
// Pushes one `hello` event on open (current dataset freshness) and one
// `data-updated` event each time the case-watcher detects a new write to
// data/cases.geojson. Clients keep the connection open and refetch /summary
// when an event arrives.
//
// SSE is preferred over WebSocket here because the channel is one-way
// (server → client), works over plain HTTP, and reconnects natively in
// every modern browser via the `EventSource` API.

const log = createLogger("api.updates");

// Format a single SSE frame. The blank line at the end is the terminator —
// without it the client never sees the event.
function frame(eventName: string, data: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function updatesRouter(): Router {
  const r = Router();

  r.get("/updates", async (req: Request, res: Response) => {
    // SSE-specific response headers. flushHeaders() commits them immediately
    // so the client sees the 200 before the first event lands.
    res.set({
      "Content-Type": "text/event-stream",
      // Disable both client- and proxy-level caching; the stream is per-request.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // nginx: turn off response buffering for this location.
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    // Initial `hello` event so the client confirms the stream is live and
    // knows the current dataset version (mainly useful for debugging).
    try {
      const meta = await getMetadata();
      const helloPayload: LiveUpdateEvent = {
        generatedAt: meta.generatedAt,
        totalCases: meta.totalCases,
      };
      res.write(frame(LIVE_UPDATE_EVENT_HELLO, helloPayload));
    } catch (err) {
      // Don't fail the connection — log and keep the stream open. The next
      // `data-updated` will overwrite whatever state the client made up.
      log.warn(`hello payload failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Subscribe to the in-process emitter. Each event becomes one SSE frame.
    const unsubscribe = caseEvents.subscribe((evt: LiveUpdateEvent) => {
      res.write(frame(LIVE_UPDATE_EVENT_DATA_UPDATED, evt));
    });

    // Heartbeat — a comment line every N seconds keeps proxies from culling
    // an "idle" connection. EventSource ignores comment lines on the client.
    const heartbeat = setInterval(() => {
      res.write(": ping\n\n");
    }, apiConfig.SSE_HEARTBEAT_INTERVAL_MS);

    // Cleanup on disconnect. `close` fires for both client-initiated and
    // server-initiated closes; we unsubscribe, stop the heartbeat, and end.
    req.on("close", () => {
      unsubscribe();
      clearInterval(heartbeat);
      res.end();
    });
  });

  return r;
}
