import type { NewsArticle } from "../../shared/news";
import { formatDateTime } from "../../lib/format-cases";

// Horizontal scrolling news strip pinned to the top of the page.
// Pure presentation — data fetching happens in the home page and SSR.

interface NewsTickerProps {
  articles: NewsArticle[];
}

export function NewsTicker({ articles }: NewsTickerProps) {
  // Render nothing when we have no news — avoids an empty bar at the top.
  if (articles.length === 0) return null;

  // Duplicate the list so the marquee can loop seamlessly: when the first copy
  // has scrolled fully out (translateX -50%), the second copy is right where
  // the first one started.
  const doubled = [...articles, ...articles];

  return (
    <div
      aria-label="Recent hantavirus news"
      className="group flex items-center gap-3 border-b border-bg-muted bg-bg-panel/95 px-3 py-1.5 text-xs text-fg-default backdrop-blur"
    >
      {/* "Latest" pill on the left, pulsing red dot to grab attention. */}
      <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-status-confirmed/15 px-2 py-0.5 font-semibold uppercase tracking-wide text-status-confirmed">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-confirmed" />
        Latest
      </span>
      {/* Marquee viewport. Animation defined in tailwind.config.ts; hover
          pauses via the `group-hover:` selector below so users can read items. */}
      <div className="flex-1 overflow-hidden">
        <div className="flex w-max animate-marquee gap-8 whitespace-nowrap group-hover:[animation-play-state:paused]">
          {doubled.map((article, idx) => (
            // Index suffix needed because we duplicate the list — ids alone collide.
            <a
              key={`${article.id}-${idx}`}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-baseline gap-2 hover:text-brand-300"
              title={`${article.title} — ${article.source}`}
            >
              <span className="font-semibold text-brand-400">{article.source}</span>
              <span className="text-fg-default">{article.title}</span>
              <span className="text-[11px] text-fg-subtle">
                {formatDateTime(article.publishedAt)}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
