#!/usr/bin/env node
// PreToolUse hook for stream-builder agents (wired in .claude/agents/stream-builder.md): refuses a
// whole-file read of a long code file and hands back its outline instead, so the stream reads the
// range it needs.
//
// Refused: `Read` with no `limit`, and a Bash segment that is only `cat <file>`, when the file is
// code and longer than MAX_LINES. Never refused: a Read with an explicit limit, `sed -n`, a cat
// piped into something, markdown and data files. The outline is every column-0 declaration with
// its line number, so the next call can name the range.
//
// WHY: in smart-home's R4 build (2026-10-22), file contents were 73% of what streams read into
// context, and one whole-file read was 300k characters. A read stays in context, paid for on every later turn,
// until the next compaction.

import { readFileSync, existsSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

const MAX_LINES = 300;
const OUTLINE_MAX = 80;
const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const DECLARATION =
    /^(export\s+)?(default\s+)?(declare\s+)?(async\s+)?(function\*?|class|abstract\s+class|interface|type|enum|const|let|var|namespace)\s+[\w$]+|^export\s+(default|\{|\*)|^(describe|it|test)(\.\w+)?\(/;

function readStdin() {
    try {
        return JSON.parse(readFileSync(0, "utf8"));
    } catch {
        return null;
    }
}

/** The file a Bash command would print whole, or null. Tracks `cd` so relative paths resolve. */
function catTarget(command, cwd) {
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

function outline(lines) {
    const out = [];
    lines.forEach((line, i) => {
        if (DECLARATION.test(line)) out.push(`L${i + 1}  ${line.length > 110 ? `${line.slice(0, 109)}…` : line}`);
    });
    if (out.length > OUTLINE_MAX) return [...out.slice(0, OUTLINE_MAX), `… and ${out.length - OUTLINE_MAX} more`];
    return out;
}

const input = readStdin();
if (!input) process.exit(0);
const tool = input.tool_name;
const args = input.tool_input ?? {};
let path = null;
if (tool === "Read" && args.limit == null && typeof args.file_path === "string") path = args.file_path;
if (tool === "Bash" && typeof args.command === "string") path = catTarget(args.command, input.cwd ?? process.cwd());
if (!path || !CODE.test(path) || !existsSync(path) || !statSync(path).isFile()) process.exit(0);

const lines = readFileSync(path, "utf8").split("\n");
if (lines.length <= MAX_LINES) process.exit(0);

const reason = [
    `${path} is ${lines.length} lines, so a whole-file read is refused. Read only the range you need:`,
    "Read with offset and limit (an explicit limit is never refused) or `sed -n 'a,bp'`.",
    "",
    "Outline (column-0 declarations):",
    ...outline(lines),
].join("\n");
process.stdout.write(
    JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
    }),
);
