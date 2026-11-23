// Brief slicer for a multi-agent build: turns each stream's brief SOURCE into the brief the stream
// reads, with its own slices of the plan documents copied in.
//
//   node tools/slice-briefs.ts <build dir> [<id>…]
//
// Reads `<build>/briefs/src/<id>.md` (every source when no id is given) and writes
// `<build>/briefs/<id>.md` and `<build>/briefs/<id>.check.json`, which tools/pre-pr-check.ts reads
// as `{ tests, owns, map }`.
//
// WHY: in smart-home's Fettle R3 build, streams re-read `streams.md` and `cards.md` about 470
// times, and those two files were 17% of everything the streams read. A brief that only POINTS at
// sections makes every stream open the whole file to find them, again after every compaction. A
// brief that carries its slices is read once and survives compaction as a file.
//
// A source is ordinary markdown plus directive lines, one per line, each starting at column 0:
//
//   @include <file> § <heading> [› <part>; <part>…]   copy that section, or only the named parts
//   @tests  <path>…                                   repo-relative test files the pre-PR check runs
//   @owns   <path>…                                   repo-relative files or dirs the stream owns;
//                                                      the pre-PR check fails a change outside them
//   @map    <path>…                                   a code map of these repo files or directories:
//                                                      package, exports, line numbers, importers, tests
//   @size   large <reason>                            lets the brief run past BRIEF_MAX_LINES
//
// <file> is relative to the build dir. A HEADING matches when its text equals the query or starts
// with it followed by a boundary (space · : , — or ". "), case-insensitively, so "1" finds
// "1. Model contract" but not "1.1 Migrations". Headings inside code fences are not headings. A
// section runs to the next heading of the same or a higher level.
//
// A PART is resolved inside the section, first rule that matches:
//   1. `Steps 2-5` / `Steps 1, 3`: those numbered items under the section's **Steps** label;
//   2. a bold label, `**Honesty:**` or `**Build notes**`: that block, to the next column-0 bold line;
//   3. an id: the list item or paragraph whose leading bold text starts with it (`- **L1 · …**`,
//      `**M-a, the contract** (owns …`);
//   4. an id: the table row whose first cell is it, with the table's header.
// A heading or part that matches nothing, or more than one thing, is an error: a brief silently
// missing a ruling is the failure this tool exists to prevent.
//
// A brief longer than BRIEF_MAX_LINES, not counting its code map, is refused unless its source says
// `@size large` and why. In Fettle's R4 (2026-10-22) seven of thirteen briefs ran past 400 lines;
// the streams that hit the 300-turn cap or came near it were all among them.
//
// Every export is a pure function over strings; only the main-guard touches the disk.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadPackages, loadSources, ROOT, renderMap } from "./code-map.ts";

export const BRIEF_MAX_LINES = 400;
export const USAGE = "usage: node tools/slice-briefs.ts <build dir> [<id>…]";

/** What the pre-PR check reads from `<id>.check.json`. */
export interface Check {
  tests: string[];
  owns: string[];
  map: string[];
}

export interface Sliced {
  text: string;
  check: Check;
}

interface Span {
  start: number; // first line, 0-based
  end: number; // one past the last line
}

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BOLD_LEAD = /^(?:[-*]\s+|\d+\.\s+)?\*\*([^*]+?)\*\*/;
const DIRECTIVE = /^@include\s+(\S+)\s+§\s+(.+?)(?:\s+›\s+(.+))?\s*$/;

/** Marks each line that sits inside a code fence, the fence lines included. */
export function fenceMask(lines: readonly string[]): boolean[] {
  let open = false;
  return lines.map((line) => {
    if (FENCE.test(line)) {
      open = !open;
      return true;
    }
    return open;
  });
}

/** True when a heading's text is the query, or starts with it followed by a boundary. */
export function matchesHeading(text: string, query: string): boolean {
  const t = text.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (t === q) return true;
  if (!t.startsWith(q)) return false;
  const rest = t.slice(q.length);
  return /^(\s|·|:|,|—|\.\s)/.test(rest) || rest === ".";
}

