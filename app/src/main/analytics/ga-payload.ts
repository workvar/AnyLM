export function buildMpBody(input: {
  clientId: string;
  userId?: string | null;
  events: Array<{ name: string; params?: Record<string, unknown> }>;
}): { client_id: string; user_id?: string; events: unknown[] } {
  const body: {
    client_id: string;
    user_id?: string;
    events: Array<{ name: string; params: Record<string, unknown> }>;
  } = {
    client_id: input.clientId,
    events: input.events.map((e) => ({
      name: e.name,
      params: { engagement_time_msec: 1, ...(e.params ?? {}) },
    })),
  };
  if (input.userId) body.user_id = input.userId;
  return body;
}

export function mpCollectUrl(measurementId: string, apiSecret: string): string {
  const u = new URL("https://www.google-analytics.com/mp/collect");
  u.searchParams.set("measurement_id", measurementId);
  u.searchParams.set("api_secret", apiSecret);
  return u.toString();
}
