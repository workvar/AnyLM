// Minimal .env parser. Deliberately not the `dotenv` package: this runs at
// build time only, the format we need is one KEY=value per line, and adding a
// dependency to read eight lines is not worth it.
const fs = require("fs");

/** Parse .env text into a plain object. Ignores blanks and # comments. */
function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip one layer of matching quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/** Read and parse a .env file. Returns {} when the file does not exist. */
function readEnvFile(filePath) {
  try {
    return parseEnv(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

module.exports = { parseEnv, readEnvFile };
