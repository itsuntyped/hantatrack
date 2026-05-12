import { useEffect, useState, type ComponentType } from "react";

import type { LocationAggregate } from "../../shared/case-aggregate";

// SSR-safe wrapper around the Leaflet map.
// Leaflet touches `window` at module-evaluation time, which would crash
// `entry-server.tsx`. By only importing the inner module from inside an
// effect (browser-only), the server renders a blank placeholder and the
// client takes over after hydration.

interface WorldCaseMapProps {
  locations: LocationAggregate[];
}

// Local alias for the dynamically-loaded component's type signature.
type InnerComponent = ComponentType<WorldCaseMapProps>;

export function WorldCaseMap({ locations }: WorldCaseMapProps) {
  // `null` until the inner module finishes loading on the client.
  const [Inner, setInner] = useState<InnerComponent | null>(null);

  useEffect(() => {
    // Guard against state updates after unmount (e.g. fast nav away during load).
    let cancelled = false;
    // Dynamic import is what keeps Leaflet out of the SSR bundle.
    void import("./world-case-map-inner").then((mod) => {
      if (!cancelled) setInner(() => mod.WorldCaseMapInner);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Inner) {
    // Empty placeholder occupying the same footprint so layout doesn't jump
    // when the map finishes loading.
    return <div className="h-full w-full bg-bg-base" aria-hidden="true" />;
  }

  return <Inner locations={locations} />;
}
