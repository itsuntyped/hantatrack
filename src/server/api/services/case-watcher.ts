import { watch, type FSWatcher } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { apiConfig } from "../config";
import { createLogger } from "../../scraper/logger";
import * as caseStore from "./case-store";
import * as caseEvents from "./case-events";

// File watcher that turns scraper output writes into in-process events.
// fs.watch fires whenever the parent directory observes a change to
// data/cases.geojson; we debounce the notifications (mtime can fire twice
// during an atomic rename-over-temp, especially on Windows), refresh the
// case-store, then emit a LiveUpdateEvent for the SSE route to forward.
//
// Watching the directory rather than the file is intentional: an atomic
// write replaces the inode, which invalidates a per-file watcher on Windows.
// Filtering by basename gives us the same precision without the fragility.

const log = createLogger("api.case-watcher");

// Debounce window for back-to-back fs.watch events on the same file.
// 250ms is long enough to coalesce a rename-then-rename pair, short enough
// to keep the propagation delay imperceptible to users.
const DEBOUNCE_MS = 250;

// Returned to the caller (api/index.ts) so the watcher can be stopped on
// graceful shutdown alongside the scraper loop.
export interface CaseWatcherHandle {
  stop(): void;
}

export function startCaseWatcher(): CaseWatcherHandle {
  // Resolve the same way case-store does so the two stay in agreement about
  // which path is being watched.
  const targetPath = resolve(process.cwd(), apiConfig.SCRAPER_OUTPUT_PATH);
  const targetDir = dirname(targetPath);
  const targetBasename = basename(targetPath);

  let debounceTimer: NodeJS.Timeout | null = null;
  let watcher: FSWatcher | null = null;
  let stopping = false;

  // Coalesced handler — called after the debounce window settles.
  // Refresh first so listeners' subsequent /summary fetch is guaranteed fresh,
  // then emit. Errors from refreshNow are logged and swallowed because the
  // file may be mid-write; the next fs.watch event will catch the settled state.
  async function handleChange(): Promise<void> {
    if (stopping) return;
    try {
      const { generatedAt, totalCases } = await caseStore.refreshNow();
      caseEvents.emit({ generatedAt, totalCases });
      log.debug(`emitted data-updated (totalCases=${totalCases}, generatedAt=${generatedAt ?? "null"})`);
    } catch (err) {
      log.warn(
        `refresh after file change failed (will retry on next event): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // Start the directory watcher. persistent:true keeps the event loop alive
  // while we have an active watcher — fine because we explicitly stop() on
  // shutdown.
  try {
    watcher = watch(targetDir, { persistent: true }, (_eventType, filename) => {
      // fs.watch can pass null on some platforms; guard explicitly.
      if (!filename || filename.toString() !== targetBasename) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void handleChange();
      }, DEBOUNCE_MS);
    });

    // Surface watcher errors so a broken inotify subscription doesn't fail silently.
    watcher.on("error", (err) => {
      log.error(`fs.watch error on ${targetDir}: ${err.message}`);
    });

    log.info(`Watching ${targetDir} for changes to ${targetBasename} (debounce ${DEBOUNCE_MS}ms).`);
  } catch (err) {
    // Directory may not exist yet on a clean clone. Log and continue —
    // clients will still get data via the normal /summary path on demand;
    // they just won't receive push notifications until the dir is created.
    log.warn(
      `could not start watcher on ${targetDir}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    stop(): void {
      if (stopping) return;
      stopping = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (watcher) {
        watcher.close();
        watcher = null;
      }
      log.info("Case watcher stopped.");
    },
  };
}