/** The span of the one section whose heading matches, from its heading line to the next heading
 *  of the same or a higher level. Throws when none or several match. */
export function findSection(
  lines: readonly string[],
  query: string,
  file: string,
): Span {
  const fenced = fenceMask(lines);
  const hits: { line: number; level: number }[] = [];
  lines.forEach((line, i) => {
    const m = fenced[i] ? null : HEADING.exec(line);
    if (m && matchesHeading(m[2], query))
      hits.push({ line: i, level: m[1].length });
  });
  if (hits.length === 0)
    throw new Error(`${file}: no heading matches "${query}"`);
  if (hits.length > 1) {
    const at = hits.map((h) => h.line + 1).join(", ");
    throw new Error(
      `${file}: "${query}" matches ${hits.length} headings (lines ${at}); name it more fully`,
    );
  }
  const { line, level } = hits[0];
  let end = lines.length;
  for (let i = line + 1; i < lines.length; i++) {
    const m = fenced[i] ? null : HEADING.exec(lines[i]);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return { start: line, end };
}

/** "2-5", "2–5", "1, 3", "1 and 3", "4" → the step numbers. */
export function parseNumbers(spec: string): number[] {
  const out: number[] = [];
  for (const piece of spec.split(/\s*(?:,|\band\b)\s*/)) {
    const range = /^(\d+)\s*[-–]\s*(\d+)$/.exec(piece);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n++) out.push(n);
    } else if (/^\d+$/.test(piece)) {
      out.push(Number(piece));
    } else {
      throw new Error(`"${spec}" is not a list of step numbers`);
    }
  }
  return out;
}

/** The text of a column-0 bold label, without a trailing colon: `**Honesty:** C3` → "Honesty". */
function labelOf(line: string): string | null {
  const m = /^\*\*([^*]+?)\*\*/.exec(line);
  return m ? m[1].trim().replace(/:$/, "").trim() : null;
}

/** A bold-label block: the label line to the next column-0 bold line, heading or rule. */
function labelBlock(
  lines: readonly string[],
  fenced: boolean[],
  section: Span,
  label: string,
): Span[] {
  const blocks: Span[] = [];
  for (let i = section.start + 1; i < section.end; i++) {
    if (fenced[i] || labelOf(lines[i])?.toLowerCase() !== label.toLowerCase())
      continue;
    let end = section.end;
    for (let j = i + 1; j < section.end; j++) {
      if (
        !fenced[j] &&
        (labelOf(lines[j]) !== null ||
          HEADING.test(lines[j]) ||
          /^---\s*$/.test(lines[j]))
      ) {
        end = j;
        break;
      }
    }
    blocks.push({ start: i, end: trimBlank(lines, i, end) });
  }
  return blocks;
}

function trimBlank(
  lines: readonly string[],
  start: number,
  end: number,
): number {
  while (end > start + 1 && lines[end - 1].trim() === "") end--;
  return end;
}

/** The numbered items under the section's **Steps** label whose numbers are listed. */
function steps(
  lines: readonly string[],
  fenced: boolean[],
  section: Span,
  numbers: number[],
): Span[] {
  const blocks = labelBlock(lines, fenced, section, "Steps");
  if (blocks.length !== 1)
    throw new Error(`expected one **Steps** block, found ${blocks.length}`);
  const { start, end } = blocks[0];
  const items: { n: number; start: number }[] = [];
  for (let i = start + 1; i < end; i++) {
    const m = fenced[i] ? null : /^(\d+)\.\s/.exec(lines[i]);
    if (m) items.push({ n: Number(m[1]), start: i });
  }
  return numbers.map((n) => {
    const k = items.findIndex((item) => item.n === n);
    if (k < 0) throw new Error(`no step ${n} under **Steps**`);
    const stop = k + 1 < items.length ? items[k + 1].start : end;
    return {
      start: items[k].start,
      end: trimBlank(lines, items[k].start, stop),
    };
  });
}

