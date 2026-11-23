import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Package } from "./code-map.ts";
import {
  baseRef,
  biomeCmds,
  cell,
  changedFiles,
  checkPathOf,
  commandStep,
  NEXT_ENV_HINT,
  ownsStep,
  parseArgs,
  parseCheck,
  render,
  secretHits,
  secretsStep,
  show,
  testCmds,
  typecheckCmds,
  typecheckHint,
} from "./pre-pr-check.ts";

const packages: Package[] = [
  { name: "@cellar-assistant/client", dir: "services/client", exports: {} },
  { name: "@cellar-assistant/db", dir: "packages/db", exports: {} },
];

describe("arguments and base", () => {
  it("reads --brief and --base and refuses the rest", () => {
    assert.deepEqual(parseArgs(["--brief", "b.md", "--base", "origin/x"]), {
      brief: "b.md",
      base: "origin/x",
      help: false,
    });
    assert.match(String(parseArgs(["--brief"])), /needs a value/);
    assert.match(String(parseArgs(["x"])), /unknown argument/);
    assert.equal((parseArgs(["--help"]) as { help: boolean }).help, true);
  });
  it("takes the flag, then changed-since, then origin/main", () => {
    assert.equal(baseRef("a", "b\n"), "a");
    assert.equal(baseRef(null, "origin/claude/r1\n"), "origin/claude/r1");
    assert.equal(baseRef(null, "\n"), "origin/main");
    assert.equal(baseRef(null, null), "origin/main");
  });
  it("finds and reads the check file", () => {
    assert.equal(checkPathOf("/b/briefs/s1.md"), "/b/briefs/s1.check.json");
    assert.deepEqual(
      parseCheck('{"tests":["a.test.ts"],"owns":["tools/"],"map":[]}'),
      { tests: ["a.test.ts"], owns: ["tools/"] },
    );
  });
});

describe("changedFiles", () => {
  it("joins the branch diff with the working tree, renames to their new name", () => {
    const porcelain = [
      " M tools/a.ts",
      "?? tools/new.ts",
      "R  old.ts -> packages/db/src/new.ts",
      "",
    ].join("\n");
    assert.deepEqual(changedFiles("tools/a.ts\nREADME.md\n", porcelain), [
      "README.md",
      "packages/db/src/new.ts",
      "tools/a.ts",
      "tools/new.ts",
    ]);
  });
});

describe("ownsStep", () => {
  it("skips without owns, passes when all are owned, lists strays", () => {
    assert.equal(
      ownsStep(["a"], null).summary,
      "skipped: no brief names `owns`",
    );
    assert.equal(ownsStep(["tools/a.ts", "tools"], ["tools/"]).ok, true);
    const s = ownsStep(
      ["tools/a.ts", "toolsx/b.ts", ".claude/x.md"],
      ["tools"],
    );
    assert.equal(s.ok, false);
    assert.deepEqual(s.tail, ["toolsx/b.ts", ".claude/x.md"]);
  });
});

describe("commands", () => {
  it("typechecks the changed packages and their dependents", () => {
    assert.equal(
      show(typecheckCmds("origin/main")[0]),
      "bunx turbo run typecheck --filter=...[origin/main]",
    );
  });
  it("biome checks the files it covers that still exist", () => {
    const cmds = biomeCmds(
      ["a.ts", "b.md", "gone.ts", "c.json"],
      (f) => f !== "gone.ts",
    );
    assert.deepEqual(cmds[0].args, [
      "biome",
      "check",
      "--no-errors-on-unmatched",
      "a.ts",
      "c.json",
    ]);
    assert.deepEqual(
      biomeCmds(["a.md"], () => true),
      [],
    );
  });
  it("runs brief tests in their packages, tools under node --test, then turbo", () => {
    const cmds = testCmds(
      [
        "services/client/src/a.test.ts",
        "packages/db/src/b.test.ts",
        "packages/db/src/c.test.ts",
        "tools/x.test.ts",
      ],
      packages,
      "origin/main",
      ["tools/x.ts"],
    );
    assert.deepEqual(cmds.map(show), [
      "(services/client) bun run test src/a.test.ts",
      "(packages/db) bun run test src/b.test.ts src/c.test.ts",
      "node --test tools/x.test.ts",
      "bunx turbo run test --filter=...[origin/main] --filter=!@cellar-assistant/e2e",
    ]);
    assert.deepEqual(testCmds([], packages, "b", ["tools/a.ts"]).map(show), [
      "node --test tools/*.test.ts",
      "bunx turbo run test --filter=...[b] --filter=!@cellar-assistant/e2e",
    ]);
  });
});

