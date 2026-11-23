#!/usr/bin/env node
// PreToolUse hook on Bash (wired in .claude/settings.json, so it holds for every session and every
// agent in this repo): refuses the shell commands this repo's written rules already forbid, so the
// rule holds when an agent has not read it.
//
// Refused, for everyone:
//   * a host dev server or Next build (AGENTS.md § HARD: they write into the working tree, and port
//     3000 is the user's): the `dev` or `build` script run through bun, npm, pnpm or yarn (`bun
//     build`, Bun's own bundler, is not a script and is allowed), `next dev` / `next build`, and
//     `turbo [run] build|dev`, unless a `--filter` or `--cwd` names a package other than the client.
//     The container lane (`bun run stack:client:build`, `docker compose exec … bun run build`) is
//     never matched: its command is not bun or turbo.
//   * a `git stash` that can touch another session's entry: the stack is shared by every worktree
//     and session. Allowed: `push … -m <tag>`, `list`, `show`, and `apply` / `drop` that name an
//     entry.
//   * `git branch -D`, in any spelling (`-Df`, `--delete --force`, `-d -f`): `-d` refuses to delete
//     unmerged work, and `-D` does not.
//   * `pkill` / `killall` aimed at node, bun, next or dapr: other worktrees' processes match too.
// Refused, for subagents only (the hook input carries `agent_id`):
//   * a git write (commit, reset, checkout, switch, merge, rebase, pull, push, stash, add, rm, mv,
//     restore, clean, cherry-pick, revert, am, tag, branch) whose directory is the repo's primary
//     checkout, the one every worktree hangs off. The user works there.
//
// The command is split the way a shell would split it: on unquoted `;`, `&&`, `||`, `|`, `&`,
// newlines and parentheses, with quoted strings kept whole and heredoc bodies dropped. Each
// segment's words are then read by position, so a commit message, an echo or a heredoc that
// mentions `git stash` or `bun run dev` is data and never refused. `sh -c` / `bash -c` strings are
// checked as commands of their own. A parse error lets the call through: a guard must never block
// work by accident.
//
// WHY: every one of these is a rule written down here or in smart-home, broken by an agent at a
// measurable cost. In smart-home, a delegate reset the primary checkout's HEAD, and that checkout
// is what deploys the house. Bare stash pops have taken another session's entry. A pkill aimed at
// one dev server took down the others. In this repo, a host `next build` silently rewrote
// services/client/tsconfig.json (AGENTS.md § HARD). The rules were all in prose, which an agent
// may not have read; a hook holds whether it has or not.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** A --filter or --cwd value that names the client package. */
const CLIENT = /(^|\/|@cellar-assistant\/)client(\.{3})?$|^\.{3}@cellar-assistant\/client$|^services\/client\/?$/;
const SCOPE_OPTIONS = new Set(["--filter", "-F", "--cwd", "--workspace", "-w"]);
const KILL_TARGET = /\b(node|bun|next|dapr|daprd)\b/;
const GIT_WRITE = new Set([
    "commit", "reset", "checkout", "switch", "merge", "rebase", "pull", "push", "stash", "add", "rm",
    "mv", "restore", "clean", "cherry-pick", "revert", "am", "tag", "branch",
]);
const READ_ONLY_BRANCH = /^(-a|-r|-v|-vv|-l|--list|--show-current|--contains|--merged|--no-merged|--all|--remotes|--format=.*)$/;

/**
 * Splits a command into segments the way a shell would: on unquoted ; && || | & newline ( ),
 * keeping quoted strings whole and dropping heredoc bodies. Returns each segment's raw text.
 */
export function split(command) {
    const out = [];
    let cur = "";
    let quote = null;
    const heredocs = [];
    const flush = () => {
        if (cur.trim() !== "") out.push(cur.trim());
        cur = "";
    };
    for (let i = 0; i < command.length; i++) {
        const c = command[i];
        if (quote) {
            cur += c;
            if (c === "\\" && quote === '"' && i + 1 < command.length) cur += command[++i];
            else if (c === quote) quote = null;
            continue;
        }
        if (c === "'" || c === '"') {
            quote = c;
            cur += c;
            continue;
        }
        if (c === "\\" && i + 1 < command.length) {
            cur += c + command[++i];
            continue;
        }
        if (c === "<" && command[i + 1] === "<" && command[i + 2] !== "<") {
            const m = /^<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/.exec(command.slice(i));
            if (m) {
                heredocs.push(m[2]);
                cur += m[0];
                i += m[0].length - 1;
                continue;
            }
        }
        if (c === "\n") {
            flush();
            // Skip each pending heredoc's body: it runs to a line that is its tag alone.
            while (heredocs.length > 0) {
                const tag = heredocs.shift();
                for (;;) {
                    const end = command.indexOf("\n", i + 1);
                    const line = command.slice(i + 1, end === -1 ? command.length : end);
                    i = end === -1 ? command.length : end;
                    if (end === -1 || line.trim() === tag) break;
                }
            }
            continue;
        }
        if (";|&()".includes(c)) {
            flush();
            continue;
        }
        cur += c;
    }
    flush();
    return out;
}

