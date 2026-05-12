// Small shared formatters used by both the server-rendered HTML and the
// client-side hydrated UI. Anything here must produce identical output on
// Node and in the browser to avoid hydration mismatches.

// Format a number with US-style thousands separators (e.g. 1234 -> "1,234").
export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

// Format an ISO timestamp for display in headers and tooltips.
// Returns the original string unchanged when parsing fails — better to show
// something than to throw inside a render path.
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Pin the locale so SSR and the browser produce the same string — leaving
  // it `undefined` reads the host's default locale and that differs between
  // Node and the user's browser, causing hydration mismatches.
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

// Visual radius bounds (in pixels) for case circles on the map.
// Tuned so a single case is visible without dominating, and the largest cluster
// stays readable on dense regions.
const MIN_RADIUS_PX = 5;
const MAX_RADIUS_PX = 24;

// Scale a case count to a pixel radius for map circles.
// Uses sqrt scaling so the *area* (visual mass) is proportional to the case
// count — linear radius scaling makes large clusters look exponentially bigger.
export function circleRadiusForCases(cases: number, maxInDataset: number): number {
  if (cases <= 0) return 0;
  // Guard against a divide-by-zero when the dataset is empty.
  const safeMax = Math.max(maxInDataset, 1);
  const ratio = Math.sqrt(cases) / Math.sqrt(safeMax);
  return MIN_RADIUS_PX + (MAX_RADIUS_PX - MIN_RADIUS_PX) * ratio;
}
