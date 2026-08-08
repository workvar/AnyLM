export function resolveNewChatUseTools(
  explicit: boolean | undefined,
  defaultUseToolsForChats: boolean
): boolean {
  return explicit != null ? !!explicit : !!defaultUseToolsForChats;
}
