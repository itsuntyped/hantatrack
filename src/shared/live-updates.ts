// SSE event names + payload type for the live case-data updates feature.
// Imported by both the server (emitter side) and the client (EventSource side)
// so they stay in lockstep — change one constant and TypeScript flags the other.

// Sent once on connection open. Carries the freshness of the dataset the
// server is currently holding; lets the client confirm the stream is live.
export const LIVE_UPDATE_EVENT_HELLO = "hello" as const;

// Sent every time the watcher observes a fresh data/cases.geojson write.
// Receivers should treat this as a "go refetch /summary now" signal.
export const LIVE_UPDATE_EVENT_DATA_UPDATED = "data-updated" as const;

// Union of every named event the SSE channel emits.
export type LiveUpdateEventName =
  | typeof LIVE_UPDATE_EVENT_HELLO
  | typeof LIVE_UPDATE_EVENT_DATA_UPDATED;

// Payload pushed on both `hello` and `data-updated`.
// `generatedAt` is null before the first scrape has produced a file — the
// case-store treats a missing file as an empty dataset rather than throwing.
export type LiveUpdateEvent = {
  generatedAt: string | null;
  totalCases: number;
};
