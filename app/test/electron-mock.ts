import { mock } from "bun:test";

mock.module("electron", () => ({
  app: {
    getPath: () => "/tmp/anylm-test-userdata",
  },
}));
