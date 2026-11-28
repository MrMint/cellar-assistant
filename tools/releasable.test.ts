import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDeployed, isReleasable, SKIP_LABEL, verdict } from "./releasable.ts";

describe("isReleasable", () => {
  for (const message of [
    "fix: a bug",
    "feat(client): a thing",
    "perf: faster",
    "revert: undo",
    "deps: bump pg",
    "fix(deps): bump pg",
    "chore!: drop Node 24",
    "refactor(api)!: rename a field",
    "chore: tidy\n\nBREAKING CHANGE: the env var is renamed",
    "chore: release 1.0.1\n\nRelease-As: 1.0.1",
  ]) {
    it(`releases ${JSON.stringify(message.split("\n")[0])}`, () => {
      assert.equal(isReleasable(message), true);
    });
  }

  for (const message of [
    "chore: tidy",
    "chore(deps): full dependency sweep",
    "docs: explain",
    "refactor: move",
    "test: cover",
    "ci: cache",
    "build: image",
    "Merge pull request #752 from MrMint/branch",
    "Merge remote-tracking branch 'origin/main' into x",
    "fix:no space",
    "Fix: capitalised type",
    "",
  ]) {
    it(`does not release ${JSON.stringify(message)}`, () => {
      assert.equal(isReleasable(message), false);
    });
  }
});

describe("isDeployed", () => {
  for (const path of [
    "services/client/src/app/page.tsx",
    "services/api/src/schema/item.ts",
    "services/actors/Dockerfile",
    "packages/db/migrations/20261128011208_b15c_user_settings/migration.sql",
    "packages/contracts/src/index.ts",
    "package.json",
    "services/client/package.json",
    "bun.lock",
    ".nvmrc",
    "infra/docker-compose.prod.yml",
    "infra/loki/pull-deploy.env.example",
  ]) {
    it(`counts ${path}`, () => assert.equal(isDeployed(path), true));
  }

  for (const path of [
    "services/client/src/app/page.test.tsx",
    "services/actors/src/lib/s3-cors.live.test.ts",
    "packages/e2e/specs/01-sign-in.spec.ts",
    "packages/analysis/src/index.ts",
    "services/actors/README.md",
    "docs/architecture/target-stack.md",
    "AGENTS.md",
    ".github/workflows/stack-ci.yaml",
    "tools/releasable.ts",
    ".claude/hooks/guard.mjs",
    "infra/docker-compose.yml",
    "services/client/src/__tests__/helper.ts",
  ]) {
    it(`does not count ${path}`, () => assert.equal(isDeployed(path), false));
  }
});

describe("verdict", () => {
  const deployed = ["services/client/src/app/page.tsx"];

  it("passes a PR that touches nothing deployed, whatever its type", () => {
    const v = verdict({
      title: "docs: explain",
      labels: [],
      files: ["docs/a.md", "tools/x.ts"],
      commits: ["docs: explain"],
    });
    assert.equal(v.ok, true);
  });

  it("passes the empty release commit", () => {
    const v = verdict({
      title: "chore: release 1.0.1",
      labels: [],
      files: [],
      commits: ["chore: release 1.0.1\n\nRelease-As: 1.0.1"],
    });
    assert.equal(v.ok, true);
  });

  it("fails #751's shape: chore(deps) title and commits on deployed files", () => {
    const v = verdict({
      title: "chore(deps): full dependency sweep",
      labels: [],
      files: ["bun.lock", "services/api/package.json"],
      commits: ["chore(deps): full dependency sweep", "chore(db): snapshots"],
    });
    assert.equal(v.ok, false);
    assert.match(v.why, /squash merge would not release/);
    assert.match(v.why, /merge commit or a rebase would not release/);
    assert.match(v.why, /bun\.lock/);
  });

  it("fails a releasable title over chore-only commits (a merge commit would not release)", () => {
    const v = verdict({
      title: "fix: the bug",
      labels: [],
      files: deployed,
      commits: ["chore: wip", "chore: more"],
    });
    assert.equal(v.ok, false);
    assert.doesNotMatch(v.why, /squash merge/);
    assert.match(v.why, /merge commit or a rebase/);
  });

  it("fails a releasable commit under a chore title (a squash would not release)", () => {
    const v = verdict({
      title: "chore: tidy",
      labels: [],
      files: deployed,
      commits: ["fix: the bug"],
    });
    assert.equal(v.ok, false);
    assert.match(v.why, /squash merge/);
    assert.doesNotMatch(v.why, /merge commit or a rebase/);
  });

  it("passes when the title and one commit are releasable", () => {
    const v = verdict({
      title: "fix: the bug",
      labels: [],
      files: deployed,
      commits: ["chore: wip", "fix: the bug"],
    });
    assert.equal(v.ok, true);
  });

  it(`passes a deployed change labelled ${SKIP_LABEL}`, () => {
    const v = verdict({
      title: "chore: comments",
      labels: ["dependencies", SKIP_LABEL],
      files: deployed,
      commits: ["chore: comments"],
    });
    assert.equal(v.ok, true);
  });

  it("lists at most ten deployed files", () => {
    const files = Array.from(
      { length: 14 },
      (_, i) => `services/api/src/f${i}.ts`,
    );
    const v = verdict({
      title: "chore: x",
      labels: [],
      files,
      commits: ["chore: x"],
    });
    assert.equal(v.ok, false);
    assert.match(v.why, /changes 14 deployed file/);
    assert.match(v.why, /… and 4 more/);
  });
});
