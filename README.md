# SORTÉ

Intelligent recycling: a website, a desktop app (macOS · Windows), and an AI classification core for a five-stream smart bin.

```
packages/core     Classification engine, provider adapters, device contract, schemas (TypeScript, Zod) + tests
packages/ui       Design tokens, bundled fonts, shared primitives
apps/web          Website — Three.js lens hero, /sorting /technology /download /docs /settings
apps/desktop      Desktop UI (React) + src-tauri (Rust: keychain, HTTP proxy, storage)
scripts/          Release manifest generator
```

## Run

Requires Node 20+, Rust stable and the platform toolchain (Xcode CLT on macOS; MSVC + WebView2 on Windows).

```bash
npm install
npm test                 # core logic (mock providers, no network)
npm run typecheck
npm run dev:web          # http://localhost:5173
npm run tauri dev        # desktop app
npm run tauri build      # installers for this OS → apps/desktop/src-tauri/target/release/bundle
```

`npm run dev:desktop` runs the desktop UI in a browser for quick UI work: no keychain, localhost-only networking.

## Architecture decisions

- **Providers** (`packages/core/src/providers`): one `AIProvider` interface; adapters for Ollama, OpenAI-compatible servers, OpenAI, Anthropic, Google Gemini (native API), DeepSeek (OpenAI-compatible; its API is text-only today, so photo classification stays off), and a deterministic demo. Capabilities are probed (Ollama `/api/show`) or explicitly declared — never assumed.
- **Engine** (`packages/core/src/engine.ts`): validate → infer → schema-check → confidence/safety → local rules → result or review. Content-hash cache, in-flight de-duplication, bounded retry for transient errors only, per-session cloud budget. Hybrid escalates to cloud only when enabled **and** disclosed; hazardous items never escalate.
- **Devices** (`packages/core/src/device`): transport-independent `SortingDevice`. Only a labelled simulator exists; commands require a review-free result or a person's decision. Accepted, acknowledged and physically verified are reported separately.
- **Security boundary**: the desktop webview has a strict CSP and no network access. All HTTP goes through Rust (`src-tauri/src/http.rs`), which validates URLs/headers, follows no redirects, and attaches keys from the OS credential store only to the origin they were saved for. The UI only ever sees the last 4 key characters. The website has no keys and no provider access.

## Releases & updates

Releases are built by GitHub Actions (`.github/workflows/release.yml`) and served from
`github.com/houssambelkasmi11-prog/sorte/releases`. Installed apps check
`releases/latest/download/latest.json` on launch and every 6 hours, show an in-app banner, and
install only after the user clicks **Update**. Every update is verified against the public key in
`tauri.conf.json`; an unsigned or tampered update is rejected.

**One-time setup** — in the GitHub repo → Settings → Secrets and variables → Actions:
- `TAURI_SIGNING_PRIVATE_KEY`: contents of `~/.tauri/sorte.key` (`pbcopy < ~/.tauri/sorte.key`)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: empty unless you regenerate the key with a password
- Optional, for Gatekeeper-clean macOS builds: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`

Back up `~/.tauri/sorte.key`. If it's lost, existing installs can't verify new updates and must be reinstalled manually.

**Each release:**
```bash
npm run release:version 0.2.0
git commit -am "Release v0.2.0" && git tag v0.2.0 && git push --follow-tags
```
The workflow drafts a release with macOS (Apple silicon) and Windows (x64) installers plus `latest.json`.
Review it and click **Publish** — only then do installed apps see the update. Then refresh the website's
download page with `npm run release:manifest -- --base-url https://github.com/houssambelkasmi11-prog/sorte/releases/download/v0.2.0`.

Local signed build: `TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/sorte.key)" npm run tauri build`.

## Known limitations

- No physical device adapter yet — waiting for the hardware protocol.
- Model confidence is self-reported, not calibrated; corrections in History are the data to calibrate with.
- Windows build is configured but not yet built or tested on Windows.
- No formal security audit.
