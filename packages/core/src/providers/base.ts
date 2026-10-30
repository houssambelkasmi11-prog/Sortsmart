import { ProviderError, toProviderError } from "../errors";
import { extractJson } from "../prompt";
import { ModelOutputSchema, type ModelOutput, type ProviderConfig } from "../schemas";
import type { HttpRequest, HttpTransport } from "../transport";
import type { ConnectionTestResult, ModelInfo } from "./types";

/** Send a request and return parsed JSON, mapping HTTP failures to ProviderError. */
export async function requestJson<T = unknown>(
  transport: HttpTransport,
  req: HttpRequest,
  signal: AbortSignal | undefined,
  dataSent: boolean,
): Promise<T> {
  let res;
  try {
    res = await transport.request(req, signal);
  } catch (err) {
    throw toProviderError(err, dataSent);
  }
  if (res.status < 200 || res.status >= 300) throw ProviderError.fromStatus(res.status, res.body, dataSent);
  try {
    return JSON.parse(res.body) as T;
  } catch {
    throw new ProviderError("invalid-response", "Provider returned a non-JSON response.", { dataSent });
  }
}

/** Validate raw model output (object or JSON text) against the strict schema. */
export function parseModelOutput(raw: unknown): ModelOutput {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = extractJson(raw);
    } catch (err) {
      throw new ProviderError("invalid-response", `Model did not return JSON: ${(err as Error).message}`, { dataSent: true });
    }
  }
  const parsed = ModelOutputSchema.safeParse(tidyOutput(value));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProviderError("invalid-response", `Model response failed validation at "${issue?.path.join(".") || "root"}": ${issue?.message}`, {
      dataSent: true,
    });
  }
  return parsed.data;
}

/**
 * Evens out harmless differences between models, so a usable answer isn't thrown
 * away over formatting. The category and flags still have to be valid values.
 */
function tidyOutput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const o = { ...(value as Record<string, unknown>) };
  if (typeof o.category === "string") o.category = o.category.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (typeof o.confidence === "string") o.confidence = Number(o.confidence.replace("%", ""));
  // Some models answer 85 instead of 0.85. Something like 1.7 is just wrong, and stays rejected.
  if (typeof o.confidence === "number" && o.confidence >= 2 && o.confidence <= 100) o.confidence /= 100;
  if (typeof o.material === "string") o.material = o.material.trim().slice(0, 200) || "Unspecified";
  if (typeof o.reasoning === "string") o.reasoning = o.reasoning.slice(0, 1000);
  if (o.reasoning === undefined || o.reasoning === null) o.reasoning = "";
  if (o.flags === null) o.flags = [];
  if (o.warnings === null) o.warnings = [];
  if (Array.isArray(o.warnings)) o.warnings = o.warnings.filter((w) => typeof w === "string").slice(0, 10).map((w: string) => w.slice(0, 300));
  return o;
}

export function requireModel(config: ProviderConfig): string {
  if (!config.model) throw new ProviderError("config", `Select a model for ${config.name} first.`);
  return config.model;
}

export async function testViaListModels(
  list: () => Promise<ModelInfo[]>,
  now: () => number = () => performance.now(),
): Promise<ConnectionTestResult> {
  const start = now();
  try {
    const models = await list();
    return { ok: true, message: `Connected. ${models.length} model${models.length === 1 ? "" : "s"} available.`, modelCount: models.length, latencyMs: now() - start };
  } catch (err) {
    const e = toProviderError(err);
    return { ok: false, message: e.message, kind: e.kind, latencyMs: now() - start };
  }
}
