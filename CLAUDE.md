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
bounded pieces. When you split work across parallel agents:

- **Spawn each role as its agent type,** defined in `.claude/agents/`: `stream-builder` for build
  and fix streams (turn cap, 300k compaction window, the `PROGRESS.md` rules, long code files
  read as an outline), `reviewer` for review rounds (fresh context, sees only the diff and the
  criteria), `verifier` for checking the running app, and `scout` (Sonnet) for a search that
  would take a stream more than two turns. A session loads these from its own checkout, so start
  a lead from a checkout that is current with `origin/main`.
- **Never pass `model: opus` to a search agent.** `scout` runs on Sonnet by its own definition,
  and a `model` you pass overrides it. Give `Explore` `model: sonnet`, or `haiku` for a plain
  "where is X". Opus is for agents that build, review or verify.

- **One brief file per stream.** It gives the goal, the acceptance criteria, the files the stream
  owns and the checks it must pass. Point to shared plans by path and section; never inline them.
  An agent re-reads its brief after every compaction.
- **Every brief requires a `PROGRESS.md`** at the root of the agent's worktree, not committed. The
  agent updates it at each milestone with what's done, decisions and why, files touched, what's
  failing, and the next step. It re-reads the file after compacting and hands back its contents
  rather than a recap from memory.
- **Size streams to finish within one or two compactions.** Split by file ownership so no two
  streams write the same file. An agent that compacts three or more times is doing too much: stop
  it and split the remaining work from its `PROGRESS.md`.
- **Resume while the context is small and warm, otherwise spawn fresh.** A resumed agent keeps
  its history and can read the cache its last run warmed, so `SendMessage` it for prompt
  follow-ups to the same work. Once its context is large, or the follow-up comes hours later
  after a review round with its cache cold, spawn a fresh `stream-builder`. Give it the
  findings it owns, written to a file, plus the original stream's `PROGRESS.md`.
- **Keep tool output small.** Pipe tests and typechecks through `tail` or a filter, read line
  ranges rather than whole files, and look at a screenshot once and write down what it showed.
  Each image stays in context until the next compaction.
