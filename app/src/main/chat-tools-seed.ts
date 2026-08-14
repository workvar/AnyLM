import { resolveUseTools } from "./use-tools";

// New standalone chats: an explicit value wins, else the app default.
export function resolveNewChatUseTools(
  explicit: boolean | null | undefined,
  defaultUseToolsForChats: boolean | null | undefined
): boolean {
  return resolveUseTools(explicit, defaultUseToolsForChats);
}
