#!/usr/bin/env node
/**
 * One-shot brand asset generator for AnyLM web.
 * Usage: node scripts/gen-brand-assets.mjs
 * Requires: sharp (install temporarily: npm install -D sharp)
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC = join(ROOT, "public");
const TMP = join(ROOT, ".tmp-brand-assets");

const BG = "#030405";
const ACCENT = "#7df9a6";
const WHITE = "#ffffff";
const MIST = "#9ca3af";

mkdirSync(PUBLIC, { recursive: true });
mkdirSync(TMP, { recursive: true });

/** Hexagon + stylized A monogram (512×512 viewBox) */
const iconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${BG}"/>
  <!-- subtle radial glow -->
  <defs>
    <radialGradient id="glow" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#glow)"/>
  <!-- hexagon frame -->
  <polygon
    points="256,88 376,157 376,295 256,364 136,295 136,157"
    fill="none"
    stroke="${ACCENT}"
    stroke-width="6"
    stroke-linejoin="round"
  />
  <!-- inner router lines -->
  <line x1="256" y1="157" x2="256" y2="295" stroke="${ACCENT}" stroke-width="3" opacity="0.35"/>
  <line x1="196" y1="226" x2="316" y2="226" stroke="${ACCENT}" stroke-width="3" opacity="0.35"/>
  <!-- stylized A -->
  <path
    d="M256 175 L310 310 L286 310 L274 278 L238 278 L226 310 L202 310 Z M246 258 L266 258 L256 228 Z"
    fill="${ACCENT}"
  />
</svg>`;

/** OG image (1200×630) with wordmark + tagline */
const ogSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="${BG}"/>
  <defs>
    <radialGradient id="ogGlow" cx="28%" cy="50%" r="45%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="accentLine" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${ACCENT}" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#ogGlow)"/>
  <!-- decorative accent line -->
  <rect x="120" y="420" width="420" height="2" fill="url(#accentLine)" opacity="0.5"/>

  <!-- icon mark (scaled) -->
  <g transform="translate(120, 165) scale(0.55)">
    <polygon
      points="256,88 376,157 376,295 256,364 136,295 136,157"
      fill="none"
      stroke="${ACCENT}"
      stroke-width="6"
      stroke-linejoin="round"
    />
    <line x1="256" y1="157" x2="256" y2="295" stroke="${ACCENT}" stroke-width="3" opacity="0.35"/>
    <line x1="196" y1="226" x2="316" y2="226" stroke="${ACCENT}" stroke-width="3" opacity="0.35"/>
    <path
      d="M256 175 L310 310 L286 310 L274 278 L238 278 L226 310 L202 310 Z M246 258 L266 258 L256 228 Z"
      fill="${ACCENT}"
    />
  </g>

  <!-- wordmark -->
  <text
    x="400"
    y="280"
    font-family="system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
    font-size="96"
    font-weight="700"
    fill="${WHITE}"
    letter-spacing="-2"
  >AnyLM</text>

  <!-- tagline -->
  <text
    x="400"
    y="350"
    font-family="system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
    font-size="32"
    font-weight="400"
    fill="${MIST}"
    letter-spacing="0.5"
  >One router. Every model. Zero duplication.</text>
</svg>`;

writeFileSync(join(TMP, "icon.svg"), iconSvg);
writeFileSync(join(TMP, "og.svg"), ogSvg);

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("sharp not found. Run: npm install -D sharp");
  process.exit(1);
}

const iconBuf = Buffer.from(iconSvg);
const ogBuf = Buffer.from(ogSvg);

async function pngFromSvg(svgBuf, size) {
  return sharp(svgBuf).resize(size, size).png({ compressionLevel: 6 }).toBuffer();
}

async function ogPng() {
  return sharp(ogBuf).resize(1200, 630).png({ compressionLevel: 6 }).toBuffer();
}

const [icon512, icon192, icon180, icon32, ogPngBuf] = await Promise.all([
  pngFromSvg(iconBuf, 512),
  pngFromSvg(iconBuf, 192),
  pngFromSvg(iconBuf, 180),
  pngFromSvg(iconBuf, 32),
  ogPng(),
]);

writeFileSync(join(PUBLIC, "icon-512.png"), icon512);
writeFileSync(join(PUBLIC, "icon-192.png"), icon192);
writeFileSync(join(PUBLIC, "apple-touch-icon.png"), icon180);
writeFileSync(join(PUBLIC, "og.png"), ogPngBuf);

// favicon.ico: 32×32 PNG bytes (widely accepted); also try real ICO via sharp
try {
  const icoBuf = await sharp(icon32).toFormat("ico").toBuffer();
  writeFileSync(join(PUBLIC, "favicon.ico"), icoBuf);
} catch {
  writeFileSync(join(PUBLIC, "favicon.ico"), icon32);
}

console.log("Generated brand assets in", PUBLIC);
