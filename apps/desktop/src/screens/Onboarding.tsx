import { CATEGORIES, OllamaProvider, PROVIDER_PRESETS, createProvider, pickDefaultModel, usableForPhotos, type AiMode, type ModelInfo, type ProviderConfig } from "@sorte/core";
import { Orbit } from "@sorte/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { Chutes } from "../components/Chutes";
import { openExternal, saveSecret, secretsAvailable, transport } from "../platform";
import { useApp } from "../state/store";

type Step = "welcome" | "choose" | "cloud" | "local" | "ready";

/** The five tubes fill as setup moves along. */
const FILL: Record<Step, number> = { welcome: 0.16, choose: 0.38, cloud: 0.62, local: 0.62, ready: 0.9 };
const RIPPLE = [1, 0.82, 1.08, 0.9, 1.02];

const CLOUD = [
  { preset: "gemini", name: "Google Gemini", company: "Google", note: "Has a free tier", site: "Google AI Studio", keyUrl: "https://aistudio.google.com/apikey" },
  { preset: "openai", name: "OpenAI", company: "OpenAI", note: "Pay per use", site: "OpenAI", keyUrl: "https://platform.openai.com/api-keys" },
  { preset: "anthropic", name: "Anthropic", company: "Anthropic", note: "Pay per use", site: "Anthropic Console", keyUrl: "https://console.anthropic.com/settings/keys" },
] as const;

const OLLAMA_MODEL = "gemma3";
const isWindows = /Windows/.test(navigator.userAgent);

interface Choice {
  mode: AiMode;
  provider?: ProviderConfig;
  model?: string;
  company?: string;
}

export function Onboarding() {
  const { settings, updateSettings, closeSetup, go } = useApp();
  const [step, setStep] = useState<Step>("welcome");
  const [choice, setChoice] = useState<Choice>({ mode: "demo" });

  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => heading.current?.querySelector("h1")?.focus({ preventScroll: true }), [step]);

  const pick = (c: Choice) => {
    setChoice(c);
    setStep("ready");
  };

  const finish = () => {
    const { mode, provider, model } = choice;
    updateSettings((s) => {
      const providers = provider
        ? [...s.providers.filter((p) => p.id !== provider.id), { ...provider, model: model ?? provider.model }]
        : s.providers;
      return {
        ...s,
        mode,
        providers,
        localProviderId: provider?.location === "local" ? provider.id : s.localProviderId,
        cloudProviderId: provider?.location === "cloud" ? provider.id : s.cloudProviderId,
        onboarding: { completedAt: new Date().toISOString() },
        // Starting here is the same as pressing the camera button.
        live: { ...s.live, autoStart: true },
      };
    });
    go("live");
    closeSetup();
  };

  const level = FILL[step];
  const levels = Object.fromEntries(CATEGORIES.map((c, i) => [c.id, Math.min(0.96, level * RIPPLE[i]!)]));

  return (
    <div className="setup">
      <div className="setup__tubes" data-compact={step !== "welcome"} aria-hidden>
        <Chutes size="dock" levels={levels} />
      </div>
      <div className="setup__step" key={step} ref={heading}>
        {step === "welcome" && (
          <>
            <h1 className="setup__title setup__title--xl" tabIndex={-1}>
              Welcome to SORTÉ
            </h1>
            <p className="setup__lede">Hold up an item. Your camera and an AI tell you which bin it goes in.</p>
            <div className="setup__actions">
              <button className="pill pill--lg pill--primary" onClick={() => setStep("choose")}>
                Get started
              </button>
            </div>
          </>
        )}

        {step === "choose" && (
          <>
            <h1 className="setup__title" tabIndex={-1}>
              Where should the AI run?
            </h1>
            <div className="setup__cards">
              <button className="setup-card" data-glass="frost" onClick={() => setStep("cloud")}>
                <Glyph d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9.5a4.3 4.3 0 0 1-.5 8.5z" />
                <strong>Online</strong>
                <span>Easiest. Takes two minutes with a key. Photos are sent to the company you pick.</span>
                <em>Recommended</em>
              </button>
              <button className="setup-card" data-glass="frost" onClick={() => setStep("local")}>
                <Glyph d="M4 5h16v11H4zM9 20h6M12 16v4" />
                <strong>On this computer</strong>
                <span>Private. Photos never leave. Needs a free app, a few GB and a decent computer.</span>
              </button>
              <button className="setup-card" data-glass="frost" onClick={() => pick({ mode: "demo" })}>
                <Glyph d="M8 5.5v13l10.5-6.5z" />
                <strong>Just try it</strong>
                <span>No AI and no setup. Answers are simulated, so don't sort by them.</span>
              </button>
            </div>
            <div className="setup__actions">
              <Back onClick={() => setStep("welcome")} />
            </div>
          </>
        )}

        {step === "cloud" && <CloudStep existing={settings.providers} onBack={() => setStep("choose")} onDone={pick} />}
        {step === "local" && <LocalStep existing={settings.providers} onBack={() => setStep("choose")} onDone={pick} />}

        {step === "ready" && (
          <>
            <h1 className="setup__title setup__title--xl" tabIndex={-1}>
              {choice.mode === "demo" ? "Ready to look around" : "You're all set"}
            </h1>
            <p className="setup__lede">
              {choice.mode === "demo" && "Answers are simulated. Connect a real AI in Settings whenever you like."}
              {choice.mode === "cloud" && `${choice.model} will look at your photos. They are sent to ${choice.company}.`}
              {choice.mode === "local" && `${choice.model} will look at your photos, right here on this computer.`}
            </p>
            <div className="setup__actions">
              <Back onClick={() => setStep("choose")} />
              <button className="pill pill--lg pill--primary" onClick={finish}>
                Start camera
              </button>
            </div>
            <p className="setup__foot">Your computer will ask for permission to use the camera.</p>
          </>
        )}
      </div>
    </div>
  );
}

