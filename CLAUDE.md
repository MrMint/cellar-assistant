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
- **Fix rounds get fresh agents.** Give a new agent the findings it owns, written to a file, plus
  the original stream's `PROGRESS.md`. Don't `SendMessage` a finished stream agent into a fix
  round. Use `SendMessage` only for short clarifications to an agent that's still mid-task.
- **Keep tool output small.** Pipe tests and typechecks through `tail` or a filter, read line
  ranges rather than whole files, and look at a screenshot once and write down what it showed.
  Each image stays in context until the next compaction.
