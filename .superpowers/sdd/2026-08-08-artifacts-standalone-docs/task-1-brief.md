### Task 1: Path slug + standalone `generated` destination

**Files:**
- Create: `src/main/path-slug.ts`
- Create: `src/main/path-slug.test.ts`
- Create: `src/main/documents/dest.test.ts`
- Modify: `src/main/documents/dest.ts`
- Modify: `src/main/project-files.ts` (`safeName` → re-export/use path-slug; `allowedGeneratedRoots`)

**Interfaces:**
- Produces:
  - `pathSlug(name: unknown, fallback?: string): string`
  - `standaloneGeneratedDir(documentsPath: string): string` → `…/AnyLM/generated`
  - `fallbackDir(): string` uses `standaloneGeneratedDir(app.getPath("documents"))`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/path-slug.test.ts
import { describe, expect, test } from "bun:test";
import { pathSlug } from "./path-slug";

describe("pathSlug", () => {
  test("spaces become hyphens and lowercased", () => {
    expect(pathSlug("My Project")).toBe("my-project");
  });
  test("strips illegal path chars", () => {
    expect(pathSlug('Report: "Q1"/final')).toBe("report-q1-final");
  });
  test("collapses repeated hyphens and trims", () => {
    expect(pathSlug("  Foo   Bar--Baz  ")).toBe("foo-bar-baz");
  });
  test("empty falls back", () => {
    expect(pathSlug("")).toBe("project");
    expect(pathSlug("***", "document")).toBe("document");
  });
});
```

```typescript
// src/main/documents/dest.test.ts
import { describe, expect, test } from "bun:test";
import { standaloneGeneratedDir } from "./dest";
import * as path from "path";

describe("standaloneGeneratedDir", () => {
  test("joins Documents/AnyLM/generated", () => {
    expect(standaloneGeneratedDir("/Users/x/Documents")).toBe(
      path.join("/Users/x/Documents", "AnyLM", "generated")
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && bun test src/main/path-slug.test.ts src/main/documents/dest.test.ts`
Expected: FAIL (module/exports missing)

- [ ] **Step 3: Implement**

```typescript
// src/main/path-slug.ts
export function pathSlug(name: unknown, fallback = "project"): string {
  const clean = String(name || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return clean || fallback;
}
```

In `dest.ts`:
- Export `standaloneGeneratedDir(documentsPath: string)` as above
- `fallbackDir()` → `standaloneGeneratedDir(app.getPath("documents"))`
- Replace local `safeName` with `pathSlug(name, "document")`

In `project-files.ts`:
- `safeName(name)` → `pathSlug(name, "project")` (keep `safeName` wrapper if callers expect the name)
- In `allowedGeneratedRoots()`, replace `AnyLM/Documents` with `AnyLM/generated` (or include **both** briefly if old files may exist — prefer **replace** per spec; keep old root only if you want open/reveal of legacy files: include both roots for read/delete safety)

Recommended roots list:

```typescript
path.resolve(defaultBase()),
path.resolve(app.getPath("documents"), "AnyLM", "generated"),
path.resolve(app.getPath("documents"), "AnyLM", "Documents"), // legacy standalone
...project folders
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && bun test src/main/path-slug.test.ts src/main/documents/dest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/main/path-slug.ts app/src/main/path-slug.test.ts \
  app/src/main/documents/dest.ts app/src/main/documents/dest.test.ts \
  app/src/main/project-files.ts
git commit -m "feat: kebab path slugs and standalone generated folder"
```

---

