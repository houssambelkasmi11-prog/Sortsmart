import { PROVIDER_PRESETS } from "@sorte/core";
import { useEffect } from "react";
import { PageHeader } from "../App";
import { field } from "../gl/field";

const SECTIONS = [
  ["installation", "Installation"],
  ["providers", "AI provider setup"],
  ["local", "Local inference"],
  ["keys", "API key management"],
  ["device-integration", "Device integration"],
  ["troubleshooting", "Troubleshooting"],
  ["privacy", "Privacy"],
  ["security", "Security"],
  ["development", "Development setup"],
] as const;

export function Docs() {
  useEffect(() => {
    field.setMood(0, 0.45);
    return () => field.setMood(0, 1);
  }, []);
  return (
    <div className="page page--docs">
      <PageHeader eyebrow="Documentation" title="Set up SORTÉ." />
      <div className="docs">
        <nav className="docs__toc" aria-label="Documentation sections">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>

        <article className="docs__body">
          <section id="installation">
            <h2>Installation</h2>
            <p>
              Published installers appear on the <a href="/download">download page</a> with their SHA-256 checksum. Until a release is published, build from source (see{" "}
              <a href="#development">Development setup</a>). macOS 11+ and Windows 10 (1803+) with WebView2 are the targets.
            </p>
            <p>On first launch SORTÉ starts in <strong>Demo</strong> mode: no account or key needed. It checks for a new version first thing on every launch, downloads it in the background, and asks you to restart.</p>
          </section>

          <section id="providers">
            <h2>AI provider setup</h2>
            <p>Open <em>AI Providers</em> in the desktop app, add a provider, test the connection, discover models, and pick one. Each adapter uses the provider's own API format.</p>
            <table className="docs__table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Runs</th>
                  <th>Key</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(PROVIDER_PRESETS).map(([id, p]) => (
                  <tr key={id}>
                    <td>{p.label}</td>
                    <td>{p.location === "local" ? "On this machine" : "Cloud"}</td>
                    <td>{p.requiresKey ? "Required" : "—"}</td>
                    <td>{p.setupHint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              OpenAI-compatible endpoints do not reveal whether a model accepts images or JSON-schema output. Declare these in the provider settings only if your model supports them;
              SORTÉ refuses to send images otherwise.
            </p>
          </section>

          <section id="local">
            <h2>Local inference</h2>
            <ol>
              <li>
                Install Ollama from <span className="s-mono">ollama.com</span> and start it.
              </li>
              <li>
                Pull a vision-capable model: <code>ollama pull &lt;model&gt;</code>. Check that <code>ollama show &lt;model&gt;</code> lists <em>vision</em> under capabilities.
              </li>
              <li>In SORTÉ → Local Models, keep the endpoint at <code>http://127.0.0.1:11434</code>, refresh, and select the model.</li>
              <li>Switch the AI mode to <strong>Local</strong>.</li>
            </ol>
            <p>SORTÉ never downloads model weights or runs binaries on your behalf. Text-only models are detected and blocked from image classification.</p>
          </section>

          <section id="keys">
            <h2>API key management</h2>
            <p>
              Keys are written to the OS credential store (macOS Keychain, Windows Credential Manager) by the Rust backend and bound to the provider's host. The UI only ever sees the last four
              characters. Keys are never placed in settings files, logs, the web build, or environment variables. Replace or delete a key at any time from the provider panel.
            </p>
          </section>

          <section id="device-integration">
            <h2>Device integration</h2>
            <p>
              Devices implement the <code>SortingDevice</code> contract: <code>connect</code>, <code>disconnect</code>, <code>getStatus</code>, <code>executeSort</code> and{" "}
              <code>safeStop</code>. Commands carry a validated category, a unique id, a timestamp, a timeout and the classification id. Adapters must reject unsupported categories and
              expired commands.
            </p>
            <p>
              Results report four separate facts: command accepted, device acknowledged, and physical verification (<em>verified</em>, <em>failed</em>, <em>timeout</em> or{" "}
              <em>not-supported</em>). Today only a simulated adapter exists and is labelled as such everywhere. A real adapter (HTTP, WebSocket, serial or MQTT) will be added once a hardware
              protocol is specified.
            </p>
          </section>

          <section id="troubleshooting">
            <h2>Troubleshooting</h2>
            <dl className="docs__faq">
              <dt>“Could not connect” to Ollama</dt>
              <dd>Make sure Ollama is running (<code>ollama serve</code>) and the endpoint is on localhost.</dd>
              <dt>“Does not accept images”</dt>
              <dd>The selected model lacks vision capability. Pull a vision model and select it.</dd>
              <dt>Authentication failed (401/403)</dt>
              <dd>Replace the API key. SORTÉ does not retry authentication errors.</dd>
              <dt>Session cloud budget reached</dt>
              <dd>Raise the per-session limit in Settings, or restart the app to begin a new session.</dd>
              <dt>Everything says “Needs review”</dt>
              <dd>Check your confidence threshold and local rules; a disabled stream without a redirect always requires review.</dd>
            </dl>
          </section>

          <section id="privacy">
            <h2>Privacy</h2>
            <ul>
              <li>Local and Demo modes send no images off the device. The only other request is the update check, to GitHub. There is no telemetry.</li>
              <li>Cloud mode sends the resized image and a short prompt to the provider you selected — nothing else.</li>
              <li>Hybrid mode only escalates to cloud after you enable it and acknowledge a disclosure. Hazardous items are never escalated.</li>
              <li>History is off by default. When enabled it stores results and an image hash — never the image — and is pruned after your retention period. You can clear it at any time.</li>
            </ul>
          </section>

          <section id="security">
            <h2>Security</h2>
            <ul>
              <li>The website has no access to keys and cannot call cloud providers. Its JavaScript is static.</li>
              <li>The desktop webview has a strict CSP and no direct network access; all HTTP goes through the Rust backend, which validates URLs and attaches keys only to the host they were saved for.</li>
              <li>Plain HTTP is accepted only for loopback endpoints. Cloud endpoints require HTTPS.</li>
              <li>Local inference servers stay on localhost; SORTÉ does not expose them.</li>
              <li>Every model response, persisted setting and device command is schema-validated.</li>
            </ul>
            <p className="muted">SORTÉ has not undergone a formal security audit or certification.</p>
          </section>

          <section id="development">
            <h2>Development setup</h2>
            <pre className="code">
              <code>{`# Node 20+, Rust stable (rustup), platform toolchains
npm install
npm test                # core logic tests (mock providers, no network)
npm run typecheck
npm run dev:web         # website on http://localhost:5173
npm run tauri dev       # desktop app
npm run tauri build     # installers for the current OS
npm run release:manifest -- --base-url https://…   # update download manifest from artifacts`}</code>
            </pre>
            <p>Code signing (Apple Developer ID + notarisation, Windows Authenticode) requires your own credentials, supplied through CI secrets — never committed.</p>
          </section>
        </article>
      </div>
    </div>
  );
}
