// Tests for the agent hooks in this directory: `bun run test:hooks` (node --test).
//
// Each hook exports its decisions as pure functions, and the main guard is the only part that
// touches stdin, disk or git. These tests drive the functions, plus one end-to-end run per hook
// that pipes a real hook input through `node <hook>` to check the wiring and the output shape.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import * as spawnGuard from "./agent-spawn-guard.mjs";
import * as shellGuard from "./shell-guard.mjs";
import * as pushGuard from "./stream-push-guard.mjs";
import * as outline from "./stream-read-outline.mjs";
import * as searchLimit from "./stream-search-limit.mjs";
import * as typecheck from "./stream-typecheck.mjs";
import * as waitGuard from "./subagent-wait-guard.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const scratch = () => mkdtempSync(join(tmpdir(), "hooks-test-"));

function runHook(file, input, env = {}) {
    const r = spawnSync(process.execPath, [join(HERE, file)], {
        input: JSON.stringify(input),
        encoding: "utf8",
        env: { ...process.env, ...env },
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
}

describe("agent-spawn-guard", () => {
    const agents = new Map([
        ["stream-builder", { name: "stream-builder", model: "opus", effort: "medium", maxTurns: "300", description: "Builds. More." }],
        ["scout", { name: "scout", model: "sonnet", effort: "medium", maxTurns: "40", description: "Searches." }],
        ["legacy", { name: "legacy", description: "An old persona." }],
    ]);

    it("refuses no subagent_type and the unroled built-ins", () => {
        for (const type of [undefined, "", "general-purpose", "fork", "claude"]) {
            assert.match(spawnGuard.refusal("Agent", { subagent_type: type, prompt: "x" }, agents) ?? "", /Spawn by role/);
        }
    });

    it("refuses a project agent with no effort or turn cap, and lists only roled agents", () => {
        const r = spawnGuard.refusal("Agent", { subagent_type: "legacy" }, agents);
        assert.match(r, /sets no effort or no maxTurns/);
        assert.match(r, /stream-builder \(opus, medium\): Builds\./);
        assert.doesNotMatch(r, /- legacy/);
    });

    it("lets roles, other built-ins and one-off tasks through", () => {
        assert.equal(spawnGuard.refusal("Agent", { subagent_type: "stream-builder" }, agents), null);
        assert.equal(spawnGuard.refusal("Agent", { subagent_type: "Explore", model: "haiku" }, agents), null);
        assert.equal(spawnGuard.refusal("Agent", { subagent_type: "general-purpose", description: "one-off: rename" }, agents), null);
        assert.equal(spawnGuard.refusal("Bash", { command: "ls" }, agents), null);
    });

    it("refuses Opus on a search role, even with one-off", () => {
        assert.match(spawnGuard.refusal("Agent", { subagent_type: "scout", model: "opus", description: "one-off: x" }, agents), /Opus buys nothing/);
        assert.match(spawnGuard.refusal("Agent", { subagent_type: "Explore", model: "claude-opus-5-5" }, agents), /Opus buys nothing/);
    });

    it("reads the frontmatter of this repo's agents, and every role in them is roled", () => {
        const found = spawnGuard.projectAgents(join(HERE, "..", "agents"));
        for (const role of ["stream-builder", "reviewer", "verifier", "scout", "surveyor", "sweeper"]) {
            assert.ok(spawnGuard.isRoled(found.get(role)), `${role} sets effort and maxTurns`);
        }
    });

    it("denies end to end through stdin", () => {
        const out = JSON.parse(runHook("agent-spawn-guard.mjs", { tool_name: "Agent", tool_input: { prompt: "x" } }));
        assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
    });
});

describe("shell-guard", () => {
    const primaryOf = (d) => ({ primary: "/repo", inPrimary: d === "/repo" });
    const refused = (command, extra = {}) =>
        shellGuard.refusal({ tool_name: "Bash", tool_input: { command }, cwd: "/repo/.claude/worktrees/w", ...extra }, primaryOf) !== null;

    it("refuses host dev servers and builds, not the container lane or quoted text", () => {
        for (const c of ["bun run dev", "bun run build", "bun dev", "cd services/client && bunx next build", "npx next dev -p 3001", "turbo run build", "echo x | bun run build"]) {
            assert.ok(refused(c), c);
        }
        for (const c of ["bun run dev:up", "bun run dev:bootstrap", "bun run stack:client:build", "turbo run typecheck", 'git commit -m "never bun run dev"', "bun run --filter @cellar-assistant/schema build"]) {
            assert.ok(!refused(c), c);
        }
    });

    it("refuses bare stash, branch -D and name-based kills", () => {
        for (const c of ["git stash", "git stash pop", "git stash -u", "git branch -D x", "git branch --force -D x", "pkill -f next", "killall node"]) assert.ok(refused(c), c);
        for (const c of ["git stash push -u -m s1-wip", "git stash apply 1a2b3c", "git stash list", "git branch -d x", "kill 4242"]) assert.ok(!refused(c), c);
    });

    it("refuses a subagent's git write in the primary checkout, and nothing else there", () => {
        assert.ok(refused("git -C /repo commit -m x", { agent_id: "a1" }));
        assert.ok(refused("cd /repo && git reset --hard HEAD~1", { agent_id: "a1" }));
        assert.ok(!refused("git -C /repo status", { agent_id: "a1" }));
        assert.ok(!refused("git commit -m x", { agent_id: "a1" }));
        assert.ok(!refused("cd /repo && git commit -m x"));
    });
});

describe("stream-search-limit", () => {
    it("classifies calls", () => {
        assert.equal(searchLimit.kindOf("Grep", {}), "search");
        assert.equal(searchLimit.kindOf("Read", {}), "neutral");
        assert.equal(searchLimit.kindOf("Bash", { command: "cd x && rg foo | head" }), "search");
        assert.equal(searchLimit.kindOf("Bash", { command: "git status" }), "neutral");
        assert.equal(searchLimit.kindOf("Bash", { command: "node tools/code-map.ts services/api/src/x.ts" }), "neutral");
        assert.equal(searchLimit.kindOf("Bash", { command: "bun run test x" }), "other");
        assert.equal(searchLimit.kindOf("Edit", {}), "other");
    });

    it("refuses the fourth search turn in a row, counts parallel calls once, and resets on work", () => {
        let state = { run: 0, last: 0 };
        let t = 0;
        for (let i = 0; i < searchLimit.LIMIT; i++) {
            t += 10_000;
            const s = searchLimit.step(state, "search", t);
            assert.equal(s.refuse, false);
            state = s.state;
            const parallel = searchLimit.step(state, "search", t + 100);
            assert.equal(parallel.refuse, false);
            state = parallel.state;
        }
        assert.equal(searchLimit.step(state, "search", t + 10_000).refuse, true);
        assert.equal(searchLimit.step(state, "neutral", t + 10_000).refuse, false);
        assert.deepEqual(searchLimit.step(state, "other", t + 10_000).state, { run: 0, last: 0 });
    });

    it("keeps a count per stream on disk", () => {
        const dir = scratch();
        const input = { session_id: "s", agent_id: "a", tool_name: "Grep", tool_input: {} };
        let out = "";
        for (let i = 0; i <= searchLimit.LIMIT; i++) out = searchLimit.handle(input, i * 10_000, dir);
        assert.match(out, /search turns in a row/);
        assert.equal(searchLimit.handle({ ...input, agent_id: "b" }, 0, dir), "");
    });
});

describe("stream-read-outline", () => {
    it("refuses a whole read of a long code file with its outline, and allows the rest", () => {
        const dir = scratch();
        const long = join(dir, "long.ts");
        writeFileSync(long, ["export function first() {}", ...Array(outline.MAX_LINES).fill("  x;"), "export const last = 1;"].join("\n"));
        writeFileSync(join(dir, "short.ts"), "export const a = 1;\n");
        writeFileSync(join(dir, "notes.md"), Array(outline.MAX_LINES + 5).fill("text").join("\n"));

        const r = outline.refusal({ tool_name: "Read", tool_input: { file_path: long } });
        assert.match(r, /L1 {2}export function first/);
        assert.match(r, /export const last/);
        assert.equal(outline.refusal({ tool_name: "Read", tool_input: { file_path: long, limit: 50 } }), null);
        assert.equal(outline.refusal({ tool_name: "Read", tool_input: { file_path: join(dir, "short.ts") } }), null);
        assert.equal(outline.refusal({ tool_name: "Read", tool_input: { file_path: join(dir, "notes.md") } }), null);
        assert.match(outline.refusal({ tool_name: "Bash", tool_input: { command: `cd ${dir} && cat long.ts` }, cwd: "/" }), /whole-file read is refused/);
        assert.equal(outline.refusal({ tool_name: "Bash", tool_input: { command: `cat ${long} | head` }, cwd: "/" }), null);
    });
});

describe("stream-push-guard", () => {
    it("finds the directory a commit ran in", () => {
        assert.equal(pushGuard.commitDir("cd /w/a && git commit -m x", "/lead"), "/w/a");
        assert.equal(pushGuard.commitDir("git -C /w/b commit -m x", "/lead"), "/w/b");
        assert.equal(pushGuard.commitDir("git commit -m x", "/lead"), "/lead");
        assert.equal(pushGuard.commitDir("git status", "/lead"), null);
    });

    it("blocks a stop with unpushed commits, at most MAX_BLOCKS times without a tool call", () => {
        const dir = scratch();
        const transcript = [
            JSON.stringify({ type: "assistant", timestamp: "2026-11-22T10:00:00Z", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "cd /w/a && git commit -m x" } }] } }),
        ].join("\n");
        const io = {
            read: () => transcript,
            unpushed: (d) => (d === "/w/a" ? { dir: d, branch: "claude/x", commits: ["abc123 feat: x"] } : null),
        };
        const input = { agent_transcript_path: "/t.jsonl", agent_id: "agent-1" };
        for (let i = 0; i < pushGuard.MAX_BLOCKS; i++) {
            const out = JSON.parse(pushGuard.handle(input, io, dir));
            assert.equal(out.decision, "block");
            assert.match(out.reason, /abc123 feat: x/);
        }
        assert.equal(pushGuard.handle(input, io, dir), "");
    });

    it("lets a stream with nothing unpushed stop", () => {
        const io = { read: () => "", unpushed: () => ({ dir: "/w", branch: "b", commits: [] }) };
        assert.equal(pushGuard.handle({ agent_transcript_path: "/t", cwd: "/w" }, io, scratch()), "");
    });
});

