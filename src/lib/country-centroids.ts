import type { CountryCentroid, CountryCode } from "../shared/case-aggregate";

// Static table of approximate country centroids (lat/lng).
// Used as a fallback when a case has a country but no finer location resolved by
// the reverse geocoder — better than dropping the case off the map entirely.
// Coordinates are rough population/geographic centroids from public sources.
const CENTROIDS: Record<CountryCode, CountryCentroid> = {
  AR: { countryCode: "AR", countryName: "Argentina", lat: -38.4161, lng: -63.6167 },
  AU: { countryCode: "AU", countryName: "Australia", lat: -25.2744, lng: 133.7751 },
  BE: { countryCode: "BE", countryName: "Belgium", lat: 50.5039, lng: 4.4699 },
  BO: { countryCode: "BO", countryName: "Bolivia", lat: -16.2902, lng: -63.5887 },
  BR: { countryCode: "BR", countryName: "Brazil", lat: -14.235, lng: -51.9253 },
  CA: { countryCode: "CA", countryName: "Canada", lat: 56.1304, lng: -106.3468 },
  CH: { countryCode: "CH", countryName: "Switzerland", lat: 46.8182, lng: 8.2275 },
  CL: { countryCode: "CL", countryName: "Chile", lat: -35.6751, lng: -71.543 },
  CN: { countryCode: "CN", countryName: "China", lat: 35.8617, lng: 104.1954 },
  CO: { countryCode: "CO", countryName: "Colombia", lat: 4.5709, lng: -74.2973 },
  CV: { countryCode: "CV", countryName: "Cabo Verde", lat: 16.5388, lng: -23.0418 },
  DE: { countryCode: "DE", countryName: "Germany", lat: 51.1657, lng: 10.4515 },
  EC: { countryCode: "EC", countryName: "Ecuador", lat: -1.8312, lng: -78.1834 },
  ES: { countryCode: "ES", countryName: "Spain", lat: 40.4637, lng: -3.7492 },
  FI: { countryCode: "FI", countryName: "Finland", lat: 61.9241, lng: 25.7482 },
  FR: { countryCode: "FR", countryName: "France", lat: 46.6034, lng: 1.8883 },
  GB: { countryCode: "GB", countryName: "United Kingdom", lat: 55.3781, lng: -3.436 },
  GR: { countryCode: "GR", countryName: "Greece", lat: 39.0742, lng: 21.8243 },
  IE: { countryCode: "IE", countryName: "Ireland", lat: 53.4129, lng: -8.2439 },
  IT: { countryCode: "IT", countryName: "Italy", lat: 41.8719, lng: 12.5674 },
  JP: { countryCode: "JP", countryName: "Japan", lat: 36.2048, lng: 138.2529 },
  KR: { countryCode: "KR", countryName: "South Korea", lat: 35.9078, lng: 127.7669 },
  MX: { countryCode: "MX", countryName: "Mexico", lat: 23.6345, lng: -102.5528 },
  NL: { countryCode: "NL", countryName: "Netherlands", lat: 52.1326, lng: 5.2913 },
  PA: { countryCode: "PA", countryName: "Panama", lat: 8.538, lng: -80.7821 },
  PY: { countryCode: "PY", countryName: "Paraguay", lat: -23.4425, lng: -58.4438 },
  RU: { countryCode: "RU", countryName: "Russia", lat: 61.524, lng: 105.3188 },
  SE: { countryCode: "SE", countryName: "Sweden", lat: 60.1282, lng: 18.6435 },
  SG: { countryCode: "SG", countryName: "Singapore", lat: 1.3521, lng: 103.8198 },
  SH: { countryCode: "SH", countryName: "Saint Helena", lat: -15.9387, lng: -5.7168 },
  TR: { countryCode: "TR", countryName: "Turkey", lat: 38.9637, lng: 35.2433 },
  UY: { countryCode: "UY", countryName: "Uruguay", lat: -32.5228, lng: -55.7658 },
  US: { countryCode: "US", countryName: "United States", lat: 37.0902, lng: -95.7129 },
  VE: { countryCode: "VE", countryName: "Venezuela", lat: 6.4238, lng: -66.5897 },
  ZA: { countryCode: "ZA", countryName: "South Africa", lat: -30.5595, lng: 22.9375 },
};

// Look up a centroid by ISO code.
// Uppercases the input so callers don't need to normalize first — most sources
// emit codes in mixed case, and lookups are stored uppercase.
export function getCentroid(code: CountryCode): CountryCentroid | undefined {
  return CENTROIDS[code.toUpperCase()];
}

// Return every centroid we know about, useful for diagnostics and tests.
export function listCentroids(): CountryCentroid[] {
  return Object.values(CENTROIDS);
}
