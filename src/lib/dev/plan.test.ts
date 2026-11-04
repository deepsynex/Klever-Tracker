import { describe, expect, it } from "vitest";
import { parseBackendRequests, parseChecklists, parsePhases, plain, statusTone } from "./plan";

const PLAN = `# Plan

## 2. Phases

| # | Phase | Weeks | Backend status |
|---|---|---|---|
| **1** | **Foundation, Auth & Users** | **3** | Partial: B1–B8 needed |
| 2 | Fleet Records | 3 | Ready |

## 3. Phase 1

### 3.6 Exit criteria

- [x] Login works. _(Verified: e2e in CI.)_
- [ ] Reset works end to end.
`;

const BACKEND = `# Requests

## 1. Needed for Google sign-in

### B9: \`loginWithGoogle\` mutation (not built yet)

## 2. Security

| # | Change | Why | Status |
|---|---|---|---|
| **B4** | Add a \`logout\` mutation | Tokens never expire | ✓ Done 2026-11-03 |
| **S3** | Stop tokens in URLs | Leaks | ⚠ Decision needed |
| **S5** | Log logins | Login history | ◐ Partly done |

## 4. Already done (thank you)

| # | Item | Seen in the live API |
|---|---|---|
| B1 | Basic-auth lock removed | ping returns 200 |
`;

describe("parsePhases", () => {
  it("reads the table and marks the bold row as current", () => {
    expect(parsePhases(PLAN)).toEqual([
      { number: "1", name: "Foundation, Auth & Users", weeks: "3", backend: "Partial: B1–B8 needed", current: true },
      { number: "2", name: "Fleet Records", weeks: "3", backend: "Ready", current: false },
    ]);
  });
});

describe("parseChecklists", () => {
  it("groups items by heading and splits off the note", () => {
    expect(parseChecklists(PLAN)).toEqual([
      {
        heading: "3.6 Exit criteria",
        items: [
          { done: true, text: "Login works.", note: "Verified: e2e in CI." },
          { done: false, text: "Reset works end to end.", note: null },
        ],
      },
    ]);
  });
});

describe("parseBackendRequests", () => {
  it("reads headings, 4-column tables and the already-done table", () => {
    const rows = parseBackendRequests(BACKEND);
    expect(rows.map((r) => [r.id, r.tone])).toEqual([
      ["B9", "pending"],
      ["B4", "done"],
      ["S3", "decision"],
      ["S5", "partial"],
      ["B1", "done"],
    ]);
    expect(rows[0]).toMatchObject({ change: "loginWithGoogle mutation", status: "not built yet", section: "Needed for Google sign-in" });
    expect(rows[1].change).toBe("Add a logout mutation");
  });
});

describe("helpers", () => {
  it("strips markdown", () => {
    expect(plain("**bold** `code` [link](http://x) _note_")).toBe("bold code link note");
  });
  it("classifies statuses", () => {
    expect(statusTone("✓ Confirmed")).toBe("done");
    expect(statusTone("Waiting")).toBe("pending");
  });
});
