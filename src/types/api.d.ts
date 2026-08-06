// The contract preload.ts exposes on `window.api`. This is the single source
// of truth for the IPC surface: preload implements it, the renderer consumes
// it, so a rename on one side is a compile error on the other.
//
// Ambient on purpose (no imports/exports) — see domain.d.ts.

/** Every on*() subscriber returns its own unsubscribe function. */
type Unsubscribe = () => void;

interface ToolEvent {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "running" | "done";
  output?: string;
}

interface ToolConfirmRequest {
  id: string;
  token: string;
  tool: { name: string; description: string };
  args: Record<string, unknown>;
}

interface GovernanceEvent {
  id: string;
  warnings: string[];
}

interface AskEvent {
  id: string;
  token: string;
  question: string;
  options?: string[];
  recommended?: string;
}

interface UpdateStatus {
  state: string;
  version?: string;
  percent?: number;
  notes?: string;
  error?: string;
}

interface ChatPayload {
  projectId?: string | null;
  threadId?: string | null;
  model: string;
  messages: ChatMessage[];
  attachments?: {
    docs?: Array<{ name: string; text: string }>;
    images?: string[];
  };
  useTools?: boolean;
}

interface AnyLmApi {
  platform: NodeJS.Platform;

  // Auth
  authMe(): Promise<AuthUser | null>;
  authLogin(email: string, password: string): Promise<AuthUser>;
  authRegister(email: string, password: string, name: string): Promise<AuthUser>;
  authOAuth(provider: string): Promise<AuthUser>;
  authLogout(): Promise<{ success: boolean }>;

  // Governance
  gov<T = any>(method: string, path: string, body?: unknown): Promise<T>;
  govEffective(): Promise<Policy[]>;
  govIdentity(): Promise<Identity>;
  exportUsage(orgId: string): Promise<string | null>;

  // Working folder
  workspaceGet(): Promise<string>;
  workspacePick(): Promise<string>;
  workspaceClear(): Promise<boolean>;

  // Tools
  toolsList(): Promise<ToolDefinition[]>;
  toolsSave(tool: Partial<ToolDefinition>): Promise<ToolDefinition>;
  toolsDelete(id: string): Promise<boolean>;
  toolsToggle(id: string, enabled: boolean): Promise<ToolDefinition | null>;

  // Skills
  skillsList(): Promise<SkillDefinition[]>;
  skillsSave(skill: Partial<SkillDefinition>): Promise<SkillDefinition>;
  skillsDelete(id: string): Promise<boolean>;
  skillsToggle(id: string, enabled: boolean): Promise<SkillDefinition | null>;
  skillsConnectors(): Promise<ConnectorStatus[]>;
  skillsConnect(provider: string): Promise<ConnectorStatus[]>;
  skillsDisconnect(provider: string): Promise<ConnectorStatus[]>;

  // Chat-time events
  onToolEvent(cb: (e: ToolEvent) => void): Unsubscribe;
  onToolConfirm(cb: (r: ToolConfirmRequest) => void): Unsubscribe;
  replyToolConfirm(token: string, approved: boolean): void;
  onFileGenerated(cb: (f: GeneratedFile & { id: string }) => void): Unsubscribe;
  onGovernance(cb: (e: GovernanceEvent) => void): Unsubscribe;
  onAsk(cb: (e: AskEvent) => void): Unsubscribe;
  replyAsk(token: string, answer: string | null): void;
  cancelChat(id: string): void;

  // Settings
  getSettings(): Promise<AppSettings>;
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  getVersion(): Promise<string>;

  // Local OpenAI-compatible endpoint
  proxyStatus(): Promise<ProxyStatus>;

  // General knowledge base
  knowledgeCount(): Promise<number>;
  knowledgeClear(): Promise<boolean>;

  // Customize (personal context applied to every chat)
  userContextGet(): Promise<UserContext>;
  userContextSet(patch: Partial<UserContext>): Promise<UserContext>;

  // Embedding model
  embedStatus(): Promise<{ model: string; installed: boolean }>;
  embedRequirements(): Promise<EmbedRequirements>;
  embedState(): Promise<EmbedState>;
  installEmbed(onProgress: (s: EmbedState) => void): void;
  onEmbedProgress(cb: (s: EmbedState) => void): Unsubscribe;

