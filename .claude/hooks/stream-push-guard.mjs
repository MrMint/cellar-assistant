#!/usr/bin/env node
// Stop hook for stream-builder agents (wired in .claude/agents/stream-builder.md, where the harness
// runs an agent's Stop hook as its SubagentStop): a stream may not end with commits it made that
// no remote has.
//
// Streams run with the lead's checkout as their cwd and `cd` into their own worktree per command,
// so the hook finds the worktrees from the stream's own transcript: the directory of every Bash
// call that ran `git commit` (a leading `cd <dir> &&|;` or `git -C <dir>`, else the call's cwd). The
// input's own `cwd` is not added: it is the lead's checkout, and the lead's commits are not the
// stream's to push.
// In each, a commit counts when no remote ref reaches it and its committer date is no earlier than
// the stream's first transcript entry, so the lead's own unpushed commits on a base never count.
//
// Loops: it blocks at most MAX_BLOCKS times in a row with no tool call between, so a stream that
// cannot push (no remote access, a rejected push) is let go and says so in its hand-back.
//
// WHY: on 2026-11-09, in smart-home's R9 Fettle build, the lead session ended with the fix round
// running. One stream had finished commits it had never pushed; the lead found them in the worktree
// 42 hours later and pushed them by hand. The lead had been writing "push after every commit" into
// each stream's prompt by hand.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_BLOCKS = 2;

/** The directory a Bash command's `git commit` ran in, or null when it names none. */
export function commitDir(command, cwd) {
    if (!/\bgit\b[^\n]*\bcommit\b/.test(command)) return null;
    const gitC = /\bgit\s+-C\s+("([^"]+)"|'([^']+)'|(\S+))\s+[^\n]*\bcommit\b/.exec(command);
    if (gitC) return absolute(gitC[2] ?? gitC[3] ?? gitC[4], cwd);
    const cd = /^\s*cd\s+("([^"]+)"|'([^']+)'|([^\s;&|]+))\s*(&&|;)/.exec(command);
    if (cd) return absolute(cd[2] ?? cd[3] ?? cd[4], cwd);
    return cwd ?? null;
}

function absolute(dir, cwd) {
    if (isAbsolute(dir)) return dir;
    return cwd ? resolve(cwd, dir) : null;
}

/**
 * From transcript lines: the stream's start (ms, or NaN) and every directory it committed in,
 * plus `cwd` when given.
 */
export function scan(lines, cwd) {
    let start = NaN;
    const dirs = new Set();
    let calls = 0;
    for (const line of lines) {
        let entry;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        const at = Date.parse(entry?.timestamp ?? "");
        if (Number.isNaN(start) && Number.isFinite(at)) start = at;
        if (entry?.type !== "assistant") continue;
        for (const block of entry?.message?.content ?? []) {
            if (block?.type !== "tool_use") continue;
            calls++;
            if (block.name !== "Bash") continue;
            const dir = commitDir(String(block.input?.command ?? ""), entry.cwd ?? cwd);
            if (dir) dirs.add(dir);
        }
    }
    return { start, dirs: [...dirs], calls };
}

/** The block reason for unpushed commits, as [{ dir, branch, commits: ["<sha> <subject>"] }]. */
export function blockReason(found) {
    const lines = ["You are ending with commits no remote has:"];
    for (const f of found) {
        lines.push(`  ${f.dir} (${f.branch}):`);
        for (const c of f.commits.slice(0, 8)) lines.push(`    ${c}`);
        if (f.commits.length > 8) lines.push(`    … and ${f.commits.length - 8} more`);
    }
    lines.push(
        "Push each branch (`git -C <dir> push -u origin HEAD`) before you hand back. If this session",
        "ends first, the lead cannot see these commits, and on 2026-11-09 a stream's finished work sat",
        "unpushed for 42 hours that way. If the push fails, say so in your hand-back with the error.",
    );
    return lines.join("\n");
}

/** `git` in a directory; returns stdout, or null on any failure. */
function git(dir, args) {
    try {
        return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 8000 });
    } catch {
        return null;
    }
}

/**
 * The stream's unpushed commits in `dir` since `startMs`, or null when `dir` is not a git checkout.
 * @param {string} dir
 * @param {number} startMs
 * @param {(dir: string, args: string[]) => string | null} [run]
 */
export function unpushed(dir, startMs, run = git) {
    if (!existsSync(dir)) return null;
    const branch = run(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (branch === null) return null;
    const since = Number.isFinite(startMs) ? [`--since=${new Date(startMs).toISOString()}`] : [];
    const out = run(dir, ["log", "HEAD", "--not", "--remotes", ...since, "--format=%h %s"]);
    if (out === null) return null;
    const commits = out.split("\n").filter((l) => l.trim() !== "");
    return { dir, branch: branch.trim(), commits };
}

/**
 * The hook's stdout for one stop: a block decision, or "" to let the stream stop. `io.read(path)`
 * returns a file's text and `io.unpushed(dir, start)` the check above; `stateDir` holds the
 * per-agent block count.
 */
export function handle(input, io, stateDir) {
    if (input === null || typeof input !== "object") return "";
    const path = input.agent_transcript_path ?? input.transcript_path;
    if (typeof path !== "string" || path === "") return "";
    let lines;
    try {
        lines = io.read(path).split("\n");
    } catch {
        return "";
    }
    const { start, dirs, calls } = scan(lines, typeof input.cwd === "string" ? input.cwd : null);
    const found = [];
    const seen = new Set();
    for (const dir of dirs) {
        const r = io.unpushed(dir, start);
        if (r === null || r.commits.length === 0) continue;
        const key = `${r.branch}\n${r.commits[0]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(r);
    }
    if (found.length === 0) return "";
    const stateFile = join(stateDir, `${String(input.agent_id ?? input.session_id ?? "agent").replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
    let state = { calls: -1, blocks: 0 };
    try {
        state = JSON.parse(readFileSync(stateFile, "utf8"));
    } catch {
        // First block for this agent.
    }
    const blocks = state.calls === calls ? state.blocks : 0;
    if (blocks >= MAX_BLOCKS) return "";
    try {
        mkdirSync(stateDir, { recursive: true });
        writeFileSync(stateFile, JSON.stringify({ calls, blocks: blocks + 1 }));
    } catch {
        // Without a count the harness's own continuation cap still bounds the loop.
    }
    return JSON.stringify({ decision: "block", reason: blockReason(found) });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    let input = null;
    try {
        input = JSON.parse(readFileSync(0, "utf8"));
    } catch {
        // Nothing to check.
    }
    const io = { read: (p) => readFileSync(p, "utf8"), unpushed: (d, s) => unpushed(d, s) };
    process.stdout.write(handle(input, io, join(tmpdir(), "stream-push-guard")));
}
