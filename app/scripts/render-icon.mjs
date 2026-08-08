import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "build", "icon.svg"));
const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } });
writeFileSync(join(root, "build", "icon.png"), resvg.render().asPng());
console.log("wrote build/icon.png");
