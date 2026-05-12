import { CircleMarker, Popup, Tooltip } from "react-leaflet";
import type { LocationAggregate } from "../../shared/case-aggregate";
import { circleRadiusForCases, formatCount } from "../../lib/format-cases";
import { CaseTooltip } from "./case-tooltip";

// Renders one case-cluster marker on the map.
// A circle's radius is proportional (by area) to its case count relative to the
// dataset max — so a 100-case city looks 10x heavier than a 10-case one.

interface CaseCircleProps {
  location: LocationAggregate;
  // Pre-computed dataset maximum so every circle scales against the same baseline.
  maxCasesInDataset: number;
}

export function CaseCircle({ location, maxCasesInDataset }: CaseCircleProps) {
  const radius = circleRadiusForCases(location.cases, maxCasesInDataset);
  const color = colorForLocation(location);
  // Only show the inline count when the circle is large enough to fit the text
  // without overlapping its neighbors.
  const showLabel = location.cases > 1 && radius >= 10;
  const label = formatCount(location.cases);
  const fontSize = labelFontSize(radius, label.length);

  return (
    <CircleMarker
      center={[location.lat, location.lng]}
      radius={radius}
      pathOptions={{
        color,
        weight: 2,
        opacity: 0.85,
        fillColor: color,
        // Low fill opacity so overlapping clusters stay readable.
        fillOpacity: 0.18,
      }}
    >
      {showLabel && (
        // Permanent + non-interactive tooltip acts as an in-circle label.
        <Tooltip
          permanent
          direction="center"
          className="hanta-count-label"
          interactive={false}
        >
          <span style={{ fontSize: `${fontSize}px` }}>{label}</span>
        </Tooltip>
      )}
      {/* Click-to-open popup with the full per-location breakdown. */}
      <Popup autoPan keepInView={false} closeButton minWidth={260} maxWidth={340}>
        <CaseTooltip location={location} />
      </Popup>
    </CircleMarker>
  );
}

// Pick a color by severity priority: deceased > confirmed > probable > suspected.
// Hardcoded hex values mirror the Tailwind tokens used by the legend.
function colorForLocation(loc: LocationAggregate): string {
  if (loc.deceased > 0) return "#ef4444";
  if (loc.confirmed > 0) return "#f97316";
  if (loc.probable > 0) return "#f59e0b";
  return "#eab308";
}

// Choose a label font size that fits inside the circle.
// Uses 1.6x radius as the horizontal text budget (approximate inscribed width).
function labelFontSize(radius: number, labelLength: number): number {
  const widthBudget = radius * 1.6;
  const perChar = widthBudget / Math.max(labelLength, 1);
  // Clamp to keep labels both legible (>=10px) and visually balanced (<=18px).
  return Math.max(10, Math.min(18, Math.round(perChar)));
}
