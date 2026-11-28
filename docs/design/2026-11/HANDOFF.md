# Hand-off: building the 2026-11 redesign

The design pass is finished and the owner approved the boards ("it all looks good", 2026-11-26).
This file is what a build lead needs to turn the boards into the app through the
`multi-agent-build` skill (`.claude/skills/multi-agent-build/SKILL.md`). It is the input to that
skill's phase 1 (`$BUILD/plan.md`), not a replacement for it.

## 1. Where everything is

| Thing | Where | In git? |
|---|---|---|
| Decisions, with the owner's words | `docs/design/2026-11/DECISIONS.md` (rows 1-46) | yes |
| The kit: tokens, parts, pilots, rules | `docs/design/2026-11/KIT.md` (amendments at the end) | yes |
| Light theme: values, switch, rulings | `docs/design/2026-11/LIGHT.md` | yes |
| Rules every screen shares | `docs/design/2026-11/CROSS-LOT.md` | yes |
| Every job the app does today | `docs/design/2026-11/JOBS.md`, `PARITY-MAIN-BRANCH.md` | yes |
| Every screen and its lot | `docs/design/2026-11/BOARD-LIST.md` | yes |
| Motion, haptics, sound | `.builds/design-pass-2026-11/motion/SPEC.md` | no (copy it, § 2) |
| The boards (37) | `.builds/design-pass-2026-11/canvas/project/` | **no, never** |
| Per-lot reports with the lead's rulings | `.builds/design-pass-2026-11/areas/*-REPORT.md`, `FIX-*.md`, `LIGHT-*.md`, `SWEEP-*.md`, `LSWEEP-*.md` | no (copy, § 2) |
| Renders (both themes) | `.builds/design-pass-2026-11/render/out/` | no |
| The canvas (the owner's view) | https://claude.ai/artifact/D98Jx428tCWsWvxKjS6Nqs, version 38 | private |

All `.builds/` paths above are in the design worktree
`/Users/jaredprather/workspace/cellar-assistant/.claude/worktrees/vigilant-ramanujan-6192b5`.
The local board files equal the canvas (checked 2026-11-26; the canvas editor only re-quoted one
board's settings).

**The boards hold the owner's private production data** (drink names, ratings, notes, places,
photo ids). They stay out of git, out of PRs and out of any request to an outside service. Builders
read them for layout and behaviour only; app code, fixtures and tests use the demo seed
(`services/actors/scripts/demo-seed-data.ts`), never anything copied from a board.

## 2. Base branch and first steps for the lead

- The redesign was drawn over the newer app on the integration branch
  `claude/app-review-improvement-plan-8072ba` (open PR MrMint/cellar-assistant#675 into main, head
  `987681bc`), not over `main`. The design branch `claude/cellar-design-pass-dfc4d3` is that head plus
  the design docs and the `designer` / `design-critic` agent definitions (no app code; unpushed;
  local in this repository).
- Cut the lead's worktree from `claude/cellar-design-pass-dfc4d3`, under the primary checkout's
  `.claude/worktrees/` (`git -C "$(git rev-parse --git-common-dir)/.." worktree add
  .claude/worktrees/<name> claude/cellar-design-pass-dfc4d3`). AGENTS.md's "cut from origin/main"
  rule does not fit here: main lacks both the app being redesigned and its agent definitions.
- Copy into `$BUILD` (the primary checkout's `.builds/<build>/`, gitignored): the 37 boards
  (`canvas/project/{areas,kit,combined,screens,onboarding,motion,desktop}/`), `motion/SPEC.md`, the
  `areas/` reports and `render/out/` (for reference). Then nothing depends on the design worktree.
- The owner decides where the build's final PR goes (into the integration branch, or into main once
  #675 merges). Never push to or open a PR into main without the owner's go.

## 3. How to read a board

A board is a `.dc.html` file: markup in `<x-dc>` with `{{holes}}`, a `class Component extends
DCLogic` script holding state and handlers, and `data-props` tweaks. Every board has a `start` tweak
(its states: empty, error, loading, offline, permission…) and a `theme` tweak (dark / light). Open it
in a browser through the render harness (`.builds/design-pass-2026-11/render/dp-render.mjs`) or read
it as source. Boards are the spec for layout, words, states and motion; they are not code to copy.
Door toasts and dashed "Board note" boxes are scaffold, not product UI. Where a board and a doc
disagree, the doc's later ruling wins (DECISIONS > CROSS-LOT > LIGHT > KIT > the board).

## 4. Boards to routes

Phone boards; desktop boards (`-desktop`, `desktop/`) cover the same routes from the `md` breakpoint
(900) up. Routes are under `services/client/src/app/(authenticated)/` unless public.

| Board | Routes and surfaces it replaces |
|---|---|
| combined/Cellar-flow | `/cellars/[id]/items` (cellar list), item pages (`/wines/[id]` … `/teas/[id]`), quick look |
| areas/Cellars-Shelves (+desktop) | `/cellars`, `/cellars/add`, `/cellars/[id]/edit`, cellar filter/sort sheet, `/brands`, `/brands/[id]` |
| areas/Cellars-Pour | item page: pour sheet, log a drink, your log, freshness, visitor view, item edit (`/…/[id]/edit`) |
| areas/Cellars-Bottles | item page: your bottles card, add to cellar, bottle camera, item menu, delete, share with QR |
| screens/Tier-list | `/tier-lists/[id]` rankings (rows, left scrubber, Arrange) |
| areas/Social-Placing | `/tier-lists/[id]` add entry, band, pairwise, insights, try next |
| areas/Social-Lists | `/tier-lists`, `/tier-lists/add`, `/tier-lists/[id]/edit`, add-to-list sheet, share sheet, `/share/*` |
| areas/Social-Friends (+desktop) | `/friends`, `/users/[id]`, invite and compare |
| areas/Social-Recap (+desktop) | `/recap`, `/taste-profile`, `/rankings` |
| screens/Landing | `(home)` landing |
| areas/Shell-Home (+desktop) | `(home)`: waiting on you, AI tray, open rail, drink soon, friends feed |
| areas/Shell-Me (+desktop) | `/me`, settings (Sound and haptics, Appearance, install), `/users/edit`, `/favorites`, `/want-to-try` |
| areas/Shell-Entry | `/sign-in`, `/sign-up`, `/invite/[token]`, install prompt, offline page, error, not found, share errors |
| onboarding/Add-bottle | `/add` bottle flow: camera, match, draft with the data floor, quick add |
| areas/Capture-Camera | `/add`, `/add/[itemType]`: modes, permissions, barcode, menu and recipe modes |
| areas/Capture-Place | `/add`: place picker, new place, drafts, Needs details, background work |
| screens/Map | `/map` |
| areas/Places-Place (+desktop) | `/places/[id]`, `/places/[id]/edit`, `/map/create-place`, map drawer |
| areas/Places-Menus | `/map/scans/[scanId]`, menu line sheets, add to catalog |
| areas/Recipes-Search (+desktop) | `/search`, scan and photo search |
| areas/Recipes-Browse (+desktop) | `/recipes`, `/recipes/groups/[id]`, versions |
| areas/Recipes-Page (+desktop) | `/recipes/[id]`, `/recipes/[id]/edit`, `/recipes/new` composer |
| areas/Recipes-Make | `/recipes/[id]/make`, `/recipes/bar`, `/recipes/bar/pantry`, brew guide |
| desktop/Cellar, desktop/Places | desktop cellar and places with the side pane and keys |
| motion/Study | every transition, gesture, haptic and sound (with `motion/SPEC.md`) |
| kit/Kit (+desktop) | the tokens and primitives (§ 5) |

`BOARD-LIST.md` § 2 lists every screen and state per lot with its job ids; `JOBS.md` has the jobs.
Every job is drawn, moved with a ruling, or dropped with a ruling (the reports' "lost" lines and
`BOARD-LIST.md` § 3).

## 5. The kit in code

`KIT.md` § 1-2 maps each token to today's `--ca-*` token and each part to its primitive in
`services/client/src/components/app/` (or "new"). In short:
- Tokens: `globals.css` and `src/lib/tokens.ts` take the dark and light blocks from `LIGHT.md` § 4
  (rename to `--ca-*`), with the kit amendments; `tokens-parity.test.ts` and
  `palette-contrast.test.ts` are extended to the light values. The theme is a class on `<html>`
  driven by Settings > Appearance (Dark / Light / Phone).
- New primitives: switch, cellar tile, quick look, desktop pane, popover, kbd hint, history row,
  chart, stat tile, permission request, offline strip, band sheet, rank chip, scrubber, label plate.
- Motion: `src/lib/motion.ts` takes `motion/SPEC.md`'s tokens; haptics port the owner's Fettle module
  (`node-red-config` repo, `infra/stacks/health/health-app/src/app/_lib/motion/motion-haptics.ts`,
  `components/HapticSwitch.tsx`, `settings/HapticsSegmented.tsx` and their tests); sound plays
  Josh Comeau's MIT `button-sounds` Asus-KBD sprites, self-hosted, through one feedback module that
  fires the haptic and the sound by the same name (`SPEC.md` § Sound).
- Rule updates at the same time: teal is action and brass retires (DECISIONS 40a, 46, replacing D21);
  Inter only, Fraunces dropped (43); `AGENTS.md` "UI and styling", `docs/product/design-direction.md`
  and `components/app/README.md` change to match, and `ui-platform.test.ts` follows.

## 6. Work beyond the client (server and data)

Collected from the reports and decisions. Each needs an owner stream and tests.

| Change | Source |
|---|---|
| Recap counts check-ins, ratings and bottles added; a query listing periods that have a recap | Social-Recap rulings; DECISIONS 46 |
| Per-user AI quotas, weekly or monthly; "Limit reached" names the reset | DECISIONS 45b |
| Insights writes itself the first time a list of 3+ opens (counts against the quota) | DECISIONS 46; Social-Placing |
| Search: real section totals separate from the first page; drop stale answers by sequence | Recipes-Search rulings |
| Cancel a sent friend request | Recipes-Search, Social-Friends |
| Side-by-side compare rows for two people | Social-Friends |
| Move a bottle between cellars (`cellar` on `UpdateCellarItemInput`) | Cellars-Bottles ruling 6 |
| Saved drafts record confirmed guesses; "No vintage" distinct from unknown; "Needs details" state and count | DECISIONS 34, 40c, 46 |
| Remove my rating (keeps list rank) | SWEEP-b ruling 1 |
| Community pick: 3 net votes from people other than the author | Recipes-Browse rulings |
| Profile picture | KIT rulings 6 |
| QR share for cellars, lists, profiles | DECISIONS 41 |
| Generated share images (recap card, link previews) use the dark values | LIGHT.md additions |
| "Made it" lowers bottle levels | deferred: MrMint/cellar-assistant#677 |

Not in scope: forgot password (DECISIONS 45a, sign-in stays social-first).

## 7. Suggested waves

The lead decides the final slicing in `plan.md`; this is the order the design supports. Each wave's
streams own disjoint files.

1. **Foundations:** tokens (both themes) and their tests, theme setting, kit primitives, motion
   tokens, feedback module (haptics + sound), style-rule doc updates. Everything else depends on it.
2. **Cellars and items:** Cellar-flow, Cellars-Shelves, Cellars-Pour, Cellars-Bottles, plus the
   bottle-move and draft-flag server work.
3. **Lists:** Tier-list, Social-Placing, Social-Lists (with QR share), plus Insights auto-write.
4. **Home, Me, entry, map, places:** Landing, Shell-Home, Shell-Me, Shell-Entry, Map, Places-Place,
   Places-Menus.
5. **Capture:** Add-bottle, Capture-Camera, Capture-Place (PWA camera, permissions).
6. **Recipes and search:** Recipes-Search, Recipes-Browse, Recipes-Page, Recipes-Make, plus search
   totals.
7. **Social and recap:** Social-Friends, Social-Recap, plus the recap query, compare rows, cancel
   request, quotas.
8. **Desktop:** every `-desktop` board and `desktop/*`, from `md` up.

Then the skill's verify round: check each screen against its board in both themes on the
containerised client (port 3003), against `JOBS.md` for parity, and against `CROSS-LOT.md`.

## 8. Build notes found during design

- Hero titles over photos must reach 4.5:1 in both themes (below the photo, or on a scrim); several
  boards only reach 3:1 on the owner's photos.
- `color-mix()` is used for the Make hero fade.
- Installed PWA is the target: the app owns the left-edge swipe back and pull to refresh.
- iPhone haptics only fire inside a real tap (iOS 26.5+); sound carries the hold, boundaries and
  pull arming there.
- The camera, toasts and glass over photos stay dark in light mode; images that leave the app are
  dark.
