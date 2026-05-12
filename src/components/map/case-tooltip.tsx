import type { LocationAggregate } from "../../shared/case-aggregate";
import { formatCount, formatDateTime } from "../../lib/format-cases";
import { AggregatedDataNotice } from "./aggregated-data-notice";

// Rich popup body for a single case circle.
// Rendered inside the Leaflet Popup — keep dimensions bounded so it doesn't
// dominate the map at low zoom.

interface CaseTooltipProps {
  location: LocationAggregate;
}

export function CaseTooltip({ location }: CaseTooltipProps) {
  // Hide the deceased/monitoring rows when their bucket is empty so the
  // popup stays compact for locations with only confirmed/probable cases.
  const showDeceased = location.deceased > 0;
  const showMonitoring = location.monitoring > 0;

  return (
    <div className="min-w-[240px] max-w-[320px] space-y-3 p-1">
      {/* Heading block — name, country, and freshness. */}
      <header className="space-y-0.5">
        <h3 className="text-sm font-semibold text-fg-default">{location.locationName}</h3>
        {location.countryName && (
          <p className="text-xs text-fg-muted">{location.countryName}</p>
        )}
        <p className="text-xs text-fg-muted">
          Last reported {formatDateTime(location.lastReportedAt)}
        </p>
      </header>

      {/* Per-status case counts. Definition list keeps the label/value pairs
          semantically linked even when wrapped. */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-fg-muted">Total cases</dt>
        <dd className="text-right font-semibold text-fg-default">
          {formatCount(location.cases)}
        </dd>

        <dt className="text-status-confirmed">Confirmed</dt>
        <dd className="text-right">{formatCount(location.confirmed)}</dd>

        <dt className="text-status-probable">Probable</dt>
        <dd className="text-right">{formatCount(location.probable)}</dd>

        <dt className="text-status-suspected">Suspected</dt>
        <dd className="text-right">{formatCount(location.suspected)}</dd>

        {showDeceased && (
          <>
            <dt className="text-fg-muted">Deceased</dt>
            <dd className="text-right">{formatCount(location.deceased)}</dd>
          </>
        )}

        {showMonitoring && (
          <>
            <dt className="text-fg-muted">Monitoring</dt>
            <dd className="text-right">{formatCount(location.monitoring)}</dd>
          </>
        )}
      </dl>

      {/* Provenance block — links back to every source that contributed cases here. */}
      <section className="space-y-1">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
          Sources
        </h4>
        <ul className="space-y-0.5 text-xs">
          {location.sources.map((source) => (
            <li key={source.id} className="truncate">
              {source.url ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-400 hover:underline"
                >
                  {source.name}
                </a>
              ) : (
                // Fall back to plain text when the source has no canonical URL.
                <span>{source.name}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Footer disclaimer — same component as the header panel, just smaller text. */}
      <div className="border-t border-bg-muted pt-2">
        <AggregatedDataNotice tone="tooltip" />
      </div>
    </div>
  );
}
