import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../http-client";
import { createLogger } from "../logger";
import type { NewsArticle } from "../../../shared/news";

// Google News RSS collector.
// Pulls a hantavirus-keyed search feed, parses the RSS XML, and emits a
// deduped + sorted list of NewsArticles for the home page ticker.

const log = createLogger("scraper.news.google");

// Search-feed URL. Multiple terms ORed so we catch ANDV mentions even when
// "hantavirus" isn't in the headline.
const FEED_URL =
  "https://news.google.com/rss/search?q=hantavirus+OR+%22Andes+virus%22+OR+%22hantavirus+pulmonary+syndrome%22&hl=en-US&gl=US&ceid=US:en";

// Just the RSS subset we read. Title/link/source may be either a plain string
// or an object with a `#text` field depending on the publisher.
interface RssItem {
  title?: string | { "#text"?: string };
  link?: string | { "#text"?: string };
  pubDate?: string;
  source?: string | { "#text"?: string; "@_url"?: string };
  guid?: string | { "#text"?: string };
}
interface RssParsed {
  rss?: { channel?: { item?: RssItem | RssItem[] } };
}

// Configure fast-xml-parser to keep strings as strings (no numeric coercion)
// and surface attributes with `@_` prefix so they don't collide with elements.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

// Normalize the string-or-object shape into a plain trimmed string.
function readText(value: RssItem["title"] | RssItem["link"] | RssItem["source"]): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && "#text" in value && typeof value["#text"] === "string") {
    return value["#text"].trim();
  }
  return "";
}

// Google News appends " - Publisher" to most titles — strip it so the ticker
// doesn't double up since we render the publisher name separately.
function stripPublisherSuffix(title: string, publisher: string): string {
  if (!publisher) return title;
  const suffix = ` - ${publisher}`;
  if (title.endsWith(suffix)) return title.slice(0, -suffix.length).trim();
  return title;
}

// Stable id derived from the article URL. Same article URL → same id so the
// store's merge keeps a single entry per article across runs.
function idFor(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

// Parse pubDate to an ISO string. Returns null on parse failure so the caller
// can fall back to the fetch timestamp.
function parsePubDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function collectGoogleNews(): Promise<NewsArticle[]> {
  let xml: string;
  try {
    xml = await fetchText(FEED_URL, { sourceName: "GoogleNews" });
  } catch (err) {
    // Network failure → empty list; the merge step will preserve whatever's
    // already on disk.
    log.warn(`Google News fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }

  const parsed = parser.parse(xml) as RssParsed;
  const items = parsed.rss?.channel?.item;
  if (!items) return [];
  // Normalize to an array — fast-xml-parser collapses single-item arrays.
  const list = Array.isArray(items) ? items : [items];
  const fetchedAt = new Date().toISOString();

  const articles: NewsArticle[] = [];
  // De-duplicate within this batch in case Google's feed contains repeats.
  const seenUrls = new Set<string>();
  for (const item of list) {
    const link = readText(item.link);
    if (!link || seenUrls.has(link)) continue;
    seenUrls.add(link);

    const publisher = readText(item.source);
    const rawTitle = readText(item.title);
    const title = stripPublisherSuffix(rawTitle, publisher);
    if (!title) continue;

    const publishedAt = parsePubDate(item.pubDate) ?? fetchedAt;

    articles.push({
      id: idFor(link),
      title,
      url: link,
      source: publisher || "Unknown",
      publishedAt,
      fetchedAt,
    });
  }

  // Newest first — the ticker scrolls left-to-right starting from the most recent.
  articles.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  log.info(`Google News: ${articles.length} articles parsed`);
  return articles;
}