  // Updates
  checkForUpdate(): Promise<UpdateStatus>;
  downloadUpdate(): Promise<UpdateStatus>;
  cancelUpdate(): Promise<boolean>;
  installUpdate(): Promise<void>;
  onUpdateStatus(cb: (msg: UpdateStatus) => void): Unsubscribe;

  // Ollama + Chroma
  ollamaStatus(): Promise<{ ok: boolean; host: string; error?: string }>;
  chromaStatus(): Promise<{ ok: boolean; host: string }>;
  listModels(): Promise<string[]>;
  modelInfo(model: string): Promise<number>;
  summarizeChat(model: string, messages: ChatMessage[]): Promise<string>;

  // Projects
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<PublicProject | null>;
  createProject(data: Partial<Project> & { folderBase?: string }): Promise<Project | null>;
  updateProject(id: string, patch: Partial<Project>): Promise<Project | null>;
  deleteProject(id: string): Promise<boolean>;

  // Project folder on disk
  pfilesDefaultBase(): Promise<string>;
  pfilesPickFolder(): Promise<string | null>;
  pfilesList(projectId: string): Promise<{ dir: string | null; files: ProjectFileEntry[] }>;
  pfilesRead(projectId: string, name: string): Promise<ProjectFileRead | null>;
  pfilesPreview(projectId: string, name: string): Promise<FilePreview>;
  pfilesSaveMd(projectId: string, title: string, markdown: string): Promise<GeneratedFile>;
  pfilesSavePdf(projectId: string, title: string, html: string, text: string): Promise<GeneratedFile>;
  pfilesReveal(projectId: string): Promise<boolean>;
  pfilesShow(dir: string, name: string): Promise<boolean>;
  pfilesOpen(dir: string, name: string): Promise<boolean>;
  pfilesAppsFor(
    dir: string,
    name: string
  ): Promise<{ defaultApp: OpenApp | null; apps: OpenApp[] }>;
  pfilesOpenWith(dir: string, name: string, appId: string): Promise<boolean>;
  pfilesExists(dir: string, name: string): Promise<boolean>;
  pfilesSetLocation(projectId: string, dir: string): Promise<string | null>;

  // Recents
  recentsList(limit?: number): Promise<RecentEntry[]>;

  // Standalone chats
  listChats(): Promise<ChatSummary[]>;
  getChat(id: string): Promise<StandaloneChat | null>;
  createChat(data: Partial<StandaloneChat>): Promise<StandaloneChat>;
  updateChat(id: string, patch: Partial<StandaloneChat>): Promise<StandaloneChat | null>;
  deleteChat(id: string): Promise<boolean>;

  titleChat(model: string, messages: ChatMessage[]): Promise<string>;

  // Folders
  listFolders(projectId: string): Promise<ProjectFolder[]>;
  addFolder(projectId: string, name: string): Promise<ProjectFolder | null>;
  renameFolder(projectId: string, folderId: string, name: string): Promise<ProjectFolder | null>;
  removeFolder(projectId: string, folderId: string): Promise<boolean>;

  // Threads
  listThreads(projectId: string): Promise<ThreadSummary[]>;
  getThread(projectId: string, threadId: string): Promise<ProjectThread | null>;
  createThread(projectId: string, data?: Partial<ProjectThread>): Promise<ProjectThread | null>;
  updateThread(
    projectId: string,
    threadId: string,
    patch: Partial<ProjectThread>
  ): Promise<ProjectThread | null>;
  deleteThread(projectId: string, threadId: string): Promise<boolean>;

  // Context references
  addContext(
    projectId: string,
    file: { name: string; content: string }
  ): Promise<PublicProject | null>;
  removeContext(projectId: string, contextId: string): Promise<boolean>;

  /** Streaming chat. onChunk(text) fires per token; resolves when done. */
  chat(
    payload: ChatPayload,
    onChunk: (text: string) => void,
    onId?: (id: string) => void
  ): Promise<{ full: string; usage: ChatUsage; stopped?: boolean }>;

  // Model management
  deleteModel(model: string): Promise<boolean>;
  pullModel(model: string, onProgress: (p: PullProgress) => void): Promise<void>;
  cancelPullModel(model: string): void;
}

interface Window {
  api: AnyLmApi;
}

declare const api: AnyLmApi;