function CloudStep({ existing, onBack, onDone }: { existing: ProviderConfig[]; onBack(): void; onDone(c: Choice): void }) {
  const { updateSettings } = useApp();
  const [index, setIndex] = useState(0);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<{ config: ProviderConfig; models: ModelInfo[] } | null>(null);
  const [model, setModel] = useState("");
  const service = CLOUD[index]!;
  const preset = PROVIDER_PRESETS[service.preset]!;

  const choose = (i: number) => {
    setIndex(i);
    setKey("");
    setError(null);
    setConnected(null);
  };

  const connect = async () => {
    setBusy(true);
    setError(null);
    const config: ProviderConfig = existing.find((p) => p.kind === preset.kind && p.endpoint === preset.defaultEndpoint) ?? {
      id: `${service.preset}-${crypto.randomUUID().slice(0, 6)}`,
      kind: preset.kind,
      name: preset.label,
      endpoint: preset.defaultEndpoint,
      location: "cloud",
      model: "",
      timeoutMs: 60_000,
      declaredImageInput: false,
      declaredStructuredOutput: false,
      keyHint: null,
      ...preset.defaults,
    };
    try {
      const keyHint = await saveSecret(config.id, key.trim(), config.endpoint);
      // Listing models is a real, free request: it proves the key works.
      const all = await createProvider(config, { transport }).listModels();
      const models = usableForPhotos(all);
      const suggested = pickDefaultModel(all);
      if (!suggested) throw new Error(`This key works, but ${service.company} lists no model that can read photos for it.`);
      const saved = { ...config, keyHint };
      // Kept even if setup is abandoned, so the saved key always shows in AI Providers.
      updateSettings((s) => ({ ...s, providers: [...s.providers.filter((p) => p.id !== saved.id), saved] }));
      setConnected({ config: saved, models });
      setModel(suggested);
      setKey("");
    } catch (e) {
      setError(friendly(e));
    }
    setBusy(false);
  };

  return (
    <>
      <h1 className="setup__title" tabIndex={-1}>
        Connect an AI
      </h1>
      <div className="setup-panel" data-glass="frost">
        <div className="setup-seg" role="radiogroup" aria-label="AI service">
          {CLOUD.map((c, i) => (
            <button key={c.preset} role="radio" aria-checked={i === index} onClick={() => choose(i)}>
              <strong>{c.name}</strong>
              <span>{c.note}</span>
            </button>
          ))}
        </div>

        {connected ? (
          <>
            <p className="setup-ok" role="status">
              <Check /> Connected to {service.company}
            </p>
            <label className="setup-field">
              <span>Model</span>
              <select className="setup-input" value={model} onChange={(e) => setModel(e.target.value)}>
                {connected.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <div className="setup-row">
              <span className="setup-num">1</span>
              <span className="setup-row__text">Make a key on {service.site}. It's a long password for apps.</span>
              <button className="setup-btn" onClick={() => void openExternal(service.keyUrl)}>
                Open
                <Glyph d="M8 16 17 7M9 7h8v8" size={14} />
              </button>
            </div>
            <div className="setup-row">
              <span className="setup-num">2</span>
              <input
                className="setup-input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste your key"
                aria-label={`${service.name} API key`}
                value={key}
                disabled={!secretsAvailable || busy}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && key.trim() && void connect()}
              />
              <button className="setup-btn setup-btn--solid" disabled={!key.trim() || busy || !secretsAvailable} onClick={() => void connect()}>
                {busy ? <Orbit /> : "Connect"}
              </button>
            </div>
            {error && (
              <p className="setup-error" role="alert">
                {error}
              </p>
            )}
            <p className="setup-note">
              {secretsAvailable
                ? `Your key stays in ${isWindows ? "Windows Credential Manager" : "the macOS Keychain"}. Photos go to ${service.company} only while the camera is scanning.`
                : "Saving keys only works in the desktop app."}
            </p>
          </>
        )}
      </div>
      <div className="setup__actions">
        <Back onClick={onBack} />
        {connected && (
          <button className="pill pill--lg pill--primary" onClick={() => onDone({ mode: "cloud", provider: connected.config, model, company: service.company })}>
            Continue
          </button>
        )}
      </div>
    </>
  );
}

