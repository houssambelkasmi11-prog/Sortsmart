import { CATEGORIES, DEFAULT_RULES, PROMPT_VERSION, type AiMode, type CategoryId } from "@sorte/core";
import { Button, StatusPill } from "@sorte/ui";
import { useEffect, useState } from "react";
import { Dialog, Field, Section } from "../components/common";
import { storeLocation } from "../platform";
import { MODE_META, useApp } from "../state/store";

export function Settings() {
  const { settings, updateSettings, providers, engine, logs, bumpStats } = useApp();
  const [disclosure, setDisclosure] = useState(false);
  const [location, setLocation] = useState("");
  useEffect(() => void storeLocation().then(setLocation), []);

  const cloud = settings.cloudProviderId ? providers.get(settings.cloudProviderId) : undefined;
  const setRule = (id: CategoryId, enabled: boolean) => updateSettings((s) => ({ ...s, rules: { ...s.rules, id: "custom", name: "Custom local rules", enabled: { ...s.rules.enabled, [id]: enabled } } }));
  const setRedirect = (id: CategoryId, v: string) =>
    updateSettings((s) => ({ ...s, rules: { ...s.rules, id: "custom", name: "Custom local rules", redirects: { ...s.rules.redirects, [id]: v as CategoryId | "review" } } }));

  return (
    <div className="grid grid--settings">
      <Section title="AI mode">
        <div className="modes" role="radiogroup" aria-label="AI mode">
          {(Object.keys(MODE_META) as AiMode[]).map((m) => (
            <button key={m} role="radio" aria-checked={settings.mode === m} className="mode-opt" onClick={() => updateSettings((s) => ({ ...s, mode: m }))}>
              <StatusPill tone={MODE_META[m].tone}>{MODE_META[m].label}</StatusPill>
              <span className="s-hint">{MODE_META[m].description}</span>
            </button>
          ))}
        </div>

        <div className="toggle-row">
          <div>
            <p className="s-label">Hybrid: escalate uncertain items to cloud</p>
            <p className="s-hint">
              {settings.hybrid.disclosureAcknowledgedAt
                ? `Authorised ${new Date(settings.hybrid.disclosureAcknowledgedAt).toLocaleDateString()}.`
                : "Off until you read and accept the disclosure."}{" "}
              Hazardous items are never escalated.
            </p>
          </div>
          <input
            type="checkbox"
            className="s-switch"
            checked={settings.hybrid.cloudFallbackEnabled}
            aria-label="Enable cloud fallback in hybrid mode"
            onChange={(e) => {
              if (e.target.checked && !settings.hybrid.disclosureAcknowledgedAt) return setDisclosure(true);
              updateSettings((s) => ({ ...s, hybrid: { ...s.hybrid, cloudFallbackEnabled: e.target.checked } }));
            }}
          />
        </div>
      </Section>

      <Section title="Classification">
        <Field label={`Confidence threshold · ${Math.round(settings.confidenceThreshold * 100)}%`} hint="Below this, you decide.">
          <input
            type="range"
            min={0.5}
            max={0.99}
            step={0.01}
            value={settings.confidenceThreshold}
            onChange={(e) => updateSettings((s) => ({ ...s, confidenceThreshold: Number(e.target.value) }))}
          />
        </Field>
        <Field label="When an item fits no stream">
          <select className="s-select" value={settings.rules.exceptionPolicy} onChange={(e) => updateSettings((s) => ({ ...s, rules: { ...s.rules, exceptionPolicy: e.target.value as "review" | "residual" } }))}>
            <option value="review">Ask for manual review (recommended)</option>
            <option value="residual">Route to residual waste</option>
          </select>
        </Field>
        <Field label="Image size sent to models" >
          <select className="s-select" value={settings.imageMaxEdge} onChange={(e) => updateSettings((s) => ({ ...s, imageMaxEdge: Number(e.target.value) }))}>
            {[512, 768, 1024, 1536].map((n) => (
              <option key={n} value={n}>
                {n}px
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section
        title={`Local rules · ${settings.rules.name}`}
        aside={
          <Button size="sm" variant="ghost" onClick={() => updateSettings((s) => ({ ...s, rules: { ...DEFAULT_RULES, exceptionPolicy: s.rules.exceptionPolicy } }))}>
            Reset
          </Button>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th>Stream</th>
              <th>Collected</th>
              <th>Otherwise</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((c) => {
              const on = settings.rules.enabled[c.id] !== false;
              return (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td>
                    <input type="checkbox" className="s-switch" checked={on} onChange={(e) => setRule(c.id, e.target.checked)} aria-label={`${c.label} collected locally`} />
                  </td>
                  <td>
                    <select className="s-select" disabled={on} value={settings.rules.redirects[c.id] ?? "review"} onChange={(e) => setRedirect(c.id, e.target.value)} aria-label={`If ${c.label} isn't collected`}>
                      <option value="review">Manual review</option>
                      {CATEGORIES.filter((o) => o.id !== c.id).map((o) => (
                        <option key={o.id} value={o.id}>
                          → {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title="Privacy & cost">
        <div className="toggle-row">
          <div>
            <p className="s-label">Keep classification history</p>
            <p className="s-hint">Never stores images.</p>
          </div>
          <input type="checkbox" className="s-switch" checked={settings.history.enabled} onChange={(e) => updateSettings((s) => ({ ...s, history: { ...s.history, enabled: e.target.checked } }))} aria-label="Keep history" />
        </div>
        <Field label="Retention (days)">
          <input
            className="s-input narrow"
            type="number"
            min={1}
            max={365}
            value={settings.history.retentionDays}
            onChange={(e) => updateSettings((s) => ({ ...s, history: { ...s.history, retentionDays: Math.min(365, Math.max(1, Number(e.target.value) || 30)) } }))}
          />
        </Field>
        <Field label="Cloud requests per session" hint={`${engine.cloudRequestCount} used`}>
          <div className="row">
            <input
              className="s-input narrow"
              type="number"
              min={0}
              max={10000}
              value={settings.budget.maxCloudRequestsPerSession}
              onChange={(e) => updateSettings((s) => ({ ...s, budget: { maxCloudRequestsPerSession: Math.min(10000, Math.max(0, Number(e.target.value) || 0)) } }))}
            />
            <Button
              size="sm"
              onClick={() => {
                engine.resetSession();
                bumpStats();
              }}
            >
              Reset counter
            </Button>
          </div>
        </Field>
        <Field label="Motion">
          <select className="s-select" value={settings.reducedMotion} onChange={(e) => updateSettings((s) => ({ ...s, reducedMotion: e.target.value as "system" | "on" | "off" }))}>
            <option value="system">Follow system</option>
            <option value="on">Reduce motion</option>
            <option value="off">Full motion</option>
          </select>
        </Field>
      </Section>

      <Section
        title="Diagnostics"
        aside={
          <Button size="sm" variant="ghost" onClick={() => engine.clearCache()}>
            Clear result cache
          </Button>
        }
      >
        <dl className="kv kv--compact">
          <div>
            <dt>Prompt version</dt>
            <dd className="s-mono">{PROMPT_VERSION}</dd>
          </div>
          <div>
            <dt>Settings stored at</dt>
            <dd className="s-mono truncate">{location}</dd>
          </div>
        </dl>
        <div className="log" role="log" aria-label="Request log">
          {logs.length === 0 ? (
            <p className="s-hint">No requests yet. Metadata only — keys and images are never logged.</p>
          ) : (
            logs.slice(0, 50).map((l, i) => (
              <p key={i} data-level={l.level}>
                <span className="s-mono muted">{l.at.slice(11, 19)}</span> {l.message}
              </p>
            ))
          )}
        </div>
      </Section>

      <Dialog open={disclosure} title="Allow cloud fallback?" onClose={() => setDisclosure(false)}>
        <div className="dialog__body">
          <p>In Hybrid mode, when the local model is unsure, SORTÉ will send that item's image to:</p>
          <p className="dialog__provider">{cloud ? `${cloud.name} (${new URL(cloud.config.endpoint).host}) · ${cloud.config.model || "no model selected"}` : "No cloud provider selected yet"}</p>
          <ul>
            <li>Sent: the resized image ({settings.imageMaxEdge}px) and a short classification prompt.</li>
            <li>Not sent: history, other images, your settings, or any identifier.</li>
            <li>Never escalated: items flagged hazardous, electronic or not-waste.</li>
            <li>Limited to {settings.budget.maxCloudRequestsPerSession} cloud requests per session.</li>
          </ul>
          <p className="s-hint">The provider's own data policy applies to what it receives.</p>
        </div>
        <div className="row row--end">
          <Button onClick={() => setDisclosure(false)}>Keep local only</Button>
          <Button
            variant="primary"
            disabled={!cloud}
            onClick={() => {
              updateSettings((s) => ({ ...s, hybrid: { cloudFallbackEnabled: true, disclosureAcknowledgedAt: new Date().toISOString() } }));
              setDisclosure(false);
            }}
          >
            Allow fallback
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
