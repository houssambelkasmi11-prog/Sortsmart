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

## Releases

1. `npm run tauri build` on each platform.
2. `npm run release:manifest` records checksums; add `--base-url https://…` once artifacts are uploaded to mark them published (`--signed`, `--notarized` only when true).
3. The download page reads `apps/web/src/releases/manifest.json` and never links to unpublished builds.

Signing needs your own credentials, supplied via CI secrets — never committed: Apple Developer ID + notarisation (`APPLE_CERTIFICATE`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`), Windows Authenticode certificate.

## Known limitations

- No physical device adapter yet — waiting for the hardware protocol.
- Model confidence is self-reported, not calibrated; corrections in History are the data to calibrate with.
- Windows build is configured but not yet built or tested on Windows.
- No formal security audit.
