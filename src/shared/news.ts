// Shared shape for a single news article surfaced on the home page ticker
// and by the public /api/v1/news endpoint.

// One article as fetched, deduped, and stored by the scraper's news collector.
export interface NewsArticle {
  // Stable id used for dedup and as a React key.
  id: string;
  // Article headline as published by the source.
  title: string;
  // Canonical URL the user clicks through to read the full article.
  url: string;
  // Publisher name (e.g. "Reuters") — used for display attribution.
  source: string;
  // ISO timestamp the source published the article.
  publishedAt: string;
  // ISO timestamp we fetched/recorded the article (used for cache freshness).
  fetchedAt: string;
}
