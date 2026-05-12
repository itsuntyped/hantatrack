import { useMemo } from "react";
import { MapContainer, TileLayer, ZoomControl } from "react-leaflet";

import type { LocationAggregate } from "../../shared/case-aggregate";
import { CaseCircle } from "./case-circle";

// The actual Leaflet map. Loaded lazily by `world-case-map.tsx` so the SSR
// build doesn't pull Leaflet (which touches `window` at import time) into the
// server bundle.

interface WorldCaseMapInnerProps {
  locations: LocationAggregate[];
}

// Default view targets the equator with a slight northern bias so the
// land-heavy hemisphere fills the screen.
const WORLD_CENTER: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;
// Constrain zoom so users can't zoom out past one world copy or in past
// useful tile resolution.
const MIN_ZOOM = 2;
const MAX_ZOOM = 8;
// Bounds clamp at ±85° because the Web Mercator projection blows up at the poles.
const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-85, -180],
  [85, 180],
];

export function WorldCaseMapInner({ locations }: WorldCaseMapInnerProps) {
  // Compute the dataset max once per locations change so every CaseCircle
  // scales against the same baseline.
  const maxCases = useMemo(
    () => locations.reduce((max, l) => Math.max(max, l.cases), 0),
    [locations],
  );

  return (
    <MapContainer
      center={WORLD_CENTER}
      zoom={DEFAULT_ZOOM}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      maxBounds={WORLD_BOUNDS}
      // Full viscosity stops users dragging the world out of bounds.
      maxBoundsViscosity={1}
      // worldCopyJump keeps markers anchored when panning past the dateline.
      worldCopyJump
      scrollWheelZoom
      // We render our own zoom control in the bottom-right (below).
      zoomControl={false}
      attributionControl
      className="h-full w-full"
    >
      <ZoomControl position="bottomright" />
      {/* CARTO Dark Matter tiles — pairs visually with the dark UI theme. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains={["a", "b", "c", "d"]}
        noWrap={false}
      />
      {locations.map((location) => (
        <CaseCircle key={location.id} location={location} maxCasesInDataset={maxCases} />
      ))}
    </MapContainer>
  );
}

// Default export so this file can be loaded via dynamic `import()` ergonomically.
export default WorldCaseMapInner;
