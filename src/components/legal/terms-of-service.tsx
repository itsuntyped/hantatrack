// Terms of Service modal content.
// Bump LAST_UPDATED whenever the text changes so users can see when terms shifted.

const LAST_UPDATED = "12 May 2026";

export function TermsOfServiceContent() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-muted">Last updated: {LAST_UPDATED}</p>

      <Section title="Acceptance">
        <p>
          By using HantaTrack you agree to these terms. If you do not agree, please do not use
          the site.
        </p>
      </Section>

      <Section title="What HantaTrack is">
        <p>
          An informational tool that aggregates publicly reported hantavirus case data. The site
          has no user accounts and is free to use.
        </p>
      </Section>

      <Section title="What HantaTrack is not">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Not medical advice.</strong> Do not use HantaTrack to make medical decisions.
            Consult a qualified healthcare professional and your local public health authority.
          </li>
          <li>Not affiliated with any health authority, government, or hospital.</li>
          <li>
            Not a guaranteed feed. Data may be incomplete, delayed, inaccurate, revised, or
            removed at any time.
          </li>
        </ul>
      </Section>

      <Section title="Use of the service">
        <p>
          You may use HantaTrack for personal, journalistic, educational, and research purposes.
          You must not:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Automate scraping or hammer the site beyond reasonable use.</li>
          <li>Reproduce content in a way that misrepresents the underlying source.</li>
          <li>Use the site in violation of any applicable law.</li>
        </ul>
      </Section>

      <Section title="Source content">
        <p>
          Every case displayed on HantaTrack carries a citation back to its originating source.
          When you follow a citation link, the linked publisher's own terms govern that content.
          We are not responsible for content on third-party sites.
        </p>
      </Section>

      <Section title="AI-generated content">
        <p>
          Some text on HantaTrack is generated with the help of large language models — for
          example, structured fields extracted from public bulletins. Such content is clearly
          labelled. We make a reasonable effort to verify accuracy but cannot guarantee it.
        </p>
      </Section>

      <Section title="No warranty">
        <p>
          HantaTrack is provided "as is", without any warranty of any kind, express or implied,
          including but not limited to merchantability, fitness for a particular purpose, or
          non-infringement.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the extent permitted by law, the operators of HantaTrack are not liable for any
          direct, indirect, incidental, consequential, special, or exemplary damages arising
          from your use of the site, including any decisions made in reliance on the information
          presented.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms. The current version is always shown here. Continued use
          after a change constitutes acceptance of the updated terms.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          <a className="text-brand-400 hover:underline" href="mailto:hantatrack@pathvoid.com">
            hantatrack@pathvoid.com
          </a>
        </p>
      </Section>
    </div>
  );
}

// Local layout helper to keep each ToS section visually consistent without
// pulling in a generic "Section" component (this one is intentionally
// scoped to this file).
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-fg-default">{title}</h3>
      <div className="space-y-2 text-fg-default">{children}</div>
    </section>
  );
}
