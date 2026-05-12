// Hardcoded constants used across the scraper.
// Kept centralized so adding a new region or tweaking weights is one edit.

// Fallback coordinate table for free-text location names emitted by upstream
// sources. Looked up before we ask Nominatim — saves a network round trip
// and works when Nominatim doesn't know the name (e.g. vessel names).
// Keys are uppercased to keep lookups case-insensitive on the caller side.
export const LOCATION_COORDS: Record<string, [number, number]> = {
  ITALY: [41.9, 12.5],
  FINLAND: [61.9, 25.7],
  DENMARK: [56.0, 10.0],
  SWEDEN: [59.3, 18.1],
  SPAIN: [40.4, -3.7],
  FRANCE: [46.2, 2.2],
  GERMANY: [51.2, 10.5],
  NETHERLANDS: [52.1, 5.3],
  BELGIUM: [50.5, 4.5],
  SWITZERLAND: [47.4, 8.5],
  "UNITED KINGDOM": [51.5, -0.1],
  UK: [51.5, -0.1],
  IRELAND: [53.4, -8.2],
  GREECE: [39.1, 21.8],
  TURKEY: [39.9, 32.9],
  "SOUTH AFRICA": [-26.2, 28.0],
  JOHANNESBURG: [-26.2, 28.0],
  SINGAPORE: [1.35, 103.8],
  AUSTRALIA: [-25.3, 133.8],
  "NEW ZEALAND": [-40.9, 174.9],
  CANADA: [56.1, -106.3],
  "UNITED STATES": [37.1, -95.7],
  USA: [37.1, -95.7],
  "NEBRASKA, USA": [41.5, -99.9],
  "GEORGIA, USA": [32.2, -83.4],
  TEXAS: [31.0, -100.0],
  CALIFORNIA: [36.8, -119.4],
  "ARIZONA, USA": [34.0, -111.1],
  VIRGINIA: [37.4, -78.7],
  "NEW JERSEY": [40.1, -74.7],
  ARGENTINA: [-34.6, -58.4],
  USHUAIA: [-54.8, -68.3],
  CHILE: [-33.5, -70.6],
  BRAZIL: [-14.2, -51.9],
  JAPAN: [36.2, 138.3],
  INDIA: [20.6, 78.9],
  PHILIPPINES: [12.9, 121.8],
  GUATEMALA: [15.8, -90.2],
  MONTENEGRO: [42.7, 19.4],
  "TRISTAN DA CUNHA": [-37.1, -12.3],
  "ST HELENA": [-15.9, -5.7],
  "SAINT HELENA": [-15.9, -5.7],
  "PRAIA, CAPE VERDE": [14.9, -23.5],
  "CAPE VERDE": [14.9, -23.5],
  "ALICANTE, SPAIN": [38.3, -0.5],
  ZURICH: [47.4, 8.5],
  // MV Hondius is a cruise ship — points the marker at the last known port.
  "MV HONDIUS": [28.1, -15.4],
  TENERIFE: [28.1, -15.4],
  "CANARY ISLANDS": [28.1, -15.4],
  "ASCENSION ISLAND": [-7.9, -14.4],
  "SOUTH GEORGIA": [-54.2, -36.5],
  "FALKLAND ISLANDS": [-51.7, -59.0],
};

// Severity-style weights used by the deduplicator to pick the "winner" when
// two records describe the same case. Higher weight wins on a tie in
// sourceVerifiedAt. Tuned so a Confirmed case always supersedes a Suspected
// one, and Deceased ranks just below Confirmed (Deceased implies the case
// was already classified higher).
export const STATUS_WEIGHTS: Record<string, number> = {
  Confirmed: 50,
  Deceased: 40,
  Probable: 30,
  Suspected: 20,
  Monitoring: 10,
  Unknown: 0,
};

// HTTP User-Agent for all outbound scraper requests.
// Includes a contact URL so site operators can reach us if our traffic
// causes problems (good citizenship + Nominatim policy compliance).
export const USER_AGENT = "HantaTrack/1.0 (+https://hantatrack.net; public health research)";
