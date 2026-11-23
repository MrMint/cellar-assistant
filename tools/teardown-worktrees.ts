// Removes the worktrees a build left behind, keeping every one that still holds work.
//
//   node tools/teardown-worktrees.ts <name prefix>…           # dry run: what would go, and why the rest stay
//   node tools/teardown-worktrees.ts <name prefix>… --apply   # archive untracked scratch, then remove
//   node tools/teardown-worktrees.ts --all [--apply]          # every worktree under .claude/worktrees/
//
// A prefix matches a worktree's own name (the last path segment) or its path below the repo's
// `.claude/worktrees/`, so `shadcn-` reaches `A/.claude/worktrees/shadcn-s1` as well.
//
// WHY: in smart-home's Fettle builds nothing removed a build's worktrees once its PR was open. Each
// was 4–8 GB, mostly node_modules and .next, and a release build made thirty or more: the Mac's
// 926 GB disk filled on 2026-10-17 with 165 worktrees holding about 440 GB, and again by
// 2026-10-23. A full host disk also corrupts the Docker VM's ext4. Cellar's builds nest: a lead
// working in `.claude/worktrees/A` makes its streams' worktrees under `A/.claude/worktrees/`, and
// removing A with `--force` would delete every one of them with it.
//
// A worktree is removed only when all of these hold, checked again just before each removal:
//   * it sits under the repo's `.claude/worktrees/` and is not the checkout this runs from (nor one
//     that holds it);
//   * it has no changes to tracked files, except NOISE: the client's next-env.d.ts and AGENTS.md,
//     whose managed block `next dev` and `next typegen` rewrite;
//   * every commit it holds is on a remote ref (merged, or pushed to its PR branch);
//   * it is not locked, and nothing in it changed for MIN_IDLE_HOURS (ALL_MIN_IDLE_HOURS with
//     --all, which reaches worktrees other sessions may own);
//   * every worktree nested inside it is being removed too. Children go before their parent.
// Untracked files (PROGRESS.md, .review/, scratch tests) are archived into one tgz before
// anything is removed (`worktree-scratch-<day>.tgz` beside the repo, `-2`, `-3`… for a second
// teardown that day), except any under a directory named for a cache, and except the nested
// worktrees, which are judged on their own; gitignored files such as node_modules are not.
// Branches are never deleted.
//
// Before each removal, when the worktree has a `.stack/`, it runs that worktree's own
// `scripts/stack/stack.sh down --volumes`: a removed worktree's stack otherwise keeps its compose
// project, ports and volumes. If that fails, the worktree stays, so nothing is left running with
// no checkout to stop it from.
//
// The auto-mode classifier blocks an agent's bulk `git worktree remove --force`, so the lead runs
// the dry run and the owner runs `--apply`.
//
// Every export is a pure function over strings and numbers; only the main-guard touches git.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const sep = "/";
const NEST = `${sep}.claude${sep}worktrees${sep}`;

export const MIN_IDLE_HOURS = 1;
export const ALL_MIN_IDLE_HOURS = 24;
export const NOISE = /^services\/client\/(next-env\.d\.ts|AGENTS\.md)$/;
const CACHE_DIR = /(^|\/)[^/]*cache[^/]*\//i;

export const USAGE =
  "usage: node tools/teardown-worktrees.ts <prefix>… | --all  [--apply]";

/** Changed tracked files in `git status --porcelain --untracked-files=no` output, less NOISE. */
export function countTrackedChanges(porcelain: string): number {
  return porcelain.split("\n").filter((l) => l && !NOISE.test(l.slice(3)))
    .length;
}

/** The untracked files worth keeping, from `git ls-files --others` output split on NUL, less
 *  caches and anything inside a nested worktree (`nested` are worktree-relative dirs). */
export function keepable(untracked: string[], nested: string[] = []): string[] {
  return untracked.filter(
    (f) =>
      f &&
      !CACHE_DIR.test(f) &&
      !nested.some((n) => f === n || f === `${n}/` || f.startsWith(`${n}/`)),
  );
}

