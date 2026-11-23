// The floor a stream's branch clears before it opens a PR.
//
//   node tools/pre-pr-check.ts [--brief <brief.md>] [--base <ref>]
//
// Run it from the worktree root. The base is `--base`, else the ref in `.review/changed-since`
// (the lead writes the integration branch there), else origin/main. "Changed" means
// `git diff --name-only <base>...HEAD` plus the working tree's changed and untracked files.
// Steps, in order; each prints pass or fail, and a failure prints the tail of its output:
//
//   owns       every changed file is inside a path the brief's check.json names in `owns`
//              (<brief>.check.json beside the brief, written by tools/slice-briefs.ts);
//   typecheck  `turbo run typecheck --filter=...[<base>]`: changed packages and their dependents;
//   biome      `biome check` on the changed files biome covers;
//   tests      the brief's `tests`, each run in its package (`bun run test <files>`; a file outside
//              every package runs under `node --test`), then `node --test 'tools/*.test.ts'` when tools/
//              changed, then `turbo run test --filter=...[<base>] --filter=!@cellar-assistant/e2e`;
//   secrets    no changed file is an env file (`.env*`, except `*.example`), a `*.pem`, or holds a
//              string matching SECRET_PATTERNS.
//
// It writes `.review/pre-pr.md`, a summary to paste into the PR body, and exits 1 when a step
// fails, 2 on a usage error or a base that is not a commit here.
//
// WHY: smart-home's Fettle builds grew a 1,600-line pre-PR floor (route shots, a model judge,
// axe) for design work. Every stream, design or not, needed its cheap core: the branch touches
// only its own files, its packages typecheck, the tests it reaches pass, and nothing secret
// leaves the machine. One command that runs those and leaves a summary for the PR body is that
// core, for a non-design build.
//
// Every export is a pure function over strings and command results; only the main-guard runs
// commands and touches the disk. Commands run through spawnSync with an argument array.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { loadPackages, ownerOf, type Package } from "./code-map.ts";

export const USAGE =
  "usage: node tools/pre-pr-check.ts [--brief <brief.md>] [--base <ref>]";
export const DEFAULT_BASE = "origin/main";
export const TAIL_LINES = 20;
const BIOME_FILES = /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts|json|jsonc)$/;
const SCAN_MAX_BYTES = 1_000_000;
/** A glob node --test expands itself: Node 24 reads a bare directory argument as a file. */
export const TOOLS_TESTS = "tools/*.test.ts";

/** Env files and keys, by name. `.env.example` and the like are templates, tracked on purpose. */
export const SECRET_FILES: RegExp[] = [
  /(^|\/)\.env(?!.*\.example$)(\..*)?$/,
  /\.pem$/,
];

/** Contents that look like a private key or a long-lived token. Kept small: each one is a
 *  format with a fixed prefix, so a match is almost never a false positive. */
export const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  {
    name: "private key",
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/,
  },
  {
    name: "GitHub token",
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/,
  },
  { name: "AWS access key id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{32,}/ },
  { name: "OpenAI key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "Slack token", re: /\bxox[abposr]-[A-Za-z0-9-]{20,}/ },
  { name: "Stripe live key", re: /\b[sr]k_live_[0-9A-Za-z]{24,}/ },
];

export interface Args {
  brief: string | null;
  base: string | null;
  help: boolean;
}

export function parseArgs(argv: string[]): Args | string {
  const out: Args = { brief: null, base: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--brief" || a === "--base") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) return `${a} needs a value`;
      out[a === "--brief" ? "brief" : "base"] = v;
    } else return `unknown argument ${a}`;
  }
  return out;
}

/** The base ref: the flag, else `.review/changed-since`'s first line, else origin/main. */
export function baseRef(
  flag: string | null,
  changedSince: string | null,
): string {
  if (flag) return flag;
  const first = changedSince?.split("\n")[0].trim();
  return first || DEFAULT_BASE;
}

/** `<brief>.check.json` beside the brief. */
export const checkPathOf = (brief: string): string =>
  `${brief.replace(/\.md$/, "")}.check.json`;

export interface Check {
  tests: string[];
  owns: string[];
}

export function parseCheck(text: string): Check {
  const j = JSON.parse(text) as Record<string, unknown>;
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return { tests: list(j.tests), owns: list(j.owns) };
}

