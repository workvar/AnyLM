import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { listArtifactRoots, isUnderAllowedRoot, ARTIFACT_EXTS } from "./artifacts";

describe("listArtifactRoots", () => {
  test("puts Generated first then projects with folders", () => {
    const roots = listArtifactRoots(
      [
        { id: "1", name: "RSA", folderPath: "/p/rsa" },
        { id: "2", name: "Empty", folderPath: "" },
      ],
      "/docs/AnyLM/generated"
    );
    expect(roots[0]).toMatchObject({ id: "generated", label: "Generated", kind: "generated" });
    expect(roots.map((r) => r.id)).toEqual(["generated", "1"]);
    expect(roots[1].label).toBe("RSA");
  });
});

describe("isUnderAllowedRoot", () => {
  test("accepts path inside root", () => {
    expect(isUnderAllowedRoot("/a/b/c.pdf", ["/a/b"])).toBe(true);
  });
  test("rejects traversal", () => {
    expect(isUnderAllowedRoot("/a/other/c.pdf", ["/a/b"])).toBe(false);
  });
});

test("ARTIFACT_EXTS includes office docs", () => {
  expect(ARTIFACT_EXTS.has(".pdf")).toBe(true);
  expect(ARTIFACT_EXTS.has(".docx")).toBe(true);
  expect(ARTIFACT_EXTS.has(".xlsx")).toBe(true);
});

describe("deleteArtifact", () => {
  test("only deletes an artifact file directly inside an allowed root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "anylm-artifacts-"));
    const nested = path.join(root, "nested");
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "anylm-outside-"));
    const artifact = path.join(root, "report.pdf");
    const text = path.join(root, "notes.txt");
    const nestedArtifact = path.join(nested, "nested.pdf");
    const outsideArtifact = path.join(outside, "outside.pdf");
    fs.mkdirSync(nested);
    fs.writeFileSync(artifact, "");
    fs.writeFileSync(text, "");
    fs.writeFileSync(nestedArtifact, "");
    fs.writeFileSync(outsideArtifact, "");

    const { deleteArtifact } = require("./artifacts");
    expect(deleteArtifact(outside, "outside.pdf", [root])).toBe(false);
    expect(deleteArtifact(root, "notes.txt", [root])).toBe(false);
    expect(deleteArtifact(nested, "nested.pdf", [root])).toBe(false);
    expect(deleteArtifact(root, "nested/nested.pdf", [root])).toBe(false);
    expect(deleteArtifact(root, "report.pdf", [root])).toBe(true);
    expect(fs.existsSync(artifact)).toBe(false);

    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
});
