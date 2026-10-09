# Product decisions (answered 2026-10-07)

The user's answers to the 29 decisions in [`ux-roadmap.md`](ux-roadmap.md) ("Decisions for the user").
**This file wins** wherever the roadmap or [`design-direction.md`](design-direction.md) says otherwise.
Each decision was put as a plain question with options; the triage page that collected the answers is
the "Cellar Assistant Roadmap" artifact (private to the owner).

Recommended option taken unless the row says otherwise. Notes are the user's, lightly paraphrased.

## Answers that change the plan

| # | Decision | Answer |
|---|---|---|
| **D20** | Component platform | **Migrate off MUI Joy to shadcn/ui (Tailwind CSS), with `motion` for animation.** Sequencing (user): **fixes first on Joy, then migrate the whole app**, then build the redesign on shadcn. The design-direction doc's "stay on Joy behind app primitives" section is superseded; its tokens, palette, type and motion language still apply. Bottom sheets use shadcn's Drawer, toasts use Sonner. The AGENTS.md "Material-UI Joy guidelines" are replaced when the migration lands. |
| **D29** | Drinking windows | **Table only.** A deterministic style/shelf-life table labelled "typical for <style>", plus the user's own dates. No AI estimate anywhere, including as a fallback. Styles missing from the table show no window. |
| **D14** | When to ask for location | **When the map opens**, but the app first shows its own one-line explanation of why, then triggers the OS prompt. |
| **D25** | AI capability handling | Recommended option, **plus: features should behave the same whatever the AI provider.** Prefer giving the local (Ollama/llama-server) path parity, e.g. local image embeddings so photo search works locally, over hiding features. Capability detection stays as the fallback. Never auto-add to the catalog. No pre-extraction classifier call. |
| **D16** | Google Places budget | Configure one: **stay under about $5/month beyond the free usage tier.** Enforce a cap in the app; the GCP billing alert is set by the user. Out of budget shows a calm "Details pending". |
| **D3** | Cellar overview | Merge into the cellar page, **and make the top a dashboard**: open now, stats, trends, almost empty, recently added (and anything else useful), above the full grid. |
| **D4** | Tier lists: Add entry, delete, padlock | Keep both; padlock becomes "Arrange". **Plus: keep a full edit history per tier list so the user can undo/redo mistakes.** |

## Answers as recommended

| # | Decision | Answer |
|---|---|---|
| D1 | Home and IA | One Home at `/`, five labelled tabs Home · Cellar · ＋ · Map · Me, with the mapping in the roadmap (Recipes → Cellar "Bar" + search; Tier lists / Top rated / Loved → Me › Lists + Home "Friends ranked"; Friends → Me; Brands → item pages + search; scans/discoveries → Home inbox + Map). `/` shows today's search until X10. |
| D2 | Your vs others' content | Yours · From friends · Discover sections. |
| D5 | Ratings | One rating per item + many drink logs (with optional score, note, place, photo, companions); logs survive the bottle. |
| D6 | Recipe Stop; menu Accept/Reject | Keep both; Accept/Reject is the universal "confirm the AI" control. |
| D7 | `/{type}s` pages | Remove the type lists; keep Edit via the item page's ⋯ menu. |
| D8 | Dropped item-page pieces | Restore check-ins now (as "Your log"), one-tap change brand; gallery later; barcode hidden; recipes with X14. |
| D9 | Recipe availability, heart, semantic search | Real availability from bottles + Bar pantry; semantic recipe search inside universal search; Love replaces the heart. |
| D10 | Search layout | One page of sections (Your bottles · Items · Places · Recipes · People · Brands, 3 each + See all), after N01. |
| D11 | Places | "Want to try" everywhere; no separate place rating; drop Recent additions (G22). |
| D12 | Photo search | Keep; also run it on the front-label photo while adding a bottle. |
| D13 | Counts and order | Count bottles still in the cellar everywhere; order cellars by recent activity. |
| D15 | Place categories | Add back wine shop, vineyard, taproom, coffee roaster, tea shop, izakaya to the single list. |
| D17 | Failed AI calls | Only calls that got a model response count against the allowance. |
| D18 | G22 / G29 / G30 | Drop G22; G29 "what can I make" after the recipe-data work (X14); G30 with L01. |
| D19 | Sign-in | Social-first confirmed; returnTo survives social sign-up; Apple later; remove dead `/forgot-password` and `/verify` links. |
| D21 | Colour | Dark default; brass `#C9A15B` (ink `#1A1408`) is the action colour in one global change; teal means AI only; light mode only on evidence. |
| D22 | Recipe visibility | Private first; AI-read recipes are drafts; authors can edit and delete. |
| D23 | Bar pantry | Separate pantry of ~30 toggles; cellar bottles count automatically. |
| D24 | Private/missing pages | One in-shell message: "doesn't exist or isn't shared with you". |
| D26 | Scrolling | Keep the inner scroller; custom pull-to-refresh and re-tap tab to top. |
| D27 | Verdict model | Save · Log · Rate · Love as the principle, applied as features are touched. |
| D28 | Places under review | Saved instantly, creator-only with "Under review"; shared once approved; rejected stays private with reason + Edit/Delete. |

