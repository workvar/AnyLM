// Serializes async calls so at most one is "in flight" at a time, without
// blocking unrelated work. Used to keep interactive confirm()/ask() prompts
// to one-at-a-time when parallel tool workers might otherwise both need the
// user's attention in the same wave (see orchestrator maxParallel).
export function createMutex(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<void> = Promise.resolve();
  return function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn, fn);
    // Chain continues regardless of whether `fn` resolved or rejected; the
    // rejection itself still propagates to whoever awaited `run`.
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
