#!/usr/bin/env node
// PreToolUse hook for the agents that read large files (wired in the frontmatter of
// .claude/agents/stream-builder.md and surveyor.md): refuses a whole-file read of a long code file
// and hands back its outline instead, so the agent reads the range it needs.
//
// Refused: `Read` with no `limit`, and a Bash segment that is only `cat <file>`, when the file is
// code and longer than MAX_LINES. Never refused: a Read with an explicit limit, `sed -n`, a cat
// piped into something, markdown and data files. The outline is every column-0 declaration with
// its line number, so the next call can name the range.
//
// WHY: in smart-home's R4 build (2026-10-22), file contents were 73% of what streams read into
// context, and one whole-file read was 300k characters. A read stays in context, paid for on every
// later turn, until the next compaction.

import { readFileSync, existsSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_LINES = 300;
const OUTLINE_MAX = 80;
const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const DECLARATION =
    /^(export\s+)?(default\s+)?(declare\s+)?(async\s+)?(function\*?|class|abstract\s+class|interface|type|enum|const|let|var|namespace)\s+[\w$]+|^export\s+(default|\{|\*)|^(describe|it|test)(\.\w+)?\(/;

/** The file a Bash command would print whole, or null. Tracks `cd` so relative paths resolve. */
export function catTarget(command, cwd) {
    let dir = cwd;
    for (const raw of command.split(/&&|;|\n/)) {
        const segment = raw.trim();
        const cd = /^cd\s+("[^"]+"|'[^']+'|\S+)$/.exec(segment);
        if (cd) {
            const to = cd[1].replace(/^["']|["']$/g, "");
            dir = isAbsolute(to) ? to : resolve(dir, to);
            continue;
        }
        const cat = /^cat\s+("[^"]+"|'[^']+'|[^\s|<>]+)$/.exec(segment);
        if (cat) {
            const file = cat[1].replace(/^["']|["']$/g, "");
            return isAbsolute(file) ? file : join(dir, file);
        }
    }
    return null;
}

/** A code file's outline: every column-0 declaration with its line number. */
export function outline(lines) {
    const out = [];
    lines.forEach((line, i) => {
        if (DECLARATION.test(line)) out.push(`L${i + 1}  ${line.length > 110 ? `${line.slice(0, 109)}…` : line}`);
    });
    if (out.length > OUTLINE_MAX) return [...out.slice(0, OUTLINE_MAX), `… and ${out.length - OUTLINE_MAX} more`];
    return out;
}

/** The deny reason for one call, or null to let it through. */
export function refusal(input) {
    if (input === null || typeof input !== "object") return null;
    const args = input.tool_input ?? {};
    let path = null;
    if (input.tool_name === "Read" && args.limit == null && typeof args.file_path === "string") path = args.file_path;
    if (input.tool_name === "Bash" && typeof args.command === "string") path = catTarget(args.command, input.cwd ?? process.cwd());
    if (!path) return null;
    if (!CODE.test(path) || !existsSync(path) || !statSync(path).isFile()) return null;

    const lines = readFileSync(path, "utf8").split("\n");
    if (lines.length <= MAX_LINES) return null;
    return [
        `${path} is ${lines.length} lines, so a whole-file read is refused. Read only the range you need:`,
        "Read with offset and limit (an explicit limit is never refused) or `sed -n 'a,bp'`, several ranges in one call.",
        "For a file's importers and tests, `node tools/code-map.ts <file>` is cheaper still.",
        "",
        "Outline (column-0 declarations):",
        ...outline(lines),
    ].join("\n");
}

/** The hook's stdout for one call: a deny decision, or "" to allow. */
export function handle(input) {
    const reason = refusal(input);
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
