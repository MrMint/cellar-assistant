#!/usr/bin/env node
// SubagentStop hook for every subagent (wired in .claude/settings.json): a subagent may end its turn
// to wait on a background job only when something is sure to wake it by a deadline.
//
// Ending the turn to wait is the normal, cheap path: the job's notice wakes the subagent when it
// exits, and nothing is spent meanwhile. What fails is a job that never exits. So the hook lets the
// stop through when no job is running, or when a Monitor the agent armed is still inside its
// expiry (a Monitor always reports by then). Otherwise it blocks once and hands the agent a
// deadline Monitor for the running jobs. Waiting stays free; only an unbounded wait costs a turn.
//
// From the agent's own transcript (`agent_transcript_path`; the input's `background_tasks` is the
// parent session's): a job starts with a tool result `Command running in background with ID: X`
// (Bash `run_in_background`), `moved to the background (ID: X)` (a foreground Bash the harness
// backgrounds at its timeout, which no flag shows in advance), `Monitor started (task X, expires in
// N`, or an async Agent launch's `agentId: X`. It is collected by a `<task-notification>` for X
// with a `<status>` or a Monitor-expired event, or by `Successfully stopped task: X`. A Bash job
// whose output file already ends in `[exited with code N]` or `[killed]` has exited; its notice is
// on the way, so it needs no deadline.
//
// Loops: it blocks at most MAX_BLOCKS times in a row with no tool call between, so an agent that
// cannot satisfy it is let go (the harness's own cap is 8 continuations in a row).
//
// WHY: on 2026-11-11 a stream in smart-home's R9 Fettle build ran its red-first tests as a
// foreground Bash; the harness backgrounded it at 180s, and the stream wrote "The red-first run is
// in the background. I'll wait for it to finish." and ended. vitest then hung for 3h40m, so no notice came; the lead
// found six rows written and none committed when it read the worktree. Over the 30 days to that
// date subagents ended a turn on a running job 1,877 times; the job's own notice woke them 1,719
// times. Every one of the 17 never woken, and every notice-woken wait over an hour, had no Monitor.

