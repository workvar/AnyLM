import { mock } from "bun:test";

mock.module("electron", () => ({
  app: {
    getPath: () => "/tmp/anylm-test-userdata",
  },
  shell: {
    openExternal: async () => {},
    openPath: async () => "",
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString("utf8"),
  },
  BrowserWindow: class {
    webContents = { printToPDF: async () => Buffer.from("") };
    loadURL = async () => {};
    destroy = () => {};
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  },
}));