/** A segment's words, with quotes removed and `~` expanded. Leading VAR=value assignments are dropped. */
export function words(segment) {
    const out = [];
    let cur = "";
    let quote = null;
    let has = false;
    for (let i = 0; i < segment.length; i++) {
        const c = segment[i];
        if (quote) {
            if (c === quote) quote = null;
            else if (c === "\\" && quote === '"' && i + 1 < segment.length) cur += segment[++i];
            else cur += c;
            continue;
        }
        if (c === "'" || c === '"') {
            quote = c;
            has = true;
            continue;
        }
        if (c === "\\" && i + 1 < segment.length) {
            cur += segment[++i];
            has = true;
            continue;
        }
        if (/\s/.test(c)) {
            if (has) out.push(cur);
            cur = "";
            has = false;
            continue;
        }
        cur += c;
        has = true;
    }
    if (has) out.push(cur);
    while (out.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(out[0])) out.shift();
    if (out[0] === "env") {
        out.shift();
        while (out.length > 0 && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(out[0]) || out[0].startsWith("-"))) out.shift();
    }
    return out.map((w) => (w === "~" || w.startsWith("~/") ? homedir() + w.slice(1) : w));
}

function at(dir, to) {
    if (!to) return dir;
    if (isAbsolute(to)) return to;
    return dir ? resolve(dir, to) : null;
}

/** Each command of a Bash command as { words, dir }, tracking `cd` and unwrapping `sh -c`. */
export function commands(command, cwd, depth = 0) {
    const out = [];
    let dir = cwd;
    for (const seg of split(command)) {
        const w = words(seg);
        if (w.length === 0) continue;
        if (w[0] === "cd") {
            dir = at(dir, w[1] ?? homedir());
            continue;
        }
        if (/^(sh|bash|zsh)$/.test(w[0]) && w[1] === "-c" && typeof w[2] === "string" && depth < 3) {
            out.push(...commands(w[2], dir, depth + 1));
            continue;
        }
        out.push({ words: w, dir });
    }
    return out;
}

/** The words that are not options or option values. */
function positionals(w) {
    const out = [];
    for (let i = 1; i < w.length; i++) {
        if (SCOPE_OPTIONS.has(w[i])) {
            i++;
            continue;
        }
        if (!w[i].startsWith("-")) out.push(w[i]);
    }
    return out;
}

