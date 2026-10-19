@AGENTS.md

# Compact instructions

Context compacts at a 300k window (set in the owner's user-level Claude Code settings), so a long
task compacts several times. When you are using compact, keep: the path of your brief and of your
`PROGRESS.md`, the task's acceptance criteria, every decision with its reason, the files you
changed, failing tests or typechecks and their error text, and the next step. Drop: old command
output, file contents you can re-read, screenshots, and finished exploration. After a compaction,
re-read your brief and your `PROGRESS.md` before acting.

# Multi-agent builds

Most of the quota goes to subagents. An agent pays for its whole context on every turn, so a stream
that runs hundreds of turns at half a million tokens costs many times what the same work costs in
bounded pieces. When you split work across parallel agents:

- **Spawn each role as its agent type.** The owner's user config defines them in
  `~/.claude/agents/`: `stream-builder` for build and fix streams (1-hour prompt cache, turn cap,
  the `PROGRESS.md` rules), `reviewer` for review rounds (fresh context, sees only the diff and
  the criteria) and `verifier` for checking the running app. Quick lookups stay on `Explore`.

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
