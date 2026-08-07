// Time-window helpers for usage limit periods.

export type LimitPeriod = "daily" | "weekly" | "monthly" | "lifetime";

// Start of the current window for a period, in local server time.
export function periodStart(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case "daily":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "weekly": {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      // Week starts Monday.
      const day = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - day);
      return d;
    }
    case "monthly":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "lifetime":
    default:
      return null; // no lower bound
  }
}
