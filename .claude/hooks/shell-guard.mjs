#!/usr/bin/env node
// PreToolUse hook on Bash (wired in .claude/settings.json, so it holds for every session and every
// agent in this repo): refuses the shell commands this repo's written rules already forbid, so the
// rule holds when an agent has not read it.
//
// Refused, for everyone:
//   * a host `bun run dev` / `bun run build` / `bun dev` / `next dev` / `next build` /
//     `turbo run build` (AGENTS.md § HARD: they write into the working tree, and port 3000 is the
//     user's). The container lane (`bun run stack:client:build`) is not matched.
//   * bare `git stash` / `git stash pop`: the stash stack is shared by every worktree and session,
//     so a pop can take another session's entry. `git stash push -u -m <tag>`, `apply <sha>`,
//     `list`, `show` and `drop` stay allowed.
//   * `git branch -D`: `-d` refuses to delete unmerged work; `-D` does not.
//   * `pkill` / `killall` aimed at node, bun, next or dapr: other worktrees' processes match too.
// Refused, for subagents only (the hook input carries `agent_id`):
//   * a git write (commit, reset, checkout, switch, merge, rebase, pull, push, stash, add, rm, mv,
//     restore, clean, cherry-pick, revert, am, tag, branch -d/-m) whose directory is the repo's
//     primary checkout, the one every worktree hangs off. The user works there.
//
// WHY: every one of these is a rule written down here or in smart-home, broken by an agent at a
// measurable cost. In smart-home, a delegate reset the primary checkout's HEAD, and that checkout
// is what deploys the house. Bare stash pops have taken another session's entry. A pkill aimed at
// one dev server took down the others. In this repo, a host `next build` silently rewrote
// services/client/tsconfig.json (AGENTS.md § HARD). The rules were all in prose, which an agent
// may not have read; a hook holds whether it has or not.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOST_BUILD =
    /(^|[\s;&|(])((bun|npm|pnpm|yarn)\s+(run\s+)?(dev|build)(?![\w:-])|(bunx\s+|npx\s+)?next\s+(dev|build)(?![\w:-])|(bunx\s+|npx\s+)?turbo\s+(run\s+)?build(?![\w:-]))/;
const KILL = /(^|[\s;&|(])(pkill|killall)\b[^\n;&|]*\b(node|bun|next|dapr|daprd)\b/;
const SAFE_STASH = /^stash\s+(push\b.*\s(-m|--message)\s|apply\b|list\b|show\b|drop\b)/;
const GIT_WRITE =
    /^(commit|reset|checkout|switch|merge|rebase|pull|push|stash|add|rm|mv|restore|clean|cherry-pick|revert|am|tag|branch\s+-[dDmM])\b/;

/** Each command segment of a Bash command, with the directory it runs in. */
export function segments(command, cwd) {
    const out = [];
    let dir = cwd;
    for (const raw of command.split(/&&|\|\||;|\n|\|/)) {
        const s = raw.trim();
        if (s === "") continue;
        const cd = /^cd\s+("([^"]+)"|'([^']+)'|(\S+))$/.exec(s);
        if (cd) {
            const to = cd[2] ?? cd[3] ?? cd[4];
            dir = isAbsolute(to) ? to : dir ? resolve(dir, to) : to;
            continue;
        }
        out.push({ text: s, dir });
    }
    return out;
}

/** A git segment's subcommand (after `-C <dir>` and `-c k=v` options) and the directory it acts on. */
export function gitCall(segment) {
    const m = /^git\s+(.*)$/.exec(segment.text);
    if (!m) return null;
    let rest = m[1];
    let dir = segment.dir;
    for (;;) {
        const opt = /^(-C|-c)\s+("([^"]+)"|'([^']+)'|(\S+))\s*/.exec(rest);
        if (!opt) break;
        if (opt[1] === "-C") {
            const to = opt[3] ?? opt[4] ?? opt[5];
            dir = isAbsolute(to) ? to : dir ? resolve(dir, to) : to;
        }
        rest = rest.slice(opt[0].length);
    }
    return { sub: rest.trim(), dir };
}

/**
 * The refusal reason for one Bash call, or null. `primaryOf(dir)` returns the primary checkout of
 * the repo that holds `dir` and whether `dir` is inside it (not inside a linked worktree), or null.
 */
export function refusal(input, primaryOf) {
    if (input?.tool_name !== "Bash") return null;
    const command = input.tool_input?.command;
    if (typeof command !== "string") return null;
    const isSubagent = typeof input.agent_id === "string" && input.agent_id !== "";

    // Quoted text (a commit message, an echo) is data, not a command: blank it for the name checks.
    const unquoted = command.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''");
    for (const seg of segments(unquoted, input.cwd ?? null)) {
        if (HOST_BUILD.test(` ${seg.text}`)) {
            return [
                "Refused: a host dev server or build (AGENTS.md § HARD). It writes into the working tree, and port 3000 is the user's.",
                "Verify against the containerised client instead: `bun run stack:up`, `bun run stack:client:build`, port 3003.",
                "One package's own build (not the client's) is `bun run --filter @cellar-assistant/<pkg> build`.",
            ].join("\n");
        }
        if (KILL.test(` ${seg.text}`)) {
            return "Refused: pkill/killall by name matches every worktree's processes. Stop your own stack with `bun run dev:down`, or kill one pid you started.";
        }
    }
    for (const seg of segments(command, input.cwd ?? null)) {
        const git = gitCall(seg);
        if (!git) continue;
        if (/^stash\b/.test(git.sub) && !SAFE_STASH.test(git.sub)) {
            return [
                "Refused: the stash stack is shared by every worktree and session, so a bare stash or pop can take another session's entry.",
                "Use a WIP commit, or `git stash push -u -m <your-tag>`, then `git stash apply <sha>` and drop your own entry by its tag.",
            ].join("\n");
        }
        if (/^branch\b(.*\s)?-D\b/.test(git.sub)) {
            return "Refused: `git branch -D` deletes unmerged work. Use `-d`, which refuses when the branch is not merged. Branches a worktree holds are other sessions'; leave them.";
        }
        if (isSubagent && GIT_WRITE.test(git.sub) && git.dir) {
            const p = primaryOf(git.dir);
            if (p?.inPrimary) {
                return [
                    `Refused: \`git ${git.sub.split(/\s+/)[0]}\` in ${p.primary}, the primary checkout every worktree hangs off. The user works there.`,
                    "Run git in your own worktree under .claude/worktrees/ (`git -C <worktree> …`). If you have none, hand back and say so.",
                ].join("\n");
            }
        }
    }
    return null;
}

/** The primary checkout for `dir`, from git itself: the parent of the common git dir. */
export function primaryFromGit(dir) {
    try {
        const run = (args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 4000 }).trim();
        const top = run(["rev-parse", "--show-toplevel"]);
        const common = resolve(dir, run(["rev-parse", "--git-common-dir"]));
        const primary = resolve(common, "..");
        return { primary, inPrimary: top === primary };
    } catch {
        return null;
    }
}

/** The hook's stdout for one call: a deny decision, or "" to allow. */
export function handle(input, primaryOf = primaryFromGit) {
    if (input === null || typeof input !== "object") return "";
    const reason = refusal(input, primaryOf);
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
    process.stdout.write(handle(input));
}
