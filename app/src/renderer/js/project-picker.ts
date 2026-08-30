// Reaching a project from a new chat. Two entry points share this menu: the
// sidebar's "New chat" split button (start the chat in a project) and the
// composer chip (move an as-yet-unsent chat into one).
import { el } from "./dom.js";
import { state } from "./state.js";
import { showMenu, type MenuEntry } from "./menu.js";
import { selectChat, archiveChat } from "./chats.js";
import { fetchThreads, openThread, archiveThread } from "./threads.js";
import { loadProjects, createProject } from "./projects.js";
import { showView } from "./nav.js";
import { updateDraft } from "./contextmeter.js";
import { resizeComposer } from "./composer-autogrow.js";
import {
  conversationStarted,
  currentProjectId,
  initProjectChip,
  setProjectChipHandler,
  syncProjectChip,
} from "./project-chip.js";

// Menus stay glanceable; the rest is one click away behind "All projects…".
const MAX_MENU_PROJECTS = 6;

function recentProjects() {
  return state.projects
    .filter((p) => !p.archived)
    .slice()
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

function browseProjects() {
  showView("projects");
  void loadProjects();
}

// --- Creating a conversation in a given place ---

async function newStandaloneChat(title = "") {
  const model = state.lastModel || state.models[0] || "";
  const c = await window.api.createChat({ title: title || "New chat", model });
  await selectChat(c.id);
}

async function newProjectThread(projectId: string, title = "") {
  const project = await window.api.getProject(projectId);
  if (!project) return false;
  state.current = project;
  state.viewProject = project;
  const t = await window.api.createThread(projectId, { title: title || "New chat" });
  await fetchThreads();
  await openThread(t.id);
  return true;
}

/** Start a fresh conversation, in a project or standalone. */
export async function startChatIn(projectId: string | null) {
  if (projectId) {
    if (!(await newProjectThread(projectId))) return;
  } else {
    await newStandaloneChat();
  }
  el("convo-name").focus();
}

// --- Moving a conversation that has not been sent yet ---

async function moveCurrentTo(projectId: string | null) {
  if (conversationStarted() || !state.current) return;
  if (currentProjectId() === projectId) return;

  const draft = el("chat-input").value;
  const typedTitle = el("convo-name").value.trim();
  const title = typedTitle && typedTitle !== "New chat" ? typedTitle : "";
  const source =
    state.mode === "chat"
      ? ({ kind: "chat", id: state.current.id } as const)
      : ({ kind: "thread", projectId: state.current.id, id: state.thread?.id } as const);
  if (source.kind === "thread" && !source.id) return;

  if (projectId) {
    if (!(await newProjectThread(projectId, title))) return;
  } else {
    await newStandaloneChat(title);
  }

  // The conversation the user was looking at is now an empty duplicate.
  if (source.kind === "chat") await archiveChat(source.id);
  else await archiveThread(source.projectId, source.id as string);

  if (draft) {
    el("chat-input").value = draft;
    updateDraft(draft);
    resizeComposer(el("chat-input"));
  }
  el("chat-input").focus();
}

// --- The shared menu ---

interface PickerOptions {
  anchor: UiElement;
  place: "below" | "above";
  ariaLabel: string;
  noneLabel: string;
  /** Undefined renders a plain menu; null/id renders radio items with a tick. */
  selectedId?: string | null;
  onPick: (projectId: string | null) => void | Promise<void>;
}

function entriesFor(opts: PickerOptions): MenuEntry[] {
  const marked = opts.selectedId !== undefined;
  const list = recentProjects();
  const shown = list.slice(0, MAX_MENU_PROJECTS);

  const entries: MenuEntry[] = [
    {
      label: opts.noneLabel,
      checked: marked ? opts.selectedId === null : undefined,
      onClick: () => void opts.onPick(null),
    },
  ];
  if (shown.length) entries.push({ separator: true });
  for (const p of shown) {
    entries.push({
      label: p.name || "Untitled project",
      checked: marked ? p.id === opts.selectedId : undefined,
      onClick: () => void opts.onPick(p.id),
    });
  }
  entries.push({ separator: true });
  if (list.length > shown.length) {
    entries.push({ label: "All projects…", onClick: browseProjects });
  }
  entries.push({ label: "New project…", onClick: () => void createProject() });
  return entries;
}

async function openPicker(opts: PickerOptions) {
  await loadProjects(); // the list may have changed since the grid last painted
  const r = opts.anchor.getBoundingClientRect();
  const y = opts.place === "above" ? r.top - 6 : r.bottom + 6;
  showMenu(r.left, y, entriesFor(opts), {
    ariaLabel: opts.ariaLabel,
    anchor: opts.anchor,
    place: opts.place,
  });
}

export function initProjectPicker() {
  initProjectChip();

  // Composer chip: move this not-yet-sent chat.
  setProjectChipHandler(() => {
    void openPicker({
      anchor: el("project-trigger"),
      place: "above",
      ariaLabel: "Move this chat to a project",
      noneLabel: "No project",
      selectedId: currentProjectId(),
      onPick: moveCurrentTo,
    });
  });

  // Sidebar split button: start the next chat somewhere specific.
  const caret = el("new-chat-project-btn");
  if (caret) {
    caret.onclick = (e) => {
      e.stopPropagation();
      void openPicker({
        anchor: caret,
        place: "below",
        ariaLabel: "Start a new chat in",
        noneLabel: "Standalone chat",
        onPick: startChatIn,
      });
    };
  }

  syncProjectChip();
}

export { syncProjectChip };
