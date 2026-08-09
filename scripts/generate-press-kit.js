#!/usr/bin/env node
/**
 * Rasterize press-kit SVGs and copy into web/public for OG / favicons.
 * Usage: node scripts/generate-press-kit.js
 */
const fs = require("fs");
const path = require("path");

async function main() {
  let Resvg;
  try {
    ({ Resvg } = require("@resvg/resvg-js"));
  } catch {
    console.error("Missing @resvg/resvg-js. Run: npm install --no-save @resvg/resvg-js");
    process.exit(1);
  }

  const root = path.resolve(__dirname, "..");
  const press = path.join(root, "press-kit");
  const pub = path.join(root, "web", "public");
  fs.mkdirSync(pub, { recursive: true });
  fs.mkdirSync(path.join(press, "gallery"), { recursive: true });

  function render(svgPath, outPath, width) {
    const svg = fs.readFileSync(svgPath);
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: width },
      background: "rgba(0,0,0,0)",
    });
    const png = resvg.render().asPng();
    fs.writeFileSync(outPath, png);
    console.log("wrote", path.relative(root, outPath), `(${width}px)`);
  }

  const logoSvg = path.join(press, "logo.svg");
  const socialSvg = path.join(press, "social-1200x630.svg");

  render(logoSvg, path.join(press, "logo-1024.png"), 1024);
  render(logoSvg, path.join(press, "logo-512.png"), 512);
  render(logoSvg, path.join(press, "logo-240.png"), 240);
  render(logoSvg, path.join(pub, "icon-512.png"), 512);
  render(logoSvg, path.join(pub, "icon-192.png"), 192);
  render(logoSvg, path.join(pub, "apple-touch-icon.png"), 180);
  render(logoSvg, path.join(pub, "favicon-32.png"), 32);
  render(socialSvg, path.join(press, "social-1200x630.png"), 1200);
  render(socialSvg, path.join(pub, "og.png"), 1200);

  // favicon.ico: write 32px PNG as favicon.png (modern browsers); keep ico-less fallback
  fs.copyFileSync(path.join(pub, "favicon-32.png"), path.join(pub, "favicon.png"));
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
