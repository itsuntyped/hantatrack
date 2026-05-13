import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { config } from "../config";
import { createLogger } from "../logger";
import type { RawCaseInput } from "../parser";
import { VALID_STATUSES } from "../../../shared/case";
import { filterAiCases } from "./plausibility";

// AI extraction. Public-health bulletins are written in prose, not tables —
// we use a structured-output LLM call (via LangChain) to lift case rows out
// of the text. The schema below is enforced by OpenAI's structured output mode
// so we get JSON in the exact shape we expect.

const log = createLogger("scraper.ai");

// Per-case schema. `.describe()` strings become field-level instructions to
// the model — keep them precise and short.
const aiCaseSchema = z.object({
  location_name: z.string().describe("Human-readable place (e.g. 'Ushuaia, Argentina')"),
  status: z.enum(VALID_STATUSES).describe("Case status"),
  date_reported: z.string().describe("ISO 8601 date (YYYY-MM-DD)"),
  latitude: z.number().nullable().describe("Latitude if the source gives it; otherwise null"),
  longitude: z.number().nullable().describe("Longitude if the source gives it; otherwise null"),
  virus_strain: z.string().describe("Strain name; 'Unknown' if not stated"),
  notes: z.string().describe("Source citation and any extra context; empty string if none"),
});

// Wrapper so the model returns an array under a known key — easier to reason
// about than a bare-array response.
const aiResponseSchema = z.object({
  cases: z
    .array(aiCaseSchema)
    .describe("All hantavirus cases mentioned in the text. Empty array if none."),
});

export type AiExtractedCase = z.infer<typeof aiCaseSchema>;

// System prompt. Bullet rules so the model can point at a specific rule on
// every emit decision. The rules are also enforced by `filterAiCases` after
// the call — the model is asked to refuse, and the code refuses too, so a
// drifty model still cannot inject bad rows.
const PROMPT = [
  "You extract structured hantavirus case data from public health reports and news articles.",
  "",
  "Strict rules — violations cause the case to be discarded downstream:",
  "- ONLY emit cases that the source text explicitly describes. Never invent, infer, or expand counts. If unsure, omit.",
  "- One entry per distinct (location, status) pair. Combine identical cases at the same place and status into one entry and mention the count in `notes`.",
  "- `status` must be exactly one of: Confirmed, Probable, Suspected, Deceased, Monitoring.",
  "- `date_reported` is the date the source itself dates the case (ISO 8601, YYYY-MM-DD). Use the first day of the month/year if only that is given.",
  "- `location_name` MUST be specific enough to geocode unambiguously. Use 'City, Country' or 'Region, Country'. A standalone country or well-known territory name is acceptable. NEVER use an ocean, sea, gulf, bay, strait, continent, hemisphere, or compass direction (e.g. 'South Atlantic', 'Caribbean', 'Europe') as the location_name.",
  "- Latitude/longitude: ONLY include them when the source itself states explicit numeric coordinates for that case. Leave them null otherwise — downstream geocoding will resolve them from `location_name`.",
  "- `notes` MUST contain a concrete source citation (bulletin id, headline, paragraph reference, or organization+date) AND any extra context the source provides. A notes value that is just the source name, empty, or under ~15 characters is invalid — OMIT the case entirely rather than emit one with weak notes.",
  "- If the text contains no hantavirus cases at all, return an empty `cases` array. An empty array is always a valid response.",
].join("\n");

export interface ExtractContext {
  sourceName: string;
  retrievedAt: string;
}

// AI is optional. Without an API key the extractor silently no-ops so the
// rest of the scrape pipeline keeps working.
export function isAiAvailable(): boolean {
  return Boolean(config.OPENAI_API_KEY && config.OPENAI_API_KEY.length > 0);
}

// Reuse one ChatOpenAI client across calls — building it is cheap but the
// underlying connections benefit from being kept open.
let cachedModel: ReturnType<typeof buildModel> | null = null;

// temperature: 0 because we want deterministic extraction, not creativity.
function buildModel() {
  return new ChatOpenAI({
    apiKey: config.OPENAI_API_KEY,
    model: config.OPENAI_MODEL,
    temperature: 0,
    timeout: config.OPENAI_TIMEOUT_MS,
  }).withStructuredOutput(aiResponseSchema, { name: "extractCases" });
}

function getModel() {
  if (!cachedModel) cachedModel = buildModel();
  return cachedModel;
}

// Run the model against a single document and return a list of RawCaseInput
// rows ready to hand to the parser.
export async function extractCasesFromText(
  text: string,
  ctx: ExtractContext,
): Promise<RawCaseInput[]> {
  if (!isAiAvailable()) {
    log.debug(`[${ctx.sourceName}] OPENAI_API_KEY not set; skipping AI extraction.`);
    return [];
  }
  // Hard cap on input length — keeps token cost predictable and protects
  // against pathological pages.
  const trimmed = text.trim().slice(0, 20_000);
  if (trimmed.length === 0) return [];

  try {
    const model = getModel();
    const response = await model.invoke([
      { role: "system", content: PROMPT },
      // Context block helps the model produce accurate citations in `notes`.
      {
        role: "user",
        content: `Source: ${ctx.sourceName}\nRetrieved at: ${ctx.retrievedAt}\n\n---\n${trimmed}\n---`,
      },
    ]);

    log.info(`[${ctx.sourceName}] AI extracted ${response.cases.length} candidate cases.`);
    // Plausibility filter. Drops rows that fail the prompt's own rules
    // (vague location, missing citation, etc.) — the model occasionally
    // returns well-formed but hallucinated cases despite the rules.
    const plausible = filterAiCases(response.cases, ctx.sourceName);
    return plausible.map((c) => ({
      location_name: c.location_name,
      status: c.status,
      date_reported: c.date_reported,
      // Normalize null -> undefined so the parser's "missing" branch fires.
      latitude: c.latitude ?? undefined,
      longitude: c.longitude ?? undefined,
      virus_strain: c.virus_strain,
      notes: c.notes,
    }));
  } catch (err) {
    // AI failure is non-fatal — log and return empty so the source can keep going.
    log.warn(
      `[${ctx.sourceName}] AI extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}
