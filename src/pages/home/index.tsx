import { useCallback, useEffect, useRef, useState } from "react";

import type { LocationAggregate } from "../../shared/case-aggregate";
import type { NewsArticle } from "../../shared/news";
import { LIVE_UPDATE_EVENT_DATA_UPDATED } from "../../shared/live-updates";
import { fetchLocationAggregates, type LocationsResult } from "../../lib/case-data";
import { fetchNews } from "../../lib/news-data";
import { formatDateTime } from "../../lib/format-cases";
import { useSSRData } from "../../lib/ssr-context";
import { useLiveUpdates } from "../../lib/use-live-updates";
import { WorldCaseMap } from "../../components/map/world-case-map";
import { MapHeader } from "../../components/map/map-header";
import { MapLegend } from "../../components/map/map-legend";
import { NewsTicker } from "../../components/news/news-ticker";

// Home page — the entire UI is a single full-bleed map with overlays.
// Boots from SSR data when available, falls back to a client fetch when not
// (e.g. local `npm run dev:client` without the Express server).
export function HomePage() {
  const ssr = useSSRData();
  // Initialize state from SSR so the first render matches the server output.
  const [locations, setLocations] = useState<LocationAggregate[]>(ssr?.locations ?? []);
  const [meta, setMeta] = useState<LocationsResult["meta"] | null>(ssr?.meta ?? null);
  const [news, setNews] = useState<NewsArticle[]>(ssr?.news ?? []);
  const [error, setError] = useState<string | null>(null);
  // Don't show the loading overlay when SSR already populated the page.
  const [loading, setLoading] = useState(!ssr);

  // Skip the initial network fetch when SSR already gave us data — those
  // values are guaranteed fresh because they were read from the same
  // case-store cache the API uses.
  const skipInitialFetch = useRef(!!ssr);

  // Tracks an in-flight refetch triggered by an SSE `data-updated` event so
  // back-to-back pushes coalesce: a new push aborts the previous fetch and
  // starts a fresh one, matching the abort pattern used in the mount effect.
  const liveRefetchController = useRef<AbortController | null>(null);

  useEffect(() => {
    // Bail on the first effect run if SSR already populated state.
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    // AbortController cancels in-flight fetches on unmount / rerun.
    const controller = new AbortController();

    Promise.all([
      fetchLocationAggregates({ signal: controller.signal }).then((r) => {
        setLocations(r.locations);
        setMeta(r.meta);
      }),
      fetchNews({ signal: controller.signal })
        .then(setNews)
        .catch(() => {
          // News failure is non-fatal — ticker just stays empty.
        }),
    ])
      .catch((err: unknown) => {
        // Swallow aborts so unmount doesn't surface a misleading error toast.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load case data");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  // Stable handler reference for the SSE subscription. Ignores `hello` (SSR
  // is already the freshest source on first paint, so refetching there would
  // be a wasted round-trip) and refetches aggregates on every `data-updated`.
  // Errors are swallowed silently per the silent-UX decision — the previous
  // map stays on screen until the next successful refetch.
  const handleLiveUpdate = useCallback((_evt: unknown, name: string) => {
    if (name !== LIVE_UPDATE_EVENT_DATA_UPDATED) return;

    // Abort any prior refetch so only the newest event wins.
    liveRefetchController.current?.abort();
    const controller = new AbortController();
    liveRefetchController.current = controller;

    fetchLocationAggregates({ signal: controller.signal })
      .then((r) => {
        setLocations(r.locations);
        setMeta(r.meta);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Silent UX — log to the console for devs, leave the visible UI alone.
        if (typeof console !== "undefined") {
          console.warn("live update refetch failed:", err);
        }
      });
  }, []);

  useLiveUpdates({ onUpdate: handleLiveUpdate });

  // Cancel any in-flight live refetch on unmount.
  useEffect(() => {
    return () => liveRefetchController.current?.abort();
  }, []);

  // Pre-format the "Updated …" timestamp on the server when possible to keep
  // SSR and client render identical (avoids hydration mismatches).
  const dataAsOf = meta?.generatedAt ?? null;

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden">
      <NewsTicker articles={news} />

      <div className="relative flex-1">
        {/* Map fills the entire content area; overlays use absolute positioning. */}
        <div className="absolute inset-0 z-0">
          <WorldCaseMap locations={locations} />
        </div>

        {/* Top-left header overlay. `pointer-events-none` on the wrapper lets
            clicks pass through; `pointer-events-auto` is set on the panel itself. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-between gap-3 p-3 sm:p-4">
          <MapHeader lastUpdated={dataAsOf ? formatDateTime(dataAsOf) : undefined} />
        </div>

        {/* Bottom-left legend overlay. */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 sm:bottom-4 sm:left-4">
          <MapLegend
            // Prefer meta counts (authoritative from the API) and fall back to
            // local state when meta hasn't loaded yet.
            totalLocations={meta?.locations ?? locations.length}
            totalCountries={meta?.countries ?? 0}
            totalCases={meta?.totalCases ?? 0}
          />
        </div>

        {/* Centered loading toast — only shown during the initial client fetch. */}
        {loading && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="rounded-md bg-bg-panel/80 px-4 py-2 text-sm text-fg-muted shadow-lg backdrop-blur">
              Loading case data…
            </div>
          </div>
        )}

        {/* Bottom-right error toast — sticky so the user can read the message. */}
        {error && (
          <div className="pointer-events-auto absolute bottom-3 right-3 z-20 max-w-sm rounded-md border border-status-confirmed/40 bg-bg-panel/95 p-3 text-xs text-status-confirmed shadow-xl">
            Could not load case data: {error}
          </div>
        )}
      </div>
    </main>
  );
}