export interface WorktreeEntry {
  path: string;
  branch: string | null; // null when detached
  locked: boolean;
}

/** Parse `git worktree list --porcelain`. */
export function parseWorktreeList(porcelain: string): WorktreeEntry[] {
  const out: WorktreeEntry[] = [];
  for (const block of porcelain.split(/\n\n+/)) {
    const lines = block.split("\n").filter(Boolean);
    const head = lines.find((l) => l.startsWith("worktree "));
    if (!head) continue;
    const branch = lines.find((l) => l.startsWith("branch "));
    out.push({
      path: head.slice("worktree ".length),
      branch: branch ? branch.slice("branch refs/heads/".length) : null,
      locked: lines.some((l) => l === "locked" || l.startsWith("locked ")),
    });
  }
  return out;
}

/** A worktree's own name: the segment after its last `.claude/worktrees/`. */
export function leafName(path: string): string {
  const i = path.lastIndexOf(NEST);
  return i < 0 ? path : path.slice(i + NEST.length);
}

/** The worktrees in scope: under `<root>/.claude/worktrees/`, matching a prefix unless `all`. */
export function inScope(
  entries: WorktreeEntry[],
  root: string,
  prefixes: string[],
  all: boolean,
): WorktreeEntry[] {
  const base = join(root, ".claude", "worktrees") + sep;
  return entries.filter((e) => {
    if (!e.path.startsWith(base)) return false;
    const rel = e.path.slice(base.length);
    const leaf = leafName(e.path);
    return all || prefixes.some((p) => rel.startsWith(p) || leaf.startsWith(p));
  });
}

/** Every listed worktree whose path lies inside `path`, at any depth. */
export function nestedIn(path: string, entries: WorktreeEntry[]): string[] {
  return entries
    .map((e) => e.path)
    .filter((p) => p.startsWith(path + sep))
    .sort();
}

/** Deepest first, so children are judged and removed before their parents. */
export function childrenFirst<T extends { path: string }>(xs: T[]): T[] {
  const depth = (p: string) => p.split(NEST).length;
  return [...xs].sort(
    (a, b) => depth(b.path) - depth(a.path) || a.path.localeCompare(b.path),
  );
}

export interface Facts {
  entry: WorktreeEntry;
  current: boolean; // the checkout this runs from, or one that holds it
  trackedChanges: number;
  unpushedCommits: number;
  idleHours: number;
  untracked: string[]; // worktree-relative
  kb: number;
  nested: string[]; // absolute paths of worktrees inside this one
}

export interface Verdict {
  facts: Facts;
  remove: boolean;
  reasons: string[]; // why it stays; empty when it goes
}

export function decide(facts: Facts, minIdleHours: number): Verdict {
  const reasons: string[] = [];
  if (facts.current) reasons.push("this checkout");
  if (facts.entry.locked) reasons.push("locked");
  if (facts.trackedChanges > 0)
    reasons.push(`${facts.trackedChanges} uncommitted tracked change(s)`);
  if (facts.unpushedCommits > 0)
    reasons.push(`${facts.unpushedCommits} commit(s) on no remote`);
  if (facts.idleHours < minIdleHours)
    reasons.push(`changed ${facts.idleHours.toFixed(1)} h ago`);
  return { facts, remove: reasons.length === 0, reasons };
}

/** Keeps every parent that holds a nested worktree which stays, whether that one was in scope
 *  or not. Returns the verdicts children first. */
