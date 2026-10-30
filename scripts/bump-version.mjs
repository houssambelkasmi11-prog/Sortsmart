#!/usr/bin/env node
// Sets the app version everywhere it lives: npm run release:version 0.2.0
// Then: git commit -am "Release v0.2.0" && git tag v0.2.0 && git push --follow-tags
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: npm run release:version <major.minor.patch>");
  process.exit(1);
}
const root = new URL("..", import.meta.url).pathname;
const files = ["package.json", "apps/desktop/package.json", "apps/desktop/src-tauri/tauri.conf.json"];
for (const f of files) {
  const p = join(root, f);
  const json = JSON.parse(readFileSync(p, "utf8"));
  json.version = version;
  writeFileSync(p, JSON.stringify(json, null, 2) + "\n");
}
const cargo = join(root, "apps/desktop/src-tauri/Cargo.toml");
writeFileSync(cargo, readFileSync(cargo, "utf8").replace(/^version = ".*"$/m, `version = "${version}"`));
console.log(`Version set to ${version}. Next:\n  git commit -am "Release v${version}" && git tag v${version} && git push --follow-tags`);
