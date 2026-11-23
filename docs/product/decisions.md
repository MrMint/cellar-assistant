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

### Pour and the drink-log follow-ups (wave B "pour": X03)

- **Where Pour lives (X03).** The bottle page's ActionBar (since X09: the
  item page's ActionBar on the URL of a bottle of yours, with Pour as its
  primary; each "Your bottles" row has Pour too) and the cellar home's shelves (Open now, Recently added —
  X04 merged the overview, whose bottle cards had it, into that page), for
  the cellar's owners and co-owners while the bottle is not finished.
  Visitors and finished bottles get Log a drink / Check in only.
- **The first pour opens the bottle**, at the pour's own time (so a
  backdated first pour opens it then). "Open it!" became a quiet "Mark as
  opened" for opening without pouring. A plain Log a drink from the bottle
  does **not** open it or move the level.
- **Glass presets (X03).** The app records no bottle size, so a pour is a
  share of an assumed container, and the sheet says which: wine 750 ml
  (taste 75, glass 150, large 250), beer 355 ml (60, half 180, the bottle),
  spirit 700 ml (20, measure 45, double 90), sake 720 ml (ochoko 60, 120,
  tokkuri 180), coffee a 340 g bag (cup 18 g, 36, pot 60), tea a 100 g tin
  (cup 3 g, pot 8, large 15). The sheet opens on the middle one, or on "the
  rest" when less than that is left.
- **The last pour (level 0)** logs the drink and then asks "Finished?" inside
  the sheet. Finished is N13a's finish with its Undo toast; **Not yet leaves
  5%** (or what was there, if less), and closing the sheet on that question
  is Not yet — the drink is already logged, so the level must move too, and
  a bottle is never finished without a tap. A bottle reading 0% that was
  never finished can still be poured: that pour is the last of it. Then
  the item's rating — the review, prefilled — then, for each of **your own** tier lists the item is on, the
  band that rating reads as (`bandForScore`), moved to the end of that band
  in one tap, with Undo through the list's history (D4). Friends' lists are
  not offered. "Keep my rating" suggests from the rating already saved, never
  from stars tapped and left unsaved; a list longer than one page (100) links
  to the list instead of moving from the sheet.
- **"me + Sam"** is the last set of friends you poured with **on this
  device** (`localStorage`), kept to people who are still your friends;
  "Others…" opens the full friend chips.
- **Backdating.** "When" is Now by default; Earlier opens the device's own
  date-and-time picker. No later than now (five minutes of clock skew
  allowed), no earlier than 1900. Re-dating your log of a table moves the
  companions' entries you wrote with it, except any a friend has made their
  own.
- **Who with after the fact.** Only on your own log of a drink you logged.
  Dropping a friend who has added to their entry is refused (it is theirs
  now) rather than silently kept. Only people being added must be friends
  now: someone already on the log stays when the set names them, even after
  an unfriending.
