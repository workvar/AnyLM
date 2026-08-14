// Ambient domain types shared by the main process and the renderer.
// No imports/exports here on purpose: keeping this file script-scoped makes
// every type global, so neither tsconfig has to reach across its rootDir.

// --- Settings ---------------------------------------------------------------

type ThemePreference = "system" | "light" | "dark";
type ReportFrequency = "off" | "daily" | "weekly" | "monthly";

interface AgentModelMap {
  planner: string | null;
  router: string | null;
  toolExecutor: string | null;
  synthesize: string | null;
  research: string | null;
  factCheck: string | null;
  summarize: string | null;
  document: string | null;
}

interface LoadProtectionSettings {
  enabled: boolean;
  killPercent: number;
}

interface AgentSettings {
  enabled: boolean;
  maxParallel: number;
  models: AgentModelMap;
  loadProtection: LoadProtectionSettings;
}

interface AnalyticsSettings {
  productUsage: boolean;
  reliability: boolean;
  chatEvents: boolean;
  titles: boolean;
  modelAndTokens: boolean;
  truncatedMessageText: boolean;
  truncateChars: number;
}

interface AppSettings {
  theme: ThemePreference;
  checkUpdatesOnLaunch: boolean | null;
  autoDownloadUpdates: boolean;
  installUpdatesOnQuit: boolean;
  sidebarCollapsed: boolean;
  railCollapsed: boolean;
  lastModel: string;
  /** Default `useTools` for newly created standalone (non-project) chats. */
  defaultUseToolsForChats: boolean;
  chromaHost: string;
  chromaPort: number;
  chromaSsl: boolean;
  ollamaSetupDeclined: boolean | null;
  setupWizardCompleted: boolean | null;
  embedInstallDeclined: boolean | null;
  notifyUsage: boolean;
  notifyRenewals: boolean;
  notifyReports: boolean;
  notifyInterventions: boolean;
  reportFrequency: ReportFrequency;
  lastReportAt: string | null;
  /** Per-org alert bookkeeping so the scheduler does not re-notify. */
  govAlerts: Record<string, GovAlert>;
  proxyEnabled: boolean;
  proxyPort: number;
  /** Customize: personal context added to every chat. */
  userContext: UserContext;
  agents: AgentSettings;
  analyticsConsent: boolean | null;
  analytics: AnalyticsSettings;
}

interface UserContext {
  enabled: boolean;
  name: string;
  about: string;
  work: string;
  style: string;
  extra: string;
}

interface GovAlert {
  periodKey: string | null;
  level: number;
}

/** An Error carrying the HTTP status the proxy should reply with. */
interface HttpError extends Error {
  status?: number;
}

// --- Chat primitives --------------------------------------------------------

type ChatRole = "system" | "user" | "assistant" | "tool";

type ActivityEvent =
  | { kind: "thinking"; phase: "start" | "end"; ms?: number }
  | { kind: "status"; text: string }
  | {
      kind: "tool";
      name: string;
      label: string;
      status: "running" | "done";
      args?: Record<string, unknown>;
      output?: string;
      detail?: string;
    }
  | {
      kind: "confirm";
      token: string;
      label: string;
      tool: { name: string; description: string };
      args: Record<string, unknown>;
    }
  | {
      kind: "ask";
      token: string;
      question: string;
      options?: string[];
    }
  | {
      kind: "done";
      thoughtMs: number;
      toolCount: number;
      summary: string;
    }
  | { kind: "agent:plan"; steps: { id: string; goal: string; stepKind: string }[] }
  | {
      kind: "agent:step";
      id: string;
      goal: string;
      stepKind: string;
      parallelGroup: number;
      status: "running" | "done" | "error";
      detail?: string;
    }
  | { kind: "agent:merge" };

interface MessageActivity {
  thoughtMs: number;
  toolCount: number;
  summary: string;
  events: ActivityEvent[];
}

interface ChatMessage {
  role: ChatRole;
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
  activity?: MessageActivity;
}

interface FileArtifactMessage {
  role: "artifact";
  type: "file";
  name: string;
  ext: string;
  dir: string;
  createdAt: number;
}

interface AskMessage {
  role: "ask";
  question: string;
  /** null means skipped */
  answer: string | null;
}

interface ChatAttachmentMessage {
  role: "attachment";
  kind: "image" | "doc";
  name: string;
  dataUrl?: string;
  text?: string;
  createdAt: number;
}

type StoredMessage = ChatMessage | FileArtifactMessage | AskMessage | ChatAttachmentMessage;

interface ChatUsage {
  tokens: number;
  ctx: number;
  percent: number;
  promptTokens: number;
  completionTokens: number;
  /** true when Ollama reported real counts, false for the ~4 chars/token estimate */
  measured: boolean;
}

interface OllamaToolCall {
  function?: { name?: string; arguments?: Record<string, unknown> };
}

interface OllamaToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description?: string }>;
      required: string[];
    };
  };
}

interface ChatStreamResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  toolCalls: OllamaToolCall[];
}

// --- Projects, threads, chats ----------------------------------------------

interface ProjectContext {
  id: string;
  name: string;
  chars: number;
  summary: string;
  chunkCount?: number;
  embedded?: boolean;
  embedError?: string | null;
  addedAt: string;
  /** legacy inline chunks, superseded by Chroma-backed storage */
  chunks?: Array<{ text: string; vector?: number[] }>;
}

interface ProjectFolder {
  id: string;
  name: string;
  createdAt: string;
}

interface ProjectThread {
  id: string;
  title: string;
  folderId: string | null;
  messages: StoredMessage[];
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  skillOverrides?: string[];
  useTools?: boolean;
}