function LocalStep({ existing, onBack, onDone }: { existing: ProviderConfig[]; onBack(): void; onDone(c: Choice): void }) {
  const preset = PROVIDER_PRESETS.ollama!;
  const [config] = useState<ProviderConfig>(
    () =>
      existing.find((p) => p.kind === "ollama") ?? {
        id: `ollama-${crypto.randomUUID().slice(0, 6)}`,
        kind: "ollama",
        name: "Ollama",
        endpoint: preset.defaultEndpoint,
        location: "local",
        model: "",
        timeoutMs: 120_000,
        declaredImageInput: true,
        declaredStructuredOutput: true,
        keyHint: null,
      },
  );
  const [state, setState] = useState<"checking" | "missing" | "no-model" | "ok">("checking");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [copied, setCopied] = useState(false);

  const check = useCallback(async () => {
    try {
      const provider = createProvider(config, { transport });
      const found = await provider.listModels();
      if (!(provider instanceof OllamaProvider)) return;
      const flags = await Promise.all(found.map((m) => provider.modelSupportsImages(m.id).catch(() => null)));
      const vision = found.filter((_, i) => flags[i] === true).map((m) => m.id);
      setModels(vision);
      setModel((m) => (vision.includes(m) ? m : vision[0] ?? ""));
      setState(vision.length ? "ok" : "no-model");
    } catch {
      setState("missing");
    }
  }, [config]);

  // Notices the install or the download finishing, with nothing to press.
  useEffect(() => {
    void check();
  }, [check]);
  useEffect(() => {
    if (state === "ok" || state === "checking") return;
    const t = setInterval(() => void check(), 4000);
    return () => clearInterval(t);
  }, [state, check]);

  const command = `ollama pull ${OLLAMA_MODEL}`;

  return (
    <>
      <h1 className="setup__title" tabIndex={-1}>
        Run it on this computer
      </h1>
      <div className="setup-panel" data-glass="frost">
        {state === "checking" && (
          <p className="setup-wait">
            <Orbit color="var(--sage)" /> Looking for Ollama…
          </p>
        )}

        {state === "missing" && (
          <>
            <div className="setup-row">
              <span className="setup-num">1</span>
              <span className="setup-row__text">Install Ollama, the free app that runs AI models, and open it.</span>
              <button className="setup-btn" onClick={() => void openExternal("https://ollama.com/download")}>
                Download
                <Glyph d="M8 16 17 7M9 7h8v8" size={14} />
              </button>
            </div>
            <p className="setup-wait">
              <Orbit color="var(--sage)" /> Waiting for Ollama to start…
            </p>
          </>
        )}

        {state === "no-model" && (
          <>
            <p className="setup-ok" role="status">
              <Check /> Ollama is running
            </p>
            <div className="setup-row">
              <span className="setup-num">2</span>
              <span className="setup-row__text">
                It needs a model that can see. Paste this into {isWindows ? "PowerShell" : "Terminal"}. It downloads about 3 GB.
              </span>
            </div>
            <div className="setup-code">
              <code>{command}</code>
              <button
                className="setup-btn"
                onClick={() => {
                  void navigator.clipboard.writeText(command);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="setup-wait">
              <Orbit color="var(--sage)" /> Waiting for the download to finish…
            </p>
          </>
        )}

        {state === "ok" && (
          <>
            <p className="setup-ok" role="status">
              <Check /> Ollama is ready
            </p>
            <label className="setup-field">
              <span>Model</span>
              <select className="setup-input" value={model} onChange={(e) => setModel(e.target.value)}>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <p className="setup-note">Photos never leave this computer.</p>
          </>
        )}
      </div>
      <div className="setup__actions">
        <Back onClick={onBack} />
        {state === "ok" && (
          <button className="pill pill--lg pill--primary" onClick={() => onDone({ mode: "local", provider: config, model })}>
            Continue
          </button>
        )}
      </div>
    </>
  );
}

function friendly(e: unknown): string {
  const kind = (e as { kind?: string }).kind;
  if (kind === "auth") return "That key didn't work. Check you copied all of it.";
  if (kind === "network" || kind === "timeout") return "Couldn't reach the service. Check your internet connection.";
  if (kind === "rate-limit") return "The service says too many requests. Wait a minute and try again.";
  return String((e as Error).message ?? e);
}

function Back({ onClick }: { onClick(): void }) {
  return (
    <button className="pill pill--lg" data-glass="clear" onClick={onClick}>
      Back
    </button>
  );
}

function Glyph({ d, size = 24 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function Check() {
  return <Glyph d="M5 12.5 10 17.5 19 7" size={18} />;
}
