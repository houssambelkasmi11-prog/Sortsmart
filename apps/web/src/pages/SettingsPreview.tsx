import { PROVIDER_PRESETS } from "@sorte/core";
import { StatusPill } from "@sorte/ui";
import { Link } from "react-router-dom";
import { PageHeader } from "../App";

/**
 * Informational preview only. Real configuration — and every secret — lives
 * inside the desktop app's security boundary. Nothing here is interactive.
 */
export function SettingsPreview() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="App preview"
        title={
          <>
            Configured in the app.
            <br />
            <em>Never in the browser.</em>
          </>
        }
        lede="This page shows what SORTÉ Desktop lets you configure. The website cannot store keys or reach AI providers."
      />
      <div className="preview s-panel" aria-label="Preview of desktop settings (not interactive)">
        <div className="preview__bar">
          <StatusPill tone="amber">Preview · not interactive</StatusPill>
        </div>
        <div className="preview__grid">
          <PreviewGroup title="AI mode" items={["Local — on-device inference only", "Cloud — your selected provider", "Hybrid — local first, cloud only if authorised", "Demo — simulated, always labelled"]} />
          <PreviewGroup title="Providers" items={Object.values(PROVIDER_PRESETS).map((p) => `${p.label} · ${p.location}`)} />
          <PreviewGroup title="Classification" items={["Confidence threshold (default 75%)", "Exception policy: review or residual", "Local stream rules & redirects", "Image size sent to models"]} />
          <PreviewGroup title="Privacy & cost" items={["History off by default · retention days", "Clear history", "Cloud requests per session limit", "Request timeout"]} />
        </div>
      </div>
      <p className="page__foot">
        <Link to="/download" className="s-btn s-btn--primary">
          Get SORTÉ Desktop
        </Link>
      </p>
    </div>
  );
}

function PreviewGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="preview__group">
      <h2 className="s-eyebrow">{title}</h2>
      <ul>
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
