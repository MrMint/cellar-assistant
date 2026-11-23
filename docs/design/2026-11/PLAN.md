# Design pass 2026-11: phase plan

A whole-app design pass, board first. The output is a Claude Design canvas with a board for every
page and state at phone size, plus a hand-off for the build that follows. No app code is written
in this pass.

- **Base ("after"):** `claude/app-review-improvement-plan-8072ba` at `987681bc`.
- **"Before":** `main` at `d3a5b1e9`.
- **Branch and worktree:** `claude/cellar-design-pass-dfc4d3`, in
  `.claude/worktrees/vigilant-ramanujan-6192b5`.
- **Working folder (gitignored):** `.builds/design-pass-2026-11/`, with `RESUME.md`.
- **Durable outputs (committed):** this folder.
- **Method source:** Fettle's `health/design-pass-2026-10-27/METHOD.md` in node-red-config.

## Top-tier spend

"Top-tier" means a `designer` or `design-critic` agent (Fable 5.2 at high; Opus 5.5 at xhigh if a
Fable agent is stopped by its safeguards). The lead is not counted.

| Phase | Top-tier agents | Cheaper agents |
|---|---|---|
| 0 Set up | 0 | 0 |
| 1 Before / after | 0 | 2 verifiers (capture, one per lane), 1 verifier (measure) |
| 2 Jobs | 0 | 2 surveyors (main, branch), merged by the lead |
| 3 Vision and taste | 0 | 1 surveyor (reference wall) |
| 4 Directions | 3 designers (one per direction), 1 critic | 1 verifier (render and word count) |
| 5 Kit and pilot | 1 designer (kit, pilot, trial wave), 1 critic | 1 stream-builder (checker, render audit, publisher) |
| 6 Every page | 6 designers (one per area) | 1 verifier (rolling render audit) |
| 7 Review | 1 fresh-eyes critic, then up to 6 designers for the fix round | 1 surveyor (parity), 1 verifier (contact sheets) |
| 8 Hand-off | 0 | 0 |
| **Total** | **13 planned, 19 at most** | about 11 |

Phase 7's fix round is sized from what the fresh-eyes critic finds: an area with no blockers gets
no designer.

## Phases

Each phase ends at an owner checkpoint. `RESUME.md` and the spend reading are updated at every
phase change.

### 0. Set up (done 2026-11-23)
- Worktree moved onto the integration tip; pass folders made.
- Roles added: `.claude/agents/designer.md` and `design-critic.md`.
- Spend reading at the start: this session $2.

### 1. Before / after
- Two lanes with the demo seed: "after" from this worktree, "before" from a second worktree
  pinned to `d3a5b1e9`. The branch's `seed:demo` script runs against main's lane.
- The client is served from containers only. If the two lanes cannot run at once on separate
  ports, they are captured one after the other.
- Capture every route and key state on both at 390×844, light and dark.
- One artifact of before/after pairs, with better / worse / same and a comment per pair. Ratings
  persist in the artifact's database.
- Measure each screen: words, text styles, tap-target sizes, what is above the fold, taps per
  core job.
- **Checkpoint:** the owner rates the pairs. Output: `FINDINGS.md`, what the owner dislikes, in
  their words, sorted into themes.

### 2. Jobs (runs beside phase 1)
- Surveyors inventory every job on main and on the branch, per route and device, seeded from
  `docs/product/ux-inventory-2026-10.md`.
- Output: `JOBS.md`. Every job gets an id that boards and the parity audit refer to.
- **Checkpoint:** none of its own. The owner sees the job count and any job that exists on only
  one side.

### 3. Vision and taste
- The lead drafts two or three contrasting vision statements for the owner to mix.
- A reference wall of real-use mobile screenshots (wine, beer and coffee apps, journals,
  collection apps, strong native iOS apps), at most 30, rated in an artifact.
- **Checkpoint:** the owner mixes a vision and rates the wall. Output: `VISION.md`, `TASTE.md`.

### 4. Directions
- Three whole-app directions on the Design canvas, each with playable key screens: Home, a
  cellar, an item, snap-to-add capture, logging a drink, the bottom nav and a sheet.
- One designer per direction, so the three really differ. The switch between directions sits on
  the boards the owner plays.
- **Checkpoint:** the owner plays them on the phone and picks or mixes. Output: `DECISIONS.md`.

### 5. Kit and pilot
- `KIT.md`: tokens, type scale, components, motion, word ceilings per screen.
- A board checker, a render audit (both themes, masked and unmasked) and a publish script with
  the checker as its gate. The publisher is the canvas's only writer.
- Pilot boards for the core patterns: shell, nav, list row, item page, sheet, empty state, chart.
- **Checkpoint 5a:** the owner accepts the patterns, by pairwise picks among six images or fewer.
- A trial wave on one area (cellars and items).
- **Checkpoint 5b:** the owner looks at the trial area on the phone.

### 6. Every page
- `BOARD-LIST.md`: every route under `services/client/src/app/(authenticated)`, the public
  routes, each sheet and dialog, each flow step, each state, each with its job ids and its doors.
- Six designers, one canvas page each:
  1. shell and Home;
  2. cellars and items;
  3. capture and onboarding;
  4. places, map and menus;
  5. social, recap, taste and tier lists;
  6. recipes and search.
- Boards are drawn at the demo seed's volume. Desktop boards only where the layout differs.
- **Checkpoint:** none until review. The owner can watch the canvas fill.

### 7. Review
- A fresh-eyes critic first, over every area.
- A parity audit against `JOBS.md`: every job is on a board, moved with sign-off, or flagged.
- Contact sheets per area in both themes.
- One fix round, sized from the critic's findings.
- **Checkpoint:** the owner reviews area by area, never the whole canvas at once. Every job
  moved deeper or dropped is listed for sign-off.

### 8. Hand-off
- `HANDOFF.md`: build waves for the `multi-agent-build` skill, the rule that boards win by
  default, and each board mapped to the routes and components it replaces.
- A retro row in `METHOD.md` here, in Fettle's format.

## Risks known at the start

- **New roles may not load in this session.** A session loads its agent roles once, from its
  checkout. If `designer` is refused at phase 4, a fresh lead session resumes from `RESUME.md`.
- **Two client containers at once** may need a second compose project with its own ports. Phase 1
  settles this before any capture.
- **Fable safeguards** stopped five Fettle design agents in one day. A stopped job is rerun on
  Opus at xhigh and noted in `RESUME.md`.
- **Playwright's browser cache is shared by every worktree.** Captures use the installed build
  and never run `playwright install` beside another session.
