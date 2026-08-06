// Theme: light / dark / system. "system" follows the OS via matchMedia.
const mql = window.matchMedia("(prefers-color-scheme: dark)");
let current = "system";

// Resolve the chosen theme to an actual palette and set it on <html>.
function paint() {
  const resolved = current === "system" ? (mql.matches ? "dark" : "light") : current;
  document.documentElement.setAttribute("data-theme", resolved);
}

// Re-paint on OS change, but only while we're in "system" mode.
mql.addEventListener("change", () => {
  if (current === "system") paint();
});

export function applyTheme(theme) {
  current = theme || "system";
  paint();
}
