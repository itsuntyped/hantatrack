import { useEffect, useRef, useState } from "react";
import {
  LIVE_UPDATE_EVENT_DATA_UPDATED,
  LIVE_UPDATE_EVENT_HELLO,
  type LiveUpdateEvent,
  type LiveUpdateEventName,
} from "../shared/live-updates";

// React hook that wraps an EventSource subscription to /api/v1/updates.
// Pages call this to get a callback whenever the server pushes a new
// `data-updated` event; the callback typically triggers a refetch of the
// summary endpoint.
//
// SSR-safe: the effect bails when `window` is missing so the hook can run
// inside the server-render path without trying to open a network connection.

export interface UseLiveUpdatesOptions {
  // Called for each named event the server pushes. The handler receives the
  // parsed payload and the event name so callers can choose what to act on
  // (typically: ignore `hello`, refetch on `data-updated`).
  onUpdate: (evt: LiveUpdateEvent, name: LiveUpdateEventName) => void;
  // Default true. Pass false to keep the connection closed (tests, etc.).
  enabled?: boolean;
}

export interface UseLiveUpdatesResult {
  // True while the EventSource is in its OPEN state. Flips to false on error;
  // the browser auto-reconnects, so a brief drop is normal during deploys.
  connected: boolean;
}

export function useLiveUpdates(options: UseLiveUpdatesOptions): UseLiveUpdatesResult {
  const { onUpdate, enabled = true } = options;
  const [connected, setConnected] = useState(false);

  // Stash the latest onUpdate in a ref so an inline function passed by the
  // caller doesn't cause the effect to tear down and re-open the connection
  // on every render.
  const handlerRef = useRef(onUpdate);
  useEffect(() => {
    handlerRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    // SSR guard — the effect won't actually run on the server, but the
    // explicit check makes the intent clear and protects against pre-render
    // edge cases.
    if (typeof window === "undefined") return;
    if (!enabled) return;

    // Open the stream. EventSource is built into every modern browser.
    const source = new EventSource("/api/v1/updates");

    const handleNamed = (name: LiveUpdateEventName) => (event: MessageEvent) => {
      // The server only sends JSON; bail quietly on a malformed frame so a
      // single bad event can't break the whole subscription.
      try {
        const parsed = JSON.parse(event.data) as LiveUpdateEvent;
        handlerRef.current(parsed, name);
      } catch {
        // Swallow — debugging the wire format belongs in devtools, not the UI.
      }
    };

    const helloListener = handleNamed(LIVE_UPDATE_EVENT_HELLO);
    const dataListener = handleNamed(LIVE_UPDATE_EVENT_DATA_UPDATED);
    source.addEventListener(LIVE_UPDATE_EVENT_HELLO, helloListener);
    source.addEventListener(LIVE_UPDATE_EVENT_DATA_UPDATED, dataListener);

    // open + error track the connection lifecycle. We don't tear down on
    // error — EventSource reconnects natively with its own backoff.
    const handleOpen = (): void => setConnected(true);
    const handleError = (): void => setConnected(false);
    source.addEventListener("open", handleOpen);
    source.addEventListener("error", handleError);

    return () => {
      source.removeEventListener(LIVE_UPDATE_EVENT_HELLO, helloListener);
      source.removeEventListener(LIVE_UPDATE_EVENT_DATA_UPDATED, dataListener);
      source.removeEventListener("open", handleOpen);
      source.removeEventListener("error", handleError);
      source.close();
    };
  }, [enabled]);

  return { connected };
}
