import { ProviderError, toProviderError } from "./errors";
import { silentLogger, type Logger } from "./logger";
import { PROMPT_VERSION } from "./prompt";
import type { AIProvider, ImageInput } from "./providers/types";
import { resolveCategory } from "./rules";
import {
  ClassificationResultSchema,
  type ApplicationSettings,
  type ClassificationFlag,
  type ClassificationResult,
  type ModelOutput,
} from "./schemas";

export interface EngineDeps {
  getSettings(): ApplicationSettings;
  /** Resolve a configured provider id to an adapter instance (null if missing/invalid). */
  getProvider(id: string): AIProvider | null;
  logger?: Logger;
  now?: () => Date;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  maxRetries?: number;
  cacheSize?: number;
}

export interface Attempt {
  providerId: string;
  location: AIProvider["location"];
  ok: boolean;
  cacheHit: boolean;
  dataSent: boolean;
  error?: { kind: string; message: string };
}

export type ClassifyOutcome =
  | { ok: true; result: ClassificationResult; attempts: Attempt[] }
  | { ok: false; error: ProviderError; attempts: Attempt[]; dataSent: boolean };

/** Flags that always force human review, regardless of confidence. */
const REVIEW_FLAGS: Partial<Record<ClassificationFlag, string>> = {
  hazardous: "Possibly hazardous — needs dedicated collection, not a sorting stream.",
  electronic: "Electronic item — take to e-waste collection.",
  "poor-image": "Image quality too low for a reliable decision.",
  "not-waste": "This does not appear to be a waste item.",
  contaminated: "Item appears contaminated; local rules may require residual waste.",
};

const BACKOFF_BASE_MS = 600;
const BACKOFF_CAP_MS = 4_000;

/**
 * Provider-independent classification pipeline:
 * validate → select backend → infer → validate output → confidence & safety
 * checks → local rules → result (or explicit review).
 *
 * The engine never talks to devices. Routing is a separate, explicit step
 * (see device/command.ts) that only accepts results that passed review.
 */
export class ClassificationEngine {
  private cache = new Map<string, ClassificationResult>();
  private inflight = new Map<string, Promise<ClassifyOutcome>>();
  private cloudRequests = 0;
  private readonly logger: Logger;
  private readonly now: () => Date;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly maxRetries: number;
  private readonly cacheSize: number;

  constructor(private deps: EngineDeps) {
    this.logger = deps.logger ?? silentLogger;
    this.now = deps.now ?? (() => new Date());
    this.sleep = deps.sleep ?? defaultSleep;
    this.maxRetries = deps.maxRetries ?? 2;
    this.cacheSize = deps.cacheSize ?? 100;
  }

  get cloudRequestCount() {
    return this.cloudRequests;
  }

  resetSession() {
    this.cloudRequests = 0;
  }

  clearCache() {
    this.cache.clear();
  }

  /** Providers that would be tried, in order, under current settings. */
  plan(settings = this.deps.getSettings()): { providers: AIProvider[]; problems: string[] } {
    const problems: string[] = [];
    const get = (id: string | null, label: string) => {
      if (!id) {
        problems.push(`No ${label} provider selected.`);
        return null;
      }
      const p = this.deps.getProvider(id);
      if (!p) problems.push(`${label} provider "${id}" is not configured.`);
      return p;
    };
    switch (settings.mode) {
      case "demo": {
        const p = this.deps.getProvider("demo");
        return { providers: p ? [p] : [], problems: p ? [] : ["Demo provider unavailable."] };
      }
      case "local": {
        const p = get(settings.localProviderId, "local");
        if (p && p.location !== "local") return { providers: [], problems: ["Local mode requires a local provider."] };
        return { providers: p ? [p] : [], problems };
      }
      case "cloud": {
        const p = get(settings.cloudProviderId, "cloud");
        if (p && p.location !== "cloud") return { providers: [], problems: ["Cloud mode requires a cloud provider."] };
        return { providers: p ? [p] : [], problems };
      }
      case "hybrid": {
        const local = get(settings.localProviderId, "local");
        const providers = local ? [local] : [];
        if (settings.hybrid.cloudFallbackEnabled && settings.hybrid.disclosureAcknowledgedAt) {
          const cloud = get(settings.cloudProviderId, "cloud");
          if (cloud?.location === "cloud") providers.push(cloud);
        }
        return { providers, problems };
      }
    }
  }

  classify(input: ImageInput, signal?: AbortSignal): Promise<ClassifyOutcome> {
    const settings = this.deps.getSettings();
    const { providers } = this.plan(settings);
    const key = `${input.sha256}|${settings.mode}|${providers.map((p) => this.cacheKeyPart(p, settings)).join(",")}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const run = this.run(input, settings, signal).finally(() => this.inflight.delete(key));
    this.inflight.set(key, run);
    return run;
  }

  private cacheKeyPart(p: AIProvider, s: ApplicationSettings) {
    return [p.id, p.config.endpoint, p.config.model, PROMPT_VERSION, s.rules.id, JSON.stringify(s.rules), s.confidenceThreshold].join("~");
  }

  private async run(input: ImageInput, settings: ApplicationSettings, signal?: AbortSignal): Promise<ClassifyOutcome> {
    const { providers, problems } = this.plan(settings);
    const attempts: Attempt[] = [];
    if (providers.length === 0) {
      return { ok: false, error: new ProviderError("config", problems.join(" ") || "No provider configured."), attempts, dataSent: false };
    }

    let lastError: ProviderError | null = null;
    let lastResult: ClassificationResult | null = null;

    for (const [index, provider] of providers.entries()) {
      const isFallback = index > 0;
      const cacheKey = `${input.sha256}|${this.cacheKeyPart(provider, settings)}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        attempts.push({ providerId: provider.id, location: provider.location, ok: true, cacheHit: true, dataSent: false });
        const result = { ...cached, cacheHit: true };
        if (!this.shouldEscalate(result, providers, index)) return { ok: true, result, attempts };
        lastResult = result;
        continue;
      }