/** Changed files from `git diff --name-only` output and `git status --porcelain` output. */
export function changedFiles(diffNames: string, porcelain: string): string[] {
  const out = new Set(
    diffNames
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
  for (const line of porcelain.split("\n")) {
    if (line.length < 4) continue;
    let path = line.slice(3);
    const arrow = path.indexOf(" -> ");
    if (arrow >= 0) path = path.slice(arrow + 4);
    out.add(path.replace(/^"|"$/g, ""));
  }
  return [...out].sort();
}

export interface Step {
  name: string;
  ok: boolean;
  summary: string;
  tail: string[];
}

const tailOf = (text: string, n = TAIL_LINES): string[] =>
  text.trimEnd().split("\n").slice(-n);

/** Whether `file` sits inside an owned path (a file, or a directory with or without its `/`). */
export function owned(file: string, owns: readonly string[]): boolean {
  return owns.some((p) => {
    const dir = p.replace(/\/$/, "");
    return file === dir || file.startsWith(`${dir}/`);
  });
}

export function ownsStep(changed: string[], owns: string[] | null): Step {
  if (owns === null || owns.length === 0)
    return {
      name: "owns",
      ok: true,
      summary: "skipped: no brief names `owns`",
      tail: [],
    };
  const strays = changed.filter((f) => !owned(f, owns));
  return strays.length === 0
    ? {
        name: "owns",
        ok: true,
        summary: `${changed.length} changed file(s), all owned`,
        tail: [],
      }
    : {
        name: "owns",
        ok: false,
        summary: `${strays.length} of ${changed.length} changed file(s) outside \`owns\``,
        tail: strays,
      };
}

/** A command to run: program, argument array, and working directory relative to the root. */
export interface Cmd {
  cmd: string;
  args: string[];
  cwd: string;
}

export interface Outcome {
  status: number | null;
  output: string;
}

export const show = (c: Cmd): string =>
  `${c.cwd === "." ? "" : `(${c.cwd}) `}${[c.cmd, ...c.args].join(" ")}`;

export const typecheckCmds = (base: string): Cmd[] => [
  {
    cmd: "bunx",
    args: ["turbo", "run", "typecheck", `--filter=...[${base}]`],
    cwd: ".",
  },
];

export function biomeCmds(
  changed: string[],
  exists: (f: string) => boolean,
): Cmd[] {
  const files = changed.filter((f) => BIOME_FILES.test(f) && exists(f));
  if (files.length === 0) return [];
  return [
    {
      cmd: "bunx",
      args: ["biome", "check", "--no-errors-on-unmatched", ...files],
      cwd: ".",
    },
  ];
}

export function testCmds(
  tests: string[],
  packages: readonly Package[],
  base: string,
  changed: string[],
): Cmd[] {
  const byDir = new Map<string, string[]>();
  const loose: string[] = [];
  for (const t of tests) {
    const p = ownerOf(t, packages);
    if (!p) {
      loose.push(t);
      continue;
    }
    const list = byDir.get(p.dir) ?? [];
    list.push(t.slice(p.dir.length + 1));
    byDir.set(p.dir, list);
  }
  const cmds: Cmd[] = [...byDir].map(([dir, files]) => ({
    cmd: "bun",
    args: ["run", "test", ...files],
    cwd: dir,
  }));
  if (loose.length)
    cmds.push({ cmd: "node", args: ["--test", ...loose], cwd: "." });
  if (
    changed.some((f) => f.startsWith("tools/")) &&
    !loose.some((f) => f.startsWith("tools"))
  )
    cmds.push({ cmd: "node", args: ["--test", TOOLS_TESTS], cwd: "." });
  cmds.push({
    cmd: "bunx",
    args: [
      "turbo",
      "run",
      "test",
      `--filter=...[${base}]`,
      "--filter=!@cellar-assistant/e2e",
    ],
    cwd: ".",
  });
  return cmds;
}

/** A step from the commands it ran and their outcomes: it passes when every command exited 0. */
export function commandStep(
  name: string,
  cmds: Cmd[],
  outcomes: Outcome[],
  empty: string,
): Step {
  if (cmds.length === 0)
    return { name, ok: true, summary: `skipped: ${empty}`, tail: [] };
  const failed = cmds.findIndex((_, i) => outcomes[i]?.status !== 0);
  if (failed < 0)
    return {
      name,
      ok: true,
      summary: `${cmds.length} command(s) passed`,
      tail: [],
    };
  const o = outcomes[failed];
  return {
    name,
    ok: false,
    summary: `\`${show(cmds[failed])}\` exited ${o?.status ?? "on a signal"}`,
    tail: tailOf(o?.output ?? ""),
  };
}

export const NEXT_ENV = "services/client/next-env.d.ts";
export const NEXT_ENV_HINT =
  "services/client has no next-env.d.ts: run `bun run typegen` in services/client (it writes only gitignored files, measured 2026-11-22) and re-run.";

/** A failed typecheck in a worktree with no next-env.d.ts gets the one line that explains it:
 *  without it the client cannot type its image imports (TS2307 on `@/images/*.png`). */
export function typecheckHint(step: Step, hasNextEnv: boolean): Step {
  return step.ok || hasNextEnv
    ? step
    : { ...step, tail: [...step.tail, NEXT_ENV_HINT] };
}

/** What a changed file trips: its name, or a pattern in its text (null when unread). */
export function secretHits(file: string, text: string | null): string[] {
  const hits: string[] = [];
  if (SECRET_FILES.some((re) => re.test(file)))
    hits.push(`${file}: an env or key file`);
  if (text !== null)
    for (const { name, re } of SECRET_PATTERNS) {
      const m = re.exec(text);
      if (m) {
        const line = text.slice(0, m.index).split("\n").length;
        hits.push(`${file}:${line}: looks like a ${name}`);
      }
    }
  return hits;
}

export function secretsStep(hits: string[], scanned: number): Step {
  return hits.length === 0
    ? {
        name: "secrets",
        ok: true,
        summary: `${scanned} file(s) scanned, none secret`,
        tail: [],
      }
    : {
        name: "secrets",
        ok: false,
        summary: `${hits.length} hit(s); nothing secret may be pushed`,
        tail: hits,
      };
}

/** The report for `.review/pre-pr.md` and the PR body. */
/** Text made safe for one markdown table cell: backslashes, pipes and newlines escaped. */
export function cell(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

export function render(
  steps: Step[],
  base: string,
  brief: string | null,
): string {
  const ok = steps.every((s) => s.ok);
  const lines = [
    "## Pre-PR check",
    "",
    `Base \`${base}\`${brief ? `, brief \`${brief}\`` : ""}: ${ok ? "**all steps pass**" : `**${steps.filter((s) => !s.ok).length} step(s) fail**`}.`,
    "",
    "| step | result | note |",
    "|---|---|---|",
    ...steps.map(
      (s) => `| ${s.name} | ${s.ok ? "pass" : "FAIL"} | ${cell(s.summary)} |`,
    ),
  ];
  for (const s of steps.filter((x) => !x.ok && x.tail.length)) {
    lines.push("", `### ${s.name}`, "", "```", ...s.tail, "```");
  }
  return `${lines.join("\n")}\n`;
}

function run(c: Cmd): Outcome {
  console.log(`  $ ${show(c)}`);
  const r = spawnSync(c.cmd, c.args, {
    cwd: c.cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return {
    status: r.error ? 127 : r.status,
    output: `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? String(r.error) : ""}`,
  };
}

function git(...args: string[]): string {
  const r = spawnSync("git", ["--no-optional-locks", ...args], {
    encoding: "utf8",
  });
  if (r.status !== 0)
    throw new Error(`git ${args.join(" ")}: ${(r.stderr ?? "").trim()}`);
  return r.stdout ?? "";
}

function readText(file: string): string | null {
  try {
    const st = statSync(file);
    if (!st.isFile() || st.size > SCAN_MAX_BYTES) return null;
    const buf = readFileSync(file);
    return buf.includes(0) ? null : buf.toString("utf8");
  } catch {
    return null;
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args === "string" || args.help) {
    if (typeof args === "string") console.error(args);
    console.error(USAGE);
    process.exitCode = typeof args === "string" ? 2 : 0;
    return;
  }
  const since = join(".review", "changed-since");
  const base = baseRef(
    args.base,
    existsSync(since) ? readFileSync(since, "utf8") : null,
  );
  let check: Check | null = null;
  if (args.brief) {
    const path = checkPathOf(args.brief);
    if (!existsSync(path)) {
      console.error(
        `${path}: no check file. Run tools/slice-briefs.ts on the build first.`,
      );
      process.exitCode = 2;
      return;
    }
    check = parseCheck(readFileSync(path, "utf8"));
  }
  const verify = spawnSync(
    "git",
    ["rev-parse", "--verify", "--quiet", `${base}^{commit}`],
    { encoding: "utf8" },
  );
  if (verify.status !== 0) {
    console.error(
      `base ${base} is not a commit here; fetch it, or pass --base <ref>`,
    );
    process.exitCode = 2;
    return;
  }
  const changed = changedFiles(
    git("diff", "--name-only", `${base}...HEAD`),
    git("status", "--porcelain", "--untracked-files=all"),
  );
  console.log(`${changed.length} changed file(s) since ${base}`);
  const packages = loadPackages(process.cwd());
  const steps: Step[] = [];
  const report = (s: Step) => {
    steps.push(s);
    console.log(`${s.ok ? "pass" : "FAIL"}  ${s.name}: ${s.summary}`);
    if (!s.ok) for (const l of s.tail) console.log(`      ${l}`);
  };
  const runStep = (
    name: string,
    cmds: Cmd[],
    empty: string,
    finish: (s: Step) => Step = (s) => s,
  ) => {
    console.log(`… ${name}`);
    const outcomes: Outcome[] = [];
    for (const c of cmds) {
      const o = run(c);
      outcomes.push(o);
      if (o.status !== 0) break;
    }
    report(finish(commandStep(name, cmds, outcomes, empty)));
  };
  report(ownsStep(changed, check?.owns ?? null));
  runStep("typecheck", typecheckCmds(base), "nothing to typecheck", (s) =>
    typecheckHint(s, existsSync(NEXT_ENV)),
  );
  runStep(
    "biome",
    biomeCmds(changed, existsSync),
    "no changed file biome covers",
  );
  runStep(
    "tests",
    testCmds(check?.tests ?? [], packages, base, changed),
    "no tests",
  );
  const hits = changed.flatMap((f) => secretHits(f, readText(f)));
  report(secretsStep(hits, changed.length));
  const text = render(steps, base, args.brief);
  mkdirSync(".review", { recursive: true });
  writeFileSync(join(".review", "pre-pr.md"), text);
  console.log(`\nWrote .review/pre-pr.md. Paste it into the PR body.`);
  process.exitCode = steps.every((s) => s.ok) ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
