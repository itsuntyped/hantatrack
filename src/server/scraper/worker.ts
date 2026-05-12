import { createLogger } from "./logger";
import { startScraperLoop } from "./loop";

// Standalone scraper worker entry — `npm run scraper:worker`.
// Just spins up the loop and listens for shutdown signals so it can be run
// as its own process (cron-replacement, container, systemd unit, etc.).

const log = createLogger("scraper.worker");

const loop = startScraperLoop();

// Same shutdown shape as the API server.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`Received ${signal}, shutting down…`);
  loop.stop();
  // No HTTP listener to drain — exit cleanly.
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