## New work from the notes

- **Tier-list history (D4):** an append-only edit log per tier list, with undo/redo in Arrange mode. Needs a migration.
- **Cellar dashboard (D3):** extends X04.
- **Provider parity (D25):** a local image-embedding path so photo search and image matching work without Gemini. **Owned by a separate session working on local models**, not this roadmap's work; roadmap packages consume `viewer.aiCapabilities` and must not change local model setup.
- **Places budget cap (D16):** an in-app monthly cap sized to the free tier + ~$5.

## Delivery (user)

- **Order:** Joy-era fixes → full shadcn migration → the rest of the roadmap on shadcn.
- **Scope:** the whole roadmap (Now, Next, Later), minus the "Don't build" list.
- **Branch:** everything lands on `claude/app-review-improvement-plan-8072ba`, delivered as **one PR at the end**.

## Implementation calls

Product calls taken while building the answers above, so the user can see and
reverse them. Each names the item it belongs to; none overrides an answer.

### Shell, first run and sections (wave A "shell": X01, N15, X11, N29)

- **One landing (X01, D1).** Sign-in, sign-up (password and social) and a
  signed-in visit to `/sign-in` go to `/` when nothing else was asked for;
  `/` still redirects to `/search` until X10. Because `/cellars` is no longer
  the default, a signed-out visit to `/cellars` now carries
  `?returnTo=/cellars` like any other page.
- **Greeting (X01).** Rendered by the browser only: the server sends an empty
  line of the heading's height and the greeting fades in after hydration. No
  time-neutral server placeholder ("Hello, Riley"): it would swap text in
  front of the viewer.
- **Quick-link chips (X01).** Deleted outright, not moved: every one duplicated
  a tab (Cellar, Map) or a Me row (Tier lists, Loved, Top rated).
- **Recipes and Brands in search (D1, ahead of D10).** A text search ends with
  up to three recipe groups and three brands, each section with "See all" into
  `/recipes?q=` or `/brands?q=` (`/brands` now reads `?q=`). D10's one-page
  layout replaces this ordering later.
- **Cellar tab's Bar (D1, ahead of X04).** `/cellars` and `/recipes` carry a
  two-link "Cellars · Bar" switch styled like a segmented control; Bar is
  today's `/recipes` page. X04 grows it into the cellar switcher.
- **Me hub (D1).** Lists opens with up to **three** of your own tier lists
  (most recently changed), then "All tier lists" ("N of yours" when there are
  more), then Top rated and Loved. Recipes and Brands are no longer Me rows
  (Cellar › Bar and search; item pages for brands). **Scans stay in Me › More**
  until X10's "Waiting on you" exists. The Friends badge counts pending
  incoming requests (read up to 100; "99+" past that) on the Friends row only,
  **not on the Me tab**, which would need polling from the tab bar. The badge
  uses the brass action colour, since every request is something to act on.