/** Every --filter / --cwd value, in `--opt v` and `--opt=v` forms. */
function scopes(w) {
    const vals = [];
    for (let i = 1; i < w.length; i++) {
        if (SCOPE_OPTIONS.has(w[i]) && i + 1 < w.length) vals.push(w[i + 1]);
        const eq = /^(--filter|--cwd|--workspace)=(.*)$/.exec(w[i]);
        if (eq) vals.push(eq[2]);
    }
    return vals.map((v) => v.replace(/^\.\//, "").replace(/^!/, "!"));
}

/** True when a package-manager or turbo command runs the client's dev server or a Next build on the host. */
export function isHostBuild(w) {
    const viaRunner = (w[0] === "npx" || w[0] === "bunx") && w.length > 1;
    const tool = viaRunner ? w[1] : w[0];
    const rest = viaRunner ? w.slice(1) : w;
    const pos = positionals(rest);
    const sc = scopes(rest);
    const included = sc.filter((v) => !v.startsWith("!"));
    // Scoped to named packages that are all something other than the client: not the client's build.
    // A graph or glob filter (`...`, `[ref]`, `*`) can reach the client, so it doesn't count.
    const notClient = included.length > 0 && included.every((v) => !CLIENT.test(v) && !/\.\.\.|\[|\*/.test(v));
    if (tool === "next") return pos[0] === "dev" || pos[0] === "build";
    if (tool === "turbo") {
        const task = pos[0] === "run" ? pos[1] : pos[0];
        return (task === "build" || task === "dev") && !notClient;
    }
    if (!/^(bun|npm|pnpm|yarn)$/.test(tool)) return false;
    let script;
    if (pos[0] === "run" || pos[0] === "run-script") script = pos[1];
    else if (tool === "bun" && pos[0] === "build") return false; // Bun's bundler, not a script
    else if (tool !== "npm") script = pos[0];
    if (script !== "dev" && script !== "build") return false;
    return !notClient;
}

/** A git command read past its global options: { dir, sub, args }, or null when it is not git. */
export function gitCall(w, cwd) {
    if (w[0] !== "git") return null;
    let dir = cwd;
    let i = 1;
    while (i < w.length && w[i].startsWith("-")) {
        const o = w[i];
        if (o === "-C") {
            dir = at(dir, w[i + 1]);
            i += 2;
        } else if (o === "-c" || o === "--namespace" || o === "--work-tree" || o === "--git-dir") {
            if (o === "--work-tree") dir = at(dir, w[i + 1]);
            if (o === "--git-dir") dir = resolve(at(dir, w[i + 1]) ?? "/", "..");
            i += 2;
        } else {
            if (o.startsWith("--work-tree=")) dir = at(dir, o.slice("--work-tree=".length));
            else if (o.startsWith("--git-dir=")) dir = resolve(at(dir, o.slice("--git-dir=".length)) ?? "/", "..");
            i += 1;
        }
    }
    return { dir, sub: w[i] ?? "", args: w.slice(i + 1) };
}

function stashRefusal(args) {
    const verb = args[0] ?? "push";
    if (verb === "list" || verb === "show") return null;
    if ((verb === "apply" || verb === "drop") && args.slice(1).some((a) => !a.startsWith("-"))) return null;
    if ((verb === "push" || verb === "save") && args.some((a) => a === "-m" || a === "--message" || a.startsWith("--message="))) {
        return null;
    }
    return [
        "Refused: the stash stack is shared by every worktree and session, so this stash can take or drop another session's entry.",
        "Use a WIP commit, or `git stash push -u -m <your-tag>`, then `git stash apply <sha>`, and drop your own entry by the stash@{n} your tag shows in `git stash list`.",
    ].join("\n");
}

function isForceDelete(args) {
    const flags = args.filter((a) => a.startsWith("-"));
    const short = (f, ch) => /^-[A-Za-z]+$/.test(f) && f.includes(ch);
    if (flags.some((f) => short(f, "D"))) return true;
    const del = flags.some((f) => f === "--delete" || short(f, "d"));
    const force = flags.some((f) => f === "--force" || short(f, "f"));
    return del && force;
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

    for (const { words: w, dir } of commands(command, input.cwd ?? null)) {
        if (isHostBuild(w)) {
            return [
                "Refused: a host dev server or Next build (AGENTS.md § HARD). It writes into the working tree, and port 3000 is the user's.",
                "Verify against the containerised client instead: `bun run stack:up`, `bun run stack:client:build`, port 3003.",
                "Another package's own build is `bun run --filter @cellar-assistant/<pkg> build`.",
            ].join("\n");
        }
        if ((w[0] === "pkill" || w[0] === "killall") && w.slice(1).some((a) => KILL_TARGET.test(a))) {
            return "Refused: pkill/killall by name matches every worktree's processes. Stop your own stack with `bun run dev:down`, or kill one pid you started.";
        }
        const git = gitCall(w, dir);
        if (!git) continue;
        if (git.sub === "stash") {
            const r = stashRefusal(git.args);
            if (r) return r;
        }
        if (git.sub === "branch" && isForceDelete(git.args)) {
            return "Refused: `git branch -D` deletes unmerged work. Use `-d`, which refuses when the branch is not merged. Branches a worktree holds are other sessions'; leave them.";
        }
        const readOnly =
            (git.sub === "branch" && git.args.every((a) => READ_ONLY_BRANCH.test(a))) ||
            (git.sub === "stash" && /^(list|show)$/.test(git.args[0] ?? "")) ||
            (git.sub === "tag" && (git.args.length === 0 || git.args.every((a) => /^(-l|--list|-n\d*|--contains|--points-at)$/.test(a))));
        if (isSubagent && GIT_WRITE.has(git.sub) && !readOnly && git.dir) {
            const p = primaryOf(git.dir);
            if (p?.inPrimary) {
                return [
                    `Refused: \`git ${git.sub}\` in ${p.primary}, the primary checkout every worktree hangs off. The user works there.`,
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
        const run = (args) =>
            execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 4000 }).trim();
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
    let reason = null;
    try {
        reason = refusal(input, primaryOf);
    } catch {
        // A parser bug must never block work.
    }
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
