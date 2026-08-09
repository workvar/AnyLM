import { describe, expect, test } from "bun:test";
import { buildMpBody, mpCollectUrl } from "./ga-payload";

describe("ga-payload", () => {
  test("buildMpBody omits user_id when absent", () => {
    const body = buildMpBody({
      clientId: "c1",
      events: [{ name: "app_opened", params: { app: "desktop" } }],
    });
    expect(body.user_id).toBeUndefined();
    expect(body.client_id).toBe("c1");
    expect(body.events[0].name).toBe("app_opened");
  });

  test("mpCollectUrl includes measurement_id and api_secret", () => {
    const url = mpCollectUrl("G-ABC", "secret");
    expect(url).toContain("measurement_id=G-ABC");
    expect(url).toContain("api_secret=secret");
  });
});
