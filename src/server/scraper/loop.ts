import { config } from "./config";
import { createLogger } from "./logger";
import { runScrape } from "./index";

// Periodic scraper loop.
// Used both by the standalone worker (`worker.ts`) and the in-process loop
// kicked off from the API server (`api/index.ts`).

const log = createLogger("scraper.loop");

// Returned to the caller so they can stop the loop on shutdown.
export interface ScraperLoopHandle {
  stop(): void;
}

export interface ScraperLoopOptions {
  // Override the interval (ms). Defaults to SCRAPER_INTERVAL_MINUTES.
  intervalMs?: number;
  // Run an initial tick immediately on start. Default: true.
  runImmediately?: boolean;
}

export function startScraperLoop(opts: ScraperLoopOptions = {}): ScraperLoopHandle {
  // Interval comes from env unless explicitly overridden.
  const intervalMs = opts.intervalMs ?? config.SCRAPER_INTERVAL_MINUTES * 60 * 1000;
  const runImmediately = opts.runImmediately ?? true;

  // Reentrancy guards: stopping prevents new ticks; running prevents overlap.
  let stopping = false;
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function tick(): Promise<void> {
    // Don't start a new run while one is in flight — protects sources from
    // double-fetch when an interval lands during a long scrape.
    if (stopping || running) return;
    running = true;
    try {
      await runScrape();
    } catch (err) {
      // Log + continue — a single bad tick must not kill the loop.
      log.error(`scrape tick failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      running = false;
    }
  }

  // Schedule the *next* tick. Recursive setTimeout (not setInterval) so we
  // can't pile up overlapping calls if a scrape takes longer than the interval.
  function scheduleNext(): void {
    timer = setTimeout(async () => {
      await tick();
      if (!stopping) scheduleNext();
    }, intervalMs);
  }

  log.info(
    `Scraper loop starting — every ${Math.round(intervalMs / 60_000)} min` +
      (runImmediately ? " (initial run immediate)." : "."),
  );

  if (runImmediately) {
    // Fire-and-forget first tick; chain into scheduleNext when it finishes.
    void tick().then(() => {
      if (!stopping) scheduleNext();
    });
  } else {
    scheduleNext();
  }

  return {
    stop(): void {
      if (stopping) return;
      stopping = true;
      // Drop any pending timer. Active runs finish naturally — running flag
      // is checked above before scheduling the next call.
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      log.info("Scraper loop stopped.");
    },
  };
}
