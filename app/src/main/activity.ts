// Activity emit + thought-timer helpers for the chat loop (wired in Task 3).
// ActivityEvent is ambient from domain.d.ts — do not import.

function activitySend(
  send: (channel: string, payload: unknown) => void,
  id: string,
  event: ActivityEvent
): void {
  send("chat:activity", { id, ...event });
}

function createThoughtTimer() {
  let total = 0;
  let startedAt: number | null = null;
  return {
    start() {
      if (startedAt == null) startedAt = Date.now();
    },
    end() {
      if (startedAt == null) return 0;
      const ms = Date.now() - startedAt;
      total += ms;
      startedAt = null;
      return ms;
    },
    totalMs() {
      if (startedAt != null) return total + (Date.now() - startedAt);
      return total;
    },
  };
}

export { activitySend, createThoughtTimer };
