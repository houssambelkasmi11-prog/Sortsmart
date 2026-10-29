#!/usr/bin/env node
// Updates apps/web/src/releases/manifest.json from real build artifacts.
//
//   node scripts/generate-release-manifest.mjs                       # record checksums, keep unpublished
//   node scripts/generate-release-manifest.mjs --base-url https://…  # mark entries with artifacts as published
//   --signed / --notarized   only pass these if the artifacts really are.
//
// An entry is only marked published when its artifact exists AND a base URL is given.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const manifestPath = join(root, "apps/web/src/releases/manifest.json");
const bundleDirs = [join(root, "apps/desktop/src-tauri/target/release/bundle"), join(root, "apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle")];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const baseUrl = value("--base-url");
if (baseUrl && !/^https:\/\/[^/]+/.test(baseUrl)) throw new Error("--base-url must be an https URL");

const pkg = JSON.parse(readFileSync(join(root, "apps/desktop/src-tauri/tauri.conf.json"), "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const FORMATS = { dmg: { dir: "dmg", ext: ".dmg" }, "nsis-exe": { dir: "nsis", ext: ".exe" }, msi: { dir: "msi", ext: ".msi" } };
const ARCH_HINT = { aarch64: /aarch64|arm64/i, x86_64: /x64|x86_64|amd64/i, universal: /universal/i };

function findArtifact(r) {
  const f = FORMATS[r.format];
  if (!f) return null;
  for (const base of bundleDirs) {
    const dir = join(base, f.dir);
    if (!existsSync(dir)) continue;
    const file = readdirSync(dir).find((n) => n.endsWith(f.ext) && ARCH_HINT[r.arch].test(n));
    if (file) return join(dir, file);
  }
  return null;
}

for (const r of manifest.releases) {
  r.version = pkg.version;
  const file = findArtifact(r);
  if (!file) {
    Object.assign(r, { status: "unpublished", url: null, sha256: null, sizeBytes: null, releaseDate: null, signed: false, notarized: false });
    console.log(`– ${r.platform}/${r.arch}: no artifact`);
    continue;
  }
  const buf = readFileSync(file);
  const name = file.split("/").pop();
  r.sha256 = createHash("sha256").update(buf).digest("hex");
  r.sizeBytes = statSync(file).size;
  r.signed = flag("--signed");
  r.notarized = r.platform === "macos" && flag("--notarized");
  if (baseUrl) {
    r.status = "published";
    r.url = `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(name)}`;
    r.releaseDate = new Date().toISOString().slice(0, 10);
  } else {
    r.status = "unpublished";
    r.url = null;
  }
  console.log(`✓ ${r.platform}/${r.arch}: ${name} ${r.sha256.slice(0, 12)}… ${r.status}`);
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
