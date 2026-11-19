/**
 * Builds the PNG images used by the alert email (backend-requests/email-templates/alert.blade.php)
 * and the Notification rules email preview: header artwork, icons and the footer wave.
 * Email apps block SVG, so they're rendered to PNG at 2x with the app's own Lucide icons.
 *
 *   node scripts/build-email-assets.mjs     → public/email/*.png
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const icons = require("lucide-react");

const OUT = new URL("../public/email/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const TEAL = "#0b6e69";
const TEAL_DARK = "#08524e";
const GREEN = "#1f9d55";
const SOFT = "#dcefec";
// The brand logo in its original colours (email has no light/dark theme); the pin's centre filled white.
const LOGO = readFileSync(new URL("../src/components/brand.tsx", import.meta.url), "utf8");
const logoPaths = [...LOGO.matchAll(/d="([^"]+)"/g)].map((m) => m[1]);
const [pinPath, kleverPath, trackerPath] = logoPaths;
const logoSvg = (height) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="9 10.9 335.2 98.1" style="height:${height}px;width:auto;display:block">
  <g fill="#5bbfb4"><circle cx="27.79" cy="92.44" r="3.6"/><circle cx="32.97" cy="83.31" r="3.6"/><circle cx="40.68" cy="76.5" r="3.6"/><circle cx="50.74" cy="78.01" r="3.6"/><circle cx="57.95" cy="85.56" r="3.6"/><circle cx="64.5" cy="93.75" r="3.6"/><circle cx="73.8" cy="98" r="3.6"/></g>
  <circle cx="18" cy="100" r="9" fill="#0b6e69"/><circle cx="18" cy="100" r="3.6" fill="#fff"/>
  <path d="${pinPath}" fill="#0b6e69"/><circle cx="82" cy="40" r="11" fill="#fff"/><circle cx="82" cy="40" r="5" fill="#f5a623"/>
  <path d="${kleverPath}" fill="#0f2f2d"/><path d="${trackerPath}" fill="#0b6e69"/>
</svg>`;

const svg = (name, color, size, extra = {}) => renderToStaticMarkup(React.createElement(icons[name], { color, size, strokeWidth: 2.2, ...extra }));

/** [file, width, height, html] — sizes are 2x the size shown in the email. */
const ASSETS = [];

// Round badges: coloured circle with a white icon (alert box), or soft circle with a teal icon (rows).
const badge = (file, name, bg, fg, px = 96) =>
  ASSETS.push([
    file,
    px,
    px,
    `<div style="width:${px}px;height:${px}px;border-radius:50%;background:${bg};display:grid;place-items:center">${svg(name, fg, Math.round(px * 0.5))}</div>`,
  ]);
badge("alert-red.png", "Bell", "#e0262f", "#fff", 120);
for (const [file, name] of [
  ["row-vehicle.png", "CarFront"],
  ["row-location.png", "MapPin"],
  ["row-geofence.png", "Building2"],
  ["row-speed.png", "Gauge"],
])
  badge(file, name, SOFT, TEAL, 80);

// Plain icons on a transparent background.
const icon = (file, name, color, px) => ASSETS.push([file, px, px, `<div style="width:${px}px;height:${px}px;display:grid;place-items:center">${svg(name, color, px)}</div>`]);
icon("icon-car-white.png", "CarFront", "#fff", 56);
icon("icon-clock-white.png", "Clock", "#fff", 36);
icon("icon-live-white.png", "MapPinned", "#fff", 44);
icon("icon-chevron-white.png", "ChevronRight", "#fff", 36);
icon("feature-tracking.png", "Zap", TEAL, 64);
icon("feature-alerts.png", "Bell", TEAL, 64);
icon("feature-security.png", "ShieldCheck", TEAL, 64);

// Header: brand on the left, a map with a route and pin, and the tracked car on the right, over a green wave.
ASSETS.push([
  "header.png",
  1200,
  320,
  `<div style="position:relative;width:1200px;height:320px;overflow:hidden;background:linear-gradient(180deg,#f6fbfa 0%,#ffffff 70%);font-family:'Segoe UI',Arial,sans-serif">
    <svg width="1200" height="320" style="position:absolute;inset:0">
      <defs>
        <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(-14)">
          <path d="M56 0H0V56" fill="none" stroke="#d7e6e3" stroke-width="2"/>
        </pattern>
        <linearGradient id="fade" x1="0" x2="1"><stop offset="0.38" stop-color="#fff" stop-opacity="1"/><stop offset="0.62" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <linearGradient id="wave" x1="0" x2="1"><stop offset="0" stop-color="${TEAL_DARK}"/><stop offset="0.55" stop-color="${TEAL}"/><stop offset="1" stop-color="${GREEN}"/></linearGradient>
      </defs>
      <rect width="1200" height="320" fill="url(#grid)"/>
      <rect width="1200" height="320" fill="url(#fade)"/>
      <path d="M640 300 C 700 250, 760 270, 800 210 S 860 120, 905 92" fill="none" stroke="${TEAL}" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 16" opacity="0.85"/>
      <ellipse cx="1030" cy="250" rx="150" ry="34" fill="none" stroke="${TEAL}" stroke-opacity="0.25" stroke-width="4"/>
      <ellipse cx="1030" cy="250" rx="105" ry="22" fill="none" stroke="${TEAL}" stroke-opacity="0.4" stroke-width="4"/>
      <path d="M0 262 C 260 222, 520 300, 820 268 S 1100 232, 1200 246 L1200 320 L0 320 Z" fill="url(#wave)"/>
      <path d="M0 250 C 280 214, 540 288, 820 256 S 1100 222, 1200 232" fill="none" stroke="#7fd0a8" stroke-width="6" opacity="0.55"/>
    </svg>
    <div style="position:absolute;left:880px;top:30px">${svg("MapPin", TEAL, 58, { fill: SOFT })}</div>
    <div style="position:absolute;left:940px;top:120px;width:180px;height:140px;display:grid;place-items:center;border-radius:36px;background:#fff;box-shadow:0 18px 40px rgba(16,36,34,.18)">${svg("CarFront", TEAL, 104, { strokeWidth: 1.8 })}</div>
    <div style="position:absolute;left:56px;top:40px">
      ${logoSvg(150)}
      <div style="margin:14px 0 0 6px;font-size:26px;color:#334155;letter-spacing:.3px">Track &nbsp;·&nbsp; Monitor &nbsp;·&nbsp; Stay Alert</div>
    </div>
  </div>`,
]);

// Footer wave.
ASSETS.push([
  "footer.png",
  1200,
  120,
  `<svg width="1200" height="120" style="display:block">
    <defs><linearGradient id="w" x1="0" x2="1"><stop offset="0" stop-color="${GREEN}"/><stop offset="0.5" stop-color="${TEAL}"/><stop offset="1" stop-color="${TEAL_DARK}"/></linearGradient></defs>
    <path d="M0 40 C 300 0, 600 90, 900 46 S 1150 20, 1200 34 L1200 120 L0 120 Z" fill="url(#w)"/>
    <path d="M0 60 C 320 26, 620 104, 920 66 S 1160 44, 1200 52 L1200 120 L0 120 Z" fill="${TEAL_DARK}" opacity="0.55"/>
  </svg>`,
]);

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, w, h, html] of ASSETS) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${html}</body></html>`);
  await page.screenshot({ path: fileURLToPath(new URL(file, OUT)), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  console.log("✓", file);
}
await browser.close();
