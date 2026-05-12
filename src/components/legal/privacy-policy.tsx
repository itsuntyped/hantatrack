// Privacy Policy modal content.
// Keep this text precise — any change to data handling must reflect here.

const LAST_UPDATED = "12 May 2026";

export function PrivacyPolicyContent() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-muted">Last updated: {LAST_UPDATED}</p>

      <Section title="What we collect">
        <p>
          <strong>Nothing personal.</strong> HantaTrack does not collect, log, or store any
          personal data about visitors — no IP addresses, no identifiers, no profiles.
        </p>
        <p>
          Like any web service, our server sees the IP address of incoming connections at the
          network layer so it can return a response. It is never written to logs, never
          persisted, and never associated with any other data.
        </p>
      </Section>

      <Section title="What we do not do">
        <ul className="ml-5 list-disc space-y-1">
          <li>We do not set cookies.</li>
          <li>We do not run analytics or telemetry.</li>
          <li>We do not have user accounts, sign-ups, or sign-ins.</li>
          <li>We do not log or retain IP addresses.</li>
          <li>We do not sell, rent, or share any data.</li>
          <li>We do not embed third-party advertising or tracking scripts.</li>
        </ul>
      </Section>

      <Section title="Third parties">
        <p>When you load HantaTrack, your browser also fetches:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            Map tiles from OpenStreetMap / CartoDB. They receive your IP as part of the normal
            HTTP request. We do not share data with them beyond that.
          </li>
        </ul>
        <p className="mt-2">
          Server-side, our scraper interacts with the following services (without sending any
          information about you):
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>OpenStreetMap Nominatim</strong> — to translate coordinates and place names.
          </li>
          <li>
            <strong>OpenAI API</strong> — to extract structured fields from public health
            bulletins.
          </li>
          <li>
            <strong>Google News RSS</strong> — to populate the news ticker.
          </li>
        </ul>
      </Section>

      <Section title="Changes">
        <p>
          We will update this page when this policy changes and note the new date at the top.
        </p>
      </Section>
    </div>
  );
}

// Local Section helper — kept private to this file (terms-of-service.tsx has its own).
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-fg-default">{title}</h3>
      <div className="space-y-2 text-fg-default">{children}</div>
    </section>
  );
}
