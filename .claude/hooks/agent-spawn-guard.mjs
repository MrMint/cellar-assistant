#!/usr/bin/env node
// PreToolUse hook on the Agent tool (wired in .claude/settings.json, so it holds for every session
// and every agent in this repo): refuses a spawn with no role, and a search or mechanical role
// given Opus.
//
// Refused:
//   * `subagent_type` missing (the harness then runs general-purpose), or one of UNROLED:
//     general-purpose, fork, claude. These carry no turn cap, no compaction window and no effort of
//     their own, so they inherit the lead's effort and run to the full context window.
//   * a project agent (`.claude/agents/<type>.md`) whose frontmatter sets no `effort` or no
//     `maxTurns`: it is unroled in the same way, whatever its name.
//   * `model: opus` on a role in NO_OPUS: search and mechanical work, where Opus buys nothing.
// Allowed through: a description starting with ONE_OFF ("one-off:"), for a single short task no
// role fits, and every built-in type not named above (Explore, Plan, claude-code-guide…). The
// refusal lists the roles from the agent files themselves, so it cannot drift from them.
//
// WHY: in smart-home's Fettle builds, over 2026-10-25 – 11-08, general-purpose and fork agents were
// 36% of all agent spend, at a median context of 296k and 380k against stream-builder's 169k; half
// their requests were over 300k. On 2026-11-08 one recast's 37 such agents cost about nine times
// that session's seven stream-builder streams. The written rule to spawn by role was there; the
// lead broke it anyway, because no role fitted the job. Hence the list in the refusal.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const UNROLED = new Set(["general-purpose", "fork", "claude"]);
export const NO_OPUS = new Set(["scout", "Explore", "surveyor", "sweeper"]);
export const ONE_OFF = /^\s*one-off:/i;

/** The frontmatter of an agent file as flat `key: value` pairs, or null when it has none. */
export function frontmatter(text) {
    const m = /^---\n([\s\S]*?)\n---/.exec(text);
    if (!m) return null;
    const out = {};
    for (const line of m[1].split("\n")) {
        const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
        if (kv) out[kv[1]] = kv[2].trim();
    }
    return out;
}

/** Every project agent in `dir`, name → { model, effort, maxTurns, description }. */
export function projectAgents(dir) {
    const agents = new Map();
    if (!existsSync(dir)) return agents;
    for (const file of readdirSync(dir)) {
        if (!file.endsWith(".md")) continue;
        const fm = frontmatter(readFileSync(join(dir, file), "utf8"));
        if (!fm?.name) continue;
        agents.set(fm.name, fm);
    }
    return agents;
}

/** An agent is roled when its own definition sets both its effort and its turn cap. */
export function isRoled(fm) {
    return Boolean(fm?.effort) && Boolean(fm?.maxTurns);
}

/** One line per roled project agent: its name, model and effort, and its description's first sentence. */
export function roleLines(agents) {
    const lines = [];
    for (const [name, fm] of [...agents].sort(([a], [b]) => a.localeCompare(b))) {
        if (!isRoled(fm)) continue;
        const first = String(fm.description ?? "").split(/(?<=\.)\s/)[0];
        lines.push(`  - ${name} (${fm.model ?? "inherits model"}, ${fm.effort}): ${first}`);
    }
    lines.push("  - Explore: a broad read-only sweep (pass model sonnet or haiku)");
    return lines;
}

/** The refusal reason for one Agent call, or null to let it through. */
export function refusal(toolName, input, agents) {
    if (toolName !== "Agent" && toolName !== "Task") return null;
    if (input === null || typeof input !== "object") return null;
    const type = typeof input.subagent_type === "string" && input.subagent_type.trim() !== "" ? input.subagent_type.trim() : null;
    const model = typeof input.model === "string" ? input.model.toLowerCase() : "";

    if (type !== null && NO_OPUS.has(type) && model.includes("opus")) {
        return `\`${type}\` is a search or mechanical role, and Opus buys nothing there. Drop \`model\` to use its own, or pass sonnet or haiku.`;
    }
    const project = type !== null ? agents.get(type) : undefined;
    const unroled = type === null || UNROLED.has(type) || (project !== undefined && !isRoled(project));
    if (!unroled) return null;
    if (typeof input.description === "string" && ONE_OFF.test(input.description)) return null;

    const asked =
        type === null
            ? "no subagent_type (general-purpose)"
            : project !== undefined
              ? `\`${type}\` (its definition sets no effort or no maxTurns)`
              : `\`${type}\``;
    return [
        `Spawn by role: ${asked} has no turn cap, no compaction window or no effort of its own, so it`,
        "inherits yours and runs to the full context window. Pick the role that fits:",
        ...roleLines(agents),
        "Split a job that mixes roles into one spawn per role.",
        'For a single short task none of these fits, start the description with "one-off:".',
    ].join("\n");
}

/** The hook's stdout for one call: a deny decision, or "" to allow. */
export function handle(input, agents) {
    if (input === null || typeof input !== "object") return "";
    const reason = refusal(input.tool_name, input.tool_input, agents);
    if (reason === null) return "";
    return JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
    });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    let input = null;
    try {
        input = JSON.parse(readFileSync(0, "utf8"));
    } catch {
        // Nothing to check.
    }
    const root = process.env.CLAUDE_PROJECT_DIR ?? join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
    process.stdout.write(handle(input, projectAgents(join(root, ".claude", "agents"))));
}
