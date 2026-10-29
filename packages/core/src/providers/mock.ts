import { ProviderError } from "../errors";
import type { ModelOutput, ProviderConfig } from "../schemas";
import type { AIProvider, ImageInput, ModelInfo, ProviderCapabilities } from "./types";

export const MOCK_PROVIDER_ID = "demo";
export const MOCK_MODEL = "sorte-demo-deterministic";

/**
 * Deterministic scenarios. These are fixtures for development and demos —
 * results come from the image hash, not from looking at the image.
 */
export const MOCK_SCENARIOS: readonly (ModelOutput & { label: string })[] = [
  { label: "Clear glass jar", category: "glass", confidence: 0.94, material: "clear glass jar", reasoning: "Demo fixture: transparent rigid container with a screw thread.", flags: [], warnings: [] },
  { label: "Cardboard box", category: "paper", confidence: 0.91, material: "corrugated cardboard", reasoning: "Demo fixture: fluted brown fibreboard.", flags: [], warnings: [] },
  { label: "Aluminium can", category: "plastic-metal", confidence: 0.88, material: "aluminium beverage can", reasoning: "Demo fixture: thin-walled metal can.", flags: [], warnings: [] },
  { label: "Banana peel", category: "organic", confidence: 0.96, material: "fruit peel", reasoning: "Demo fixture: soft organic matter.", flags: [], warnings: [] },
  { label: "Crisp packet", category: "residual", confidence: 0.82, material: "metallised multi-layer film", reasoning: "Demo fixture: laminated film, not separable.", flags: ["multi-material"], warnings: [] },
  { label: "Ambiguous tub", category: "plastic-metal", confidence: 0.52, material: "possibly plastic tub", reasoning: "Demo fixture: low-confidence case to exercise review.", flags: [], warnings: ["Material unclear"] },
  { label: "AA battery", category: "unknown", confidence: 0.9, material: "alkaline battery", reasoning: "Demo fixture: hazardous item outside supported streams.", flags: ["hazardous", "electronic"], warnings: ["Take batteries to a dedicated collection point."] },
  { label: "Greasy pizza box", category: "paper", confidence: 0.7, material: "soiled cardboard", reasoning: "Demo fixture: fibreboard with visible grease.", flags: ["contaminated"], warnings: [] },
];

function scenarioIndex(sha256: string): number {
  return parseInt(sha256.slice(0, 8), 16) % MOCK_SCENARIOS.length;
}

export function mockScenarioFor(sha256: string) {
  return MOCK_SCENARIOS[scenarioIndex(sha256)]!;
}

export function createMockConfig(): ProviderConfig {
  return {
    id: MOCK_PROVIDER_ID,
    kind: "mock",
    name: "Demo (simulated)",
    endpoint: "mock://local",
    location: "local",
    model: MOCK_MODEL,
    timeoutMs: 10_000,
    declaredImageInput: true,
    declaredStructuredOutput: true,
    keyHint: null,
  };
}

export class MockProvider implements AIProvider {
  readonly kind = "mock" as const;
  readonly location = "demo" as const;
  readonly config: ProviderConfig;
  /** Override for tests; otherwise derived from the image hash. */
  forceScenario: number | null = null;
  failWith: ProviderError | null = null;

  constructor(
    config: ProviderConfig = createMockConfig(),
    private delayMs = 450,
  ) {
    this.config = config;
  }

  get id() {
    return this.config.id;
  }
  get name() {
    return this.config.name;
  }

  async capabilities(): Promise<ProviderCapabilities> {
    return { imageInput: true, structuredOutput: true, cancellation: true };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: MOCK_MODEL, name: "Deterministic demo fixtures", imageInput: true }];
  }

  async testConnection() {
    return { ok: true as const, message: "Demo provider ready. Results are simulated.", modelCount: 1, latencyMs: 0 };
  }

  async classify(input: ImageInput, signal?: AbortSignal) {
    await abortableDelay(this.delayMs, signal);
    if (this.failWith) throw this.failWith;
    const s = this.forceScenario !== null ? MOCK_SCENARIOS[this.forceScenario]! : mockScenarioFor(input.sha256);
    const { label: _label, ...output } = s;
    return { output, model: MOCK_MODEL };
  }
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ProviderError("aborted", "Request cancelled."));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new ProviderError("aborted", "Request cancelled."));
    }, { once: true });
  });
}
