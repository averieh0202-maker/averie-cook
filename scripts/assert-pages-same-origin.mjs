#!/usr/bin/env node
/**
 * Guard the Cloudflare Pages frontend build: relative /api, root base,
 * no workers.dev API host baked into JS/HTML.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "web/dist");
const forbiddenHost = "averie-cook-api.averieh0202.workers.dev";

if (!existsSync(join(dist, "index.html"))) {
  console.error("web/dist/index.html missing — run npm run build:pages first");
  process.exit(1);
}

const index = readFileSync(join(dist, "index.html"), "utf8");
if (index.includes("/averie-cook/")) {
  console.error("CF Pages build still uses GitHub Pages base /averie-cook/");
  process.exit(1);
}
if (index.includes(forbiddenHost)) {
  console.error("CF Pages index.html still points at workers.dev");
  process.exit(1);
}

const routes = JSON.parse(readFileSync(join(dist, "_routes.json"), "utf8"));
if (!Array.isArray(routes.include) || !routes.include.includes("/api/*") || !routes.include.includes("/health")) {
  console.error("dist/_routes.json must include /api/* and /health");
  process.exit(1);
}

let scanned = 0;
function walk(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(p);
      continue;
    }
    if (!/\.(js|css|html)$/.test(ent.name)) continue;
    scanned += 1;
    const text = readFileSync(p, "utf8");
    if (text.includes(forbiddenHost)) {
      console.error(`CF Pages build still points at workers.dev: ${p}`);
      process.exit(1);
    }
  }
}
walk(dist);

if (scanned === 0) {
  console.error("no JS/CSS/HTML assets scanned in web/dist");
  process.exit(1);
}

console.log(`OK: CF Pages build is same-origin /api (${scanned} assets, root base)`);
