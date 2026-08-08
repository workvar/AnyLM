export function modelLockPopoverMessage({
  started,
  projectLocked,
}: {
  started: boolean;
  projectLocked: boolean;
}): string | null {
  if (started) return "Models cannot be changed after conversation has started.";
  if (projectLocked) return "Model is locked for this project.";
  return null;
}
