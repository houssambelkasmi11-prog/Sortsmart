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

## Live camera and liquid glass

The app opens on **Live** (`apps/desktop/src/screens/Live.tsx`): the camera fills the window and glass controls float on top.

- **When a model runs:** `packages/core/src/live.ts` compares small grayscale frames on the device. It learns the empty scene, waits for an item to hold still, and triggers one classification per item. Nothing is sent while the picture moves, and the shutter always works manually. Auto with a cloud provider asks for permission first, and the session budget still applies.
- **Privacy:** the camera only runs on the Live screen. Frames aren't stored; history keeps results and a hash.
- **Glass:** `apps/desktop/src/gl` renders the background shader and camera, then refracts them through every `[data-glass]` element using a signed distance field, so panels really bend the picture and melt together. Without WebGL2 the app falls back to a CSS blur. Quality drops automatically on slow GPUs.

## Website deployment

Vercel builds only `apps/web` (see `vercel.json`); `.vercelignore` keeps the Rust backend out of the deployment.

## Releases & auto-update

Every push to `main` that touches the app builds and publishes a new release automatically
(`.github/workflows/release.yml`): macOS (Apple silicon) and Windows (x64) installers plus `latest.json`,
versioned `major.minor.<run number>`. The release only goes public after both platforms succeed.
Website and Markdown-only pushes don't trigger a release.

Installed apps check `github.com/houssambelkasmi11-prog/Sortsmart/releases/latest/download/latest.json`
on launch and every 6 hours, download in the background, and install when the user clicks
**Restart to update**. Every update is verified against the public key in `tauri.conf.json`; a tampered
or unsigned update is rejected. Both automatic steps can be turned off in Settings → Updates.

**One-time setup:**
- The repo must be **public**: apps download release files without logging in.
- Repo → Settings → Secrets and variables → Actions → add `TAURI_SIGNING_PRIVATE_KEY` with the contents of
  `~/.tauri/sorte.key` (`pbcopy < ~/.tauri/sorte.key`). Back this file up: if it's lost, existing installs
  can't verify new updates and must be reinstalled manually.
- Repo → Settings → Actions → General → Workflow permissions: **Read and write**, so the workflow can publish releases.

To bump the major or minor version, run `npm run release:version 0.2.0` and commit. Builds are ad-hoc signed;
for Gatekeeper-clean downloads add an Apple Developer ID (see the comment in the workflow).

Local signed build: `TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/sorte.key)" npm run tauri build`.

## Known limitations

- No physical device adapter yet — waiting for the hardware protocol.
- Model confidence is self-reported, not calibrated; corrections in History are the data to calibrate with.
- Windows build has not been run on real Windows hardware.
- The live camera has only been tested with a simulated video stream, not a physical camera inside the packaged app.
- No formal security audit.