/** List items and paragraphs whose leading bold text starts with the id. */
function boldItems(
  lines: readonly string[],
  fenced: boolean[],
  section: Span,
  id: string,
): Span[] {
  const lead = new RegExp(`^${escapeRegExp(id)}(?![\\w-])`, "i");
  const found: Span[] = [];
  for (let i = section.start + 1; i < section.end; i++) {
    const m = fenced[i] ? null : BOLD_LEAD.exec(lines[i]);
    if (!m || !lead.test(m[1].trim())) continue;
    const listItem = /^([-*]|\d+\.)\s/.test(lines[i]);
    let end = i + 1;
    while (end < section.end) {
      const line = lines[end];
      if (listItem) {
        // A list item keeps its indented lines, and blank lines that lead to more of them.
        if (/^\s+\S/.test(line)) end++;
        else if (line.trim() === "" && /^\s+\S/.test(lines[end + 1] ?? ""))
          end++;
        else break;
      } else {
        if (line.trim() === "" || HEADING.test(line)) break;
        end++;
      }
    }
    found.push({ start: i, end });
  }
  return found;
}

/** The table row whose first cell is the id, preceded by that table's header and separator. */
function tableRows(
  lines: readonly string[],
  fenced: boolean[],
  section: Span,
  id: string,
): Span[] {
  const found: Span[] = [];
  for (let i = section.start + 1; i < section.end; i++) {
    if (fenced[i] || !lines[i].startsWith("|")) continue;
    const first = lines[i].split("|")[1]?.trim().replace(/[`*]/g, "");
    if (first?.toLowerCase() !== id.toLowerCase()) continue;
    let top = i;
    while (top > section.start + 1 && lines[top - 1].startsWith("|")) top--;
    if (top + 2 > i) continue; // the header row itself
    found.push({ start: top, end: top + 2 }, { start: i, end: i + 1 });
  }
  return found;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The spans one part names inside a section. Throws when it names nothing or is ambiguous. */
export function findPart(
  lines: readonly string[],
  section: Span,
  part: string,
  file: string,
): Span[] {
  const fenced = fenceMask(lines);
  const where = `${file} § line ${section.start + 1} › ${part}`;
  try {
    const stepSpec = /^steps?\s+(.+)$/i.exec(part);
    if (stepSpec)
      return steps(lines, fenced, section, parseNumbers(stepSpec[1]));
    const label = labelBlock(lines, fenced, section, part);
    if (label.length === 1) return label;
    if (label.length > 1)
      throw new Error(`the label **${part}** appears ${label.length} times`);
    const items = boldItems(lines, fenced, section, part);
    if (items.length === 1) return items;
    if (items.length > 1)
      throw new Error(`${items.length} bold items start with "${part}"`);
    const rows = tableRows(lines, fenced, section, part);
    if (rows.length === 2) return rows;
    if (rows.length > 2)
      throw new Error(`${rows.length / 2} table rows start with "${part}"`);
  } catch (error) {
    throw new Error(`${where}: ${(error as Error).message}`);
  }
  throw new Error(`${where}: no steps, label, bold item or table row matches`);
}

/** Turns one brief source into the brief and its check file. `read` returns a plan file's text,
 *  given its path relative to the build dir; `map` renders the code map for a `@map` line. */
export function sliceBrief(
  source: string,
  sourceName: string,
  read: (file: string) => string,
  map?: (paths: string[]) => string,
): Sliced {
  const check: Check = { tests: [], owns: [], map: [] };
  const out = [
    `<!-- Generated by tools/slice-briefs.ts from briefs/src/${sourceName}. Edit the source and re-run; edits here are lost. -->`,
  ];
  let mapLines = 0;
  let large = false;
  const push = (list: string[], words: string[], what: string) => {
    if (words.length === 0)
      throw new Error(`${sourceName}: ${what} names no paths`);
    for (const w of words) if (!list.includes(w)) list.push(w);
  };
  for (const line of source.split("\n")) {
    const words = line.trim().split(/\s+/).slice(1);
    const verb = /^@(\w+)/.exec(line)?.[1];
    if (verb === undefined) {
      out.push(line);
      continue;
    }
    if (verb === "size") {
      if (words[0] !== "large" || words.length < 2)
        throw new Error(`${sourceName}: write \`@size large <reason>\``);
      large = true;
      continue;
    }
    if (verb === "map") {
      if (!map)
        throw new Error(
          `${sourceName}: @map needs a code map, and none was given`,
        );
      push(check.map, words, "@map");
      const rendered = [
        "> Code map at slicing time. Line numbers move as other streams merge: re-run `node tools/code-map.ts <file>` before you change an export.",
        "",
        map(words),
        "",
      ];
      mapLines += rendered.join("\n").split("\n").length;
      out.push(...rendered);
      continue;
    }
    if (verb === "tests") {
      push(check.tests, words, "@tests");
      continue;
    }
    if (verb === "owns") {
      push(check.owns, words, "@owns");
      continue;
    }
    if (verb !== "include")
      throw new Error(`${sourceName}: unknown directive @${verb}: ${line}`);
    const d = DIRECTIVE.exec(line);
    if (!d) throw new Error(`${sourceName}: cannot read directive: ${line}`);
    const [, file, heading, partList] = d;
    const lines = read(file).split("\n");
    const section = findSection(lines, heading, file);
    const parts = partList ? partList.split(";").map((p) => p.trim()) : [];
    const spans =
      parts.length === 0
        ? [section]
        : parts.flatMap((p) => findPart(lines, section, p, file));
    const body = spans
      .map((s) => lines.slice(s.start, s.end).join("\n"))
      .join("\n\n");
    const lineList = spans.map((s) =>
      s.end - s.start > 1 ? `${s.start + 1}–${s.end}` : `${s.start + 1}`,
    );
    const named = `\`${file}\` § ${heading}${partList ? ` › ${partList}` : ""}`;
    out.push(`> From ${named} (lines ${lineList.join(", ")}):`, "", body, "");
  }
  const text = out.join("\n");
  const size = text.split("\n").length - mapLines;
  if (size > BRIEF_MAX_LINES && !large) {
    throw new Error(
      `${sourceName}: the brief is ${size} lines without its code map, over ${BRIEF_MAX_LINES}. Split the stream, or add \`@size large <reason>\` to the source.`,
    );
  }
  return { text, check };
}

