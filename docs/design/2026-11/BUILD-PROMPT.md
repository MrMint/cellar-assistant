# Prompt for the build lead session

Paste everything below the line into a new Claude Code session started in the cellar-assistant
repository. Start that session in a worktree cut from `claude/cellar-design-pass-dfc4d3` (see step 1),
so it loads this branch's agent definitions and skills.

---

Run the 2026-11 redesign as a multi-agent build. You are the build lead: use the `multi-agent-build`
skill (`.claude/skills/multi-agent-build/SKILL.md`) and follow it phase by phase. You write no
feature code yourself.

**What to build.** I approved a full set of design boards for the app, in dark and light. The
hand-off is `docs/design/2026-11/HANDOFF.md` on branch `claude/cellar-design-pass-dfc4d3`: read it
first, all of it. It says where every board, decision and rule lives, which routes each board
replaces, the kit-to-code mapping, the server work, and a suggested wave order. The decisions
(`docs/design/2026-11/DECISIONS.md`, rows 1-46) are mine and settled; don't reopen them.

**Setup.**
1. Cut your worktree from `claude/cellar-design-pass-dfc4d3` (not origin/main: main lacks the app
   being redesigned, which lives on the integration branch `claude/app-review-improvement-plan-8072ba`,
   PR MrMint/cellar-assistant#675). Create it under the primary checkout's `.claude/worktrees/`.
2. Make `$BUILD` = the primary checkout's `.builds/redesign-2026-11/` and copy into it, from
   `/Users/jaredprather/workspace/cellar-assistant/.claude/worktrees/vigilant-ramanujan-6192b5/.builds/design-pass-2026-11/`:
   the boards (`canvas/project/{areas,kit,combined,screens,onboarding,motion,desktop}/`),
   `motion/SPEC.md`, `areas/` (the per-lot reports and rulings) and `render/out/`.
3. Write `$BUILD/plan.md` from HANDOFF.md, run the skill's spec-gap pass, slice briefs, then spawn.

**Rules that matter here.**
- The boards contain my private production data (drinks, ratings, notes, places). They never go into
  git, a PR, a commit message, a test fixture or any request to an outside service. App code and
  tests use the demo seed (`services/actors/scripts/demo-seed-data.ts`).
- Never push to main, merge into main or open a PR into main without my go. Pushing build and stream
  branches and PRs into your integration branch is fine.
- Never run `bun run dev` or `bun run build` on the host; verify on the containerised client
  (port 3003). Commit with explicit pathspecs only; never amend. Follow AGENTS.md § Worktrees.
- Ask me only what HANDOFF.md, the decisions, the code and AGENTS.md don't settle, one question at a
  time, with your recommendation first.

**When to check in with me.** After `plan.md` and the spec-gap rulings (before spawning wave 1);
after each wave merges, with screenshots of its screens in both themes beside their boards; and
before the final PR, to agree where it goes (the integration branch, or main once #675 merges).
