// Chat attachments: images, documents, folders, and camera capture.
// Documents are sent as per-turn context; images go to vision-capable models.
import { el, node } from "./dom.js";

let attachments = []; // { kind: "image" | "doc", name, base64?, text? }
let stream = null;

const TEXT_EXT = /\.(txt|md|markdown|json|csv|log|tsv|yml|yaml|js|ts|py|html|css)$/i;

function renderChips() {
  const wrap = el("attach-chips");
  wrap.innerHTML = "";
  attachments.forEach((a, i) => {
    const chip = node("span", "chip");
    chip.appendChild(node("span", "chip-name", `${a.kind === "image" ? "🖼" : "📄"} ${a.name}`));
    const x = node("button", "chip-x", "×");
    x.type = "button";
    x.onclick = () => {
      attachments.splice(i, 1);
      renderChips();
    };
    chip.appendChild(x);
    wrap.appendChild(chip);
  });
}

function closeMenu() {
  el("attach-menu").classList.add("hidden");
  el("attach-btn").setAttribute("aria-expanded", "false");
}

function addImageFile(file) {
  return new Promise<void>((resolve) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = String(r.result);
      attachments.push({
        kind: "image",
        name: file.name,
        base64: dataUrl.split(",")[1] || "",
        dataUrl,
      });
      resolve();
    };
    r.readAsDataURL(file);
  });
}

async function addDocFile(file) {
  attachments.push({ kind: "doc", name: file.name, text: await file.text() });
}

// --- Camera ---
async function openCamera() {
  el("camera-error").textContent = "";
  el("camera-modal").classList.remove("hidden");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    el("camera-video").srcObject = stream;
  } catch (e) {
    el("camera-error").textContent = `Camera unavailable: ${(e as Error).message}`;
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  el("camera-video").srcObject = null;
}

function closeCamera() {
  stopCamera();
  el("camera-modal").classList.add("hidden");
}

function capture() {
  const video = el("camera-video") as unknown as HTMLVideoElement;
  if (!video.videoWidth) return;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  attachments.push({
    kind: "image",
    name: `camera-${Date.now()}.jpg`,
    base64: dataUrl.split(",")[1] || "",
    dataUrl,
  });
  renderChips();
  closeCamera();
}

export function initAttach() {
  el("attach-btn").onclick = (e) => {
    e.stopPropagation();
    const menu = el("attach-menu");
    const willOpen = menu.classList.contains("hidden");
    menu.classList.toggle("hidden");
    el("attach-btn").setAttribute("aria-expanded", String(willOpen));
  };
  el("attach-menu").onclick = (e) => e.stopPropagation();
  document.addEventListener("click", closeMenu);

  for (const b of el("attach-menu").querySelectorAll("[data-attach]")) {
    b.onclick = () => {
      closeMenu();
      const kind = b.dataset.attach;
      if (kind === "image") el("attach-image-input").click();
      else if (kind === "document") el("attach-doc-input").click();
      else if (kind === "folder") el("attach-folder-input").click();
      else if (kind === "camera") openCamera();
    };
  }

  el("attach-image-input").onchange = async (e) => {
    for (const f of (e.target as UiElement).files) await addImageFile(f);
    (e.target as UiElement).value = "";
    renderChips();
  };
  el("attach-doc-input").onchange = async (e) => {
    for (const f of (e.target as UiElement).files) await addDocFile(f);
    (e.target as UiElement).value = "";
    renderChips();
  };
  el("attach-folder-input").onchange = async (e) => {
    for (const f of (e.target as UiElement).files) if (TEXT_EXT.test(f.name)) await addDocFile(f);
    (e.target as UiElement).value = "";
    renderChips();
  };

  el("camera-cancel").onclick = closeCamera;
  el("camera-capture").onclick = capture;
  el("camera-modal").onclick = (e) => {
    if ((e.target as UiElement).id === "camera-modal") closeCamera();
  };
}

/** Snapshot pending tray items for persistence into state.chat. */
export function snapshotPending() {
  return attachments.map((a) => ({
    kind: a.kind as "image" | "doc",
    name: a.name as string,
    text: a.text as string | undefined,
    dataUrl: a.dataUrl as string | undefined,
  }));
}

export function hasAttachments() {
  return attachments.length > 0;
}

export function clearAttachments() {
  attachments = [];
  renderChips();
}
