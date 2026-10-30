import { CATEGORY_IDS } from "./categories";
import { FLAG_IDS } from "./schemas";

/** Bump whenever the prompt or schema changes — it is part of the cache key. */
export const PROMPT_VERSION = "2026-10-30.1";

export const SYSTEM_PROMPT = [
  "You classify a single waste item in a photo into one disposal stream.",
  `Streams: paper (paper & cardboard), plastic-metal (plastic packaging & metal containers), glass (glass packaging), organic (food scraps), residual (non-recyclable).`,
  `Use "unknown" if the item is unclear, not waste, or fits no stream. Never guess to be helpful.`,
  `Set flags: hazardous (batteries, chemicals, sharps, aerosols), electronic, contaminated (heavily soiled), multi-material, poor-image, not-waste.`,
  "confidence is your probability (0-1) that the stream is correct. Keep material to a few words and reasoning to one short sentence about visible evidence.",
  "Respond only with JSON matching the schema.",
].join("\n");

export const USER_PROMPT = "Classify the item in this image.";

/** JSON Schema of ModelOutputSchema, for providers that accept one. Strict-mode compatible. */
export const OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["category", "confidence", "flags", "material", "reasoning", "warnings"],
  properties: {
    category: { type: "string", enum: [...CATEGORY_IDS, "unknown"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    flags: { type: "array", items: { type: "string", enum: [...FLAG_IDS] } },
    material: { type: "string", description: "Short material description, e.g. 'clear PET bottle'." },
    reasoning: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

/**
 * Extract a JSON object from model text. Handles code fences and leading prose,
 * which some models emit when structured output is not enforced.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("No JSON object in model response.");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}
