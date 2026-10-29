import { CATEGORY_IDS, type CategoryId } from "../categories";
import type { ClassificationResult } from "../schemas";
import type { SortCommand } from "./types";

export const DEFAULT_COMMAND_TIMEOUT_MS = 8_000;

export type CommandBuild = { ok: true; command: SortCommand } | { ok: false; reason: string };

/**
 * The only path from a classification to an actuator. An unvalidated or
 * review-pending AI result can never produce a command; a person must decide.
 */
export function buildSortCommand(
  result: ClassificationResult,
  opts: { userCategory?: CategoryId | null; confidenceThreshold: number; now?: Date; timeoutMs?: number },
): CommandBuild {
  const now = opts.now ?? new Date();
  let category: CategoryId | null;
  let decidedBy: SortCommand["decidedBy"];

  if (opts.userCategory) {
    category = opts.userCategory;
    decidedBy = "user";
  } else {
    if (result.requiresReview) return { ok: false, reason: "This result needs review. Confirm a stream before sorting." };
    if (result.category === null) return { ok: false, reason: "No stream assigned." };
    if (result.confidence < opts.confidenceThreshold) return { ok: false, reason: "Confidence below threshold." };
    if (result.flags.includes("hazardous") || result.flags.includes("electronic")) return { ok: false, reason: "Hazardous or electronic items are never routed automatically." };
    category = result.category;
    decidedBy = "model";
  }

  if (!isCategory(category)) return { ok: false, reason: `Unsupported category "${String(category)}".` };

  return {
    ok: true,
    command: {
      commandId: globalThis.crypto.randomUUID(),
      category,
      issuedAt: now.toISOString(),
      timeoutMs: opts.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      classificationId: result.id,
      decidedBy,
    },
  };
}

export function isCategory(value: unknown): value is CategoryId {
  return typeof value === "string" && (CATEGORY_IDS as readonly string[]).includes(value);
}

/** Validation a device adapter applies to every incoming command. */
export function validateCommand(cmd: SortCommand, now = new Date()): string | null {
  if (!isCategory(cmd.category)) return `Unsupported category "${String(cmd.category)}".`;
  if (!cmd.commandId || !cmd.classificationId) return "Command is missing identifiers.";
  if (!(cmd.timeoutMs > 0 && cmd.timeoutMs <= 60_000)) return "Command timeout must be between 1 ms and 60 s.";
  const issued = Date.parse(cmd.issuedAt);
  if (Number.isNaN(issued)) return "Invalid command timestamp.";
  if (now.getTime() - issued > cmd.timeoutMs) return "Command expired before execution.";
  return null;
}
