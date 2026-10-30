export type ProviderErrorKind =
  | "auth"
  | "invalid-request"
  | "not-found"
  | "rate-limit"
  | "server"
  | "timeout"
  | "network"
  | "aborted"
  | "invalid-response"
  | "capability"
  | "config"
  | "budget"
  | "policy";

const RETRYABLE: ReadonlySet<ProviderErrorKind> = new Set(["rate-limit", "server", "timeout", "network"]);

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status?: number;
  /** Whether image data may have left the device before the failure. */
  readonly dataSent: boolean;
  /** How long the provider asked us to wait before trying again. */
  readonly retryAfterMs?: number;

  constructor(kind: ProviderErrorKind, message: string, opts: { status?: number; dataSent?: boolean; retryAfterMs?: number } = {}) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.status = opts.status;
    this.dataSent = opts.dataSent ?? false;
    this.retryAfterMs = opts.retryAfterMs;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }

  static fromStatus(status: number, body: string, dataSent: boolean): ProviderError {
    const detail = summarizeBody(body);
    // Gemini reports a bad key as 400 API_KEY_INVALID.
    if (status === 401 || status === 403 || (status === 400 && body.includes("API_KEY_INVALID"))) return new ProviderError("auth", `Authentication failed (${status}). Check the API key.`, { status, dataSent });
    if (status === 404) return new ProviderError("not-found", `Endpoint or model not found (404). ${detail}`, { status, dataSent });
    if (status === 408) return new ProviderError("timeout", "The provider timed out (408).", { status, dataSent });
    if (status === 429) {
      // Gemini says how long to wait: "retryDelay": "23s".
      const delay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
      return new ProviderError("rate-limit", `The provider's rate limit was reached (429). ${detail}`.trim(), { status, dataSent, retryAfterMs: delay ? Number(delay[1]) * 1000 : undefined });
    }
    if (status >= 500) return new ProviderError("server", `Provider error (${status}). ${detail}`, { status, dataSent });
    return new ProviderError("invalid-request", `Request rejected (${status}). ${detail}`, { status, dataSent });
  }
}

/** Short, secret-free excerpt of an error body for display. */
function summarizeBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const msg = typeof parsed.error === "string" ? parsed.error : parsed.error?.message ?? parsed.message;
    if (msg) return msg.slice(0, 200);
  } catch {
    /* not JSON */
  }
  return body.slice(0, 120);
}

export function toProviderError(err: unknown, dataSent = false): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Error && err.name === "AbortError") return new ProviderError("aborted", "Request cancelled.", { dataSent });
  if (err instanceof Error && err.name === "TimeoutError") return new ProviderError("timeout", "Request timed out.", { dataSent });
  const message = err instanceof Error ? err.message : String(err);
  return new ProviderError("network", `Network error: ${message}`, { dataSent });
}
