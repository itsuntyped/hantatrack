import { useState } from "react";
import { AggregatedDataNotice } from "./aggregated-data-notice";
import { InfoModal } from "../modal/info-modal";
import { PrivacyPolicyContent } from "../legal/privacy-policy";
import { TermsOfServiceContent } from "../legal/terms-of-service";
import { AttributionsContent } from "../legal/attributions";

// Top-left header panel.
// Shows the site title, last-updated timestamp, disclaimer, and the legal
// modal triggers. Owns the open/closed state for the three legal modals.

interface MapHeaderProps {
  // Pre-formatted timestamp string from the server. Optional — header still
  // renders correctly when no data has been loaded yet.
  lastUpdated?: string;
}

// Discriminator for which legal modal (if any) is currently open.
type LegalPage = "privacy" | "terms" | "attributions" | null;

export function MapHeader({ lastUpdated }: MapHeaderProps) {
  const [open, setOpen] = useState<LegalPage>(null);

  return (
    <>
      <div className="pointer-events-auto max-w-md rounded-lg border border-bg-muted bg-bg-panel/90 p-4 shadow-xl backdrop-blur">
        {/* Title row. */}
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-fg-default">
            HantaTrack <span className="text-fg-muted">·</span>{" "}
            <span className="text-fg-muted">Global hantavirus map</span>
          </h1>
        </div>
        {lastUpdated && <p className="mt-1 text-xs text-fg-muted">Updated {lastUpdated}</p>}
        <div className="mt-3 border-t border-bg-muted pt-3">
          <AggregatedDataNotice />
          {/* Footer nav — three legal pages rendered into the InfoModal below. */}
          <nav
            aria-label="Site information"
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-muted"
          >
            <LegalLink onClick={() => setOpen("privacy")}>Privacy</LegalLink>
            <span aria-hidden="true">·</span>
            <LegalLink onClick={() => setOpen("terms")}>Terms</LegalLink>
            <span aria-hidden="true">·</span>
            <LegalLink onClick={() => setOpen("attributions")}>Attributions</LegalLink>
          </nav>
        </div>
      </div>

      {/* One modal per legal page; only one is open at a time per the union above. */}
      <InfoModal
        open={open === "privacy"}
        onClose={() => setOpen(null)}
        title="Privacy Policy"
      >
        <PrivacyPolicyContent />
      </InfoModal>
      <InfoModal
        open={open === "terms"}
        onClose={() => setOpen(null)}
        title="Terms of Service"
      >
        <TermsOfServiceContent />
      </InfoModal>
      <InfoModal
        open={open === "attributions"}
        onClose={() => setOpen(null)}
        title="Attributions"
      >
        <AttributionsContent />
      </InfoModal>
    </>
  );
}

// Small button styled as a text link.
// Kept inline because it's not reused elsewhere and pulls header-specific styles.
function LegalLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-fg-muted underline-offset-2 hover:text-fg-default hover:underline focus:outline-none focus-visible:underline focus-visible:text-fg-default"
    >
      {children}
    </button>
  );
}