      try {
        if (provider.location === "cloud") this.chargeBudget(settings);
        if (isFallback) this.logger.log("info", "Escalating to cloud provider (hybrid mode, user-authorised).", { provider: provider.id });
        const started = this.now().getTime();
        const { output, model } = await this.withRetry(() => provider.classify(input, signal), signal);
        const result = this.finalize(output, provider, model, settings, this.now().getTime() - started);
        this.remember(cacheKey, result);
        attempts.push({ providerId: provider.id, location: provider.location, ok: true, cacheHit: false, dataSent: provider.location === "cloud" });
        if (!this.shouldEscalate(result, providers, index)) return { ok: true, result, attempts };
        lastResult = result;
      } catch (err) {
        const e = toProviderError(err, provider.location === "cloud");
        this.logger.log(e.kind === "aborted" ? "info" : "warn", `Classification via ${provider.id} failed: ${e.message}`, { kind: e.kind, status: e.status });
        attempts.push({ providerId: provider.id, location: provider.location, ok: false, cacheHit: false, dataSent: e.dataSent, error: { kind: e.kind, message: e.message } });
        lastError = e;
        if (e.kind === "aborted") break;
      }
    }

    const dataSent = attempts.some((a) => a.dataSent);
    if (lastResult) return { ok: true, result: lastResult, attempts };
    return { ok: false, error: lastError ?? new ProviderError("config", "No provider produced a result."), attempts, dataSent };
  }

  /** In hybrid mode, escalate only uncertain (not safety-flagged) local results. */
  private shouldEscalate(result: ClassificationResult, providers: AIProvider[], index: number) {
    if (index >= providers.length - 1) return false;
    if (!result.requiresReview) return false;
    return !result.flags.some((f) => f === "hazardous" || f === "electronic" || f === "not-waste");
  }

  private chargeBudget(settings: ApplicationSettings) {
    const max = settings.budget.maxCloudRequestsPerSession;
    if (this.cloudRequests >= max) {
      throw new ProviderError("budget", `Session cloud budget reached (${max} requests). Raise it in Settings or start a new session.`);
    }
    this.cloudRequests += 1;
  }

  private async withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const e = toProviderError(err);
        if (!e.retryable || attempt >= this.maxRetries || signal?.aborted) throw e;
        const delay = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt) * (0.75 + Math.random() * 0.5);
        this.logger.log("info", `Transient ${e.kind} error, retry ${attempt + 1}/${this.maxRetries} in ${Math.round(delay)} ms.`);
        await this.sleep(delay, signal);
      }
    }
  }

  private remember(key: string, result: ClassificationResult) {
    if (this.cache.size >= this.cacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, result);
  }

  private finalize(output: ModelOutput, provider: AIProvider, model: string, settings: ApplicationSettings, latencyMs: number): ClassificationResult {
    const reviewReasons: string[] = [];
    const warnings = [...output.warnings];
    for (const flag of output.flags) {
      const reason = REVIEW_FLAGS[flag];
      if (reason) reviewReasons.push(reason);
    }
    if (output.flags.includes("multi-material")) warnings.push("Multi-material item — check local rules.");

    let category: ClassificationResult["category"] = null;
    const resolution = resolveCategory(output.category, settings.rules);
    if (resolution.kind === "assign") {
      category = resolution.category;
      if (resolution.note) warnings.push(resolution.note);
    } else {
      reviewReasons.push(resolution.reason);
    }

    if (output.confidence < settings.confidenceThreshold) {
      reviewReasons.push(`Reported confidence ${(output.confidence * 100).toFixed(0)}% is below the ${(settings.confidenceThreshold * 100).toFixed(0)}% threshold.`);
    }

    const result: ClassificationResult = {
      id: globalThis.crypto.randomUUID(),
      category,
      confidence: output.confidence,
      material: output.material,
      reasoning: output.reasoning,
      requiresReview: reviewReasons.length > 0,
      reviewReasons,
      warnings,
      flags: output.flags,
      provider: provider.id,
      model,
      location: provider.location,
      inference: provider.kind === "mock" ? "mock" : "ai",
      promptVersion: PROMPT_VERSION,
      rulesProfile: settings.rules.id,
      timestamp: this.now().toISOString(),
      latencyMs: Math.max(0, Math.round(latencyMs)),
      cacheHit: false,
    };
    return ClassificationResultSchema.parse(result);
  }
}

function defaultSleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new ProviderError("aborted", "Request cancelled."));
    }, { once: true });
  });
}
