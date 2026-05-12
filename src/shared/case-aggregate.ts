// Aggregate-level shapes used by the map and summary endpoints.
// These are the "rolled-up" views over many `Case` records — one row per country
// or per location instead of one row per case.

// Lower-cased status union used at aggregate level (matches the bucket keys below).
export type CaseStatus = "confirmed" | "probable" | "suspected";

// ISO 3166-1 alpha-2 country code (e.g. "US", "AR"). Stored as a string for flexibility.
export type CountryCode = string;

// Per-country aggregate row. Produced by the scraper's aggregator and consumed by
// /api/v1/summary?groupBy=country and the map's choropleth/heat overlays.
export interface CountryCaseAggregate {
  countryCode: CountryCode;
  countryName: string;
  // Total case count across all statuses below.
  cases: number;
  confirmed: number;
  probable: number;
  suspected: number;
  // Deceased outcome count, tracked separately from status buckets.
  fatalities: number;
  // ISO timestamp of the most recent contributing case.
  lastReportedAt: string;
  // Provenance — every source that contributed at least one case to this row.
  sources: AggregateSource[];
}

// Source attribution attached to aggregate rows so the UI can show provenance.
export interface AggregateSource {
  id: string;
  name: string;
  url: string;
  // ISO timestamp marking when we last pulled from this source for this row.
  retrievedAt: string;
}

// Static lookup row for centroid coordinates per country.
// Used to place country-level pins on the map when a finer location isn't known.
export interface CountryCentroid {
  countryCode: CountryCode;
  countryName: string;
  lat: number;
  lng: number;
}

// Location-level aggregate (finer than country).
// One row per resolved geographic point — city, region, or fallback country centroid.
export interface LocationAggregate {
  // Stable id derived from the resolved location (used as React key and dedup key).
  id: string;
  locationName: string;
  // Optional resolved fields filled in by the reverse geocoder.
  resolvedCity?: string;
  resolvedRegion?: string;
  countryCode?: CountryCode;
  countryName?: string;
  lat: number;
  lng: number;
  // Total cases at this point; matches the sum of the status buckets below.
  cases: number;
  confirmed: number;
  probable: number;
  suspected: number;
  deceased: number;
  monitoring: number;
  lastReportedAt: string;
  sources: AggregateSource[];
}
