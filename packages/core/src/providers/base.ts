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
  const parsed = ModelOutputSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProviderError("invalid-response", `Model response failed validation at "${issue?.path.join(".") || "root"}": ${issue?.message}`, {
      dataSent: true,
    });
  }
  return parsed.data;
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
