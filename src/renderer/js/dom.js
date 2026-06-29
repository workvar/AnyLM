// Tiny DOM helpers.
export const el = (id) => document.getElementById(id);

export function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}