describe("subagent-wait-guard", () => {
    const result = (text, at = "2026-11-22T10:00:00Z") =>
        JSON.stringify({ type: "user", timestamp: at, message: { content: [{ type: "tool_result", content: text }] } });

    it("tracks background jobs until their notice", () => {
        const lines = [
            result("Command running in background with ID: b1. Output is being written to: /tmp/b1.output"),
            result("Command running in background with ID: b2."),
            JSON.stringify({ type: "user", message: { content: "<task-notification>\n<task-id>b2</task-id>\n<status>completed</status>\n</task-notification>" } }),
        ];
        assert.deepEqual(
            waitGuard.pendingJobs(lines).map((j) => j.id),
            ["b1"],
        );
    });

    it("lets the stop through under a live Monitor, or when the job's output shows it exited", () => {
        const now = Date.parse("2026-11-22T10:05:00Z");
        const shell = { id: "b1", kind: "shell", output: "/tmp/b1.output", expiresAt: null };
        const monitor = { id: "m1", kind: "monitor", output: null, expiresAt: now + 60_000 };
        assert.deepEqual(waitGuard.unboundedJobs([shell, monitor], now, () => ""), []);
        assert.deepEqual(waitGuard.unboundedJobs([shell], now, () => "done\n[exited with code 0]"), []);
        assert.deepEqual(
            waitGuard.unboundedJobs([shell], now, () => "still running").map((j) => j.id),
            ["b1"],
        );
    });

    it("blocks an unbounded wait with a Monitor to arm, then lets go", () => {
        const dir = scratch();
        const transcript = result("Command running in background with ID: b9. Output is being written to: /tmp/b9.output");
        const io = { read: () => transcript, tail: () => "running" };
        const input = { agent_transcript_path: "/t.jsonl", agent_id: "agent-9" };
        let out = "";
        for (let i = 0; i < waitGuard.MAX_BLOCKS; i++) {
            out = JSON.parse(waitGuard.handle(input, io, dir));
            assert.equal(out.decision, "block");
        }
        assert.match(out.reason, /Monitor\(/);
        assert.equal(waitGuard.handle(input, io, dir), "");
    });
});

describe("stream-typecheck", () => {
    it("finds the worktree from an edit or a Bash call", () => {
        assert.equal(typecheck.worktreeOf("Edit", { file_path: "/r/.claude/worktrees/s1/services/api/src/a.ts" }), "/r/.claude/worktrees/s1");
        assert.equal(typecheck.worktreeOf("Bash", { command: "bun run test" }, "/r/.claude/worktrees/s2"), "/r/.claude/worktrees/s2");
        assert.equal(typecheck.worktreeOf("Edit", { file_path: "/r/services/api/src/a.ts" }), null);
    });

    it("keeps only package TypeScript from git status, and groups it by package", () => {
        const files = typecheck.changedFiles(" M services/client/src/a.tsx\n?? packages/db/src/b.ts\n M README.md\nR  services/api/x.ts -> services/api/y.ts\n M tools/agent-spend.ts\n");
        assert.deepEqual(files, ["services/client/src/a.tsx", "packages/db/src/b.ts", "services/api/y.ts"]);
        assert.deepEqual(typecheck.packagesOf(files), ["services/client", "packages/db", "services/api"]);
    });

    it("reports errors in changed files, counts the rest, and says once when they clear", () => {
        const errors = typecheck.parseErrors("src/a.tsx(3,5): error TS2322: Type 'x' is not assignable.\nsrc/z.ts(1,1): error TS2307: Cannot find module.\n", "services/client");
        assert.equal(errors[0].file, "services/client/src/a.tsx");
        const r = typecheck.report(errors, ["services/client/src/a.tsx"], 0);
        assert.equal(r.mine, 1);
        assert.match(r.text, /services\/client\/src\/a\.tsx\(3,5\): TS2322/);
        assert.match(r.text, /1 more in files you did not change/);
        assert.equal(typecheck.report([], ["services/client/src/a.tsx"], 0).text, null);
        assert.match(typecheck.report([], ["services/client/src/a.tsx"], 2).text, /clean now/);
    });

    it("stays silent end to end outside a worktree", () => {
        assert.equal(runHook("stream-typecheck.mjs", { tool_name: "Edit", tool_input: { file_path: "/nowhere/a.ts" } }), "");
    });
});

describe("lifecycle hooks", () => {
    it("worktree-remove is a no-op without a path or a .stack directory", () => {
        for (const args of [[], [scratch()]]) {
            const r = spawnSync("sh", [join(HERE, "worktree-remove.sh"), ...args], { encoding: "utf8" });
            assert.equal(r.status, 0, r.stderr);
        }
    });

    it("dev-prune exits 0 at once in a tree with no stack script", () => {
        const dir = scratch();
        mkdirSync(join(dir, "scripts"), { recursive: true });
        const r = spawnSync("sh", [join(HERE, "dev-prune.sh")], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
        assert.equal(r.status, 0, r.stderr);
    });
});