- **Sections (X11, D2).** Server-side: `myCellars` and `myTierLists` take an
  optional `section` (`MINE`, `FRIENDS`, `DISCOVER`) that partitions what the
  viewer may see; omitted, they return the old whole set. The item page's
  add-to-cellar picker and the own-tier-list pickers ask for `MINE`, so they
  no longer page through everyone else's to find yours. From friends means *created by* a friend, so a
  stranger's PUBLIC cellar that a friend co-owns is in Discover. Discover shows
  **six** at a time; Yours and From friends a screenful (24 cellars, 100 tier
  lists); all have "Show more". Empty From friends and Discover sections are
  not drawn; Yours always is. Your tier lists are ordered by when their
  contents last changed (D13's activity order is for cellars).
- **Starter cellar (N15).** "My Cellar", PRIVATE, made once, when the account
  is created (better-auth's user-create hook, then the outbox, then
  `CellarActor.createStarter`). Deleting it does not bring it back, and
  accounts created before this change get the first-run state, not a cellar.
- **Empty states (N15, design §3.6).** Your cellars: "Your cellar is waiting."
  with New cellar (only when you have none at all, since a new account already
  has one). An empty cellar: "Your cellar is waiting." with Snap a bottle; a
  friend viewing it sees "Nothing in this cellar yet." and no action. Your
  tier lists: "Nothing ranked yet." with New tier list. An empty tier list:
  "Nothing ranked yet." with "Add from what you've tasted", which opens Add
  entry (owner, unlocked only). No friends: "Taste is better compared." with
  Invite a friend.
- **Invite a friend.** The system share sheet with a link to `/sign-up` on this
  origin, or the link copied where there is no sheet. No referral id or
  inviter name goes in the URL.
- **Top rated (N15).** The page title is "Top rated" (D1's name for Rankings).
  The control is Me · Friends · Everyone, Me by default, held in `?scope=`
  (`friends`, `everyone`; absent means Me). Old `?reviewers=` links are not
  translated and read as Me. `ME_AND_FRIENDS` stays a server scope but is not
  offered. Each card shows its place on the board as a numeral (Fraunces; #1
  in claret).
- **Install prompt (N15).** "First save" counts a bottle added to a cellar or
  an item confirmed in the onboarding wizard, announced the moment it happens
  rather than at the next navigation.

### Global capture (wave B "globalcapture": X06, X05 leftovers)

- **＋ is the camera (X06).** The chooser sheet is gone: ＋ is a link to
  `/add`, the full-screen capture surface, and the phone's tab bar steps
  aside there (and on a cellar's add pages) with Close as the way out —
  back to the page ＋ was tapped on, or Home on a cold open. The mode row
  is **Bottle · Menu · Recipe**, right under the picture, opening on the
  last mode used (an explicit `?mode=` wins; a `?draft=` is always a
  bottle). **Place left ＋**: a place is added from the map (its own
  button) and from the menu picker's "Not listed? Add the place".
- **Menus from anywhere (X06).** A scan is filed on a place, so the place
  is settled before the scan is sent, never guessed silently. The position
  is asked the D14 way (one line of ours, then the browser's prompt) and
  finds the nearest place the app knows **within 200 m**; the card under
  the camera asks "At Cork & Barrel?" — "Yes, I'm here" is the one tap.
  "Somewhere else", no place nearby, or no location opens a picker: the
  other places nearby, a search by name, "Not listed? Add the place". The
  shutter never waits: a photo taken first is held, and the tap that
  settles the place sends it. The scan's `placeHint` carries the chosen
  place, plus the position only when that place is one of those around
  the person (a place picked by name gets none: it is not where that menu
  is). A guess passed over is not sent even as `estimatedPlaceId` — it is
  a claim the person said was false, and it would block deleting that
  place while it is still its creator's. The results page takes over at
  once.
- **Recipe mode (X06)** reads a recipe photo at the shutter (the drafter's
  job, shared as `useRecipePhotoJob`) and opens the new recipe when it
  lands.
- **Photo search's fallback (X06).** Where the catalogue does not
  recognise a photo, the results end in "Read the label instead", which
  carries **the same bytes** into Add (in memory, `?photo=<token>`; a
  reload offers a fresh snap instead). Add shows the photo with the type
  row (last used) and "Read this label", so the person sets the type
  before the one read. Where the deployment cannot search by photo at all
  but can read labels, the search page's Photo button goes straight to
  that fallback instead of disappearing.
- **"Looks like a menu" switches modes (X05/X06).** A label read that
  abstains with `surfaceKind: menu` offers "Scan it as a menu", which
  opens Menu mode with the same photo (from a cellar's add page, `/add`
  in Menu mode).
- **"Open it now" opens the bottle's page; it never uncorks (X05
  leftover).** Uncorking from the success sheet turned a tap meant as
  "show me" into an opening in the bottle's log. The bottle page's own
  "Open it!" is one tap away. Because Open it now *is* the bottle's page,
  the sheet no longer has a second "View bottle"; dismissing it still
  lands on the bottle (with no cellar, the second action is "View item").
- **One upload per photo (X05 leftover).** The front label goes up once,
  as `label-front`: the read, the photo match (`itemSearch(imageFileId:)`
  on that same file — the search discards only `image-search` files) and
  the bottle's display image (`attachItemImage` with that file id) all use
  it. It used to go up three times.
- **A resumed draft keeps its photo across a reload (X05 leftover).** The
  session already stores the label's file id; a draft reopened after a
  full reload takes its thumbnail from that file and attaches it as the
  display image, instead of opening photo-less.
- **Every cellar add page names the cellar (X05 leftover).** The six
  per-type routes read the cellar like `/items/add` does, so the success
  sheet says "… is in Home Cellar", a cellar that does not exist is a 404,
  and a viewer who may not add there gets the note instead of a camera.
