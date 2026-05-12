// Floating legend pinned to the bottom-left of the map.
// Shows color-status mapping plus a one-line dataset summary so the user
// always sees the totals without opening the header panel.

interface MapLegendProps {
  totalLocations: number;
  totalCountries: number;
  totalCases: number;
}

export function MapLegend({ totalLocations, totalCountries, totalCases }: MapLegendProps) {
  return (
    <div className="pointer-events-auto rounded-lg border border-bg-muted bg-bg-panel/90 p-3 text-xs text-fg-default shadow-xl backdrop-blur">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
        Legend
      </h2>
      {/* Legend entries — order matches the priority used by case-circle:colorForLocation
          (deceased > confirmed > probable > suspected). */}
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-status-confirmed/70 ring-1 ring-status-confirmed" />
          <span>Deceased reported</span>
        </li>
        <li className="flex items-center gap-2">
          {/* Hardcoded orange — no Tailwind token exists for this distinct color yet. */}
          <span className="inline-block h-3 w-3 rounded-full bg-[#f97316]/70 ring-1 ring-[#f97316]" />
          <span>Confirmed</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-status-probable/70 ring-1 ring-status-probable" />
          <span>Probable</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-status-suspected/70 ring-1 ring-status-suspected" />
          <span>Suspected / monitoring</span>
        </li>
      </ul>
      {/* Dataset summary footer — kept compact so the legend doesn't grow tall. */}
      <p className="mt-3 border-t border-bg-muted pt-2 text-[11px] text-fg-muted">
        {totalCases.toLocaleString("en-US")} cases · {totalLocations} locations · {totalCountries} countries
      </p>
    </div>
  );
}
