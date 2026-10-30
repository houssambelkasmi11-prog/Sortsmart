import type { ModelOutput, ProviderConfig, ProviderKind } from "../schemas";
import type { HttpTransport } from "../transport";

export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMime = (typeof ACCEPTED_MIME)[number];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface ImageInput {
  mimeType: ImageMime;
  /** Base64 without a data: prefix. Already resized by the caller. */
  base64: string;
  sizeBytes: number;
  sha256: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  /** null = could not be determined; never assumed. */
  imageInput: boolean | null;
  sizeBytes?: number;
  details?: string;
}

export interface ProviderCapabilities {
  imageInput: boolean | null;
  structuredOutput: boolean;
  cancellation: boolean;
}

export type ConnectionTestResult =
  | { ok: true; message: string; modelCount: number; latencyMs: number }
  | { ok: false; message: string; kind: string; latencyMs: number };

export interface ProviderClassifyOutput {
  output: ModelOutput;
  model: string;
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly kind: ProviderKind;
  readonly location: "local" | "cloud" | "demo";
  readonly config: ProviderConfig;
  capabilities(model?: string): Promise<ProviderCapabilities>;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  testConnection(signal?: AbortSignal): Promise<ConnectionTestResult>;
  /** Returns the validated model output. Throws ProviderError on any failure. */
  classify(input: ImageInput, signal?: AbortSignal): Promise<ProviderClassifyOutput>;
}

export interface ProviderFactoryContext {
  transport: HttpTransport;
}