import { readFileSync, writeFileSync, mkdirSync, openSync, fstatSync, readSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_BLOCKS = 3;
/** The Monitor deadline the hook asks for: the tool's maximum. */
export const DEADLINE_MS = 1_800_000;

const STARTS = [
    /Command running in background with ID: ([A-Za-z0-9_-]+)/g,
    /moved to the background \(ID: ([A-Za-z0-9_-]+)\)/g,
    /Monitor started \(task ([A-Za-z0-9_-]+)/g,
    /Async agent launched successfully[\s\S]*?agentId: ([A-Za-z0-9_-]+)/g,
];
const NOTICE = /<task-notification>\s*<task-id>([A-Za-z0-9_-]+)<\/task-id>([\s\S]*?)<\/task-notification>/g;
const STOPPED = /Successfully stopped task: ([A-Za-z0-9_-]+)/g;
const EXITED = /\[(exited with code -?\d+|killed)\]\s*$/;
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000 };

/** Every string in a tool_result block's content. */
function resultTexts(block) {
    const c = block?.content;
    if (typeof c === "string") return [c];
    if (Array.isArray(c)) return c.filter((b) => typeof b?.text === "string").map((b) => b.text);
    return [];
}

/** Every string leaf of a value. */
function allStrings(value, out = []) {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
    else if (value !== null && typeof value === "object") for (const v of Object.values(value)) allStrings(v, out);
    return out;
}

function kindOf(result) {
    if (result.startsWith("Monitor started")) return "monitor";
    if (/Async agent launched/.test(result)) return "agent";
    return "shell";
}

/**
 * The jobs a transcript started and never collected, oldest first, as { id, kind, result, at,
 * output, expiresAt }. `lines` are the JSONL lines. Starts count only from tool results, so an
 * agent quoting a result in its own text starts nothing.
 */
export function pendingJobs(lines) {
    const started = new Map();
    const done = new Set();
    for (const line of lines) {
        let entry;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        const content = entry?.message?.content;
        if (entry?.type === "user" && Array.isArray(content)) {
            const at = Date.parse(entry.timestamp ?? "");
            for (const block of content) {
                if (block?.type !== "tool_result") continue;
                for (const text of resultTexts(block)) {
                    for (const re of STARTS) {
                        for (const m of text.matchAll(re)) {
                            if (started.has(m[1])) continue;
                            const kind = kindOf(text);
                            const exp = /expires in (\d+)\s*(s|m|h)/.exec(text);
                            started.set(m[1], {
                                id: m[1],
                                kind,
                                result: text,
                                at,
                                output: /Output is being written to: (\S+?\.output)/.exec(text)?.[1] ?? null,
                                expiresAt: kind === "monitor" && exp && Number.isFinite(at) ? at + Number(exp[1]) * UNIT_MS[exp[2]] : null,
                            });
                        }
                    }
                }
            }
        }
        for (const text of allStrings(entry)) {
            if (!text.includes("task-notification") && !text.includes("Successfully stopped task")) continue;
            for (const m of text.matchAll(NOTICE)) {
                if (/<status>/.test(m[2]) || /Monitor expired/.test(m[2])) done.add(m[1]);
            }
            for (const m of text.matchAll(STOPPED)) done.add(m[1]);
        }
    }
    return [...started.values()].filter((j) => !done.has(j.id));
}

/**
 * The jobs that leave the agent with no sure wake, or [] when the stop is safe. `tail(path)` returns
 * the end of a job's output file (throws if unreadable).
 */
export function unboundedJobs(jobs, now, tail) {
    if (jobs.some((j) => j.kind === "monitor" && j.expiresAt !== null && j.expiresAt > now)) return [];
    return jobs.filter((j) => {
        if (j.kind === "monitor") return false; // expired, its notice not yet read: it wakes the agent
        if (j.kind === "shell" && j.output) {
            try {
                if (EXITED.test(tail(j.output))) return false;
            } catch {
                // An unreadable output file proves nothing.
            }
        }
        return true;
    });
}

/** A Monitor command that exits when every listed job's output shows it exited. */
export function monitorCommand(jobs) {
    const files = jobs.map((j) => j.output).filter(Boolean);
    if (files.length === 0) return `sleep ${DEADLINE_MS / 1000 - 60}; echo deadline`;
    const quoted = files.map((f) => `'${f.replace(/'/g, "'\\''")}'`).join(" ");
    return `for f in ${quoted}; do until tail -c 300 "$f" | grep -qE '\\[(exited with code|killed)'; do sleep 10; done; done; echo jobs-exited`;
}

/** The instruction a blocked agent gets next. */
export function blockReason(jobs) {
    return [
        `You are ending your turn while ${jobs.length === 1 ? "a background job runs" : `${jobs.length} background jobs run`} with no deadline: ${jobs.map((j) => j.id).join(", ")}.`,
        "Its notice wakes you when it exits, but a job that hangs never exits, and then nothing wakes you",
        "and your caller reads the silence as done. Arm a deadline first, then end your turn as you meant to:",
        `  Monitor({ description: "background job exits", timeout_ms: ${DEADLINE_MS}, command: ${JSON.stringify(monitorCommand(jobs))} })`,
        "If the Monitor expires while the job still runs, compare its runtime with what that job usually",
        "takes; if it has hung, TaskStop it, read its output, and run it again or report it.",
    ].join("\n");
}

/** How many tool calls a transcript holds: a block counts only against a stop with none since. */
export function toolCalls(lines) {
    let n = 0;
    for (const line of lines) if (line.includes('"type":"tool_use"')) n++;
    return n;
}

/**
 * The hook's stdout for one SubagentStop: a block decision, or "" to let the agent stop.
 * `io.read(path)` returns a file's text, `io.tail(path)` its last bytes; `stateDir` holds the
 * per-agent block count.
 */
export function handle(input, io, stateDir, now = Date.now()) {
    if (input === null || typeof input !== "object") return "";
    const path = input.agent_transcript_path;
    if (typeof path !== "string" || path === "") return "";
    let lines;
    try {
        lines = io.read(path).split("\n");
    } catch {
        return "";
    }
    const jobs = unboundedJobs(pendingJobs(lines), now, io.tail);
    if (jobs.length === 0) return "";
    const calls = toolCalls(lines);
    const stateFile = join(stateDir, `${String(input.agent_id ?? "agent").replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
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
    return JSON.stringify({ decision: "block", reason: blockReason(jobs) });
}

/** The last bytes of a file. */
function tailOf(path, bytes = 300) {
    const fd = openSync(path, "r");
    try {
        const size = fstatSync(fd).size;
        const buf = Buffer.alloc(Math.min(bytes, size));
        readSync(fd, buf, 0, buf.length, size - buf.length);
        return buf.toString("utf8");
    } finally {
        closeSync(fd);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    let input = null;
    try {
        input = JSON.parse(readFileSync(0, "utf8"));
    } catch {
        // Nothing to check.
    }
    const io = { read: (p) => readFileSync(p, "utf8"), tail: (p) => tailOf(p) };
    process.stdout.write(handle(input, io, join(tmpdir(), "subagent-wait-guard")));
}
