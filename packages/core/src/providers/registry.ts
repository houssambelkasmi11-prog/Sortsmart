import { ProviderError } from "../errors";
import type { ProviderConfig, ProviderKind } from "../schemas";
import { validateEndpoint } from "../security";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { MockProvider } from "./mock";
import { OllamaProvider } from "./ollama";
import { OpenAICompatibleProvider } from "./openaiCompatible";
import type { AIProvider, ProviderFactoryContext } from "./types";

export interface ProviderPreset {
  kind: ProviderKind;
  label: string;
  location: "local" | "cloud";
  defaultEndpoint: string;
  requiresKey: boolean;
  /** User must declare capabilities (they can't be probed). */
  declareCapabilities: boolean;
  setupHint: string;
  defaults?: Partial<ProviderConfig>;
}

/** Adapter registry. UI components read from here instead of hardcoding provider logic. */
export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  ollama: {
    kind: "ollama",
    label: "Ollama",
    location: "local",
    defaultEndpoint: "http://127.0.0.1:11434",
    requiresKey: false,
    declareCapabilities: false,
    setupHint: "Install Ollama, then pull a vision model, e.g. `ollama pull <vision-model>`. SORTÉ checks the model's vision capability before use.",
  },
  "openai-compatible-local": {
    kind: "openai-compatible",
    label: "OpenAI-compatible (local server)",
    location: "local",
    defaultEndpoint: "http://127.0.0.1:1234/v1",
    requiresKey: false,
    declareCapabilities: true,
    setupHint: "For LM Studio, llama.cpp server or vLLM running on this machine. Declare image and JSON-schema support only if your loaded model has them.",
  },
  openai: {
    kind: "openai-compatible",
    label: "OpenAI",
    location: "cloud",
    defaultEndpoint: "https://api.openai.com/v1",
    requiresKey: true,
    declareCapabilities: true,
    setupHint: "Create an API key at platform.openai.com. Pick a model with vision support and enable image input.",
    defaults: { declaredImageInput: true, declaredStructuredOutput: true },
  },
  anthropic: {
    kind: "anthropic",
    label: "Anthropic",
    location: "cloud",
    defaultEndpoint: "https://api.anthropic.com",
    requiresKey: true,
    declareCapabilities: false,
    setupHint: "Create an API key at console.anthropic.com. Models are listed from your account.",
    defaults: { declaredImageInput: true, declaredStructuredOutput: true },
  },
  gemini: {
    kind: "gemini",
    label: "Google Gemini",
    location: "cloud",
    defaultEndpoint: "https://generativelanguage.googleapis.com",
    requiresKey: true,
    declareCapabilities: false,
    setupHint: "Create an API key in Google AI Studio. Models are listed from your account; pick a multimodal one.",
    defaults: { declaredImageInput: true, declaredStructuredOutput: true },
  },
  deepseek: {
    kind: "openai-compatible",
    label: "DeepSeek",
    location: "cloud",
    defaultEndpoint: "https://api.deepseek.com/v1",
    requiresKey: true,
    declareCapabilities: true,
    setupHint:
      "Create an API key at platform.deepseek.com. At the time of writing, DeepSeek's API models don't accept images, so photo classification stays off unless you select a model that does and enable image input.",
    defaults: { declaredImageInput: false, declaredStructuredOutput: false },
  },
};

export function createProvider(config: ProviderConfig, ctx: ProviderFactoryContext): AIProvider {
  if (config.kind === "mock") return new MockProvider(config);
  const check = validateEndpoint(config.endpoint, config.location);
  if (!check.ok) throw new ProviderError("config", `${config.name}: ${check.reason}`);
  switch (config.kind) {
    case "ollama":
      return new OllamaProvider(config, ctx.transport);
    case "openai-compatible":
      return new OpenAICompatibleProvider(config, ctx.transport);
    case "anthropic":
      return new AnthropicProvider(config, ctx.transport);
    case "gemini":
      return new GeminiProvider(config, ctx.transport);
  }
}
