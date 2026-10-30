import { ProviderError, toProviderError } from "./errors";
import { isLoopbackHost } from "./security";

/**
 * Reference to a secret held outside JavaScript (the OS keychain, via the
 * desktop backend). The transport — never the caller — attaches the value.
 */
export interface SecretRef {
  providerId: string;
  header: "authorization" | "x-api-key" | "x-goog-api-key";
  scheme: "bearer" | "raw";
}

export interface HttpRequest {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  auth?: SecretRef;
}

export interface HttpResponse {
  status: number;
  body: string;
}

export interface HttpTransport {
  readonly name: string;
  /** Whether this transport can attach stored secrets. */
  readonly supportsSecrets: boolean;
  request(req: HttpRequest, signal?: AbortSignal): Promise<HttpResponse>;
}

/**
 * Plain fetch transport for the browser / dev mode. It refuses authenticated
 * requests: secrets only exist in the desktop backend. It only talks to
 * loopback hosts so a web build can never be used to proxy cloud keys.
 */
export function createFetchTransport(fetchImpl: typeof fetch = fetch): HttpTransport {
  return {
    name: "fetch",
    supportsSecrets: false,
    async request(req, signal) {
      if (req.auth) throw new ProviderError("config", "API keys are only available in SORTÉ Desktop (OS keychain).");
      const host = new URL(req.url).hostname;
      if (!isLoopbackHost(host)) throw new ProviderError("config", "The browser build only connects to local (localhost) endpoints.");
      const timeout = AbortSignal.timeout(req.timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      try {
        const res = await fetchImpl(req.url, { method: req.method, headers: req.headers, body: req.body, signal: combined });
        return { status: res.status, body: await res.text() };
      } catch (err) {
        if (timeout.aborted && !signal?.aborted) throw new ProviderError("timeout", `No response within ${req.timeoutMs} ms.`);
        throw toProviderError(err);
      }
    },
  };
}
