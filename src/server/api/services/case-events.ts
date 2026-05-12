import { EventEmitter } from "node:events";
import type { LiveUpdateEvent } from "../../../shared/live-updates";

// In-process pub/sub for data-changed notifications.
// The case-watcher emits here when data/cases.geojson is rewritten; the SSE
// /api/v1/updates route subscribes per connection and forwards to each client.
//
// Kept module-local on purpose: the API is single-process and this emitter
// is the single source of "data is fresh" signals inside it.

// Single internal channel. We only ever emit one event name on it; keeping a
// constant here avoids typo bugs since the string never escapes this file.
const CHANNEL = "data-updated";

// Module-level emitter. Each open SSE connection registers exactly one listener
// here, so the default 10-listener warning would fire under normal load —
// raise the cap explicitly. The route handler is responsible for unregistering
// its listener on connection close (see routes/v1/updates.ts).
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

// Returned to subscribers so they can clean up without needing the listener fn.
export type CaseEventsUnsubscribe = () => void;

// Subscribe to data-changed events. Returns an unsubscribe handle the caller
// MUST invoke when its connection closes — otherwise we leak listeners.
export function subscribe(listener: (evt: LiveUpdateEvent) => void): CaseEventsUnsubscribe {
  emitter.on(CHANNEL, listener);
  return () => {
    emitter.off(CHANNEL, listener);
  };
}

// Internal API — called by the watcher only. Not enforced by TS visibility,
// but the convention is: only case-watcher.ts imports this.
export function emit(evt: LiveUpdateEvent): void {
  emitter.emit(CHANNEL, evt);
}

// Drop every subscriber. Used during graceful shutdown so the EventEmitter
// doesn't hold references that prevent the process from exiting.
export function removeAllListeners(): void {
  emitter.removeAllListeners(CHANNEL);
}
