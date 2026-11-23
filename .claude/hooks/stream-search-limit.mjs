#!/usr/bin/env node
// PreToolUse hook for stream-builder agents (wired in .claude/agents/stream-builder.md): refuses a
// stream's search turn once LIMIT search turns have run in a row, and tells it to send a `scout`
// or act on what it has. Any other call ends the run.
//
// A search call is Grep or Glob, or a Bash call whose every segment searches (grep, rg, find, ls,
// cat, head, tail, sed -n, wc, jq, awk, tree, git log/show/diff/grep/blame). Neutral calls neither
// count nor end a run: Read, because a stream must read a file before it edits it, and the outline
// hook already refuses whole long files; `git status` and the like, which check state before a
// commit; and `tools/code-map.ts`, which answers a whole question in one call. Calls closer together
// than SAME_TURN_MS are one turn's parallel calls and count once, so a batched turn costs one.
// A refused call does not count, so the run stays refused until the stream does something else.
// The count lives in a file per stream under the OS temp dir, keyed by session, agent and
// transcript.
//
// WHY: in smart-home's Fettle builds, search-only turns were 54% of stream spend in R4, 52% in R9
// and 49% in R10. A written rule (R4) and a nudge at the third turn (R9, 350 fires) changed neither
// the share nor the 1.0 tool calls per turn. Scouts cost $0.02–0.80 each, so the work belongs in
// their context. It came here as a trial: `node tools/agent-spend.ts` prints the search-turn share
// per build, so keep it only while that share falls and stream turns and defects do not rise.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const LIMIT = 3;
export const SAME_TURN_MS = 1500;

const SEARCH = /^(grep|rg|egrep|find|ls|cat|head|tail|sed -n|wc|jq|awk|tree|git (log|show|diff|grep|blame))\b/;
const NEUTRAL = /^(git (status|branch|rev-parse|ls-files|fetch|remote)|(npx tsx |node |bun )tools\/code-map\.ts|echo|printf|pwd|which|stat|file)\b/;

/** "search", "neutral" or "other" for one call. */
export function kindOf(tool, input) {
    if (tool === "Grep" || tool === "Glob") return "search";
    if (tool === "Read") return "neutral";
    if (tool !== "Bash" || typeof input?.command !== "string") return "other";
    const segments = input.command
        .split(/&&|\|\||;|\n|\|/)
        .map((s) => s.trim())
        .filter((s) => s !== "" && !/^cd\s/.test(s) && !/^[A-Z_][A-Z0-9_]*=\S*$/.test(s));
    if (segments.length === 0) return "neutral";
    if (!segments.every((s) => SEARCH.test(s) || NEUTRAL.test(s))) return "other";
    return segments.some((s) => SEARCH.test(s)) ? "search" : "neutral";
}

/**
 * The run after one call, `{ run, last }` (search turns in the run, the last one's time), and
 * whether to refuse the call. A refused call leaves the state as it was.
 */
export function step(state, kind, now) {
    if (kind === "other") return { state: { run: 0, last: 0 }, refuse: false };
    if (kind === "neutral") return { state, refuse: false };
    if (state.run > 0 && now - state.last < SAME_TURN_MS) return { state: { run: state.run, last: now }, refuse: false };
    if (state.run >= LIMIT) return { state, refuse: true };
    return { state: { run: state.run + 1, last: now }, refuse: false };
}

export function refusalText(run) {
    return [
        `Refused: ${run} search turns in a row already. Each one re-reads your whole context.`,
        "Send a `scout` with the question, your worktree path and what you already know: it searches in",
        "its own small context and returns file:line ranges. Or act on what you have: Read the lines you",
        "will edit (Read is never refused), edit, or run a test. Batching many patterns into the one",
        "search call this turn would have taken also counts as one turn.",
    ].join("\n");
}

/** One hook call: reads and writes this stream's count under `dir`, and returns what to print ("" for nothing). */
export function handle(input, now, dir) {
    if (input === null || typeof input !== "object") return "";
    const key = createHash("sha256")
        .update([input.session_id, input.agent_id, input.transcript_path, input.agent_transcript_path].map((x) => x ?? "").join("\u0000"))
        .digest("hex")
        .slice(0, 16);
    const file = join(dir, `${key}.json`);
    let state = { run: 0, last: 0 };
    try {
        state = JSON.parse(readFileSync(file, "utf8"));
    } catch {
        // First call for this stream.
    }
    const next = step(state, kindOf(input.tool_name, input.tool_input), now);
    try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file, JSON.stringify(next.state));
    } catch {
        return "";
    }
    if (!next.refuse) return "";
    return JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: refusalText(next.state.run) },
    });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    let input = null;
    try {
        input = JSON.parse(readFileSync(0, "utf8"));
    } catch {
        // Nothing to count.
    }
    process.stdout.write(handle(input, Date.now(), join(tmpdir(), "stream-search-limit")));
}
