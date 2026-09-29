#!/usr/bin/env node
/**
 * Render Product Hunt / landing gallery PNGs (1270×760) that match the
 * AWC/MD3 desktop mockups shown on the marketing site.
 */
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const OUT = path.join(__dirname, "..", "press-kit", "gallery");
const W = 1270;
const H = 760;

const shots = [
  {
    file: "01-hero.png",
    title: "Chat workspace",
    lines: [
      "Pool every local model behind one OpenAI endpoint.",
      "Cursor, Continue, and scripts hit 127.0.0.1:3227/v1.",
    ],
  },
  {
    file: "02-projects-rag.png",
    title: "Projects + RAG",
    lines: ["Attach reference docs.", "Chunks embed and retrieve into every turn."],
  },
  {
    file: "03-multi-agent.png",
    title: "Multi-agent trail",
    lines: ["Planner → Research → Coder → Synthesize", "Visible agent trail on complex turns."],
  },
  {
    file: "04-models.png",
    title: "Models pool",
    lines: ["llama3.2 · resident", "nomic-embed-text · ready"],
  },
  {
    file: "05-endpoint.png",
    title: "Local API :3227",
    lines: ["http://127.0.0.1:3227/v1", "OpenAI-compatible · signed builds"],
  },
];

function svgFor(shot) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#030405"/>
      <stop offset="55%" stop-color="#0a0c10"/>
      <stop offset="100%" stop-color="#12151c"/>
    </linearGradient>
    <radialGradient id="glow" cx="72%" cy="28%" r="45%">
      <stop offset="0%" stop-color="#7df9a6" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#7df9a6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- App window -->
  <rect x="90" y="90" width="1090" height="560" rx="28" fill="#0a0c10" stroke="#404943" stroke-width="2"/>
  <rect x="90" y="90" width="1090" height="48" rx="28" fill="#12151c"/>
  <rect x="90" y="118" width="1090" height="20" fill="#12151c"/>
  <circle cx="120" cy="114" r="7" fill="#ff5f57"/>
  <circle cx="146" cy="114" r="7" fill="#febc2e"/>
  <circle cx="172" cy="114" r="7" fill="#28c840"/>
  <text x="210" y="120" fill="#bfc9c1" font-family="ui-sans-serif, system-ui, sans-serif" font-size="16">AnyLM · ${shot.title}</text>

  <!-- Sidebar -->
  <rect x="90" y="138" width="240" height="512" fill="#12151c"/>
  <circle cx="130" cy="180" r="14" fill="#7df9a6"/>
  <text x="156" y="186" fill="#e2e8e2" font-family="ui-sans-serif, system-ui, sans-serif" font-size="18" font-weight="600">AnyLM</text>
  <rect x="110" y="210" width="200" height="36" rx="18" fill="#7df9a6"/>
  <text x="210" y="233" text-anchor="middle" fill="#00391c" font-family="ui-sans-serif, system-ui, sans-serif" font-size="14" font-weight="600">+ New chat</text>
  <text x="120" y="280" fill="#8a938b" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11">CHATS</text>
  <rect x="110" y="295" width="200" height="32" rx="10" fill="#374b3e"/>
  <text x="124" y="316" fill="#d1e8d5" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">Local router design</text>
  <text x="124" y="352" fill="#bfc9c1" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">RAG for notes</text>
  <text x="124" y="384" fill="#bfc9c1" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">Ollama setup</text>

  <!-- Main pane copy -->
  <text x="380" y="220" fill="#7df9a6" font-family="ui-sans-serif, system-ui, sans-serif" font-size="14" font-weight="600">Material Design 3</text>
  <text x="380" y="270" fill="#e2e8e2" font-family="ui-sans-serif, system-ui, sans-serif" font-size="36" font-weight="600">${shot.title}</text>
  <text x="380" y="320" fill="#bfc9c1" font-family="ui-sans-serif, system-ui, sans-serif" font-size="20">${shot.lines[0]}</text>
  <text x="380" y="360" fill="#bfc9c1" font-family="ui-sans-serif, system-ui, sans-serif" font-size="20">${shot.lines[1] || ""}</text>
  <rect x="380" y="420" width="220" height="40" rx="20" fill="#7df9a6"/>
  <text x="490" y="446" text-anchor="middle" fill="#00391c" font-family="ui-sans-serif, system-ui, sans-serif" font-size="15" font-weight="600">AWC UI · local-first</text>
</svg>`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const shot of shots) {
  const svg = svgFor(shot);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    background: "transparent",
  });
  const png = resvg.render().asPng();
  const dest = path.join(OUT, shot.file);
  fs.writeFileSync(dest, png);
  console.log("wrote", dest, `(${png.length} bytes)`);
}
