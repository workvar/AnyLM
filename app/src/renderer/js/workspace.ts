// Working-folder picker: scopes the model's file tools to one directory.
import { el } from "./dom.js";

export function initWorkspace() {
  const btn = el("workspace-btn");
  const label = el("workspace-label");

  const render = (root) => {
    const name = root ? root.split(/[\\/]/).filter(Boolean).pop() : "";
    btn.classList.toggle("active", !!root);
    btn.title = root
      ? `Working folder: ${root} (click to change)`
      : "Choose a working folder for file tools";
    label.classList.toggle("hidden", !root);
    label.innerHTML = "";
    if (!root) return;
    const text = document.createElement("span");
    text.className = "chip-name";
    text.textContent = `📁 ${name}`;
    text.title = root;
    label.appendChild(text);
    const x = document.createElement("button");
    x.type = "button";
    x.className = "chip-x";
    x.textContent = "×";
    x.title = "Clear working folder";
    x.onclick = async () => {
      await window.api.workspaceClear();
      render(null);
    };
    label.appendChild(x);
  };

  btn.onclick = async () => render(await window.api.workspacePick());
  window.api.workspaceGet().then(render);
  window.api.onWorkspaceChanged?.(({ root }) => render(root));
}
