// Ambient DOM helper types for the renderer.
//
// The renderer looks elements up by id and immediately touches whichever
// property that element happens to have — .value on an input, .checked on a
// checkbox, .files on a file picker, .srcObject on the camera <video>.
// Typing every lookup with its exact element class would mean hundreds of
// casts for no real safety gain, since the id-to-element mapping only exists
// in index.html.
//
// UiElement is the compromise: a real HTMLElement widened with exactly the
// properties this app reads off DOM nodes. Typos on those properties are
// still caught, and anything genuinely element-specific still needs a cast.
//
// Ambient on purpose (no imports/exports) — see domain.d.ts.

interface UiElement extends HTMLElement {
  // Form controls
  value: string;
  checked: boolean;
  disabled: boolean;
  readOnly: boolean;
  placeholder: string;
  name: string;
  type: string;
  files: FileList | null;
  selectedIndex: number;
  options: HTMLOptionsCollection;
  rows: number;
  selectionStart: number | null;
  selectionEnd: number | null;
  setSelectionRange(start: number, end: number): void;
  select(): void;

  // Media / embedded content
  src: string;
  alt: string;
  srcObject: MediaProvider | null;
  videoWidth: number;
  videoHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  width: number;
  height: number;
  play(): Promise<void>;
  pause(): void;
  getContext(id: "2d"): CanvasRenderingContext2D | null;
  toDataURL(type?: string, quality?: number): string;

  // Anchor / details
  href: string;
  download: string;
  open: boolean;

  // Everything below narrows the return type of the standard lookups so
  // chained calls stay usable rather than degrading to Element.
  querySelector(selectors: string): UiElement | null;
  querySelectorAll(selectors: string): NodeListOf<UiElement>;
  closest(selectors: string): UiElement | null;
}

/** `e.target` for a listener attached to a UiElement. */
type UiEvent<E extends Event = Event> = E & { target: UiElement; currentTarget: UiElement };
