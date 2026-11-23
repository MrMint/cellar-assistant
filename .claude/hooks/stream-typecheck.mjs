#!/usr/bin/env node
// PostToolUse hook for stream-builder agents (wired in .claude/agents/stream-builder.md): after an
// edit to a workspace package's TypeScript, type-checks that package and tells the stream about
// errors in the files its worktree has changed.
//
// It runs after Edit and Write on a .ts/.tsx file under services/* or packages/*, and after a Bash
// call when a changed .ts/.tsx file in the worktree is newer than the last check (streams edit
// mostly through Bash) or the last check found errors: a `git checkout` or a script can clear them
// without leaving a newer changed file. It checks only the packages that hold changed files, with
// `tsc --noEmit --incremental` and a build-info file per package under `.review/`: measured
// 2026-11-22, services/client took 36 s cold and 4 s warm. It stays silent when the changed files
// are clean, says so once when they turn clean, and skips a worktree with no node_modules, where
// every answer would be false.
//
// WHY: the IDE's and the LSP's diagnostics reach the main conversation only. In smart-home's R4
// Fettle build (2026-10-22) no stream received one, and a subagent that made a deliberate type
// error with Edit saw nothing. Hook context does reach a subagent, so this hook is how a stream
// hears about type errors before its commit.
//
// State lives in <worktree>/.review/typecheck.json: when the last check ran and how many errors it
// found in changed files.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TS = /\.(ts|tsx|mts|cts)$/;
/** A workspace package: the first two path segments of a file under services/ or packages/. */
const PACKAGE = /^((?:services|packages)\/[^/]+)\//;
export const SHOW_MAX = 15;
const TIMEOUT_MS = 80_000;

/** The worktree a call touched: from a Bash command and cwd, or an edited file's path. */
export function worktreeOf(tool, args, cwd) {
    const where = tool === "Bash" ? `${args?.command ?? ""} ${cwd ?? ""}` : String(args?.file_path ?? "");
    // Greedy, so a worktree nested inside another resolves to the innermost one.
    return /(\/[^\s'"]*\/\.claude\/worktrees\/[^/\s'"]+)/.exec(where)?.[1] ?? null;
}

/** Worktree-relative .ts/.tsx paths from `git status --porcelain` output. */
export function changedFiles(porcelain) {
    return porcelain
        .split("\n")
        .map((line) => line.slice(3).trim().replace(/^.* -> /, ""))
        .filter((f) => TS.test(f) && PACKAGE.test(f));
}

/** The packages that hold the given worktree-relative files, in first-seen order. */
export function packagesOf(files) {
    return [...new Set(files.map((f) => PACKAGE.exec(f)?.[1]).filter(Boolean))];
}

/** tsc errors in one package's output, with paths made worktree-relative. */
export function parseErrors(output, pkg) {
    return output
        .split("\n")
        .map((line) => /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line.trim()))
        .filter(Boolean)
        .map((m) => ({ file: `${pkg}/${m[1]}`, line: m[2], col: m[3], code: m[4], text: m[5] }));
}

/** The context to hand the stream, or null for silence. */
export function report(errors, changed, previousErrors) {
    const mine = errors.filter((e) => changed.includes(e.file));
    const others = errors.length - mine.length;
    if (mine.length > 0) {
        return {
            mine: mine.length,
            text: [
                `Typecheck after this change: ${mine.length} error${mine.length === 1 ? "" : "s"} in files you changed.`,
                ...mine.slice(0, SHOW_MAX).map((e) => `${e.file}(${e.line},${e.col}): ${e.code}: ${e.text}`),
                ...(mine.length > SHOW_MAX ? [`… and ${mine.length - SHOW_MAX} more (bun run typecheck)`] : []),
                ...(others > 0
                    ? [
                          `${others} more in files you did not change: another stream's merge, a caller of your change, or`,
                          "generated types this worktree lacks (`bun run typegen` and `bun run codegen` in services/client;",
                          "typegen writes only gitignored files, measured 2026-11-22).",
                      ]
                    : []),
            ].join("\n"),
        };
    }
    return { mine: 0, text: previousErrors > 0 ? "Typecheck: the files you changed are clean now." : null };
}

function main(input) {
    const tool = input.tool_name;
    const args = input.tool_input ?? {};
    const worktree = worktreeOf(tool, args, input.cwd);
    if (!worktree || !existsSync(join(worktree, "node_modules"))) return "";
    if (tool !== "Bash") {
        const file = String(args.file_path ?? "");
        if (!file.startsWith(`${worktree}/`) || !TS.test(file) || !PACKAGE.test(file.slice(worktree.length + 1))) return "";
    }
    if (tool === "Bash" && /\btypecheck\b|\btsc\b/.test(args.command ?? "")) return "";

    const stateFile = join(worktree, ".review", "typecheck.json");
    let state = { at: 0, errors: 0 };
    try {
        state = JSON.parse(readFileSync(stateFile, "utf8"));
    } catch {}

    const status = spawnSync("git", ["-C", worktree, "status", "--porcelain", "--untracked-files=all", "--", "services", "packages"], {
        encoding: "utf8",
    });
    const changed = changedFiles(status.stdout ?? "");
    if (changed.length === 0 && !(state.errors > 0)) return "";
    if (tool === "Bash") {
        const newer = changed.some((f) => {
            try {
                return statSync(join(worktree, f)).mtimeMs > state.at;
            } catch {
                return false;
            }
        });
        if (!newer && !(state.errors > 0)) return "";
    }

    const bun = existsSync("/opt/homebrew/bin/bun") ? "/opt/homebrew/bin/bun" : "bun";
    const started = Date.now();
    mkdirSync(join(worktree, ".review"), { recursive: true });
    const errors = [];
    for (const pkg of packagesOf(changed)) {
        const dir = join(worktree, pkg);
        if (!existsSync(join(dir, "tsconfig.json"))) continue;
        const info = join(worktree, ".review", `tsc-${pkg.replace(/\//g, "-")}.tsbuildinfo`);
        const run = spawnSync(bun, ["x", "--bun", "tsc", "--noEmit", "-p", "tsconfig.json", "--incremental", "--tsBuildInfoFile", info, "--pretty", "false"], {
            cwd: dir,
            encoding: "utf8",
            timeout: TIMEOUT_MS,
        });
        errors.push(...parseErrors(`${run.stdout ?? ""}\n${run.stderr ?? ""}`, pkg));
    }
    const out = report(errors, changed, state.errors);
    try {
        writeFileSync(stateFile, JSON.stringify({ at: started, errors: out.mine }));
    } catch {}
    if (!out.text) return "";
    return JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: out.text } });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    let input = null;
    try {
        input = JSON.parse(readFileSync(0, "utf8"));
    } catch {
        // Nothing to check.
    }
    if (input && typeof input === "object") process.stdout.write(main(input));
}
