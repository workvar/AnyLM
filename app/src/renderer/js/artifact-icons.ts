// Finder-style file-type icons for the Artifacts explorer grid.
function svgEl(tag: string, attrs: Record<string, string> = {}): SVGElement {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function docShell(fill: string, badge: string): SVGElement {
  const svg = svgEl("svg", {
    viewBox: "0 0 64 64",
    class: "artifact-type-svg",
    "aria-hidden": "true",
  });
  // Page body
  svg.appendChild(
    svgEl("path", {
      d: "M14 6h26l10 10v42a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z",
      fill,
    })
  );
  // Folded corner
  svg.appendChild(
    svgEl("path", {
      d: "M40 6v10h10",
      fill: "none",
      stroke: "rgba(0,0,0,0.22)",
      "stroke-width": "2",
      "stroke-linejoin": "round",
    })
  );
  svg.appendChild(
    svgEl("path", {
      d: "M40 6l10 10H44a4 4 0 0 1-4-4V6z",
      fill: "rgba(255,255,255,0.35)",
    })
  );
  // Type badge band
  svg.appendChild(
    svgEl("rect", {
      x: "10",
      y: "34",
      width: "44",
      height: "16",
      rx: "2",
      fill: "rgba(0,0,0,0.28)",
    })
  );
  const label = svgEl("text", {
    x: "32",
    y: "46",
    "text-anchor": "middle",
    "font-size": "11",
    "font-family": "ui-sans-serif, system-ui, sans-serif",
    "font-weight": "700",
    fill: "#fff",
    "letter-spacing": "0.5",
  });
  label.textContent = badge;
  svg.appendChild(label);
  return svg;
}

function folderIcon(): SVGElement {
  const svg = svgEl("svg", {
    viewBox: "0 0 64 64",
    class: "artifact-type-svg",
    "aria-hidden": "true",
  });
  // Back tab
  svg.appendChild(
    svgEl("path", {
      d: "M8 18a4 4 0 0 1 4-4h14l4 4h22a4 4 0 0 1 4 4v6H8v-10z",
      fill: "#2fbf6d",
    })
  );
  // Front body
  svg.appendChild(
    svgEl("path", {
      d: "M8 26h48a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V26z",
      fill: "#7df9a6",
    })
  );
  // Soft highlight
  svg.appendChild(
    svgEl("path", {
      d: "M12 30h40a2 2 0 0 1 2 2v4H10v-4a2 2 0 0 1 2-2z",
      fill: "rgba(255,255,255,0.28)",
    })
  );
  return svg;
}

const FILE_ICONS: Record<string, () => SVGElement> = {
  ".pdf": () => docShell("#e4574c", "PDF"),
  ".docx": () => docShell("#2b579a", "DOC"),
  ".doc": () => docShell("#2b579a", "DOC"),
  ".pptx": () => docShell("#c43e1c", "PPT"),
  ".ppt": () => docShell("#c43e1c", "PPT"),
  ".xlsx": () => docShell("#217346", "XLS"),
  ".xls": () => docShell("#217346", "XLS"),
  ".md": () => docShell("#6b7280", "MD"),
};

export function artifactKindIcon(kind: "folder" | string): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "artifact-icon-wrap";
  wrap.dataset.kind = kind === "folder" ? "folder" : kind.replace(/^\./, "") || "file";
  const svg = kind === "folder" ? folderIcon() : (FILE_ICONS[kind.toLowerCase()] || (() => docShell("#64748b", "FILE")))();
  wrap.appendChild(svg);
  return wrap;
}
