// Renders the medical disclaimer + authoritative-sources block.
// Reused in two places: the header panel (full size) and case tooltips (compact).

// Visual variants; "tooltip" is rendered at a smaller font for the popup context.
type Tone = "tooltip" | "panel";

interface AggregatedDataNoticeProps {
  tone?: Tone;
  className?: string;
}

// Curated list shown after the disclaimer. Order matters — these are listed by
// global reach, not alphabetically.
const AUTHORITATIVE_SOURCES = [
  { label: "WHO", url: "https://www.who.int/emergencies/disease-outbreak-news" },
  { label: "CDC", url: "https://www.cdc.gov/hantavirus/" },
  { label: "ECDC", url: "https://www.ecdc.europa.eu/en/hantavirus-infection" },
];

export function AggregatedDataNotice({ tone = "panel", className = "" }: AggregatedDataNoticeProps) {
  const isTooltip = tone === "tooltip";
  // Pick a font size class up front to keep JSX readable below.
  const baseText = isTooltip
    ? "text-[11px] leading-snug text-fg-muted"
    : "text-xs leading-snug text-fg-muted";

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Disclaimer — wording chosen so this can stand alone if shown outside the tooltip context. */}
      <p className={baseText}>
        <span className="font-semibold text-fg-default">⚠ Medical Disclaimer.</span> This tracker
        is for <span className="font-semibold text-fg-default">informational and research
        purposes only</span>. Data may be incomplete, delayed, or inaccurate. Do not use this
        information to make medical decisions. Always consult a qualified healthcare professional
        for medical advice.
      </p>
      <p className={baseText}>
        Authoritative sources:{" "}
        {AUTHORITATIVE_SOURCES.map((source, index) => (
          <span key={source.url}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-400 hover:underline"
            >
              {source.label}
            </a>
            {/* Visual separator between items, suppressed after the last entry. */}
            {index < AUTHORITATIVE_SOURCES.length - 1 ? " · " : ""}
          </span>
        ))}
      </p>
    </div>
  );
}
