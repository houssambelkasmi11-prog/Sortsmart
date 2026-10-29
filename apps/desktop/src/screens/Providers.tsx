import { PROVIDER_PRESETS, maskSecret, validateEndpoint, type ConnectionTestResult, type ModelInfo, type ProviderConfig } from "@sorte/core";
import { Button, Orbit, StatusPill } from "@sorte/ui";
import { useEffect, useState } from "react";
import { Empty, Field, Section } from "../components/common";
import { deleteSecret, hasSecret, saveSecret, secretsAvailable } from "../platform";
import { useApp } from "../state/store";

export function Providers() {
  const { settings, updateSettings } = useApp();
  const [selected, setSelected] = useState<string | null>(settings.providers.find((p) => p.kind !== "mock")?.id ?? null);
  const editable = settings.providers.filter((p) => p.kind !== "mock");
  const current = editable.find((p) => p.id === selected) ?? null;

  const add = (presetKey: string) => {
    const preset = PROVIDER_PRESETS[presetKey];
    if (!preset) return;
    const id = `${presetKey}-${crypto.randomUUID().slice(0, 6)}`;
    const cfg: ProviderConfig = {
      id,
      kind: preset.kind,
      name: preset.label,
      endpoint: preset.defaultEndpoint,
      location: preset.location,
      model: "",
      timeoutMs: 60_000,
      declaredImageInput: false,
      declaredStructuredOutput: false,
      keyHint: null,
      ...preset.defaults,
    };
    updateSettings((s) => ({ ...s, providers: [...s.providers, cfg] }));
    setSelected(id);
  };

  return (
    <div className="grid grid--split">
      <Section title="Providers">
        {editable.length === 0 ? (
          <Empty title="No providers yet" />
        ) : (
          <ul className="list">
            {editable.map((p) => (
              <li key={p.id}>
                <button className="list__item" aria-current={p.id === selected} onClick={() => setSelected(p.id)}>
                  <span>{p.name}</span>
                  <span className="row">
                    {(settings.localProviderId === p.id || settings.cloudProviderId === p.id) && <StatusPill tone="sage">Active</StatusPill>}
                    <StatusPill tone={p.location === "cloud" ? "lavender" : "sage"}>{p.location}</StatusPill>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Field label="Add provider">
          <select className="s-select" value="" onChange={(e) => add(e.target.value)}>
            <option value="" disabled>
              Choose a provider…
            </option>
            {Object.entries(PROVIDER_PRESETS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label} — {p.location}
              </option>
            ))}
          </select>
        </Field>

      </Section>

      {current ? <ProviderEditor key={current.id} config={current} onRemoved={() => setSelected(null)} /> : <Section title="Details"><Empty title="Select a provider" /></Section>}
    </div>
  );
}

function ProviderEditor({ config, onRemoved }: { config: ProviderConfig; onRemoved(): void }) {
  const { settings, updateSettings, providers, providerErrors } = useApp();
  const [endpoint, setEndpoint] = useState(config.endpoint);
  const [key, setKey] = useState("");
  const [keyStored, setKeyStored] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"test" | "models" | "key" | null>(null);
  const [test, setTest] = useState<ConnectionTestResult | null>(null);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const provider = providers.get(config.id);
  const endpointCheck = validateEndpoint(endpoint, config.location);
  const needsKey = config.location === "cloud";

  useEffect(() => {
    if (needsKey) void hasSecret(config.id).then(setKeyStored, () => setKeyStored(false));
  }, [config.id, needsKey]);

  const patch = (p: Partial<ProviderConfig>) => updateSettings((s) => ({ ...s, providers: s.providers.map((x) => (x.id === config.id ? { ...x, ...p } : x)) }));

  const commitEndpoint = () => {
    if (endpointCheck.ok && endpoint !== config.endpoint) {
      const hostChanged = new URL(endpoint).host !== new URL(config.endpoint).host;
      patch({ endpoint: endpoint.replace(/\/+$/, "") });
      setModels(null);
      setTest(null);
      if (hostChanged && needsKey && keyStored) setMessage({ tone: "error", text: "Host changed. Your saved key is bound to the previous host — save it again for this endpoint." });
    }
  };

  const runTest = async () => {
    if (!provider) return;
    setBusy("test");
    setTest(await provider.testConnection());
    setBusy(null);
  };

  const discover = async () => {
    if (!provider) return;
    setBusy("models");
    setMessage(null);
    try {
      setModels(await provider.listModels());
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    }
    setBusy(null);
  };

  const storeKey = async () => {
    if (!key.trim() || !endpointCheck.ok) return;
    setBusy("key");
    try {
      const hint = await saveSecret(config.id, key.trim(), config.endpoint);
      patch({ keyHint: hint });
      setKeyStored(true);
      setMessage({ tone: "ok", text: "Key saved to the system credential store." });
    } catch (e) {
      setMessage({ tone: "error", text: String((e as Error).message ?? e) });
    }
    setKey("");
    setBusy(null);
  };

  const removeKey = async () => {
    await deleteSecret(config.id);
    patch({ keyHint: null });
    setKeyStored(false);
    setMessage({ tone: "ok", text: "Key deleted." });
  };

  const remove = async () => {
    if (needsKey) await deleteSecret(config.id);
    updateSettings((s) => ({
      ...s,
      providers: s.providers.filter((p) => p.id !== config.id),
      localProviderId: s.localProviderId === config.id ? null : s.localProviderId,
      cloudProviderId: s.cloudProviderId === config.id ? null : s.cloudProviderId,
    }));
    onRemoved();
  };

  const isActive = config.location === "cloud" ? settings.cloudProviderId === config.id : settings.localProviderId === config.id;
  const declare = config.kind === "openai-compatible";

  return (
    <Section title={config.name} aside={<StatusPill tone={config.location === "cloud" ? "lavender" : "sage"}>{config.location === "cloud" ? "Cloud — images leave this device" : "Local"}</StatusPill>}>
      {providerErrors.get(config.id) && <p className="field-error">{providerErrors.get(config.id)}</p>}
      <div className="form">
        <Field label="Display name">
          <input className="s-input" value={config.name} maxLength={80} onChange={(e) => patch({ name: e.target.value || config.name })} />
        </Field>
        <Field label="Endpoint" error={endpointCheck.ok ? null : endpointCheck.reason} hint={config.location === "local" ? "Loopback only (localhost)." : "HTTPS required."}>
          <input className="s-input" value={endpoint} aria-invalid={!endpointCheck.ok} onChange={(e) => setEndpoint(e.target.value)} onBlur={commitEndpoint} spellCheck={false} />
        </Field>

        {needsKey && (
          <Field
            label="API key"
            hint={secretsAvailable ? `Stored in the OS credential store and bound to ${safeHost(config.endpoint)}. Saved: ${keyStored ? maskSecret(config.keyHint) : "not set"}` : "Key storage requires SORTÉ Desktop. The browser build never handles keys."}
          >
            <div className="row">
              <input
                className="s-input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={keyStored ? "Replace saved key…" : "Paste key"}
                value={key}
                disabled={!secretsAvailable}
                onChange={(e) => setKey(e.target.value)}
              />
              <Button onClick={storeKey} disabled={!key.trim() || busy === "key" || !secretsAvailable}>
                Save
              </Button>
              {keyStored && (
                <Button variant="danger" onClick={removeKey}>
                  Delete
                </Button>
              )}
            </div>
          </Field>
        )}

        <div className="row">
          <Button onClick={runTest} disabled={!provider || busy !== null || (needsKey && !keyStored)}>
            {busy === "test" ? <Orbit /> : null} Test connection
          </Button>
          <Button onClick={discover} disabled={!provider || busy !== null || (needsKey && !keyStored)}>
            {busy === "models" ? <Orbit /> : null} Discover models
          </Button>
        </div>
        {test && (
          <p className={test.ok ? "ok" : "field-error"} role="status">
            {test.message} <span className="s-hint">({Math.round(test.latencyMs)} ms)</span>
          </p>
        )}
        {message && <p className={message.tone === "ok" ? "ok" : "field-error"}>{message.text}</p>}

        <Field label="Model" hint={models ? `${models.length} found` : undefined}>
          {models && models.length > 0 ? (
            <select className="s-select" value={config.model} onChange={(e) => patch({ model: e.target.value })}>
              <option value="">Select…</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <input className="s-input" value={config.model} onChange={(e) => patch({ model: e.target.value.trim() })} spellCheck={false} />
          )}
        </Field>

        {(declare || config.kind === "anthropic" || config.kind === "gemini") && (
          <fieldset className="fieldset">
            <legend className="s-label">Declared capabilities</legend>
            <label className="check">
              <input type="checkbox" className="s-switch" checked={config.declaredImageInput} onChange={(e) => patch({ declaredImageInput: e.target.checked })} />
              The selected model accepts image input
            </label>
            {declare && (
              <label className="check">
                <input type="checkbox" className="s-switch" checked={config.declaredStructuredOutput} onChange={(e) => patch({ declaredStructuredOutput: e.target.checked })} />
                The endpoint supports JSON-schema response format
              </label>
            )}

          </fieldset>
        )}

        <Field label="Timeout (s)">
          <input
            className="s-input narrow"
            type="number"
            min={2}
            max={300}
            value={config.timeoutMs / 1000}
            onChange={(e) => patch({ timeoutMs: Math.min(300, Math.max(2, Number(e.target.value) || 60)) * 1000 })}
          />
        </Field>

        <div className="row row--between">
          <Button
            variant={isActive ? "secondary" : "primary"}
            disabled={isActive || !config.model}
            onClick={() => updateSettings((s) => (config.location === "cloud" ? { ...s, cloudProviderId: config.id } : { ...s, localProviderId: config.id }))}
          >
            {isActive ? `Active ${config.location} provider` : `Use as ${config.location} provider`}
          </Button>
          <Button variant="danger" onClick={remove}>
            Remove provider
          </Button>
        </div>
      </div>
    </Section>
  );
}

function safeHost(u: string) {
  try {
    return new URL(u).host;
  } catch {
    return "this endpoint";
  }
}
