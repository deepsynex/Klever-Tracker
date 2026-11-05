// Copies MapLibre's web worker into public/, so the browser can load it from this site.
// MapLibre looks for the worker next to its own script, but the bundler moves that script into a
// chunk without the worker beside it ("Worker failed to load"). live-osm-map.tsx points MapLibre
// at /maplibre/maplibre-gl-worker.mjs instead. Runs before dev and build; the copy isn't committed.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("maplibre-gl/package.json"));
const target = path.join(process.cwd(), "public", "maplibre");
mkdirSync(target, { recursive: true });
copyFileSync(path.join(dist, "dist", "maplibre-gl-worker.mjs"), path.join(target, "maplibre-gl-worker.mjs"));
console.log("Copied MapLibre worker to public/maplibre/");
