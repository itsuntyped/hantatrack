// Privacy Policy modal content.
// Keep this text precise — any change to data handling must reflect here.

const LAST_UPDATED = "12 May 2026";

export function PrivacyPolicyContent() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-muted">Last updated: {LAST_UPDATED}</p>

      <Section title="What we collect">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>IP addresses</strong>, used for security logging and per-IP rate limiting on
            our API endpoints. Retained no longer than 30 days.
          </li>
        </ul>
        <p>That is the only personal data we process.</p>
      </Section>

      <Section title="What we do not do">
        <ul className="ml-5 list-disc space-y-1">
          <li>We do not set cookies.</li>
          <li>We do not run analytics or telemetry.</li>
          <li>We do not have user accounts, sign-ups, or sign-ins.</li>
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

      <Section title="Your rights">
        <p>
          If you are in the EU, UK, or California, you have the right to access, correct, or
          delete personal data we hold about you. Since the only personal data we hold is
          short-lived IP logs, a deletion request is typically satisfied within hours. Email{" "}
          <a className="text-brand-400 hover:underline" href="mailto:hantatrack@pathvoid.com">
            hantatrack@pathvoid.com
          </a>
          .
        </p>
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