interface Project {
  id: string;
  name: string;
  instructions: string;
  model: string;
  folderPath: string;
  contexts: ProjectContext[];
  threads?: ProjectThread[];
  folders?: ProjectFolder[];
  archived: boolean;
  importGeneral: boolean;
  exportToGeneral: boolean;
  shareToOrg?: boolean;
  autoLog?: boolean;
  locked?: boolean;
  /** Members cannot change the project's model. */
  modelLocked?: boolean;
  /** When true, threads in this project default to tools on (existing + new). */
  defaultUseTools?: boolean;
  createdAt: string;
}

/** Renderer-safe project: threads dropped, contexts stripped of chunk text. */
type PublicProject = Omit<Project, "threads">;

interface ProjectSummary {
  id: string;
  name: string;
  model: string;
  archived: boolean;
  contextCount: number;
  chatCount: number;
  updatedAt: string;
}

interface ThreadSummary {
  id: string;
  title: string;
  folderId: string | null;
  msgCount: number;
  updatedAt: string;
}

interface StandaloneChat {
  id: string;
  title: string;
  model: string;
  messages: StoredMessage[];
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  skillOverrides?: string[];
  useTools?: boolean;
}

interface ChatSummary {
  id: string;
  kind: "chat";
  title: string;
  model: string;
  msgCount: number;
  updatedAt: string;
}

interface ThreadRecent {
  kind: "thread";
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  model: string;
  msgCount: number;
  updatedAt: string;
}

type RecentEntry = ChatSummary | ThreadRecent;

// --- Tools and skills -------------------------------------------------------

interface ToolParam {
  name: string;
  description: string;
  required: boolean;
}

interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  params: ToolParam[];
  command?: string;
  enabled: boolean;
  builtin?: boolean;
  risky?: boolean;
}

interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  instructions: string;
  tools: ToolDefinition[];
  /** Ids of registry tools this skill pulls in, as sent by the editor. */
  toolNames?: string[];
  enabled: boolean;
  builtin?: boolean;
  provider?: string;
}

interface ConnectorStatus {
  provider: string;
  connected: boolean;
  configured: boolean;
  accountLabel?: string | null;
}

// --- Governance -------------------------------------------------------------

type PolicyKind =
  | "token_limit"
  | "budget"
  | "rate_limit"
  | "model_allowlist"
  | "content_filter"
  | "pii"
  | "logging";

interface Policy {
  id: string;
  orgId: string;
  kind: PolicyKind;
  scope: string;
  enabled: boolean;
  config: Record<string, unknown> | string;
}

interface Identity {
  userId: string | null;
  orgId: string | null;
  orgName: string | null;
  role: string | null;
  orgChromaUrl: string;
}

interface PolicyVerdict {
  blocked: boolean;
  reason?: string;
  warnings: string[];
  text: string;
}

interface PreflightResult {
  allowed: boolean;
  reason?: string;
  warnings: string[];
}

// --- Auth -------------------------------------------------------------------

interface AuthTokens {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string | null;
}

interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
}

// --- Retrieval --------------------------------------------------------------

interface RetrievedChunk {
  name: string;
  text: string;
  score: number;
  shared?: boolean;
}

interface ChromaRecord {
  text: string;
  metadata: Record<string, string>;
  score: number;
}

// --- Misc -------------------------------------------------------------------

interface EmbedState {
  active: boolean;
  percent: number;
  status: string;
  error: string | null;
  done: boolean;
}

interface EmbedRequirements {
  model: string;
  sizeLabel: string;
  sizeBytes: number;
  paramLabel: string;
  quant: string;
  minRamGB: number;
  totalRamGB: number;
  freeDiskOk: boolean;
  ok: boolean;
  reason: string | null;
}

interface PullProgress {
  percent: number | null;
  status: string;
  error?: string;
}

/** Models settings browser entry (curated + live search). */
type ModelCompatRating = "best" | "good" | "bad";

interface ModelCatalogEntry {
  name: string;
  display: string;
  description: string;
  sizeLabel: string;
  sizeBytes: number | null;
  minRamGB: number;
  requirements: string;
  bestFor: string;
  compatibility: ModelCompatRating;
  installed: boolean;
  popular?: boolean;
}

interface ProjectFileEntry {
  name: string;
  ext: string;
  size: number;
  mtime: string;
}

interface ArtifactRoot {
  id: string;
  label: string;
  dir: string;
  kind: "generated" | "project";
}

/** pfiles:read — inline content for text, a file:// url for PDFs, neither for
 *  docx/pptx (the viewer calls pfiles:preview for those). */
interface ProjectFileRead {
  name: string;
  ext: string;
  url?: string;
  content?: string;
}

/** pfiles:apps-for / pfiles:open-with — OS-registered app for opening a file. */
interface OpenApp {
  id: string;
  name: string;
}

type FilePreview =
  | { kind: "html"; html: string }
  | { kind: "slides"; slides: string[] }
  | { kind: "none" };

interface ProxyStatus {
  running: boolean;
  port: number | null;
  baseUrl: string | null;
}

/**
 * A risky-tool confirmation stored on disk so it survives the turn that asked
 * for it. "pending" is live in this process; "expired" means the user never
 * answered (timeout, stop, or app quit) and it can be offered again.
 */
interface PendingConfirmRecord {
  token: string;
  /** Conversation key: "chat:<id>" or "thread:<id>". */
  key: string;
  chatId?: string | null;
  projectId?: string | null;
  threadId?: string | null;
  toolName: string;
  toolDescription?: string;
  args: Record<string, unknown>;
  createdAt: number;
  status: "pending" | "expired";
}

interface GeneratedFile {
  name: string;
  ext: string;
  /** Folder the file was written to. */
  dir?: string;
  /** Absolute path, when the generator wrote straight to disk. */
  path?: string;
  projectId?: string | null;
}
