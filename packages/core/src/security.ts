export type EndpointKind = "local" | "cloud";

export type EndpointCheck = { ok: true; url: URL } | { ok: false; reason: string };

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK.has(hostname) || hostname.endsWith(".localhost");
}

/**
 * Validate a user-supplied provider endpoint.
 * - Cloud endpoints must use HTTPS.
 * - Plain HTTP is only accepted for loopback hosts (local inference servers).
 * - Embedded credentials, query strings and fragments are rejected.
 */
export function validateEndpoint(raw: string, kind: EndpointKind): EndpointCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "Not a valid URL." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "Only http(s) endpoints are supported." };
  if (url.username || url.password) return { ok: false, reason: "Credentials must not be embedded in the URL." };
  if (url.search || url.hash) return { ok: false, reason: "Endpoint must not include a query string or fragment." };
  const loopback = isLoopbackHost(url.hostname);
  if (url.protocol === "http:" && !loopback) return { ok: false, reason: "Plain HTTP is only allowed for localhost. Use HTTPS." };
  if (kind === "cloud" && url.protocol !== "https:") return { ok: false, reason: "Cloud providers require HTTPS." };
  return { ok: true, url };
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

const SECRET_KEY = /(authorization|api[-_]?key|x-api-key|secret|token|password)/i;
const SECRET_VALUE = /\b(sk-[A-Za-z0-9_-]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})/g;

/** Deep-copy a value with anything secret-looking replaced. Use before logging. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof value === "string") return value.replace(SECRET_VALUE, "[redacted]");
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    return out;
  }
  return value;
}

/** Mask a hint such as the last 4 characters of a stored key. Never pass full keys here from storage. */
export function maskSecret(lastFour: string | null | undefined): string {
  return lastFour ? `••••••••${lastFour}` : "Not set";
}
