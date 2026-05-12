// Tiny structured-ish logger used by every scraper and API module.
// No external dep — keeps the worker image small and avoids the overhead of
// a real logging framework for the volumes we produce.

type Level = "debug" | "info" | "warn" | "error";

// Numeric ordering used to filter messages below the active level.
const LEVEL_ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
// Read once at startup. LOG_LEVEL=debug in dev to see everything.
const ACTIVE_LEVEL: Level = (process.env.LOG_LEVEL as Level) ?? "info";

// Is this message verbose enough to print?
function shouldLog(level: Level): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[ACTIVE_LEVEL];
}

// Format with ISO timestamp + level + module scope so logs are greppable.
function formatLine(level: Level, scope: string, message: string): string {
  return `${new Date().toISOString()} [${level.toUpperCase()}] ${scope}: ${message}`;
}

// Public Logger interface — kept minimal on purpose.
export interface Logger {
  debug(message: string, ...extra: unknown[]): void;
  info(message: string, ...extra: unknown[]): void;
  warn(message: string, ...extra: unknown[]): void;
  error(message: string, ...extra: unknown[]): void;
}

// Factory — call with a short scope name like "scraper.who" so log lines
// identify which module emitted them.
export function createLogger(scope: string): Logger {
  const emit = (level: Level, message: string, ...extra: unknown[]) => {
    if (!shouldLog(level)) return;
    // Errors and warnings go to stderr so they're separable from info traffic.
    const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
    stream.write(formatLine(level, scope, message) + "\n");
    // Extra args are appended indented. Errors print their stack when available.
    if (extra.length > 0) {
      for (const item of extra) {
        stream.write("  " + (item instanceof Error ? item.stack ?? item.message : JSON.stringify(item)) + "\n");
      }
    }
  };
  return {
    debug: (m, ...e) => emit("debug", m, ...e),
    info: (m, ...e) => emit("info", m, ...e),
    warn: (m, ...e) => emit("warn", m, ...e),
    error: (m, ...e) => emit("error", m, ...e),
  };
}