function main(): void {
  const [build, ...ids] = process.argv.slice(2);
  if (!build || build === "--help" || build === "-h") {
    console.error(USAGE);
    process.exitCode = build ? 0 : 2;
    return;
  }
  const srcDir = join(build, "briefs", "src");
  let sources: Map<string, string> | undefined;
  let packages: ReturnType<typeof loadPackages> | undefined;
  const map = (paths: string[]) => {
    sources ??= loadSources();
    packages ??= loadPackages();
    return renderMap(paths, sources, packages);
  };
  const head = execFileSync(
    "git",
    ["-C", ROOT, "rev-parse", "--short", "HEAD"],
    {
      encoding: "utf8",
    },
  ).trim();
  const names =
    ids.length > 0
      ? ids.map((id) => `${id}.md`)
      : readdirSync(srcDir).filter((f) => f.endsWith(".md"));
  let failed = 0;
  for (const name of names.sort()) {
    const id = name.replace(/\.md$/, "");
    try {
      const sliced = sliceBrief(
        readFileSync(join(srcDir, name), "utf8"),
        name,
        (file) => readFileSync(join(build, file), "utf8"),
        (paths) => `${map(paths)}\n\n_Mapped from ${head}._`,
      );
      writeFileSync(join(build, "briefs", name), sliced.text);
      writeFileSync(
        join(build, "briefs", `${id}.check.json`),
        `${JSON.stringify(sliced.check, null, 2)}\n`,
      );
      const kb = (sliced.text.length / 1024).toFixed(1);
      const { tests, owns, map: mapped } = sliced.check;
      console.log(
        `${id}: ${sliced.text.split("\n").length} lines, ${kb} KB · ${tests.length} tests, ${owns.length} owned paths, ${mapped.length} mapped`,
      );
    } catch (error) {
      failed++;
      console.error(`${id}: ${(error as Error).message}`);
    }
  }
  process.exitCode = failed === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