- **Delete with Undo.** Deleting a log no longer asks; the toast's Undo puts
  back the same entries (ids, dates, companions' entries) for **one hour**
  after the delete, for whoever deleted them. A bottle, place or photo that
  has gone meanwhile comes back as none; an ex-friend's entry does not come
  back.

### Cellar home (wave B "cellarhome": X04, D3, D13)

- **One cellar page (D3).** `/cellars/[id]/items` is the cellar home;
  `/cellars/[id]` (the old overview) redirects to it. The overview's
  check-in history (drinker + time, no bottle) is gone: the dashboard's
  pours-per-month trend replaces it, and who drank what stays on each item's
  "Your log".
- **Dashboard order at 390.** Bar and search → Open now (open bottles, most
  recently opened first, up to 12, each with Pour) → four tiles (in the
  cellar, with the three biggest types named; open, with how many are still
  sealed; almost empty, at or under
  **25%**; finished this month) → pours per month (12 months) → Recently
  added (last **30 days**, not already on Open now) → the collection. A tile
  opens the collection with the matching sort or segment. A search hides the
  dashboard so results sit under the field.
- **Bottles by type is words, not colour.** The six type hues fail as a
  chart palette (the dataviz validator: oak/amber ΔE 4.4), so "8 wine · 3
  spirit" is text in the In-the-cellar tile, and the type chips below carry
  per-type counts.
- **Months are the viewer's.** A `ca-tz` cookie (an IANA zone name only)
  carries the browser's zone to the server; the first visit renders UTC
  months and re-renders once.
- **×N.** Identical bottles (one catalog item) are one card, placed where the
  best-placed bottle sits under the current sort, showing that bottle's state
  and linking to it. Open now does not group, and under All a finished bottle
  is its own card rather than part of a live bottle's ×N.
- **Finished is a diary**: by month finished, latest first, with the date,
  how long it lasted once open, **your own** logs from it (count, last score,
  last note — never a co-owner's) and your rating. Its sort is fixed, and a
  search narrows it without reordering it.
- **Search narrows.** Names first (pg_trgm, the N08 rule), then meaning
  matches within cosine distance **0.36** and within **+0.06** of the nearest
  (tuned on N05 with nomic-embed-text; Gemini not measured), nothing else. A
  meaning match says "Similar to your search". Without an embedding model the
  page is names only and says so. **Fan-out** asks your own (created or
  co-owned) cellars — up to 24, most recently active first, 5 matches each —
  by name only: "Lagavulin 16 / is in Bar Cart".
- **Pour** on the shelves is X03's Pour sheet, one for both shelves
  (`PourScope`), so a pour that moves its bottle between them — the first
  opens it, the last finishes it — keeps its sheet and toasts. As X03 has
  it, Pour is for owners and co-owners; anyone else who may see the cellar
  gets Check in.

### One item page (wave B "itempage": X09, D1 taste header, D8)

- **The bottle route is the item page with that bottle selected.**
  `/cellars/<c>/<type>s/<bottleId>` is not redirected: it renders the same
  page as `/<type>s/<itemId>` with that bottle marked in "Your bottles", its
  level control inline, its photo in the hero and "Delete bottle" in `⋯`.
  The URL keeps meaning a bottle (D-gating answer 1), Back from it still goes
  to the cellar, and old item-id links at that URL redirect as before. A
  bottle in someone else's cellar you may see shows as a read-only "This
  bottle" row.
- **Taste header (D1's Rankings on item pages).** You · Friends · Everyone:
  your review's score (the one rating per item, D5 — not an average of your
  logs), your friends' average with how many friends, everyone's average with
  how many ratings. A friend who reviewed twice counts once, by their newest.
  No number is words ("Rate it", "No friends' ratings", "No ratings yet"),
  never a zero, never a percentage. The friend set is resolved on the server
  (`Item.friendsScore`).
- **Your bottles** are bottles still in cellars you created or co-own, open
  first, then sealed, then finished (`Item.myBottles`). Pour is X03's Pour
  sheet (open + log + level in one action, glass presets), held once for the
  page above the rows so a last pour that finishes the bottle keeps its
  rating step and Undo toasts; Log opens "Log a drink" for that bottle. The
  selected bottle's inline level keeps "Mark as opened" (X03's quiet open
  without pouring), the slider and Restore. The section is not drawn when
  you have none — "Add to cellar" is in the ActionBar.
- **ActionBar:** Log a drink (brass) · Add to cellar · Want to try · `⋯`.
  "Log a drink" logs from the selected bottle when it is yours, else from
  your one open bottle, else with no bottle (two open bottles is a question,
  not a guess). On the URL of a bottle of yours that is not finished, the
  brass action is **Pour** from it instead (X03's "Pour is the bottle page's
  primary", sealed or open); a plain log from it is its row's Log. `⋯` holds Add to tier list, Share, Edit item (creator, D7),
  and Delete bottle (last, on a bottle URL, for its cellar's owner). The
  AppBar keeps Share and no longer has a `⋯` of its own.
- **One producer title per type:** Winery, Brewery, Distillery, Roaster,
  Brewery (sake), Tea house — plural when an item has several. The primary
  brand also leads the hero as a link to its brand page (D1: Brands from item
  pages).
- **Fact sheet for all six types:** every recorded attribute as a labelled
  row (wine, beer, spirit and coffee had only a subtitle); nothing unrecorded
  becomes a row and nothing is estimated.
- **Recipes:** "Cocktails with this" (X14) is shown for every type, spirits
  included; the restored "Used in Recipes" now lists only **food** recipes
  ("Cook with this"), since every cocktail is already in X14's section.
- **Deleting a bottle keeps its drink logs** (X02's `ON DELETE SET NULL`); the
  confirm no longer says they are deleted with it.

### Search (wave B "search": X12, D9, D10)

- **One page of sections (D10).** A text search shows Your bottles · Items ·
  Places · Recipes · People · Brands in that fixed order, three rows each, a
  section drawn only when it found something. Nothing anywhere is one empty
  state ("Nothing called "…" yet.", Add an item). The six searches run side by
  side and the page renders once, so it does not reflow six times under the
  thumb; a failed section is simply absent.
- **See all.** Bottles, Items, Recipes and People open in place
  (`/search?q=…&in=<section>`, every row the search held, "All results" back),
  so the box and its text stay. Places open on the map (`/map?search=`),
  Brands on `/brands?q=` (the same search with the index around it). Typing a
  new query returns to every section.
- **Your bottles.** Open bottles in cellars you created or co-own (never a
  friend's, however visible), matched by item name, one row per item per
  cellar ("Bar Cart · 2 bottles"); a tap opens the bottle already opened, else
  the oldest. Name only, so it works without AI.
- **Items narrow (X12).** When the phrase names an item, Items keeps the name
  matches and the bottles the embedding puts right beside the named one
  (`itemSearch(narrow: true)`, strong name 0.6, gap 0.03 — tuned on N05:
  recall@10 unchanged at 100%, irrelevant hits in the 29 narrowed queries
  241 → 24). A description is never narrowed. The menu matcher does not use it.
- **Recipes (D9).** Names first, then meaning (`recipeSearch(hybrid: true)`),
  one row per recipe group, with "You can make this" / "Missing Campari" from
  your bar. The meaning half is cut at 0.45 and 0.05 past the nearest, measured
  on hand-written recipes (the N05 set has none) — re-measure when it has some.
- **People.** Anyone by name: friends first, then requests either way, then
  everyone else with an Add button that sends the request in place. A friend
  opens their profile (`/users/<id>`, "Me hub v1"); a request opens Friends,
  where it is answered, since the profile answers friends only (updated in
  wave C "leftovers": the rows predate friend profiles).
- **Places.** Searched within about 30 km of your last known position (the
  location cookie the map and Home write). Without one, only places whose name
  matched are shown — a category-only match would be a bar anywhere on earth.
- **No AI.** Every section answers by name when the phrase cannot be embedded
  (places and recipes gained that fallback here), and the page says "Matching
  names only: search by meaning is off." when `semanticSearch` is false.
- **The app needs JavaScript (L1, wave C "leftovers").** `/search` keeps its
  `loading.tsx` shell: it is what a navigation into the sheet shows while the
  page streams. Without scripts nothing replaces it, so the no-JS spec is
  gone; the spec now holds the live box to what that one guarded (fully
  visible once hydrated, no `opacity:0` left behind, takes typing).
- **Close replaces (wave C "leftovers").** Close swaps the sheet's history
  entry for the page it was opened from, so Back after Close does not reopen
  `/search`.
### Home "Today" and the AI inbox (wave B "home": X10, D1)

- **`/` is Home.** The redirect to `/search` is gone; the Home tab points at
  `/` (and still lights on `/search`). Sections, top to bottom: greeting and
  search field; the AI job tray and **Waiting on you**; **Continue** and
  **Drink soon**; **Friends ranked**; **Friends**; **Nearby**. Each section
  streams and fails on its own; a failed read draws nothing rather than an
  error over the page (every row has a full page that shows errors properly).
- **Search is a full-screen sheet at `/search`**, not an overlay above Home:
  a title and Close in place of the tab bar, the box, then a one-line hint
  or the results. Close returns to wherever the sheet was opened from (the
  in-app history, however many queries were typed), Home on a cold open. The
  URL keeps working on its own. "The tab bar search" is a second tap on Home
  at its root and scrolled to the top, the one tap that used to do nothing.
  The search landing's greeting, collection line, Recent Activity and Nearby
  Places moved to Home; `/search?activity=` is no longer read.
- **Waiting on you** lists, in this order: menu matches to confirm (one row
  per scan, into the scan's results), capture drafts to check (a label read
  that finished and was never added or closed, within three days, into
  `/add?draft=`), friend requests (Accept inline), then finished insights,
  read menus and read recipes. A finished result leaves the list once it is
  opened or dismissed, remembered per browser in a small cookie of hashes so
  the server renders without it (no flash); matches and requests leave when
  answered.
- **The AI job tray** shows work still running (label reads under 15 min,
  menu scans until their matches are found, not just read, recipe photos,
  insights being generated) and failures not yet
  dismissed, worded by N07's mapper from the typed failure; a limit reads
  calm, never red. A watcher in the shell polls `me.aiJobs` every 4 s **only
  while something runs** (woken by Home, a menu scan or a recipe photo;
  never on a timer of its own; at most 15 min) and toasts what settles, with
  Open / Review / Try again — except on the screen already showing it, and
  never for a label read (the add flow announces those).
- **Continue** is open bottles across cellars you created or co-own (not a
  friend's — not yours to pour), newest opened first, up to 12 on the
  shelf. **Pour**
  opens the X02 drink-log sheet with the bottle; X03's Pour sheet replaces
  what it opens when it lands.
- **Drink soon** is opened bottles first, then sealed ones (L02, L18).
  Opened is unchanged: a style's typical life once open, labelled
  "Typical for <style> once open: <span>", listed once a bottle has been
  open the shortest span, most overdue first, over every open bottle (up to
  100); beer (1–2 days) and coffee beans (2–4 weeks) apply to any style,
  wine, sake, spirits and tea by their style field, matcha by its form.
  Sealed bottles join when their window's end — the owner's own
  drink-until, else the shelf-life table's typical one for the style —
  falls within three months (or has passed): "Sealed · window ends Jan 2027
  · typical for IPA", or "Sealed · your date: drink by Feb 2027". It is no
  longer the opened table only because L02 gave each bottle its own dates
  and the table its sealed rows, so a window that is closing is now
  something we know rather than guess. A style the table lacks, with no
  date of the owner's, still shows no window (D29).
- **Friends** is friends only (your own activity is the rest of Home), in
  sentences ("Sam rated Barolo ★4.5", "Sam had Pliny · with you · at Old
  Mill"), with bursts folded: the same person, kind and cellar or list,
  each entry within 3 h of the one before, become one line ("added 12
  bottles to Garage") with the first three names under it. Paged 20 at a
  time with Show more; a burst cut by a page boundary joins up. With no
  friends at all it is N15's "Taste is better compared." and Invite.
- **Friends ranked** is up to three of your friends' tier lists, most
  recently changed, with See all into `/tier-lists`.
- **Nearby** follows D14 on Home too: when the browser has not been asked,
  one line of why with "Use my location" (which raises the browser prompt)
  and "Not now" (shared with the map for the session); refused shows
  nothing.
- **`/discoveries` and the `/map/scans` list redirect to `/#waiting`**; each
  scan's own page stays, and Me › More › Scans goes. Discoveries' Saved
  Places tab and the full scan history are not on Home; their components
  stay in the tree, unrouted, for X20's Map sheet (Loved · Been · Want · My
  scans).

### Recipes: editor, drafts and privacy (wave B "recipesedit": X15, D22, D9)

- **Privacy is the cellar/tier-list one (D22).** `recipes.privacy` is a
  `permission_type` — Private · Friends · Public — read by the same
  four-branch rule (`canSeeRecipe`). New recipes start **Private**; every
  recipe that existed before the column is **Public**, so nothing visible
  yesterday disappeared. Friends was kept rather than offering two choices,
  because every other privacy picker in the app has three.
- **A draft is its author's alone, whatever its privacy.** `recipes.is_draft`
  marks what the AI read off a photo or out of pasted text. The job writes it
  Private and a draft; only Save in the editor clears it, and a published
  recipe cannot become a draft again.
- **Hidden means "not found", everywhere.** A recipe you may not see is
  `NotFound` on its page, its reviews, Love, Want to try, search, the Bar's
  "What can I make", an item's "Used in" and "Cocktails with this", and its
  share URL (which answers exactly like a made-up id, author included). A
  recipe made private after you Loved or saved it drops out of those lists
  and comes back if it is shared again.
- **Groups are as visible as their versions.** A group is listed for you when
  you created it or can see a version in it; its count, its versions, its
  votes and its search terms are only the versions you can see. The canonical
  is chosen from the most widely shared versions first (Public, then
  Friends), and **only a Public canonical renames the group**, so a private
  recipe's name never becomes a group's name.
- **The menu matcher proposes Public recipes only**: its suggestion lands on
  a place's menu, which every visitor reads.
- **New recipe is Photo · Paste · Type.** Photo opens the picker from the
  sheet's row and reading starts the moment a photo is chosen — no second
  button. Paste reads text through the same job, schema and abstention as a
  photo (a shopping list is refused, not turned into a recipe). Type is a
  blank form. `/recipes/ai-generator` redirects to Photo.
- **Ingredient matches wait on the person.** In a draft, each line the search
  matched to a catalog bottle wears the AI mark with **Keep** / **Not this**;
  Save stays blocked until none is left. "Keep all" is one explicit tap.
  Not this turns the line into the bar word for it ("Gin") when there is one.
  Typed lines are plain ingredients by name — the editor never guesses a
  catalog bottle.
- **Loved recipes live on Loved (D9).** Me › Lists › Loved holds the recipes
  you Love. X15 first drew them above the bottles (three, then Show all); X18
  replaced that with Loved's Drinks · Recipes segment (see "Me hub v1"), so
  the drinks half is bottles only and the recipes half pages and keeps each
  row's Love toggle.
- **The Bar page.** `/recipes` is titled **Bar** (the segment's word), with
  New recipe where Cellars has Add cellar; then Your drafts, Your recipes,
  What can I make, and All recipes. "Recipe Groups" and the paragraph about
  community voting are gone. The nested 800 px list scroller is gone too.

### Tier lists without typing (wave B "tierlists2": X16)

- **Add entry's sections.** In your cellars (cellars you made or co-own),
  Tasted, not ranked (your reviews and drink logs; for a place list "Been
  there": rated, marked visited, or a drink logged there) and Friends ranked
  (band 1 and up on lists **a friend created** that you may see — never a
  stranger's public list, never a private one, never a place under review).
  An entry is in the first section that has it; at most 30 a section, five
  shown before "Show N more". Each row says why in words ("In Garage · 2
  bottles", "Logged twice", "Riley: Outstanding · +1 friend") and where it
  will land; your verdict is your review, else your newest scored log.
- **Multi-add is one edit.** Rows are checkboxes and "Add N entries" sends
  one `addTierListItems`: one history row, so the toast's single Undo takes
  every one back. Entries already on the list by then are skipped and said.
  That Undo names the edit it takes (`expectedSeq`, read back with the add),
  and is not offered when another edit is already on top.
- **Templates.** Creating a list of a type you have rated offers "Start with
  your ratings", **on by default**, with the count. The list lands pre-banded
  (the shared `bandForScore`), best first, at most 100, as its first edit.
  Ratings only — a drink log without a review does not seed it. Picking a type
  names an unnamed list "My wines" until you type a name.
- **Try this next is grounded and model-free.** Up to six catalog cards,
  alternating a friend's top-two-band pick you have not had with neighbours
  of this list's top-two-band entries (or bottles you love) — the stored item
  vectors and name trigrams fused by rank (N08's arms), at a 0.85-similarity
  floor. Never something you rated, logged, keep in a cellar or already
  ranked. Each card's reason is a fact, never a number. Empty is said to the
  owner as what would fill it, and is nothing at all for anyone else. The
  model's own suggestion stays, retitled "A style to explore".
- **The padlock is retired.** `isEditingLocked` is gone from the API and the
  client (Arrange replaced it in X23). The `is_editing_locked` column stays
  until a contract-phase migration drops it, so an older image still running
  during a deploy keeps working.

### Me hub v1 (wave B "me": X18)

- **Counts.** Under the Me header: bottles, logs, places, tier lists — each
  the viewer's own. Bottles is D13's number (still in a cellar you created or
  co-own); logs are drink-log entries *about* you, including one a friend
  wrote for you at the table; places are the distinct places you have been
  (marked Visited, or named on one of your logs), leaving out someone else's
  place still under review (X27); tier lists are the ones you made, whatever
  their privacy. Each names its noun, a zero is not shown, and an account
  with nothing yet has no count row. The tiles are a summary, not links:
  each has a row or a tab of its own.
- **Settings.** The Account section is renamed Settings: Edit profile and
  Sign out. **No theme switch** — dark is the default and light ships only
  on evidence (D21), so a placeholder would promise something that is not
  coming.
- **Loved holds recipes (D9).** Loved gains a Drinks · Recipes segment held
  in `?kind=recipes`; no `kind` is drinks, so every old `/favorites` link
  lands where it did. Each loved recipe keeps its Love toggle; un-Loving
  leaves the row in place until the next visit.
- **A friend's profile (`/users/<id>`).** Reached from a friend's row on
  Friends. Read-only: who, "Friends since <month year>", then the tier lists
  of theirs you may open (PUBLIC and FRIENDS — never PRIVATE), the cellars
  they created or co-own that you may open, and their drink log (entries
  about them, newest first, with what they said; Show more). Sections with
  nothing in them are not drawn; a friend who shares nothing gets "Nothing
  shared yet." Only friends: a stranger, an id that names nobody and a
  malformed id all get the same "doesn't exist or isn't shared with you"
  (D24), decided server-side with one message, and the page reads nothing
  before that gate answers. An admin is held to the same rules here: the
  profile lists what a friend shares with friends, never a PRIVATE list or
  cellar, even though an admin could open one by its link. Your own id redirects to Me. `/users` (the old
  dead "Profile" crumb) redirects to Me.

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
- **Recipe mode (X06)** reads a recipe photo at the shutter (the same
  `startRecipePhotoJob` the Bar's New recipe › Photo starts, through
  `useRecipePhotoJob`) and opens the new private draft in the recipe editor
  (`/recipes/<id>/edit`, X15) when it lands. Paste and Type stay on the
  Bar's New recipe; ＋ is the camera.
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

### Wave B leftovers (wave C "leftovers": items 1–9)

- **Toasts sit above an open sheet.** While a mobile sheet is open the
  toaster's bottom offset is the sheet's top edge plus 12 px (`--sheet-inset`,
  M5), and the tab bar's offset otherwise, so the "Finished" Undo no longer
  covers the rating sheet's Save. A near-full-height sheet caps the toast at
  96 px below the top of the screen, over the sheet's header rather than off
  screen.
- **No account-existence oracle on `user` and `userSearch` (L6, L41).** One
  policy rule, `canSeeProfile`, decides who may know a user exists; today it
  admits every signed-in viewer. A missing id, a malformed id and (once there
  is one) a hidden profile all answer `NotFoundError` with the profile
  wording, "This profile doesn't exist or isn't shared with you." The actor
  used to name the key in its refusal, so a uuid and junk answered in
  different bytes; `UserActor` now refuses every absent case with that one
  message, an invite with a wrong secret included. Sign-in is checked before
  existence: the old order told an anonymous caller NotFound for nobody and
  Forbidden for someone. The API answers a malformed id without sending it
  to an actor. A hidden person is dropped from `userSearch` like someone who
  does not exist, so a page can hold fewer than `limit` hits once blocking
  lands.
- **Friend-profile lists page.** Tier lists and cellars on `/users/<id>`
  show 20, then "Show more" walks the connection, as the drink log does; the
  "Showing 20 of 26" line is gone. The sections clamp `first` to the server's
  cap (100) instead of the usual `VALIDATION` error: all three sit under one
  `friendProfile` answer, and one over-large section would otherwise blank
  the whole profile.
- **Touch targets.** The item page's action bar and the Pour sheet already
  met 44 px (icon buttons are 44, chips and the Move-to button extend their
  hit area); m21 now runs axe `target-size` on just those regions. The
  page-level pass belongs to the verify round (L31).
- **e2e cleanup.** m06 deletes the teas it makes, the typed draft's
  included (`deleteTeas` in `fixtures/db.ts`). A recipe ingredient naming one
  of them is left in place and fails the delete, since no spec puts one there.

### Pairwise placement (wave C "pairwise": L09)

- **Where it starts.** Add entry offers **Compare to place it** when exactly one entry is picked. Several picks
  stay one multi-add, as X16 has it, because a pairwise run places a single entry. The run starts in the band
  the entry's rating gives it (`bandForScore`, X23). That is why the board's Skip line can name the band
  ("Skip, put it at the end of Very Good").
- **The search.** A binary search over the band's insertion slots, then one question across the line only
  when the entry ended at the band's very top or bottom. That question goes against the bottom entry of the
  band above, or the top entry of the band below. Only the adjacent band counts, and only bands 1 to 5.
  Unrated is not a quality tier, so it is nobody's neighbour. Beating the band above's bottom entry puts the
  new entry just above it. Losing to the band below's top entry puts it just below it. The budget is
  ceil(log2(n+1)) + 1 questions at most. An empty band asks nothing and adds straight away.
- **About the same** ends the run just below the entry it was compared with. Against a neighbour, it keeps the
  entry at its own band's edge. **Skip** goes to the end of its own band at any step, as a plain add would.
- **"N of M"** is the most questions still possible, recomputed after each answer. The board's fixed "1 of 3"
  cannot be known in advance for a binary search, so the count can shrink as answers narrow it.
- **M7.** `addTierListItem` takes `position` together with `band`. It inserts at that index, moves the rest of
  the band down one, and records one `ADD`. Undo goes through the existing `planBandOrders`, which closes the
  gap. Redo puts the entry back at the recorded position. A `position` without a `band`, or outside
  `0..length`, is a `ValidationError`. `addTierListItems` refuses a `position`, because a batch appends. The
  creator check runs before the position is validated. A stranger's bad index therefore answers `NotFound`,
  the same as a missing list, and is not a validation oracle (L6).
- **Undo on the result** steps that one edit back (`expectedSeq` from the add's own read-back) and returns to
  the first question, as the board's prototype does ("restart"). **Done** closes the sheet. The page refreshes
  after the add and after Undo, so its own Undo/Redo stays in step.
- **Board differences.** The cards show the type's vessel silhouette, not a photo, because the board query
  carries no images. Each card's eyebrow is the entry's band and its rank on the whole board ("Very Good · #3").
  The result line says "Top of / Bottom of / First in <band>" at the edges, where there is no "Above X,
  below Y" to give.
- **e2e.** `m11-pairwise` builds its fixture from five teas (`createItem` needs no onboarding) and one review.
  It deletes the review and the list afterwards. The API has no item delete, so the teas remain, as in
  specs 11 and 12. It creates no places.

### Imagery system (wave C "imagery": B03)

- **Fourteen vessels, not sixteen (L19).** The Main board's plates, kept
  where a style field we store drives them: wine Bordeaux (default),
  Burgundy (`variety` pinot noir, chardonnay), Sparkling (`style`
  SPARKLING, which wins over the variety), Alsace (`variety` riesling,
  gewürztraminer); beer Tall-neck (default), Stubby (`style` lager, pils,
  pilsner, pilsener, helles), Can (`style` IPA, india pale ale, sour,
  gose); spirit Decanter (default), Square (`spiritType` whiskey, whisky,
  Scotch, bourbon, rye), Tall (gin, vodka); sake Tokkuri; coffee Valve bag;
  tea Tin (default), Pouch (`form` tea_bag, sachet, matcha_powder,
  instant). **Port** is out (no fortified style exists, and DESSERT is
  also Sauternes) and so is **Isshobin** (a bottle size, which no field
  records). Matching is on whole words of the stored value, so
  `PILSENER_PILSNER_PILS` is a pils and `GINGER_LIQUEUR` is not gin; an
  unknown style is the type's vessel. The table is
  `components/app/label-plate/silhouettes.ts`, pinned row by row in
  `LabelPlate.test.tsx`.
- **The style reaches the plate through a new optional prop.** LabelPlate's
  existing props are unchanged; `styleFields` (the `StyleFields` shape
  drink-soon derives, plus `variety`) is new and optional, so every caller
  still draws its type's vessel until it passes one. The three plate
  builders (`item/adapter.ts`, `item/ItemCard/adapter.ts`,
  `home/continue.ts`) are outside this stream: wiring them is a hand-off.
- **The plate keeps its printed label.** The board draws a bare silhouette
  over an 18% tint; the shipped plate (N28) prints producer, name, vintage
  and origin over the vessel, and its tests pin that. Taken from the board:
  the 18% tint (was 15%) and the style's vessel, raised from 12% to 16% so
  the shape reads behind the text.
- **The glass: one coupe, coloured from a phrase table (L36).** Cocktails
  are a coupe (the board's), food keeps the cloche, uncoloured. 94 phrases
  map to 12 hues, most specific first ("dry vermouth" before "vermouth",
  "ginger beer" before "beer"); the bar kind is read first, then the
  generic item, then the bottle's name, then its type (coffee, beer, sake,
  tea); anything else is **neutral**. The body is the dominant line — a
  coloured hue outranks clear (gin, vodka, tonic), clear outranks neutral,
  then the bigger pour (oz/ml/cl/dash…, an unknown unit as 10 ml, a
  garnish as nothing), then the server's order — and the top band the next
  line of a different hue. Every hue is a `color-mix` of `--ca-*` tokens,
  so no colour is outside the token file and no token was added. The
  recipe fragment already selected every field the glass reads: unchanged.
- **The place hero replaces the category tile (Main board).** A 160 px,
  20 px-rounded card toned from the place's category (wine, beer, spirit,
  sake, coffee, tea, food, else neutral, by whole slug segment, so a
  `barbecue_restaurant` is food, not a bar), two rings and the tone's glyph
  at the top right, the name and category at the bottom left. A Google
  photo fills the same frame when there is one — the separate photo block
  under the header is gone — so the page does not jump when it arrives.
  The loading shell draws the same hero from the server's name and
  category. The name keeps the `type-title-1` h1 (28 px) the shell test
  pins, where the board's 3-up tile shows 20 px.
- **No PNG deleted (L22).** All seven illustrations are `CellarItemsEmpty`'s,
  inside `EmptyState`, so all seven stay. ItemRecipes' fallback (a wine
  photo for every cocktail, a beer photo for food) is now the drawn
  `RecipeThumb`. AddItemClient and the brand card/details still use the
  PNGs: their restored-markup tests (outside this stream) pin the images,
  so swapping them is a hand-off.

### BottomSheet physics (wave C "sheetphysics": B04, M6)

- **vaul stays the engine; each criterion is vaul's or ours (L21, D20).**
  vaul's: transform-only movement (`translate3d`), following the finger,
  scroll handoff (its `shouldDrag`: a list that can scroll takes the drag,
  and at `scrollTop` 0 a downward drag moves the sheet), dismissal
  thresholds, focus trap, Escape and aria. Ours (`useSheetDrag` +
  `sheet-physics.ts`): velocity-aware snapping by release velocity,
  rubber-band past the ends, and `onSnapChange` (M6). Reduced motion was
  already `globals.css`'s: vaul's transitions go to 0 s (instant snaps), and
  our stretch snaps back without a spring.
- **Release velocity, not vaul's average.** vaul divides the whole drag's
  distance by its time, so a slow drag that ends in a flick reads as slow
  and a fast drag that stops before lifting reads as a flick. We take the
  last 100 ms of samples (or the last segment, when a slow frame leaves
  none), project 200 ms ahead and take the nearest stop; at 0.4 px/ms (vaul's
  own threshold) a release always reaches the next stop its way. UIKit's
  full deceleration projection (about 500 ms) threw a sheet two snaps on an
  ordinary flick, so 200 ms. Our decision replaces vaul's as vaul reports
  it; vaul reports nothing when it keeps the current snap, so a pending
  decision is applied a tick later. A close vaul starts always wins.
- **The stretch is on `translate`, not `transform`.** vaul writes
  `transform` inline on every move; motion's `y` would overwrite it. The CSS
  `translate` property composes with `transform`, so the stretch stays a
  compositor-only transform and the two never fight. It applies only where
  vaul hard-stops: above `full` (and above a content-sized sheet when vaul is
  not already dragging, since vaul stretches that case itself once it is),
  and below the lowest stop of a sheet that cannot be dismissed (vaul does
  not move those at all). It never applies while the content owns the drag.
- **M6 fires on settle.** After the snap transition (0 under reduced
  motion), only for a snap other than the one the sheet last rested at;
  re-opening resets that to `initialSnap` without firing. A close started
  by vaul marks the sheet closing before vaul picks a snap in the same
  release, so nothing fires on close.
- **MapFilter (L15).** On a phone the filters are a `BottomSheet` titled
  "Filters" with Reset and Close in its footer, replacing a fixed panel
  measured under the filter bar; the sheet's own backdrop, Escape and drag
  replace the panel's click-outside and Escape listeners, which now run on
  desktop only. The desktop popover is unchanged; the tier-list combobox
  inside stays a popover.

### Freshness and drink soon (wave C "freshness": L02)

- **Per-bottle fields.** `packagedOn`, `acquiredOn`, `drinkFrom`,
  `drinkUntil` (GraphQL `Date`, strict `yyyy-mm-dd`), `priceAmount` (Float,
  0–99,999,999.99, two decimals) with `priceCurrency` (ISO 4217, set
  together; clearing the amount clears the currency) and `location` (≤ 80
  characters). All optional, all clearable with `null`. `drinkFrom` after
  `drinkUntil` is refused, checked against the stored other end.
- **Private to the owners.** "Dates and price are yours and stay private"
  (the Freshness board): anyone who is not the creator or a co-owner reads
  `null` for every one of them, on every read path, and `Cellar.drinkSoon`
  is an empty page for them. Writes follow the cellar's existing rules; a
  bottle id from another cellar answers exactly as an id that does not
  exist.
- **The table is one list, two units.** Sealed rows count months from
  bottling, vintage or purchase (tried in that order); opened rows count
  days, because open life is "3–5 days" and months would round it away.
  Every row carries the words "typical for <label>" prints. Sealed spirits,
  koshu, dark tea and pu-erh have no row on purpose: they keep or improve,
  and a made-up end would be an estimate.
- **The server ranks Drink soon** (`Cellar.drinkSoon`, `Viewer.drinkSoon`,
  connections per §1.5): opened by how far through their life, then sealed
  by the nearest end. Home keeps computing its opened rows in the browser
  from `me.openBottles`, so "Open N days" ticks with the page clock and the
  existing tests hold, and takes only the sealed rows from the server. A
  cellar's dashboard draws the server's list whole, for owners.
- **Board differences.** The window heading is years ("2024 – 2036") when
  the span is two years or more and month-year otherwise; the rows show
  month-year ("Mar 2024 · yours"), not the board's bare year, so a beer's
  three-month window reads as one. An opened bottle's card is its open life
  ("Best by 25 Nov 2026"), not the cellar window, since once open the
  cellar window no longer says how long it keeps; its rows still show the
  sealed dates. The sealed Drink soon row's verb is **Open** as a link to
  the bottle, not a pour.
- **Re-buy photo.** After adding a bottle of an item you already had (any
  bottle of it in your cellars, finished included), a card offers a label
  or receipt photo; it is attached as a private item image and set as that
  bottle's picture. A first bottle gets no card.
- **Pour is 44x44** on Home's shelf and in Drink soon (L27).

### Route motion (wave C "routemotion": B05, H-2)

- **The page transition is an `update` of the shell's `<main>`, not
  per-page wrappers.** Next's guide puts a `<ViewTransition>` in every
  `page.tsx` because a layout's enter/exit never fire; `main` stays mounted,
  so wrapping it once in `AppShell` and mapping the types on `update` gives
  every route the same motion without touching 60 pages, and the snapshot
  is exactly the scroller's visible box.
- **Kinds are inferred, then overridable.** A call site that says nothing
  gets: same path → none (filters, query strings), another tab's root →
  tab, a path ancestor → back (so AppBar's cold-link Back to its `parent`
  slides back), anything else → forward. `/` is nobody's ancestor. A
  `replace` follows the same rule, so a form that replaces itself with its
  result slides forward and a filter stays put.
- **Browser Back gets a type from the stack.** Next's popstate carries none.
  `RouteTransition` listens to `popstate` and, in the same event, starts a
  transition that adds the type and sets a no-op state: React queues the
  type on the root in the shared transition lane, so the traverse's commit
  carries it. Landing on the entry below the stack's top is Back, anything
  else Forward; a move between two tab roots is a tab crossfade either way.
  `navigate.back()` states its kind instead of relying on the stack.
- **Reduced motion and no API: no types at all,** read through motion's
  `useReducedMotion` (the ui-platform guard forbids a hand-rolled query), so
  nothing is named or animated and the router call is byte-for-byte what it
  was before B05. The CSS also zeroes any view-transition animation under
  the media query, as a backstop.
- **Bars are anchored by `data-slot` in CSS,** not by editing AppBar: the tab
  bar, side rail and app bar each get a `view-transition-name` whose old
  snapshot is hidden and new one not animated. The root's own crossfade is
  off, so only the page moves.
- **Title morph names come from the path** (`title_cellars_…`), so a card
  needs only its `href` and the page only its pathname. Wired: `ItemCard`
  (search, favourites, rankings) → `ItemHero`, and `TierListCard`'s side.
  The cellar grid draws `BottleCard`, not `ItemCard`, and the tier list's
  heading is in `TierListViewPage`, both outside this stream: hand-offs.
- **`app/Link` is now a client component** (it reads the pathname to infer
  the kind). Server components still render it; the props they pass were
  already serialisable, since `next/link` is itself a client component.
- **H-2: plates carry style fields.** `plateStyleFields(type, …)` maps WINE
  `style`+`variety`, BEER `style`, SPIRIT `spiritType` (else `style`), TEA
  `category`+`form`; sake and coffee have one vessel. The item page's
  attributes already select every field (`ItemView.plateStyle`); the page
  draws it once `ItemPageView` passes `styleFields={item.plateStyle}` to its
  `LabelPlate`, a one-line hand-off (not this stream's file). The card
  fragment lacks Wine `style`, Spirit `spiritType` and Tea `form`, so a card
  shows variety/beer/tea-category vessels until it selects them (hand-off).


### Seen at and scan-anywhere new place (wave C "seenat": L10)

- **Seen at is one actor read that composes the existing rules.**
  `ItemActor.seenAt` (`services/actors/src/lib/seen-at.ts`) gathers the
  item's menu lines (`place_menu_items` by item column) and its logs with a
  place (`check_ins.place_id`) by the viewer, their friends and the viewer's
  own outings, then keeps a place only through `canSeePlace` and a log only
  through `canSeeCheckInDetails` — the place is a detail of the log. Every
  refusal is an omission: a missing item, a private place and a log the
  viewer may not see all answer `[]` (tests shown failing with the checks
  removed first). Anonymous viewers get `[]`. No new policy.
- **A private log is not a thing yet.** `check_ins` has no privacy column, so
  "a friend's private log" is tested as a friend's log at the friend's
  pending place plus a stranger's log. A per-log privacy setting belongs to
  `packages/policy` (the make stream) and Seen at will follow it there.
- **One row per place, with one reason:** your own log beats a menu, which
  beats a friend's; newest within a kind. Nearest first when the browser
  *already* shares a position (the item page never asks — D14 asks on
  demand), newest first otherwise; at most 20 (`SEEN_AT_MAX`). The API
  field is `Item.seenAt(near, first): SeenAtConnection`.
- **The menu header is an abstaining field, read after `rawText`.**
  `venueNameIsPrinted` then `venueName` follow `confidence` and precede
  `items`, neither required, and the seam keeps a name only when the flag is
  true, it is 2–120 characters and it appears in the read text. It is stored
  as the new nullable `menu_scans.header_name` (migration
  `20261123055037_ux_c_seenat`, ruling L46) and never renames a place by
  itself: the results page offers "This menu says 'X'. Rename the place?" only
  for the person's own place still Under review, and only Rename resubmits
  (the type of `headerRenameInput` takes `confirmed: true`).
- **The inline new place is settled before upload (L24).** With a fix and no
  saved place within 50 m, capture offers "Add this place"; a shutter with no
  place opens the same sheet with the photo held. The place is created only
  on "Add place", saved pending — Under review (D28) — with a client-minted
  `placeId` kept for the open sheet so a retry converges (N09), and the bounds
  checked before a round trip. The prefill spends one budgeted Google nearby
  read; when D16 says no the sheet says "Details pending" and invents no name.
  No `google_place_id` is bound, so nothing is enriched on create.
- **Location asks our line first.** The capture card's prompt is
  `LocationPrePrompt` with "Use your location to find the place this menu is
  from." before the OS sheet; the pre-prompt took optional copy and labels,
  its defaults unchanged.
- **No seam for taste (L47 → H-10).** The taste_phrase seam was dropped from
  this stream; the proposed cap (20 000 requests / 200 cents a month) is
  recorded for whoever adds it with `install.ts` and `budget.ts`.
