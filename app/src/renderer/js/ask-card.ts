// The clarification card: the model's question with numbered options,
// arrow-key selection, a free-text escape hatch, and Skip.
//
// Pinned in #ask-dock above the composer; re-rendered when the user returns
// to a chat that asked while they were elsewhere.
import { el, node } from "./dom.js";

interface AskCardHandlers {
  onAnswer(text: string): void;
  onSkip(): void;
  onFreeform(): void;
}

let cursor = 0;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

function clearKeys() {
  if (keyHandler) document.removeEventListener("keydown", keyHandler, true);
  keyHandler = null;
}

// Remove the card (answered, skipped, or the conversation was left).
export function clearAsk(): void {
  clearKeys();
  const dock = el("ask-dock");
  if (dock) {
    dock.innerHTML = "";
    dock.classList.add("hidden");
  }
  for (const card of document.querySelectorAll(".ask-card")) card.remove();
}

export function renderAsk(ask, handlers: AskCardHandlers): void {
  clearAsk();
  const dock = el("ask-dock");
  dock.classList.remove("hidden");
  const options: string[] = ask.options || [];
  cursor = 0;

  const card = node("div", "ask-card");

  const head = node("div", "ask-head");
  head.appendChild(node("div", "ask-question", ask.question));
  const skip = node("button", "ask-skip", "Skip");
  skip.type = "button";
  skip.onclick = () => {
    clearAsk();
    handlers.onSkip();
  };
  head.appendChild(skip);
  card.appendChild(head);

  const list = node("div", "ask-options");
  const rows: HTMLElement[] = [];

  options.forEach((text, i) => {
    const row = node("button", "ask-option");
    row.type = "button";
    row.appendChild(node("span", "ask-num", String(i + 1)));
    const label = node("span", "ask-option-label", text);
    if (ask.recommended && text === ask.recommended) {
      label.appendChild(node("span", "ask-rec", "Recommended"));
    }
    row.appendChild(label);
    row.appendChild(node("span", "ask-arrow", "→"));
    row.onclick = () => {
      clearAsk();
      handlers.onAnswer(text);
    };
    row.onmouseenter = () => setCursor(i);
    list.appendChild(row);
    rows.push(row);
  });

  // Always available: answer in your own words, in the composer below.
  const other = node("button", "ask-option ask-other");
  other.type = "button";
  other.appendChild(node("span", "ask-num", "✎"));
  other.appendChild(node("span", "ask-option-label", "Something else"));
  other.onclick = () => handlers.onFreeform();
  other.onmouseenter = () => setCursor(rows.length);
  list.appendChild(other);
  rows.push(other);

  card.appendChild(list);
  card.appendChild(
    node("div", "ask-hint", "↑↓ to navigate · Enter to select · or type your answer below")
  );

  dock.appendChild(card);

  function setCursor(i: number) {
    cursor = Math.max(0, Math.min(rows.length - 1, i));
    rows.forEach((r, n) => r.classList.toggle("on", n === cursor));
  }
  setCursor(0);

  // Arrow keys work from anywhere, including the composer, so the user never
  // has to reach for the mouse. Typing a digit picks that option.
  keyHandler = (e: KeyboardEvent) => {
    if (!document.body.contains(card)) return clearKeys();
    const typing = document.activeElement === el("chat-input");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor(cursor + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor(cursor - 1);
    } else if (e.key === "Enter" && !typing) {
      e.preventDefault();
      rows[cursor].click();
    } else if (!typing && /^[1-9]$/.test(e.key)) {
      const i = Number(e.key) - 1;
      if (i < options.length) {
        e.preventDefault();
        rows[i].click();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      skip.click();
    }
  };
  document.addEventListener("keydown", keyHandler, true);
}
