import { OllamaProvider, PROVIDER_PRESETS, RECOMMENDED_LOCAL_MODEL, type ModelInfo, type ProviderConfig } from "@sorte/core";
import { Button, Orbit, StatusPill } from "@sorte/ui";
import { useCallback, useEffect, useState } from "react";
import { Empty, Section } from "../components/common";
import { useApp } from "../state/store";

export function LocalModels() {
  const { settings, updateSettings, providers, go } = useApp();
  const ollamaConfigs = settings.providers.filter((p) => p.kind === "ollama");
  const [selectedId, setSelectedId] = useState<string | null>(ollamaConfigs[0]?.id ?? null);
  const config = ollamaConfigs.find((p) => p.id === selectedId) ?? null;

  const addOllama = () => {
    const preset = PROVIDER_PRESETS.ollama!;
    const cfg: ProviderConfig = {
      id: `ollama-${crypto.randomUUID().slice(0, 6)}`,
      kind: "ollama",
      name: "Ollama",
      endpoint: preset.defaultEndpoint,
      location: "local",
      model: "",
      timeoutMs: 120_000,
      declaredImageInput: false,
      declaredStructuredOutput: false,
      keyHint: null,
    };
    updateSettings((s) => ({ ...s, providers: [...s.providers, cfg] }));
    setSelectedId(cfg.id);
  };

  if (!config) {
    return (
      <Section title="Local inference">
        <Empty title="No local backend configured">

          <SetupSteps />
          <div className="row">
            <Button variant="primary" onClick={addOllama}>
              Add Ollama at 127.0.0.1:11434
            </Button>
            <Button variant="ghost" onClick={() => go("providers")}>
              Other local servers
            </Button>
          </div>
        </Empty>
      </Section>
    );
  }

  const provider = providers.get(config.id);
  return (
    <div className="grid">
      {ollamaConfigs.length > 1 && (
        <div className="row">
          {ollamaConfigs.map((c) => (
            <button key={c.id} className="chip" aria-pressed={c.id === selectedId} onClick={() => setSelectedId(c.id)}>
              {c.name} · {c.endpoint}
            </button>
          ))}
        </div>
      )}
      {provider instanceof OllamaProvider ? <ModelTable key={config.id} config={config} provider={provider} /> : <p className="field-error">Endpoint is invalid. Fix it under AI Providers.</p>}
    </div>
  );
}

function ModelTable({ config, provider }: { config: ProviderConfig; provider: OllamaProvider }) {
  const { settings, updateSettings } = useApp();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; models: ModelInfo[] }>({ kind: "loading" });
  const [vision, setVision] = useState<Record<string, boolean | null | "checking">>({});

  const refresh = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "ok", models: await provider.listModels() });
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }, [provider]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const check = async (id: string) => {
    setVision((v) => ({ ...v, [id]: "checking" }));
    try {
      const r = await provider.modelSupportsImages(id);
      setVision((v) => ({ ...v, [id]: r }));
    } catch {
      setVision((v) => ({ ...v, [id]: null }));
    }
  };

  const select = async (id: string) => {
    const supports = vision[id] === true ? true : await provider.modelSupportsImages(id).catch(() => null);
    setVision((v) => ({ ...v, [id]: supports }));
    if (supports !== true) return;
    updateSettings((s) => ({
      ...s,
      localProviderId: config.id,
      providers: s.providers.map((p) => (p.id === config.id ? { ...p, model: id, declaredImageInput: true, declaredStructuredOutput: true } : p)),
    }));
  };

  const activeHere = settings.localProviderId === config.id;

  return (
    <Section
      title={`${config.name} · ${config.endpoint}`}
      aside={
        <Button size="sm" onClick={refresh} disabled={state.kind === "loading"}>
          Refresh
        </Button>
      }
    >
      {state.kind === "loading" && (
        <div className="processing">
          <Orbit color="var(--sage)" /> Connecting to local server…
        </div>
      )}
      {state.kind === "error" && (
        <div className="error-box" role="alert">
          <p className="error-box__title">Could not reach Ollama</p>
          <p>{state.message}</p>
          <SetupSteps />
        </div>
      )}
      {state.kind === "ok" && state.models.length === 0 && (
        <Empty title="Ollama is running, but no models are installed">
          <SetupSteps fromStep={2} />
        </Empty>
      )}
      {state.kind === "ok" && state.models.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Size</th>
              <th>Image input</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.models.map((m) => {
              const v = vision[m.id] ?? m.imageInput;
              const isActive = activeHere && config.model === m.id;
              return (
                <tr key={m.id}>
                  <td className="s-mono">
                    {m.name} {m.id === RECOMMENDED_LOCAL_MODEL && <StatusPill tone="sage">Recommended</StatusPill>}
                  </td>
                  <td className="muted">{m.sizeBytes ? `${(m.sizeBytes / 1e9).toFixed(1)} GB` : "—"}</td>
                  <td>
                    {v === "checking" ? (
                      <Orbit color="var(--sage)" />
                    ) : v === true ? (
                      <StatusPill tone="sage">Vision</StatusPill>
                    ) : v === false ? (
                      <StatusPill>Text only</StatusPill>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => check(m.id)}>
                        Check
                      </Button>
                    )}
                  </td>
                  <td className="right">
                    {isActive ? (
                      <StatusPill tone="sage">Active</StatusPill>
                    ) : (
                      <Button size="sm" disabled={v === false} onClick={() => select(m.id)} title={v === false ? "This model can't process images." : undefined}>
                        Use
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {activeHere && settings.mode !== "local" && settings.mode !== "hybrid" && (
        <div className="row">
          <Button variant="primary" onClick={() => updateSettings((s) => ({ ...s, mode: "local" }))}>
            Switch AI mode to Local
          </Button>
        </div>
      )}
    </Section>
  );
}

function SetupSteps({ fromStep = 1 }: { fromStep?: number }) {
  const steps = [
    <>Install Ollama from ollama.com and start it (it listens on 127.0.0.1:11434).</>,
    <>
      Pull a vision model in a terminal: <code>ollama pull {RECOMMENDED_LOCAL_MODEL}</code>
    </>,
    <>
      Confirm <code>ollama show &lt;model&gt;</code> lists <em>vision</em>, then press Refresh.
    </>,
  ];
  return (
    <ol className="steps-sm" start={fromStep}>
      {steps.slice(fromStep - 1).map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}
