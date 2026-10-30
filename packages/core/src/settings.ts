import { createMockConfig } from "./providers/mock";
import { DEFAULT_RULES } from "./rules";
import { ApplicationSettingsSchema, HISTORY_VERSION, HistoryFileSchema, SETTINGS_VERSION, type ApplicationSettings, type HistoryFile } from "./schemas";

export function defaultSettings(): ApplicationSettings {
  return ApplicationSettingsSchema.parse({ version: SETTINGS_VERSION, rules: DEFAULT_RULES, providers: [createMockConfig()] });
}

export type LoadResult<T> = { value: T; recovered: boolean; message?: string };

/** Parse persisted settings; migrate old versions; fall back safely on corruption. */
export function loadSettings(raw: string | null): LoadResult<ApplicationSettings> {
  if (!raw) return { value: defaultSettings(), recovered: false };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { value: defaultSettings(), recovered: true, message: "Settings file was unreadable and has been reset." };
  }
  const migrated = migrateSettings(data);
  const parsed = ApplicationSettingsSchema.safeParse(migrated);
  if (!parsed.success) return { value: defaultSettings(), recovered: true, message: "Settings were invalid or from an unsupported version and have been reset." };
  const value = parsed.data;
  if (!value.providers.some((p) => p.kind === "mock")) value.providers.unshift(createMockConfig());
  return { value, recovered: false };
}

/** Version migrations go here. v1 is the first schema. */
function migrateSettings(data: unknown): unknown {
  if (data && typeof data === "object" && !("version" in data)) return { ...data, version: SETTINGS_VERSION };
  return data;
}

export function loadHistory(raw: string | null, retentionDays: number, now = new Date()): LoadResult<HistoryFile> {
  const empty: HistoryFile = { version: HISTORY_VERSION, records: [] };
  if (!raw) return { value: empty, recovered: false };
  try {
    const parsed = HistoryFileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { value: empty, recovered: true, message: "History file was invalid and has been cleared." };
    const cutoff = now.getTime() - retentionDays * 86_400_000;
    return { value: { ...parsed.data, records: parsed.data.records.filter((r) => Date.parse(r.result.timestamp) >= cutoff) }, recovered: false };
  } catch {
    return { value: empty, recovered: true, message: "History file was unreadable and has been cleared." };
  }
}
