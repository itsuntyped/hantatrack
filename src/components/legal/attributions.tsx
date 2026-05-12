// Attributions modal content.
// Lists every external party we depend on or whose data we surface — split
// into Data sources, Infrastructure & services, and Icons & assets.

// Row shape used by all three lists below.
interface Attribution {
  name: string;
  url: string;
  // Optional trailing note rendered in muted text.
  note?: string;
}

// Authoritative public-health data feeds and aggregators.
// Keep names in their official long form for clarity.
const DATA_SOURCES: Attribution[] = [
  {
    name: "World Health Organization — Disease Outbreak News",
    url: "https://www.who.int/emergencies/disease-outbreak-news",
  },
  {
    name: "U.S. Centers for Disease Control — Hantavirus",
    url: "https://www.cdc.gov/hantavirus/",
  },
  {
    name: "European Centre for Disease Prevention and Control — Hantavirus",
    url: "https://www.ecdc.europa.eu/en/hantavirus-infection",
  },
  {
    name: "ANDV Hantavirus 2026 Dashboard (University of Toledo / K. Panozzo)",
    url: "https://www.arcgis.com/apps/dashboards/5c68442d2afc42d7ba2696e4cd393729",
  },
  {
    name: "HealthMap — Boston Children's Hospital",
    url: "https://healthmap.org/",
  },
  {
    name: "Google News",
    url: "https://news.google.com/",
    note: "News ticker source",
  },
];

// Backing services and infrastructure providers.
const INFRASTRUCTURE: Attribution[] = [
  {
    name: "OpenStreetMap",
    url: "https://www.openstreetmap.org/copyright",
    note: "Base map data",
  },
  {
    name: "CARTO basemaps",
    url: "https://carto.com/attributions",
    note: "Dark Matter tile rendering",
  },
  {
    name: "OpenStreetMap Nominatim",
    url: "https://nominatim.openstreetmap.org/",
    note: "Reverse and forward geocoding",
  },
  {
    name: "OpenAI",
    url: "https://openai.com/",
    note: "Structured-output extraction from public health bulletins",
  },
];

// Icon and visual asset credits.
const ICONS: Attribution[] = [
  {
    // Flaticon's terms require this exact link text. Don't shorten it.
    name: "Virus icons created by Freepik - Flaticon",
    url: "https://www.flaticon.com/free-icons/virus",
    note: "Favicon",
  },
];

// Shared list renderer to keep the three sections visually identical.
function AttributionList({ items }: { items: Attribution[] }) {
  return (
    <ul className="ml-5 list-disc space-y-1.5">
      {items.map((item) => (
        <li key={item.url}>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-400 hover:underline"
          >
            {item.name}
          </a>
          {item.note && <span className="text-fg-muted"> — {item.note}</span>}
        </li>
      ))}
    </ul>
  );
}

// Top-level component rendered inside the attributions InfoModal.
export function AttributionsContent() {
  return (
    <div className="space-y-5">
      <p className="text-fg-muted">
        HantaTrack is built on the work of many organizations. Thanks to all of them.
      </p>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-fg-default">Data sources</h3>
        <AttributionList items={DATA_SOURCES} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-fg-default">Infrastructure & services</h3>
        <AttributionList items={INFRASTRUCTURE} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-fg-default">Icons & assets</h3>
        <AttributionList items={ICONS} />
      </section>
    </div>
  );
}
