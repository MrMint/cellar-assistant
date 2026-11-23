@AGENTS.md

# Compact instructions

A `stream-builder` agent compacts at a 300k window (set in its own definition), so a long stream
compacts several times; other sessions keep the default window, so a long design or planning
conversation keeps what was said in it. When you are using compact, keep: the path of your brief and of your
`PROGRESS.md`, the task's acceptance criteria, every decision with its reason, the files you
changed, failing tests or typechecks and their error text, and the next step. Drop: old command
output, file contents you can re-read, screenshots, and finished exploration. After a compaction,
re-read your brief and your `PROGRESS.md` before acting.

# Multi-agent builds

Most of the quota goes to subagents. An agent pays for its whole context on every turn, so a stream
that runs hundreds of turns at half a million tokens costs many times what the same work costs in
bounded pieces. For a build of parallel streams, use the `multi-agent-build` skill
(`.claude/skills/multi-agent-build/SKILL.md`): it is the lead's process, phase by phase. The rules
every agent needs are below; each is enforced by a hook in `.claude/hooks/`, and
`bun run test:harness` tests them.

- **Spawn each role as its agent type,** defined in `.claude/agents/`: `stream-builder` for build and
  fix streams, `reviewer` for review rounds, `verifier` for checking the running app, `scout` for a
  search that would take you more than two turns, `surveyor` for read-many-write-one reports, and
  `sweeper` for a mechanical change across many files. Each definition sets its own model, effort,
  turn cap and compaction window. The spawn guard refuses `general-purpose`, `fork`, and any
  project agent whose definition sets no `effort` or `maxTurns`, and lists the roles that fit. A
  single short task none of them fits passes with a description starting `one-off:`.
- **Never pass `model: opus` to `scout`, `Explore`, `surveyor` or `sweeper`.** The spawn guard
  refuses it. Give `Explore` `model: sonnet`, or `haiku` for a plain "where is X".
- **A session loads its roles and hooks from its own checkout, once.** Start a lead from a worktree
  cut from `origin/main`; the SessionStart hook says so when a checkout is far behind.
- **The shell guard refuses** a host `bun run dev`/`build` (AGENTS.md § HARD), a bare `git stash` or
  `git stash pop`, `git branch -D`, `pkill`/`killall` by name, and a subagent's git writes in the
  primary checkout.
- **Resume while the context is small and warm, otherwise spawn fresh.** `SendMessage` a finished
  agent for a prompt follow-up to the same work. Once its context is large, or the follow-up comes
  after a review round with its cache cold, spawn a fresh `stream-builder` with the findings it owns
  in a file, plus the original stream's `PROGRESS.md`.
- **Keep tool output small.** Pipe tests and typechecks through `tail` or a filter, read line ranges
  rather than whole files, and look at a screenshot once and write down what it showed.
- **Measure after each build.** `node tools/agent-spend.ts --since <date>` gives spend by role and
  agent, flags unroled and oversized agents, and prints the streams' search-turn share.
