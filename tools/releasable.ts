// Does this pull request leave production code unreleased?
//
//   node tools/releasable.ts            (in CI: reads BASE_SHA, HEAD_SHA, PR_TITLE, PR_LABELS)
//
// release-please opens a release PR only for releasable commits: `feat:`, `fix:`, `perf:`,
// `revert:`, `deps:`, anything breaking (`type!:` or a `BREAKING CHANGE:` footer), or a
// `Release-As:` footer. Everything else (`chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `build:`,
// `style:`, and `chore(deps):`, because the scope does not change the type) is left out. The
// frontend deploys only from a release (release-please fast-forwards `production`, which Vercel
// builds), so a PR that changes what runs in production under a non-releasable type merges and
// then sits undeployed with nothing saying so. That happened to #751 and #752 (2026-11-28).
//
// This check fails such a PR. It has to look at both halves, because the repository allows every
// merge method and release-please reads whatever lands on main:
//
//   title    a squash merge turns the PR title into the one commit release-please reads;
//   commits  a merge commit or a rebase lands the branch's own commits (merge commits in the
//            branch are skipped: release-please cannot parse "Merge …" and ignores them).
//
// A PR that touches nothing deployed passes whatever its type. A PR that changes deployed files
// but genuinely should not release (a comment-only change, say) passes with the
// `release:skip` label.
//
// Every export is a pure function over strings; only the main-guard runs git.

import { spawnSync } from "node:child_process";

export const SKIP_LABEL = "release:skip";

const RELEASABLE_TYPES = new Set(["feat", "fix", "perf", "revert", "deps"]);

const HEADER = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<bang>!)?: \S/;

/** Is this commit message (or PR title) one release-please would release? */
export function isReleasable(message: string): boolean {
  const header = HEADER.exec(message.trimStart());
  if (header === null) return false;
  if (header.groups?.bang === "!") return true;
  if (/^BREAKING[ -]CHANGE: /m.test(message)) return true;
  if (/^Release-As: *\S/im.test(message)) return true;
  return RELEASABLE_TYPES.has(header.groups?.type ?? "");
}

/**
 * The files whose change reaches production: the apps and the packages they are built from, the
 * dependency set, the runtime pin, and the production infra. Tests, docs, the e2e suite and
 * test-time analysis do not.
 */
export function isDeployed(path: string): boolean {
  if (/\.mdx?$/i.test(path)) return false;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(path)) return false;
  if (/(^|\/)(__tests__|__mocks__|fixtures)\//.test(path)) return false;
  if (/^packages\/(e2e|analysis)\//.test(path)) return false;
  if (/^(services|packages)\//.test(path)) return true;
  return (
    [
      "package.json",
      "bun.lock",
      "bunfig.toml",
      ".nvmrc",
      "infra/docker-compose.prod.yml",
    ].includes(path) || /^infra\/(loki|postgres)\//.test(path)
  );
}

export type Verdict =
  | { readonly ok: true; readonly why: string }
  | { readonly ok: false; readonly why: string };

export function verdict(input: {
  readonly title: string;
  readonly labels: readonly string[];
  readonly files: readonly string[];
  /** Full messages of the branch's non-merge commits. */
  readonly commits: readonly string[];
}): Verdict {
  const deployed = input.files.filter(isDeployed);
  if (deployed.length === 0) {
    return { ok: true, why: "touches nothing that is deployed" };
  }
  if (input.labels.includes(SKIP_LABEL)) {
    return { ok: true, why: `labelled ${SKIP_LABEL}` };
  }
  const titleOk = isReleasable(input.title);
  const commitsOk = input.commits.some(isReleasable);
  if (titleOk && commitsOk) {
    return { ok: true, why: "title and commits are releasable" };
  }
  const shown = deployed.slice(0, 10).map((f) => `  ${f}`);
  if (deployed.length > shown.length) {
    shown.push(`  … and ${deployed.length - shown.length} more`);
  }
  const missing = [
    titleOk
      ? null
      : `- the PR title "${input.title}" is not releasable, so a squash merge would not release`,
    commitsOk
      ? null
      : "- no commit on the branch is releasable, so a merge commit or a rebase would not release",
  ].filter((line): line is string => line !== null);
  return {
    ok: false,
    why: [
      `This PR changes ${deployed.length} deployed file(s):`,
      ...shown,
      "",
      "but release-please would open no release for it:",
      ...missing,
      "",
      "Use a releasable type: `fix:` (including `fix(deps):`), `feat:` or `perf:`, or mark a",
      "breaking change. If the change really should not ship (comments only, say), add the",
      `\`${SKIP_LABEL}\` label.`,
    ].join("\n"),
  };
}

function git(args: string[]): string {
  const run = spawnSync("git", args, { encoding: "utf8" });
  if (run.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${run.stderr}`);
  }
  return run.stdout;
}

if (import.meta.main) {
  const base = process.env.BASE_SHA ?? "";
  const head = process.env.HEAD_SHA ?? "";
  if (base === "" || head === "") {
    console.error("releasable: BASE_SHA and HEAD_SHA are required");
    process.exit(2);
  }
  const labels: string[] = JSON.parse(process.env.PR_LABELS ?? "[]");
  const files = git(["diff", "--name-only", `${base}...${head}`])
    .split("\n")
    .filter((f) => f !== "");
  const commits = git([
    "log",
    "--no-merges",
    "--format=%B%x00",
    `${base}..${head}`,
  ])
    .split("\0")
    .map((m) => m.trim())
    .filter((m) => m !== "");
  const result = verdict({
    title: process.env.PR_TITLE ?? "",
    labels,
    files,
    commits,
  });
  console.log(result.ok ? `releasable: pass (${result.why})` : result.why);
  process.exit(result.ok ? 0 : 1);
}
