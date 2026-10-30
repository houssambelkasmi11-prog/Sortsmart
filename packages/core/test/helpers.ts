import type { HttpRequest, HttpResponse, HttpTransport, ImageInput, ProviderConfig } from "../src";

type Handler = (req: HttpRequest) => HttpResponse | Promise<HttpResponse>;

/** Records requests and answers from a route table: "METHOD path-suffix" → handler. */
export function fakeTransport(routes: Record<string, Handler>, supportsSecrets = true) {
  const calls: HttpRequest[] = [];
  const transport: HttpTransport = {
    name: "fake",
    supportsSecrets,
    async request(req, signal) {
      calls.push(req);
      if (signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      const path = new URL(req.url).pathname;
      const entry = Object.entries(routes).find(([k]) => {
        const [m, p] = k.split(" ");
        return m === req.method && path.endsWith(p!);
      });
      if (!entry) return { status: 404, body: JSON.stringify({ error: { message: `no route ${req.method} ${path}` } }) };
      return entry[1](req);
    },
  };
  return { transport, calls };
}

export const json = (status: number, body: unknown): HttpResponse => ({ status, body: JSON.stringify(body) });

export const image: ImageInput = { mimeType: "image/jpeg", base64: "AAAA", sizeBytes: 3, sha256: "00000000aabbccdd" };

export const validOutput = { category: "glass", confidence: 0.93, material: "clear glass jar", reasoning: "Transparent jar.", flags: [], warnings: [] };

export function config(over: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: "p1",
    kind: "ollama",
    name: "Test",
    endpoint: "http://127.0.0.1:11434",
    location: "local",
    model: "m",
    timeoutMs: 10_000,
    declaredImageInput: false,
    declaredStructuredOutput: false,
    keyHint: null,
    ...over,
  };
}