describe("commandStep", () => {
  const cmds = typecheckCmds("b");
  it("passes when every command exits 0, and skips with none", () => {
    assert.equal(
      commandStep("t", cmds, [{ status: 0, output: "" }], "x").ok,
      true,
    );
    assert.equal(commandStep("t", [], [], "none").summary, "skipped: none");
  });
  it("fails with the failing command and its output's tail", () => {
    const output = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    const s = commandStep("t", cmds, [{ status: 2, output }], "x");
    assert.equal(s.ok, false);
    assert.match(s.summary, /exited 2/);
    assert.equal(s.tail.length, 20);
    assert.equal(s.tail[19], "line 29");
  });
});

describe("secrets", () => {
  // Built from pieces so this file does not trip the scan itself.
  const key = ["-----BEGIN", "RSA PRIVATE", "KEY-----"].join(" ");
  const gh = `ghp_${"a1".repeat(18)}`;
  const aws = `AKIA${"ABCDEFGHIJKLMNOP"}`;
  it("refuses env and key files but not templates", () => {
    assert.equal(secretHits("infra/.env", null).length, 1);
    assert.equal(secretHits(".env.local", null).length, 1);
    assert.equal(secretHits("certs/a.pem", null).length, 1);
    assert.deepEqual(secretHits("infra/.env.example", null), []);
    assert.deepEqual(secretHits("infra/.env.prod.example", null), []);
  });
  it("finds keys and tokens with their line", () => {
    assert.deepEqual(secretHits("a.ts", `x\n${key}\n`), [
      "a.ts:2: looks like a private key",
    ]);
    assert.deepEqual(secretHits("b.ts", `t = "${gh}"`), [
      "b.ts:1: looks like a GitHub token",
    ]);
    assert.deepEqual(secretHits("c.ts", aws), [
      "c.ts:1: looks like a AWS access key id",
    ]);
    assert.deepEqual(secretHits("d.ts", "const sk = 'sk-short'; // AKIA"), []);
  });
  it("passes with no hits and fails with them", () => {
    assert.equal(secretsStep([], 3).ok, true);
    assert.equal(secretsStep(["x"], 3).ok, false);
  });
});

describe("render", () => {
  it("summarises the steps and shows failing tails", () => {
    const text = render(
      [
        { name: "owns", ok: true, summary: "all owned", tail: [] },
        { name: "biome", ok: false, summary: "a | b", tail: ["err"] },
      ],
      "origin/main",
      "b.md",
    );
    assert.match(
      text,
      /Base `origin\/main`, brief `b\.md`: \*\*1 step\(s\) fail\*\*/,
    );
    assert.match(text, /\| biome \| FAIL \| a \\\| b \|/);
    assert.match(text, /### biome\n\n```\nerr\n```/);
  });
});

describe("typecheckHint", () => {
  const failed = {
    name: "typecheck",
    ok: false,
    summary: "x",
    tail: ["TS2307"],
  };
  it("adds the typegen line only to a failure with no next-env.d.ts", () => {
    assert.deepEqual(typecheckHint(failed, false).tail, [
      "TS2307",
      NEXT_ENV_HINT,
    ]);
    assert.deepEqual(typecheckHint(failed, true), failed);
    const passed = { ...failed, ok: true, tail: [] };
    assert.deepEqual(typecheckHint(passed, false), passed);
  });
});

describe("cell", () => {
  it("escapes backslashes before pipes, and folds newlines", () => {
    assert.equal(cell("a|b"), "a\\|b");
    assert.equal(cell("C:\\x|y"), "C:\\\\x\\|y");
    assert.equal(cell("one\ntwo"), "one two");
  });
});