export function holdParents(verdicts: Verdict[]): Verdict[] {
  const ordered = childrenFirst(
    verdicts.map((v) => ({ path: v.facts.entry.path, v })),
  ).map((x) => x.v);
  const going = new Set<string>();
  const out: Verdict[] = [];
  for (const v of ordered) {
    const staying = v.facts.nested.filter((n) => !going.has(n));
    const next =
      v.remove && staying.length > 0
        ? {
            ...v,
            remove: false,
            reasons: [
              `holds ${staying.length} nested worktree(s) that stay (${staying.map(leafName).join(", ")})`,
            ],
          }
        : v;
    if (next.remove) going.add(next.facts.entry.path);
    out.push(next);
  }
  return out;
}

const gb = (kb: number): string => `${(kb / 1048576).toFixed(1)} GB`;
const nameOf = (v: Verdict): string => leafName(v.facts.entry.path);

export function renderPlan(verdicts: Verdict[], archive: string): string {
  const go = verdicts.filter((v) => v.remove);
  const stay = verdicts.filter((v) => !v.remove);
  const lines = [
    `Remove ${go.length} worktree(s), ${gb(go.reduce((s, v) => s + v.facts.kb, 0))}, children first:`,
  ];
  for (const v of go)
    lines.push(
      `  - ${nameOf(v)}  ${gb(v.facts.kb)}  ${v.facts.untracked.length} untracked`,
    );
  lines.push(`Keep ${stay.length}:`);
  for (const v of stay) lines.push(`  = ${nameOf(v)}  ${v.reasons.join(", ")}`);
  const files = go.reduce((s, v) => s + v.facts.untracked.length, 0);
  if (files > 0)
    lines.push(`Untracked files archived first: ${files}, to ${archive}`);
  return lines.join("\n");
}

/** The day's archive name in `dir`, or the first free `-2`, `-3`… when a teardown that day kept one. */
export function archivePath(
  dir: string,
  day: string,
  exists: (path: string) => boolean,
): string {
  const at = (n: number) =>
    join(dir, `worktree-scratch-${day}${n === 1 ? "" : `-${n}`}.tgz`);
  let n = 1;
  while (exists(at(n))) n++;
  return at(n);
}

/** Archive member paths, relative to `root`, for the worktrees that will go. */
export function archiveList(verdicts: Verdict[], root: string): string[] {
  const prefix = root.endsWith(sep) ? root : root + sep;
  return verdicts
    .filter((v) => v.remove)
    .flatMap((v) =>
      v.facts.untracked.map((f) =>
        join(v.facts.entry.path, f).slice(prefix.length),
      ),
    );
}

export interface Args {
  prefixes: string[];
  all: boolean;
  apply: boolean;
  minIdleHours: number;
}

export function parseArgs(argv: string[]): Args | string {
  if (argv.includes("--help") || argv.includes("-h")) return "";
  const prefixes = argv.filter((a) => !a.startsWith("--"));
  const all = argv.includes("--all");
  const unknown = argv.filter(
    (a) => a.startsWith("--") && !["--all", "--apply"].includes(a),
  );
  if (unknown.length > 0) return `unknown option ${unknown.join(" ")}`;
  if (all === prefixes.length > 0)
    return "name one or more worktree prefixes (e.g. r4-), or pass --all";
  return {
    prefixes,
    all,
    apply: argv.includes("--apply"),
    minIdleHours: all ? ALL_MIN_IDLE_HOURS : MIN_IDLE_HOURS,
  };
}

// --no-optional-locks: a plain `git status` rewrites the index to refresh it, and the index's
// mtime is one of the idle signals, so a dry run would make every worktree look busy.
function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", ["--no-optional-locks", "-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0)
    throw new Error(
      `git ${args.join(" ")} in ${cwd}: ${(r.stderr ?? "").trim()}`,
    );
  return r.stdout ?? "";
}

