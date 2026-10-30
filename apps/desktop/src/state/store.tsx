import {
  ApplicationSettingsSchema,
  ClassificationEngine,
  HISTORY_VERSION,
  MockSortingDevice,
  createLogger,
  createProvider,
  defaultSettings,
  loadHistory,
  loadSettings,
  type AIProvider,
  type ApplicationSettings,
  type ClassificationRecord,
  type DeviceStatus,
  type LogEntry,
  type MockDeviceScenario,
  type SortingDevice,
} from "@sorte/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readStore, transport, writeStore } from "../platform";
import { checkForUpdate, describeUpdateError, downloadUpdate, type UpdateState } from "../platform/updates";
import type { Update } from "@tauri-apps/plugin-updater";

export type Screen = "live" | "overview" | "providers" | "local" | "devices" | "history" | "settings";

interface AppState {
  ready: boolean;
  screen: Screen;
  go(screen: Screen): void;
  settings: ApplicationSettings;
  updateSettings(fn: (s: ApplicationSettings) => ApplicationSettings): void;
  notices: string[];
  dismissNotice(n: string): void;
  providers: Map<string, AIProvider>;
  providerErrors: Map<string, string>;
  engine: ClassificationEngine;
  history: ClassificationRecord[];
  addRecord(r: ClassificationRecord): void;
  updateRecord(id: string, patch: Partial<ClassificationRecord>): void;
  clearHistory(): void;
  logs: LogEntry[];
  device: SortingDevice | null;
  deviceStatus: DeviceStatus | null;
  connectSimulator(scenario: MockDeviceScenario): Promise<void>;
  disconnectDevice(): Promise<void>;
  refreshDevice(): Promise<void>;
  cloudRequests: number;
  bumpStats(): void;
  update: UpdateState;
  setUpdate(u: UpdateState): void;
  runUpdateCheck(opts?: { silent?: boolean }): Promise<void>;
  /** False until the launch update check has answered; the camera waits for it. */
  startupChecked: boolean;
  updateSheetOpen: boolean;
  closeUpdateSheet(): void;
  startUpdateDownload(update: Update, opts?: { silent?: boolean }): Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("live");
  const [settings, setSettings] = useState<ApplicationSettings>(defaultSettings);
  const [history, setHistory] = useState<ClassificationRecord[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [device, setDevice] = useState<SortingDevice | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [, setTick] = useState(0);
  const [update, setUpdate] = useState<UpdateState>({ kind: "idle" });
  const updateRef = useRef(update);
  updateRef.current = update;

  const autoDownloadRef = useRef(true);

  const startUpdateDownload = useCallback(async (u: Update, { silent = false }: { silent?: boolean } = {}) => {
    setUpdate({ kind: "downloading", version: u.version, received: 0, total: null });
    try {
      await downloadUpdate(u, (received, total) => setUpdate({ kind: "downloading", version: u.version, received, total }));
      setUpdate({ kind: "ready", update: u });
    } catch (e) {
      // A failed background download just tries again at the next check.
      setUpdate(silent ? { kind: "idle" } : { kind: "error", message: describeUpdateError(e) });
    }
  }, []);

  const [startupChecked, setStartupChecked] = useState(false);
  const [updateSheetOpen, setUpdateSheetOpen] = useState(false);
  const dismissedVersion = useRef<string | null>(null);
  const startupRan = useRef(false);
  const closeUpdateSheet = useCallback(() => {
    setUpdateSheetOpen(false);
    const u = updateRef.current;
    if (u.kind === "available" || u.kind === "ready") dismissedVersion.current = u.update.version;
    else if (u.kind === "downloading") dismissedVersion.current = u.version;
  }, []);

  // Silent checks never surface errors; a manual check from Settings does.
  const runUpdateCheck = useCallback(async ({ silent = false, timeoutMs }: { silent?: boolean; timeoutMs?: number } = {}) => {
    const now = updateRef.current;
    if (now.kind === "checking") return;
    // Already fetched or fetching: a manual check just brings it back up.
    if (now.kind === "downloading" || now.kind === "ready") {
      if (!silent) setUpdateSheetOpen(true);
      return;
    }
    setUpdate({ kind: "checking" });
    try {
      const u = await checkForUpdate(timeoutMs);
      setStartupChecked(true);
      if (u && (!silent || dismissedVersion.current !== u.version)) setUpdateSheetOpen(true);
      if (!u) setUpdate({ kind: "current", checkedAt: new Date() });
      else if (autoDownloadRef.current) await startUpdateDownload(u, { silent });
      else setUpdate({ kind: "available", update: u });
    } catch (e) {
      console.warn("[sorte] update check failed", e);
      setStartupChecked(true);
      setUpdate(silent ? { kind: "idle" } : { kind: "error", message: describeUpdateError(e) });
    }
  }, [startUpdateDownload]);

  // Every launch checks for a new version first, before the camera opens.
  useEffect(() => {
    if (!ready || startupRan.current) return;
    startupRan.current = true;
    if (settings.updates.autoCheck) void runUpdateCheck({ silent: true, timeoutMs: 6_000 });
    else setStartupChecked(true);
  }, [ready, settings.updates.autoCheck, runUpdateCheck]);

  // Load persisted state once.
  useEffect(() => {
    (async () => {
      const s = loadSettings(await readStore("settings"));
      const h = loadHistory(await readStore("history"), s.value.history.retentionDays);
      setSettings(s.value);
      setHistory(s.value.history.enabled ? h.value.records : []);
      setNotices([s.message, h.message].filter((m): m is string => !!m));
      setReady(true);
    })();
  }, []);

  // Persist settings (debounced). Secrets are never part of settings.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => void writeStore("settings", JSON.stringify(settings)), 250);
    return () => clearTimeout(t);
  }, [settings, ready]);

  useEffect(() => {
    if (!ready) return;
    const records = settings.history.enabled ? history : [];
    void writeStore("history", JSON.stringify({ version: HISTORY_VERSION, records }));
  }, [history, settings.history.enabled, ready]);

  const { providers, providerErrors } = useMemo(() => {
    const providers = new Map<string, AIProvider>();
    const providerErrors = new Map<string, string>();
    for (const cfg of settings.providers) {
      try {
        providers.set(cfg.id, createProvider(cfg, { transport }));
      } catch (e) {
        providerErrors.set(cfg.id, (e as Error).message);
      }
    }
    return { providers, providerErrors };
  }, [settings.providers]);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  autoDownloadRef.current = settings.updates.autoDownload;
  const providersRef = useRef(providers);
  providersRef.current = providers;

  const engine = useMemo(
    () =>
      new ClassificationEngine({
        getSettings: () => settingsRef.current,
        getProvider: (id) => providersRef.current.get(id) ?? null,
        // Request metadata only — the logger redacts secrets, and images are never logged.
        logger: createLogger((e) => setLogs((l) => [e, ...l].slice(0, 200))),
      }),
    [],
  );

  const updateSettings = useCallback((fn: (s: ApplicationSettings) => ApplicationSettings) => {
    setSettings((prev) => {
      const parsed = ApplicationSettingsSchema.safeParse(fn(prev));
      if (!parsed.success) {
        console.warn("[sorte] rejected invalid settings update", parsed.error.issues[0]);
        return prev;
      }
      return parsed.data;
    });
  }, []);

  const addRecord = useCallback(
    (r: ClassificationRecord) => {
      if (!settingsRef.current.history.enabled) return;
      setHistory((h) => [r, ...h].slice(0, 5000));
    },
    [],
  );
  const updateRecord = useCallback((id: string, patch: Partial<ClassificationRecord>) => setHistory((h) => h.map((r) => (r.id === id ? { ...r, ...patch } : r))), []);
  const clearHistory = useCallback(() => setHistory([]), []);

  const connectSimulator = useCallback(async (scenario: MockDeviceScenario) => {
    await device?.disconnect();
    const d = new MockSortingDevice(scenario);
    setDevice(d);
    setDeviceStatus(await d.getStatus());
    setDeviceStatus(await d.connect());
  }, [device]);

  const disconnectDevice = useCallback(async () => {
    await device?.disconnect();
    setDevice(null);
    setDeviceStatus(null);
  }, [device]);

  const refreshDevice = useCallback(async () => {
    if (device) setDeviceStatus(await device.getStatus());
  }, [device]);

  const value: AppState = {
    ready,
    screen,
    go: setScreen,
    settings,
    updateSettings,
    notices,
    dismissNotice: (n) => setNotices((ns) => ns.filter((x) => x !== n)),
    providers,
    providerErrors,
    engine,
    history,
    addRecord,
    updateRecord,
    clearHistory,
    logs,
    device,
    deviceStatus,
    connectSimulator,
    disconnectDevice,
    refreshDevice,
    cloudRequests: engine.cloudRequestCount,
    bumpStats: () => setTick((t) => t + 1),
    update,
    setUpdate,
    runUpdateCheck,
    startUpdateDownload,
    startupChecked,
    updateSheetOpen,
    closeUpdateSheet,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const MODE_META = {
  local: { label: "Local", tone: "sage", description: "On-device inference. Nothing leaves this machine." },
  cloud: { label: "Cloud", tone: "lavender", description: "Images are sent to your selected cloud provider." },
  hybrid: { label: "Hybrid", tone: "amber", description: "Local first; cloud only if you've authorised fallback." },
  demo: { label: "Demo", tone: "neutral", description: "Simulated results from fixtures. Not AI inference." },
} as const;
