// Single source of truth for what "tools enabled" means.
// Tools are ON by default; only an explicit `false` turns them off. Any code
// that reads a stored `useTools` must go through resolveUseTools so a missing
// value never renders as "off" in one place and "on" in another.
export const DEFAULT_USE_TOOLS = true;

export function resolveUseTools(
  value: boolean | null | undefined,
  fallback: boolean | null | undefined = DEFAULT_USE_TOOLS
): boolean {
  if (value != null) return !!value;
  if (fallback != null) return !!fallback;
  return DEFAULT_USE_TOOLS;
}