function gather(
  entry: WorktreeEntry,
  here: string,
  listed: WorktreeEntry[],
): Facts {
  const p = entry.path;
  const gitDir = git(p, "rev-parse", "--absolute-git-dir").trim();
  const mtimes = [p, join(gitDir, "index"), join(gitDir, "HEAD")]
    .filter(existsSync)
    .map((f) => statSync(f).mtimeMs);
  const du = (
    spawnSync("du", ["-sk", p], { encoding: "utf8" }).stdout ?? ""
  ).split("\t")[0];
  const nested = nestedIn(p, listed);
  return {
    entry,
    current: here === p || here.startsWith(p + sep),
    trackedChanges: countTrackedChanges(
      git(p, "status", "--porcelain", "--untracked-files=no"),
    ),
    unpushedCommits: Number(
      git(p, "rev-list", "--count", "HEAD", "--not", "--remotes").trim(),
    ),
    idleHours: (Date.now() - Math.max(...mtimes)) / 3.6e6,
    untracked: keepable(
      git(p, "ls-files", "--others", "--exclude-standard", "-z").split("\0"),
      nested.map((n) => n.slice(p.length + 1)),
    ),
    kb: Number(du) || 0,
    nested,
  };
}

/** Takes a worktree's stack down with its own stack.sh, when it has one. False on failure. */
function downStack(worktree: string): boolean {
  if (!existsSync(join(worktree, ".stack"))) return true;
  const script = join(worktree, "scripts", "stack", "stack.sh");
  if (!existsSync(script)) {
    console.log(`${leafName(worktree)}: .stack/ but no scripts/stack/stack.sh`);
    return false;
  }
  const r = spawnSync(script, ["down", "--volumes"], {
    cwd: worktree,
    encoding: "utf8",
    timeout: 180_000,
  });
  if (r.status === 0) return true;
  console.log(
    `${leafName(worktree)}: stack.sh down --volumes exited ${r.status ?? "on a signal"}; keeping it\n${(r.stderr ?? "").trim().split("\n").slice(-5).join("\n")}`,
  );
  return false;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args === "string") {
    if (args === "") {
      console.log(USAGE);
      return;
    }
    console.error(`${args}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  const here = git(".", "rev-parse", "--show-toplevel").trim();
  const root = dirname(
    git(here, "rev-parse", "--path-format=absolute", "--git-common-dir").trim(),
  );
  git(root, "worktree", "prune");
  const listed = parseWorktreeList(
    git(root, "worktree", "list", "--porcelain"),
  ).filter((e) => existsSync(e.path));
  const scope = inScope(listed, root, args.prefixes, args.all);
  const verdicts = holdParents(
    scope.map((e) => decide(gather(e, here, listed), args.minIdleHours)),
  );
  const archive = archivePath(
    dirname(root),
    new Date().toISOString().slice(0, 10),
    existsSync,
  );
  console.log(renderPlan(verdicts, archive));
  if (!args.apply) {
    console.log("\nDry run. Re-run with --apply to remove.");
    return;
  }
  const members = archiveList(verdicts, root);
  if (members.length > 0) {
    const list = join(mkdtempSync(join(tmpdir(), "teardown-")), "members.txt");
    writeFileSync(list, `${members.join("\n")}\n`);
    const tar = spawnSync("tar", ["-czf", archive, "-C", root, "-T", list], {
      encoding: "utf8",
    });
    if (tar.status !== 0)
      throw new Error(`tar failed; nothing was removed\n${tar.stderr ?? ""}`);
  }
  let removed = 0;
  for (const v of verdicts.filter((x) => x.remove)) {
    const p = v.facts.entry.path;
    const again = decide(
      gather(v.facts.entry, here, listed),
      args.minIdleHours,
    );
    const left = v.facts.nested.filter(existsSync);
    if (left.length > 0)
      again.reasons.push(`${left.length} nested worktree(s) still there`);
    if (again.reasons.length > 0) {
      console.log(`skip ${nameOf(v)}: ${again.reasons.join(", ")}`);
      continue;
    }
    if (!downStack(p)) continue;
    git(root, "worktree", "remove", "--force", p);
    removed++;
  }
  git(root, "worktree", "prune");
  console.log(`\nRemoved ${removed}. Branches are kept.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
