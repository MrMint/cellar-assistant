import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  archiveList,
  archivePath,
  childrenFirst,
  countTrackedChanges,
  decide,
  type Facts,
  holdParents,
  inScope,
  keepable,
  leafName,
  MIN_IDLE_HOURS,
  nestedIn,
  parseArgs,
  parseWorktreeList,
  renderPlan,
  type WorktreeEntry,
} from "./teardown-worktrees.ts";

const root = "/r";
const wt = (rel: string): WorktreeEntry => ({
  path: `${root}/.claude/worktrees/${rel}`,
  branch: rel,
  locked: false,
});
const A = wt("lead-a");
const B = wt("lead-a/.claude/worktrees/s1");
const C = wt("lead-a/.claude/worktrees/s2");
const listed = [{ path: root, branch: "main", locked: false }, A, B, C];

const facts = (entry: WorktreeEntry, over: Partial<Facts> = {}): Facts => ({
  entry,
  current: false,
  trackedChanges: 0,
  unpushedCommits: 0,
  idleHours: 5,
  untracked: [],
  kb: 1048576,
  nested: nestedIn(entry.path, listed),
  ...over,
});

describe("countTrackedChanges", () => {
  it("ignores the client files next dev and typegen rewrite", () => {
    const porcelain = [
      " M services/client/next-env.d.ts",
      " M services/client/AGENTS.md",
      " M AGENTS.md",
      " M services/client/src/a.ts",
      "",
    ].join("\n");
    assert.equal(countTrackedChanges(porcelain), 2);
  });
});

describe("keepable", () => {
  it("drops caches and nested worktrees", () => {
    assert.deepEqual(
      keepable(
        [
          "PROGRESS.md",
          ".review/a.md",
          "x/.vitest-cache/f",
          ".claude/worktrees/s1/",
          ".claude/worktrees/s1/PROGRESS.md",
          "",
        ],
        [".claude/worktrees/s1"],
      ),
      ["PROGRESS.md", ".review/a.md"],
    );
  });
});

describe("parseWorktreeList", () => {
  it("reads paths, branches and locks", () => {
    const out = parseWorktreeList(
      [
        "worktree /r",
        "HEAD abc",
        "branch refs/heads/main",
        "",
        "worktree /r/.claude/worktrees/x",
        "HEAD def",
        "detached",
        "locked reason",
        "",
      ].join("\n"),
    );
    assert.deepEqual(out, [
      { path: "/r", branch: "main", locked: false },
      { path: "/r/.claude/worktrees/x", branch: null, locked: true },
    ]);
  });
});

describe("scope and nesting", () => {
  it("matches a prefix on the leaf name or the path below .claude/worktrees", () => {
    assert.equal(leafName(B.path), "s1");
    assert.deepEqual(inScope(listed, root, ["s"], false), [B, C]);
    assert.deepEqual(inScope(listed, root, ["lead-a/"], false), [B, C]);
    assert.deepEqual(inScope(listed, root, ["lead"], false), [A, B, C]);
    assert.deepEqual(inScope(listed, root, [], true), [A, B, C]);
  });
  it("finds nested worktrees and orders children first", () => {
    assert.deepEqual(nestedIn(A.path, listed), [B.path, C.path]);
    assert.deepEqual(nestedIn(B.path, listed), []);
    assert.deepEqual(
      childrenFirst([A, B, C]).map((e) => e.path),
      [B.path, C.path, A.path],
    );
  });
});

describe("decide", () => {
  it("lists every reason a worktree stays", () => {
    const v = decide(
      facts(B, {
        current: true,
        trackedChanges: 1,
        unpushedCommits: 2,
        idleHours: 0.2,
        entry: { ...B, locked: true },
      }),
      MIN_IDLE_HOURS,
    );
    assert.equal(v.remove, false);
    assert.equal(v.reasons.length, 5);
  });
});

describe("holdParents", () => {
  it("removes a parent once all its children go, children first", () => {
    const out = holdParents([A, B, C].map((e) => decide(facts(e), 1)));
    assert.deepEqual(
      out.map((v) => [leafName(v.facts.entry.path), v.remove]),
      [
        ["s1", true],
        ["s2", true],
        ["lead-a", true],
      ],
    );
  });
  it("keeps a parent whose child stays", () => {
    const out = holdParents([
      decide(facts(A), 1),
      decide(facts(B), 1),
      decide(facts(C, { unpushedCommits: 1 }), 1),
    ]);
    const parent = out.find((v) => v.facts.entry === A);
    assert.equal(parent?.remove, false);
    assert.match(
      parent?.reasons[0] ?? "",
      /holds 1 nested worktree\(s\) that stay \(s2\)/,
    );
  });
  it("keeps a parent whose child is out of scope", () => {
    const out = holdParents([decide(facts(A), 1), decide(facts(B), 1)]);
    assert.equal(out.find((v) => v.facts.entry === A)?.remove, false);
    assert.equal(out.find((v) => v.facts.entry === B)?.remove, true);
  });
});

describe("plan and archive", () => {
  it("renders the plan and archives only what goes", () => {
    const vs = holdParents([
      decide(facts(B, { untracked: ["PROGRESS.md"] }), 1),
      decide(facts(C, { trackedChanges: 1, untracked: ["x"] }), 1),
    ]);
    const plan = renderPlan(vs, "/a.tgz");
    assert.match(
      plan,
      /Remove 1 worktree\(s\), 1\.0 GB, children first:\n {2}- s1/,
    );
    assert.match(plan, /Keep 1:\n {2}= s2 {2}1 uncommitted tracked change/);
    assert.match(plan, /Untracked files archived first: 1, to \/a\.tgz/);
    assert.deepEqual(archiveList(vs, root), [
      ".claude/worktrees/lead-a/.claude/worktrees/s1/PROGRESS.md",
    ]);
  });
  it("numbers a second archive the same day", () => {
    const taken = new Set(["/d/worktree-scratch-2026-11-22.tgz"]);
    assert.equal(
      archivePath("/d", "2026-11-22", (p) => taken.has(p)),
      "/d/worktree-scratch-2026-11-22-2.tgz",
    );
  });
});

describe("parseArgs", () => {
  it("needs prefixes or --all, not both", () => {
    assert.match(String(parseArgs([])), /prefixes/);
    assert.match(String(parseArgs(["x", "--all"])), /prefixes/);
    assert.match(String(parseArgs(["--nope"])), /unknown option/);
    assert.equal(parseArgs(["--help"]), "");
    assert.deepEqual(parseArgs(["--all", "--apply"]), {
      prefixes: [],
      all: true,
      apply: true,
      minIdleHours: 24,
    });
  });
});
