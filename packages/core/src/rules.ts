import { CATEGORY_IDS, type CategoryId } from "./categories";
import type { RulesProfile } from "./schemas";

export const DEFAULT_RULES: RulesProfile = {
  id: "default-5",
  name: "SORTÉ default (5 streams)",
  enabled: Object.fromEntries(CATEGORY_IDS.map((c) => [c, true])) as Record<CategoryId, boolean>,
  redirects: {},
  exceptionPolicy: "review",
  notes: "Generic default. Check your municipality's rules — collection systems differ between regions.",
};

export type RuleResolution =
  | { kind: "assign"; category: CategoryId; note?: string }
  | { kind: "review"; reason: string };

/** Map a model's stream to the stream actually collected under the local rules. */
export function resolveCategory(category: CategoryId | "unknown", rules: RulesProfile): RuleResolution {
  if (category === "unknown") {
    return rules.exceptionPolicy === "residual"
      ? { kind: "assign", category: "residual", note: "Unrecognised item routed to residual by local exception policy." }
      : { kind: "review", reason: "The model could not place this item in a supported stream." };
  }
  if (rules.enabled[category] !== false) return { kind: "assign", category };
  const redirect = rules.redirects[category];
  if (redirect && redirect !== "review" && rules.enabled[redirect] !== false) {
    return { kind: "assign", category: redirect, note: `Local rules redirect ${category} to ${redirect}.` };
  }
  return { kind: "review", reason: `The ${category} stream is not collected under "${rules.name}".` };
}
