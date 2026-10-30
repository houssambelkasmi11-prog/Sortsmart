import { z } from "zod";
import { CATEGORY_IDS } from "./categories";

export const CategorySchema = z.enum(CATEGORY_IDS);

export const FLAG_IDS = ["hazardous", "electronic", "contaminated", "multi-material", "poor-image", "not-waste"] as const;
export const FlagSchema = z.enum(FLAG_IDS);
export type ClassificationFlag = z.infer<typeof FlagSchema>;

/**
 * What a model must return. Validated before anything reaches the UI or device layer.
 * `unknown` lets a model decline instead of guessing.
 */
export const ModelOutputSchema = z
  .object({
    category: z.enum([...CATEGORY_IDS, "unknown"]),
    confidence: z.number().min(0).max(1),
    material: z.string().trim().min(1).max(200),
    reasoning: z.string().trim().max(1000),
    flags: z.array(FlagSchema).max(FLAG_IDS.length).default([]),
    warnings: z.array(z.string().max(300)).max(10).default([]),
  })
  .strict();
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

export const InferenceLocationSchema = z.enum(["local", "cloud", "demo"]);
export type InferenceLocation = z.infer<typeof InferenceLocationSchema>;

export const ClassificationResultSchema = z.object({
  id: z.string(),
  /** null when the system declined to assign a stream (review required). */
  category: CategorySchema.nullable(),
  /** Model-reported, uncalibrated. */
  confidence: z.number().min(0).max(1),
  material: z.string(),
  reasoning: z.string(),
  requiresReview: z.boolean(),
  reviewReasons: z.array(z.string()),
  warnings: z.array(z.string()),
  flags: z.array(FlagSchema),
  provider: z.string(),
  model: z.string(),
  location: InferenceLocationSchema,
  /** "mock" results are deterministic demo output, never AI inference. */
  inference: z.enum(["ai", "mock"]),
  promptVersion: z.string(),
  rulesProfile: z.string(),
  timestamp: z.string().datetime(),
  latencyMs: z.number().nonnegative(),
  cacheHit: z.boolean(),
});
export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

export const ProviderKindSchema = z.enum(["mock", "ollama", "openai-compatible", "anthropic", "gemini"]);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

export const ProviderConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  kind: ProviderKindSchema,
  name: z.string().min(1).max(80),
  endpoint: z.string(),
  location: z.enum(["local", "cloud"]),
  model: z.string().max(200).default(""),
  timeoutMs: z.number().int().min(2_000).max(300_000).default(60_000),
  /** Declared capabilities for endpoints that cannot be probed (OpenAI-compatible). */
  declaredImageInput: z.boolean().default(false),
  declaredStructuredOutput: z.boolean().default(false),
  /** Last four characters of the stored key, for masked display only. */
  keyHint: z.string().max(4).nullable().default(null),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const AiModeSchema = z.enum(["local", "cloud", "hybrid", "demo"]);
export type AiMode = z.infer<typeof AiModeSchema>;

export const RulesProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Streams collected locally. A disabled stream is redirected or sent to review. */
  enabled: z.record(CategorySchema, z.boolean()),
  redirects: z.record(CategorySchema, CategorySchema.or(z.literal("review"))).default({}),
  /** What to do with items the model can't place, or that are outside every stream. */
  exceptionPolicy: z.enum(["review", "residual"]),
  notes: z.string().max(2000).default(""),
});
export type RulesProfile = z.infer<typeof RulesProfileSchema>;

export const SETTINGS_VERSION = 1;

export const ApplicationSettingsSchema = z.object({
  version: z.literal(SETTINGS_VERSION),
  mode: AiModeSchema.default("demo"),
  localProviderId: z.string().nullable().default(null),
  cloudProviderId: z.string().nullable().default(null),
  providers: z.array(ProviderConfigSchema).default([]),
  confidenceThreshold: z.number().min(0.5).max(0.99).default(0.75),
  hybrid: z
    .object({
      cloudFallbackEnabled: z.boolean().default(false),
      /** Set only after the user has read the disclosure dialog. */
      disclosureAcknowledgedAt: z.string().nullable().default(null),
    })
    .default({}),
  budget: z
    .object({
      maxCloudRequestsPerSession: z.number().int().min(0).max(10_000).default(50),
    })
    .default({}),
  history: z
    .object({
      enabled: z.boolean().default(false),
      retentionDays: z.number().int().min(1).max(365).default(30),
    })
    .default({}),
  rules: RulesProfileSchema,
  imageMaxEdge: z.number().int().min(256).max(2048).default(1024),
  updates: z.object({ autoCheck: z.boolean().default(true), autoDownload: z.boolean().default(true) }).default({}),
  reducedMotion: z.enum(["system", "on", "off"]).default("system"),
});
export type ApplicationSettings = z.infer<typeof ApplicationSettingsSchema>;

export const ClassificationRecordSchema = z.object({
  id: z.string(),
  result: ClassificationResultSchema,
  /** Category confirmed or corrected by a person; null if not reviewed. */
  userCategory: CategorySchema.nullable(),
  correctedAt: z.string().nullable(),
  /** Hash of the image bytes. Raw images are never stored. */
  imageSha256: z.string(),
});
export type ClassificationRecord = z.infer<typeof ClassificationRecordSchema>;

export const HISTORY_VERSION = 1;
export const HistoryFileSchema = z.object({
  version: z.literal(HISTORY_VERSION),
  records: z.array(ClassificationRecordSchema),
});
export type HistoryFile = z.infer<typeof HistoryFileSchema>;
