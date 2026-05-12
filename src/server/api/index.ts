import { apiConfig } from "./config";
import { buildApp } from "./app";
import { createLogger } from "../scraper/logger";
import { startScraperLoop, type ScraperLoopHandle } from "../scraper/loop";

// Production-style server entry point.
// Builds the Express app, starts the HTTP listener, kicks off the scraper
// loop, and installs graceful-shutdown handlers.

const log = createLogger("api");

// Handle to the scraper loop so we can stop it on shutdown.
let scraperLoop: ScraperLoopHandle | null = null;

// Top-level await is OK here — Node ESM supports it and we don't need to
// listen until the app is fully wired.
const app = await buildApp();
const server = app.listen(apiConfig.PORT, () => {
  log.info(`HantaTrack server listening on http://localhost:${apiConfig.PORT} (${apiConfig.NODE_ENV})`);
});

// Start the in-process hourly scraper loop. In environments where the scraper
// runs as a separate worker, set SCRAPER_LOOP_DISABLED to skip this.
scraperLoop = startScraperLoop();

// Guard so SIGINT + SIGTERM arriving back-to-back don't re-enter shutdown.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`Received ${signal}, shutting down…`);
  scraperLoop?.stop();
  server.close((err) => {
    if (err) {
      log.error(`Error during shutdown: ${err.message}`);
      process.exit(1);
    }
    process.exit(0);
  });
  // Force-exit safety net in case a connection refuses to close in time.
  // .unref() so the timer doesn't keep the event loop alive on its own.
  setTimeout(() => {
    log.warn("Force-exiting after 10s shutdown timeout.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Log unhandled promise rejections instead of crashing so a stray promise
// somewhere doesn't take down the server.
process.on("unhandledRejection", (reason) => {
  log.error(`Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});
