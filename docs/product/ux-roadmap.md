# Cellar Assistant: roadmap to "well built, high quality, intuitive, delightful (mobile)"

> **Decisions are answered in [`decisions.md`](decisions.md), which overrides this file where they differ** (notably D20: migrate to shadcn/ui + motion; D29: table-only drinking windows). Capture evidence (`ux-review-capture/…`) lived in the review session's scratchpad and is not checked in.

Synthesis of the 2026-10-05/06 UX review, revised after a critic pass (see "Critique response" at the end).

Inputs:
- the phase-0 inventory and market research;
- the capture (`ux-review-capture/INDEX.md`, tree **b2c5f541**, clean; AI on Ollama gemma3:4b);
- about 150 verified reviewer findings across 9 themes.

Every row cites the finding ids it merges, and those ids carry the evidence (capture file names and repo `path:line`). The visual and motion overhaul is its own deliberate track (**Track B**), designed in `ux-review-design-direction.md`. Track A fixes never wait for it.

## North star

**One app, one loop, one thumb.** Point the camera at anything to drink: a label, a menu, a recipe card, a shelf. The AI drafts it and marks every value with where it came from, and you confirm with one tap. That bottle, log, place or recipe then shows up wherever it matters: Home ("open now", "waiting on you"), the item's single page, your lists, your friends' feed, the next menu you scan. All of it lives in a dark, warm, native-feeling shell that answers every tap within a frame. The AI never quietly invents anything: no invented bottles, and no invented numbers (prices, drinking windows, match percentages). You never retype what the app already knows.

## Themes

| # | Theme | Why it matters |
|---|---|---|
| T1 | **Trust the basics** (correctness, honest state) | Several S–M defects make the app feel broken before any redesign: <br>• search drops the keyboard mid-word; <br>• a printed vintage is thrown away; <br>• a 15 s countdown can auto-commit AI-invented items to the shared catalog; <br>• the slider at 0 silently finishes a bottle; <br>• menu matches "un-accept" themselves on screen; <br>• operator error text reaches users; <br>• missing pages are a bare black 404; <br>• the only rating input is invisible to VoiceOver. |
| T2 | **Shell and IA**: one home, five labelled tabs, a real Back | Two homes (/search vs /cellars). 4 unlabelled icons plus 5 hidden destinations. No Back in standalone mode. Four orphan routes. Mine, friends' and strangers' content mixed together. |
| T3 | **Capture: one camera, draft then confirm** | About 10 taps across 4 camera screens behind a hand-picked type. Five unrelated camera entry points. AI output looks hand-typed. The seams are excellent (abstention-first); the problem is the plumbing between the model and the screen. |
| T4 | **Bottle state first** | The API has sorts, status, openAt, % and updateCellarItem, and the UI shows none of them. Cards show `0 ♥ 0 💬`. The best surface ("Open and recent" plus one-tap Check in) is orphaned. |
| T5 | **A real drink log and taste model** | A check-in is a timestamp bound to a bottle and is deleted with it. "Liking" is spread over seven mechanisms that disagree (★4 sits in GOOD under ★3). |
| T6 | **Map and menus: "what's good here"** | Menu scan is the signature AI moment. Today it ends on a "Scan Complete" card, matches 1–2 of 8 lines (vector-only retrieval, against a junk catalog, so unmeasured), and gives no line an action. |
| T7 | **Recipes join the cellar** | Spirits show no cocktails. baseSpirit is never written. There is no editor, no privacy, no "what can I make". |
| T8 | **Visual system and imagery** (Track B) | The theme is a palette patch. Every grid is identical clip art. Primary buttons are 2.80:1. Five header styles, six score formats. Teal means both "action" and "AI". |
| T9 | **Motion and perceived performance** (Track B, partly A) | Taps get no acknowledgement. Every route is a one-frame cut after a 150–515 ms freeze (55 force-dynamic routes, 2 loading.tsx). There is no success moment outside the onboarding particles. |
| T10 | **Return loops and growth** | No public share pages (every link dead-ends at sign-in), no push, no recap, no invite. |

**How to read the tables.**
- **Type:** fix · quick-win · foundation · big-bet · decision.
- **Value:** 1–5.
- **Effort:** S (days) · M (1–2 wk) · L (3–6 wk) · XL.
- **Track:** A = product and fixes; B = intentional overhaul.
- **IDs:** stable within this revision. Gaps are merged items. N14, N16, N18, N24 and N25 moved to early Next (X13, X01/X17, X23, X22→X15, X24).

---

## NOW: next 2–4 weeks, in two waves

**Wave 1 (weeks 1–2): S-sized correctness and the guardrails that measure it.** N06a is the only M in the wave. **Wave 2 (weeks 3–4):** the foundations and the first visible change.

Now holds 26 items: 17 S and 9 M. That assumes two or three agents in parallel. If work is single-threaded, wave 2 spills into Next and the order still holds.

### Wave 1

| ID | Item | Type | Value | Effort | Sources | Notes / dependencies |
|---|---|---|---|---|---|---|
| N01 | **The search field never remounts.** One persistent input. `router.replace` while typing; push only on commit. A results skeleton from `isPending`. | fix | 5 | S | shell-1 | Prerequisite for sectioned search (X12). |
| N02 | **Quick-add can only add another bottle of a known item; vintage reads as a year.** <br>• Accept a bare year for date fields the form edits as a year, and ask the model for a year. <br>• **Acceptance:** `canQuickAdd` (`OnboardingWizard/adapter.ts:177-191`) also requires an existing catalog match: a barcode hit, or an N19 `itemSearch` hit with an equal vintage. The 15 s countdown can then never create a catalog row. <br>• Unit tests go beside the E2c guard tests in `adapter.test.ts` ("canQuickAdd (Q7, the E2c guard)"). | fix | 5 | S | items-2, ai-capture-3 | **Depends on N19** (same wave; one PR or N19 first). The vintage fix alone would switch on unattended creation of new wine items. |
| N03 | **Required fields say what's wrong.** FormControl `error` plus helper text on the onboarding and edit forms; the saveBlocker message becomes reachable. | fix | 5 | S | items-3 | Today: the page scrolls to the field, then 120 s of silence (flows/02a/13). |
| N04 | **The camera never dead-ends.** `ideal`-only constraints; onUserMediaError plus a 5 s timeout state; a Library button beside the shutter. | fix | 5 | S | items-6, ai-capture-17 | The first-bottle blocker under iOS standalone permission quirks. |
| N19 | **`AIDraftField` v0 and dedupe.** <br>• Introduce **one** component: `<AIDraftField source="label" \| "suggested" \| "pin" \| "barcode">`, on today's styles. <br>• Mark AI-filled fields by diffing defaults against form values. Render the merge's `skipped` proposals. <br>• Migrate CreatePlaceForm's "Auto-filled from pin" chip (`:564`) onto it. <br>• After itemDefaults, `itemSearch(text, itemTypes)` plus an explicit vintage compare leads with "Is it this one? +1 bottle". | quick-win | 4 | S | ai-capture-2 (S half), visual-6 (S part), features-11, ai-capture-8, items-5, ai-knowledge-17 | No SDL change. Later steps reuse the same component: X05 adds `confidence`, X19 uses `source="suggested"`, B02 only restyles it. |
| N06a | **Menu-scan truth.** <br>• Expose match status on MenuScan and poll until it settles. <br>• Fix the PlaceDetails refetch race. <br>• "Scan Complete!" **auto-advances** into results. <br>• Honest headline: "8 read · 2 matched · 6 new". <br>• Optimistic "Matched" after Accept (today the row re-renders "not yet matched"). | fix | 5 | M | map-1, ai-capture-12, motion-14 (accept), motion-9 (accept) | Actor field plus client. Readability moved to X07's first slice. |
| N05 | **A retrieval and match eval set.** <br>• About 10 labelled menu photos or OCR texts, plus about 30 search queries, each with expected catalog ids, against a seeded (non-e2e) catalog. <br>• A vitest-runnable recall@k and match-rate script. <br>• Record a baseline on Ollama, and on Gemini when available. | foundation | 3 | S | map-5, ai-knowledge-15, cellars-1 | Without it, "1–2 of 8 matched" is an anecdote taken against e2e residue. N08 and X04's search cutoff are judged on it. |
| N10 | **Shell errors and offline phase 1.** <br>• In-shell `not-found.tsx` with non-oracle copy; the tab bar stays. <br>• Route-group `error.tsx` and a `global-error.tsx`. <br>• Delete the dead `/v1` SW matchers. <br>• Make `/~offline` public (it can precache the sign-in redirect). <br>• Purge SW caches on sign-out. <br>• Theme the offline page. | fix | 4 | S | shell-10, shell-9 (ph.1), visual-12 (404), cellars-15 (404) | Copy: "doesn't exist or isn't shared with you". |
| N11 | **Contrast and fonts.** <br>• A palette contrast unit test. <br>• `text.tertiary` raised to at least 4.5:1. <br>• next/font becomes the only Inter, wired to Joy `fontFamily` (no faux bold). <br>• Primary fix: **if the B01 palette is signed off by then, this PR is the global brass flip** (`palette.primary` → brass with `#1A1408` ink, 7.61:1, covered by the test). Otherwise use dark ink on teal now, and the flip lands as a single B01 PR. | fix | 4 | S | visual-3, visual-13, shell-14 | Every primary button is 2.80:1 today. Teal never ends up meaning both "action" and "AI". |
| N13a | **Finishing a bottle is deliberate and reversible.** <br>• 0% opens a "Finished it?" sheet (N27) with Undo (`updateCellarItem(emptyAt:null)`). <br>• Delete warns that the bottle's check-ins go too. | fix | 5 | S | cellars-2, motion-8 (finish) | A data-loss fix. Depends on N27. |
| N27 | **`BottomSheet` v0 and `Toast` with Undo.** <br>• `<BottomSheet>` is an app-owned API. v0 is a bottom-anchored sheet that borrows Joy Modal for portal and focus trap, with no physics. <br>• `<Toast action="Undo">` is Joy-free and sits **above** the tab bar (today's toast covers the nav, obs 41). <br>• B04 later swaps in physics behind the same props. | foundation | 4 | S | motion-6 (API), motion-15, items-20 (toast), cellars-2 | Precondition for N13a, N15, N21, N26's overflow and X23's undo. Prevents four ad-hoc sheets that would later be rebuilt. |
| N22 | **Map basics.** <br>• Dark basemap by default; the container painted with the theme surface (no cream flash). <br>• Map sized to the content area, so attribution shows. <br>• Geolocation on demand, with a pre-prompt. <br>• Enrichment skeleton capped at 8 s, not a 3-minute spinner. <br>• Empty search answers "Not on the map yet: Add it here". | fix | 4 | S | map-13, map-14, visual-17, coherence-24, map-17, map-8 | Attribution is a licensing obligation. |
| N20 | **A mobile e2e guardrail.** <br>• A 390×844 touch Playwright project. <br>• Five specs reproducing obs 9/15/25/59 and the search remount: keyboard focus survives typing; the camera fallback appears; nav labels exist; map attribution sits above the nav; a 16 pt gutter at 375. | foundation | 3 | S | shell-13 (e2e part), shell-1, items-6, map-14, cellars-19 | e2e is desktop-only today. **Do not create places in these specs** (shared 25/day cap). |
| N29 | **Record decisions D1–D29** in `docs/architecture/ui-parity-decisions.md` and a product-decisions doc. | decision | 3 | S | coherence-14…28, features-22 | Unblocks N15, X01, X04, X09, X10, X11. (The stranded taste-profile code is *not* here; see L03.) |

### Wave 2

| ID | Item | Type | Value | Effort | Sources | Notes / dependencies |
|---|---|---|---|---|---|---|
| N07 | **A typed AI-outcome contract.** <br>• ActorErrorReason gains USER_CAP, SERVICE_BUDGET, AI_UNCONFIGURED and NOTHING_READ, plus `retryAt`. <br>• One client mapper plus an `AiStatus` component. <br>• `TierList.insightsStatus`. <br>• Release the budget reservation when no provider response arrived. <br>• `viewer.aiCapabilities.{imageSearch,labelRead}`, so the UI hides rather than refuses. | foundation | 4 | M | ai-capture-4, ai-knowledge-18, coherence-26, social-8, ai-capture-19 | Removes operator text ("Set AI_PROVIDER=ollama…") and the never-ending "Generating Insights". Settles D17. |
| N08 | **Hybrid retrieval.** <br>• A pg_trgm index on item names, fused with vector rank in ItemSearchActor and MenuMatchJob. <br>• Human-readable labels and the brand in `embeddingTextFor`, then a re-embed. | foundation | 4 | M | map-5, ai-knowledge-15, social-7 (lexical) | **Measured on N05** before and after. Deterministic, Ollama-OK. Check item_vectors coverage first. |
| N09 | **Place creation is bounded and converges.** <br>• An ~8 s timeout on `#reviewOrNull`. A timeout takes the **existing** "no model ran" path (`review: null`, recorded unreviewed; the actor's header guarantees never a fabricated approval). <br>• A retry with the same client-minted `placeId` returns the existing row instead of hitting the duplicate guard. | fix | 4 | S | ai-capture-13, map-7, ai-knowledge-14 | Removes the 48.7 s and 120.8 s creates. The explicit `approved:false` gate stays synchronous for now. Async moderation with a pending state is X27. |
| N12 | **Tap acknowledgement and touch hygiene.** <br>• `:active` press on cards and a `useLinkStatus` hairline. <br>• Tab active by prefix, lit optimistically, with **visible labels**; tooltips only on `(hover:hover)`. <br>• `-webkit-tap-highlight-color: transparent`. <br>• `-webkit-touch-callout:none` and `user-select:none` on cards, the nav and the drawer header (obs 33). <br>• 44 pt minimum IconButton targets. | quick-win | 4 | S | motion-2, coherence-4 (labels/prefix), visual-18 (labels) | The highest value per effort in motion. The only home for the tab label and prefix work (X01 doesn't repeat it). Optimistic toggles moved to X24. |
| N13b | **BottleCard plus sort and status.** <br>• A sort chip (Open first · Recently added · Almost empty · A–Z) and a status segment (In cellar · Finished · All). <br>• A BottleCard showing Sealed / Open·8d, a level bar and your stars, instead of `0 ♥ 0 💬`. <br>• Fix score clipping. | quick-win | 5 | M | cellars-8, cellars-4, visual-10 (clip), visual-11 (zero metrics) | All fields are already fetched by CellarItemRow. **Ships with N28**, so the first cellar screen visibly changes. |
| N28 | **LabelPlate v0 in the existing ItemCard fallback.** <br>• A deterministic SVG plate: producer, name, a big vintage, region · ABV, on the type tint. <br>• One vessel silhouette per type (six). <br>• Ships the `itemTypeTokens` module (one order, one colour set, fixed spirit/sake glyphs). | big-bet | 5 | M | visual-2, visual-7, cellars-17, items-16, visual-11 | Evidence: on `cellars__cellar-items-home__m390__populated__fold.png` the one real label photo is instantly recognisable and the rest are identical lilac bottles. A primitive, not a restyle. B03 extends it to ~15 style shapes. |
| N15 | **A designed first run.** <br>• Auto-create "My Cellar". <br>• EmptyState v0 with one action on the empty cellar, tier list and friends. <br>• The install prompt waits until after the first save, as an N27 sheet; fix the iPadOS check and the orphan ".". <br>• Rankings gets a labelled Me·Friends·Everyone control, default Me, with rank numerals. | quick-win | 5 | M | shell-7, shell-8, social-11, visual-12 | The Yours/Friends/Discover split moved to X11 (needs D2). |
| N17 | **Honest formatting.** <br>• Wire the tier-list adapter and AddEntryModal to `utilities/formatters.ts`. <br>• Smart title case for all-caps AI names, at write time and on display. | quick-win | 3 | S | visual-15, items-9, coherence-9 (enum part) | Brand-type inference and the quantity formatter moved to X23 and X14. |
| N21 | **Adding a bottle: two cameras, a real ending.** <br>• The display photo defaults to the front-label data URL (the machine already keeps `frontLabel`, `backLabel` and `displayImageDataUrl` separately, `machines.ts:73-77`). <br>• The back label becomes an optional "Add back label" step. Order: barcode → front → (optional back). <br>• Mount the particle bottle **immediately** (kills the 0.7 s black "ANALYZING…" gap, obs 26) with a reduced-motion static. <br>• Fix the "Lets" copy and drop "Scanning (Native API)". <br>• End on a success sheet (+1 bottle · Snap another · Open it now). <br>• Item-page Add to Cellar opens a sheet (remembered cellar, quantity, "Already open?") followed by an Undo toast. | quick-win | 4 | M | items-8, items-7 (gap), ai-capture-1 (display=front), items-20 | About half of T3's tap reduction this month. Uses N27. |
| N30 | **Replace the star-rating input.** <br>• `AddReview.tsx:14,165` uses `react-simple-star-rating@5.1.7`. Its dist sets `aria-hidden="true"` on the root (invisible to VoiceOver), `touch-action:none` (swallows a thumb scroll), and commits via `onPointerLeave` (a slide rates). <br>• Verify on a real iPhone. <br>• Replace with an accessible half-star radio group: 44 pt targets, tap to set, arrow keys. | fix | 4 | S | ai-capture-7 (tap misses), motion-18 (obs 22) | X03, X23, X02 and L09 all rely on this control. Obs 22 was flagged as possibly an emulation artefact; the library code is not. |
| N26 | **AppBar with a real Back.** <br>• Back via a session nav-depth counter, otherwise the declared parent. <br>• A collapsing title. <br>• Overflow (an N27 sheet on phones) for Edit/Delete/Share. <br>• Breadcrumbs desktop-only; fix the `/users` crumb. | foundation | 5 | M | shell-3, visual-4 (header), visual-8 (overflow) | No custom edge-swipe. B02 restyles it. |
| B01 | **Track B kickoff.** <br>• Design-direction sign-off. <br>• Token layer as CSS variables on Joy `extendTheme`. <br>• `lib/motion.ts` and `MotionConfig reducedMotion="user"`. <br>• A vitest guard against new hex and raw springs. <br>• **The brass flip as one global PR**, if N11 didn't already do it. Teal enters only as `--ca-ai`, together with AIDraftField. | foundation | 3 | M | visual-1, motion-1, visual-5 (ph.1), shell-21 | The only visible change is the accent flip. Everything else rides on primitives. |

---

## NEXT: following 1–2 months

### Early Next (spill from Now, weeks 5–6)

| ID | Item | Type | Value | Effort | Sources | Notes |
|---|---|---|---|---|---|---|
| X11 | **Yours / From friends / Discover** on /cellars and /tier-lists. Strangers' public content never appears in "mine". Own cellars ordered by recent activity. | quick-win | 4 | M | coherence-7, social-13, coherence-22 | Needs D2. Client-side via createdById; a server owner arg later for large accounts. |
| X23 | **Tier-list truth.** <br>• The owner's score plus a "You 2.5" chip on others' lists. <br>• Band defaults from your verdict on add. <br>• Whole-row tap and an "On this list" state in Add entry. <br>• "Arrange" mode replaces the padlock and the always-on trash. <br>• Confirm/Undo on friend Remove. <br>• Brands infer their type from the first linked item and drop "Since <created_at>" / "1 items". | quick-win | 4 | S | social-2, coherence-3, social-7 (UI), coherence-23, coherence-14, social-17 (S), social-18 | Needs a `TierListItem.ownerReview` resolver (S), plus N27 and N30. |
| X24 | **Loading shells and optimistic toggles.** <br>• Shape-matched `loading.tsx` for the tab roots, map and place; heroes stay outside Suspense. <br>• Prefetch on pointerdown. <br>• `useOptimistic` for favourite (ItemCard's "optimistic" heart is held by its async transition), visited and check-in. | foundation | 4 | M | motion-10 (ph.1–2), motion-11, motion-9 | Precondition for B05. |
| X27 | **Async place moderation.** <br>• Insert first as **creator-only `pending`**, hidden from the shared map, with a visible "Under review" chip. <br>• placeReviewer runs via the outbox. <br>• Approved: the place becomes shared. <br>• Rejected: it stays creator-only, showing `rejectionReason` with Edit / Delete. <br>• suggestedCategories surfaced as "also tagged as…". | foundation | 3 | M | ai-capture-13, map-7, ai-knowledge-14 | Migration: a place review status. Makes the post-hoc gate explicit (D28). Prerequisite for L10. |

### Main Next

| ID | Item | Type | Value | Effort | Sources | Notes |
|---|---|---|---|---|---|---|
| X01 | **Five labelled tabs (Home · Cellar · ＋ · Map · Me), the IA mapping, and one landing.** <br>• Every landing (sign-in, sign-up, `start_url`) goes to `/`. Until X10, `/` still redirects to `/search`. <br>• Delete the duplicate chips. <br>• Greeting rendered on the client. <br>• The submit spinner persists until navigation commits. <br>• Re-tap pops to root. <br>• **＋ opens a chooser sheet** (Bottle · Menu · Recipe · Place) wired to today's flows: `/add`, MenuScanner, the recipe generator, create-place. <br>• **Mapping** (D1): Recipes → Cellar "Bar" segment plus a search section. Tier lists → top of Me›Lists plus a Home "Friends ranked" card. Rankings → Me›Lists "Top rated" plus the item taste header. Favorites → Me›Lists "Loved". Friends → Me (badge). Brands → item pages and search. Scans and Discoveries → Home inbox plus the Map sheet. | foundation | 5 | M | coherence-4, shell-2, social-20, shell-6 (step 1), shell-4, motion-17 | Needs D1, N12, N26. No per-tab stacks. X06 replaces the chooser sheet's contents later. |
| X02 | **A bottle-optional drink log.** <br>• Migration: `check_ins.item_id`, a nullable `cellar_item_id`, score, note, tags, place, photo, companions. <br>• `canSeeCheckIn` for bottle-less logs. <br>• Removing a bottle keeps its history. <br>• `CHECKED_IN` in the feed. <br>• A typed note becomes flavour chips via an abstaining seam (Ollama-OK). Voice comes later and is Gemini-only. | foundation | 5 | L | features-2, coherence-15, ai-capture-7 (typed), social-4, coherence-2, cellars-7, ai-knowledge-6 | **Critical path.** One rating per thing, plus many logs. |
| X03 | **Pour sheet.** <br>• openItem + checkIn + setPercentage in one thumb-zone action. <br>• "Just me / me + Sam" replaces Bulk Check In. <br>• Per-type glass presets. <br>• The last pour offers Finish, then rate (N30 control), then a band suggested from that rating. | big-bet | 5 | M | cellars-6, cellars-16 (copy), motion-8 | Needs X02 and N27. |
| X04 | **Cellar home merge.** <br>• An "Open now" shelf (OPEN_FIRST plus Pour) above the collection. <br>• ×N grouping (a grouped connection). <br>• Finished as a diary. <br>• **Search narrows instead of re-sorting**: a distance cutoff tuned on N05, a name match first, a cross-cellar fan-out ("Lagavulin is in Bar Cart"). | big-bet | 4 | L | cellars-3, coherence-13, features-21 (grouping), visual-11, cellars-1 | D3. |
| X05 | **Snap-once capture with a draft card.** <br>• One camera with live client barcode (zxing). <br>• Mode defaults to the last used (usually Bottle). **No classifier call.** <br>• The itemDefaults abstention prefix gains an optional `surfaceKind` enum (declared before the values), so "not a label" can offer "Looks like a menu, scan it as a menu?" at zero extra calls. <br>• The front photo doubles as the display image and the G32 match; the cellar is defaulted. <br>• The read starts at the shutter and lands in the draft card. AIDraftField gains `confidence` (Sure · Likely · Check this; schema fields declared after the values). <br>• Background continuation after about 8 s. | big-bet | 5 | L | ai-capture-1, ai-capture-2, ai-capture-9, items-7, items-1, ai-knowledge-1, cellars-13, coherence-21 | Needs N02, N03, N04, N19, N21. `start()` is idempotent per onboarding, so this means a single-label snap. |
| X06 | **Global capture surface behind ＋.** <br>• Replaces the X01 chooser with the camera: mode row Bottle · Menu · Recipe (· Shelf when L01 lands). <br>• Menu scans from anywhere: a geolocation `placeHint` plus a one-tap "At Cork & Barrel?". <br>• The photo-search fallback reads the label (type from the mode row) and carries the bytes into Add. | big-bet | 5 | L | ai-capture-11, ai-capture-10, shell-17, coherence-5, features-10 (known place) | Needs X01 and X05. |
| X07 | **Menu lines: readable, actionable, personal.** <br>• **First slice (S):** one shared line component, grouped by detected type, cocktail/sake/tea icons, scanner copy naming every type, and "Add to Cellar" relabelled. <br>• **Then:** grounded chips ("In Bar Cart", "You ★4.5", "Test Two loved it", "Like the Lagavulin 16 you rated ★4.5"). **No affinity percentages.** <br>• Actions: I'm having this (an X02 log at this place), Want to try, Add to tier list, Add to cellar, Not this. <br>• Unmatched lines get candidates plus "Add to catalog" via a text-only itemDefaults. | big-bet | 5 | L | map-4, map-2, features-5, map-3, ai-knowledge-5, coherence-11, ai-capture-5 | Needs N06a, N08, X02, X08. |
| X08 | **Want to try** across items, places and recipes. Revive `wantToVisit`. Saved becomes Loved. A want-to-go pin. A target on insights and activity rows. | foundation | 4 | M | features-8, map-11, social-12, coherence-20 | |
| X09 | **One item page.** <br>• "Your bottles" with Pour. <br>• A sticky action bar. <br>• A taste header: You · Friends · Everyone. <br>• Item.checkIns as "Your log". <br>• A fact sheet for all six types. <br>• One brand title per type. <br>• Spirits get recipes. <br>• The bottle route becomes the item page with that bottle selected. | big-bet | 5 | L | items-10, cellars-9, cellars-10, items-17, social-19, coherence-17, items-12, coherence-10, coherence-6, visual-8 | Cheap first slices: link both ways, restore Item.checkIns. |
| X10 | **Home "Today" v1 plus the AI inbox.** <br>• Continue: open bottles across cellars. <br>• Waiting on you: matches, drafts, requests, insights. <br>• An AI job tray with toasts. <br>• Friends: a paged, sentence-form, burst-grouped feed. <br>• Nearby. <br>• `/` now renders Today; /search becomes a sheet. | big-bet | 5 | L | shell-6, coherence-8, social-5, features-7 (ph.1), cellars-12 (heuristic), shell-18, motion-16 | Needs X01 and N07. "Drink soon" is deterministic: openAt plus a style table. Kills /discoveries and the /map/scans list. |
| X12 | **Sectioned universal search**: Your bottles · Items · Places · Recipes (semantic) · People · Brands, 3 each. | quick-win | 4 | M | coherence-19, shell-5, recipes-8 | Needs N01 and N08. |
| X14 | **Recipes meet the cellar (data first).** <br>• Extraction returns baseSpirit, role, brandMentioned and quantityText. Backfill. A migration for role plus optional bottle. <br>• One quantity formatter with Unicode fractions. <br>• Then: "Cocktails with this / Use it up"; Have / Substitute / Missing; a Bar pantry; Make now / One bottle away. | big-bet | 5 | L | recipes-1, recipes-2, recipes-5, recipes-15, recipes-16, coherence-27, coherence-18, ai-knowledge-16, features-6 | |
| X15 | **Recipes: quick fixes, then editor, drafts and privacy.** <br>• **First slice (S):** drop the nested 800 px virtualizer; share text names the drink; the generator auto-starts and is linked from ＋ on /recipes; correct loading titles. <br>• **Then:** a New recipe sheet (Photo · Paste · Type) into a draft editor with confirmable ingredient-match chips; private first; author edit and delete; jargon goes. | big-bet | 4 | L | recipes-7, recipes-17, recipes-12, motion-11 (recipes), recipes-3, recipes-4, recipes-9, ai-capture-14, recipes-13 | |
| X16 | **Tier lists without typing.** <br>• Sections: In your cellars / Tasted, not ranked / Friends ranked, with multi-add. <br>• Templates pre-banded from reviews. <br>• A grounded "Try this next" as catalog cards. | big-bet | 4 | M | social-7, social-16, ai-capture-16, ai-knowledge-10, social-9 | Needs N08, X23, X08. |
| X17 | **Public share pages and invite.** <br>• Read-only PUBLIC tier lists, recipes and items, served by an anonymous client. <br>• next/og cards. <br>• A CTA through OAuth with **returnTo surviving social sign-up and the proxy** (`SignUpApiClient.tsx:63`, `proxy.ts:76`). <br>• A friend invite link. | big-bet | 5 | L | features-3, shell-19, social-17, recipes-17, social-21, coherence-28 (returnTo) | Policy review of anonymous reads. |
| X18 | **Me hub v1**: counts; Lists (tier lists plus Loved / Want / Top rated); Friends with a badge; Settings; a read-only friend profile. | foundation | 4 | L | coherence-12, social-3, shell-16 | Needs X01 and X02. |
| X19 | **Catalog correction loop.** <br>• NV vintage, with dedupe and formatting paths. <br>• Optional coffee description. <br>• BrandPicker on edit. <br>• Creator "Re-read label". <br>• A text-only inference pass rendered through `AIDraftField source="suggested"`, never auto-applied. | foundation | 4 | M | items-15, items-14, ai-knowledge-2, ai-capture-18 | |
| X20 | **Map shell and place page rebuild.** <br>• A bottom-sheet map: search at thumb height, labelled chips, floating Locate and Scan. <br>• Pins encode Loved / Been / Want / menu-known. <br>• The place page answers "what's good here", with no tabs and no nested scroller. | big-bet | 4 | L | map-15, map-12, map-6, map-16 | Uses B04. |
| X21 | **Accessibility baseline.** <br>• Name every control (25 of 47 IconButtons are unnamed). <br>• Landmarks plus a skip link. <br>• Per-route titles; one h1. <br>• axe at 390 inside N20's mobile project. | fix | 3 | M | shell-13 | |
| B02 | **Primitive set.** <br>• Page/AppBar restyle, InsetSection, ItemTile, Score, TypeChip, EmptyState, ActionBar, SegmentedControl, charts on tokens. <br>• AIDraftField restyle; teal `--ca-ai` arrives here. <br>• **Built Joy-free** where Joy has no counterpart (Toast, SegmentedControl, LabelPlate, Score, ActionBar). | foundation | 4 | L | visual-4, visual-9, visual-10, visual-12, visual-6, visual-8, visual-11, visual-16, visual-18 | Needs B01. |
| B03 | **Imagery system, full.** <br>• LabelPlate grows to ~15 style silhouettes. <br>• Recipe glasses coloured from ingredients. <br>• Place heroes. <br>• Illustrations move to empty states; delete the unused PNGs. | big-bet | 5 | L | visual-2, recipes-11, map-17 (hero) | Builds on N28. |
| B04 | **BottomSheet physics** behind N27's props: transform-only, velocity snaps, rubber-band, scroll handoff. Migrate the drawer, menus and filters. | foundation | 4 | L | motion-6, motion-15, map-16 | Built on framer-motion 14.0.0 (already a dependency). |
| B05 | **Route motion**: a page-level ViewTransition (forward / back / tab), an anchored nav, a title morph. Codemod 22 direct `next/link` imports and 18 `router.push` sites. | big-bet | 4 | M | motion-3, motion-4, shell-12 | Needs N12, X24, N26. |
| B06 | **Signature moments v1 and brand.** <br>• Moments: check-in stamp; plate into the Cellar tab; Pour level; tier settle; matches land on menu rows; photo→draft particles. <br>• Brand: wordmark, one AuthLayout, the multi-vessel particle intro. <br>• An iOS `switch` haptics spike. | big-bet | 4 | L | motion-8, motion-12, motion-14, items-7, cellars-18, visual-14, shell-20, motion-18 | Needs B03, B05, X03, X05. |

## LATER: big bets

| ID | Item | Type | Value | Effort | Sources | Notes |
|---|---|---|---|---|---|---|
| L01 | **Multi-item drafts and import**, in this order: receipts/PDF, then shelf/haul (Gemini-only), then N recipes per photo (G30), then CSV export and import. One draft grid with "Add all". A bulk budget kind reserved per batch. | big-bet | 4 | XL | features-4, ai-capture-15, ai-capture-6, items-19, coherence-27, ai-capture-14, features-19 | After X05. |
| L02 | **Freshness and drink-soon, full.** <br>• Per-bottle packagedOn, acquiredOn, user drink-from/until, price and location. <br>• Photo capture on re-buy. <br>• **A deterministic style and shelf-life table**, labelled "typical for <style>", that the user's own dates override. <br>• **No model-estimated drinking window.** | big-bet | 4 | L | ai-knowledge-4, features-7 (ph.2–3), cellars-16 (clocks), features-21 | D29. |
| L03 | **Taste profile and friend agreement.** <br>• The stranded `flamboyant-poitras-fa3ffe` code (tip `1b8ced13`, pre-migration Nhost tree): **archive it as a patch** without committing in that worktree, and port only the presentational components; rewrite the data layer as actor queries. <br>• A cross-type archetype. <br>• Agreement shown as evidence ("you agree on 7 of 9 shared wines"), only above a minimum-overlap gate, **never a cosine %**. <br>• Compare and clone a friend's list. | big-bet | 4 | L | features-12, ai-knowledge-11, ai-knowledge-12, social-10, social-14 | Needs X02. |
| L04 | **Recap and breadth stamps**: decks that skip thin cards; share images; breadth only. | big-bet | 4 | L | features-13, social-21, features-20 | Needs X02 and X17. |
| L05 | **Web Push and app badge**, opt-in at the moment of need. | big-bet | 3 | L | features-15 | Needs X10 and N07. |
| L06 | **"Tonight" sheet**: deterministic retrieval plus one structured ranking call that explains by ID; writes only through confirm cards. | big-bet | 4 | L | features-18, ai-knowledge-9, ai-knowledge-3, cellars-12 | Needs L02, X14, X02. |
| L07 | **Offline phase 2**: an IndexedDB snapshot with barcodes, "Do I own this?" offline, a queue with sync. | big-bet | 4 | L | shell-9, features-14 | Needs N10. |
| L08 | **Make mode and "Made it"**, plus Steep and Brew. | big-bet | 3 | M | features-17, recipes-6, recipes-14 | Needs X02 and X14. |
| L09 | **Pairwise placement**: band plus position, with no second score. | big-bet | 4 | M | features-16, social-6 | Needs X23. |
| L10 | **"Seen at" and scan-anywhere new place.** | big-bet | 4 | L | features-9, features-10, map-9, ai-knowledge-13 | Needs N06a, N08, X27, X06. |
| L12 | **Cache Components migration**: drop the 55 force-dynamic routes; Activity keeps the last three routes. | foundation | 4 | XL | motion-10 (ph.3), shell-11 | Needs X24. |

(L11, the unified verdict model, and L15, Base UI / Daylight, became decisions D27 and D20/D21. They are principles to apply incrementally, not tickets.)

---

## Decisions for the user

| # | Question | Recommendation | Why |
|---|---|---|---|
| D1 | Where is home, and where does everything live? | **"/" is Home**: sign-in, sign-up and `start_url` all land there. Until X10 ships, `/` keeps redirecting to `/search`, so nothing waits. <br>Destinations under five tabs: <br>• **Recipes:** Cellar "Bar" segment plus a search section. <br>• **Tier lists:** pinned at the top of Me›Lists, plus a Home "Friends ranked" card. <br>• **Rankings:** Me›Lists "Top rated" plus the item taste header. <br>• **Favorites:** "Loved". <br>• **Friends:** Me, with a badge. <br>• **Brands:** from item pages and search. <br>• **Scans and Discoveries:** Home inbox plus the Map sheet. | There are two homes today. Without an explicit map, five tabs would orphan features (shell-6, coherence-4). |
| D2 | Parity 2: the Your/Shared split | **Reverse it** (X11). | A new user's first screen is strangers' cellars (coherence-7). |
| D3 | Parity 1: the /cellars/[id] overview | **Merge it into the cellar home** as "Open now". | cellars-3. |
| D4 | Parity 2 and 14: Add entry / delete; the UI-only lock | **Keep both. The lock becomes "Arrange".** | coherence-14, coherence-23. |
| D5 | Parity 3: one review per person | **One rating per thing plus many logs.** | coherence-15. |
| D6 | Parity 4 and 5: recipe Stop; menu Accept/Reject | **Keep both. Accept/Reject is the universal confirm.** | coherence-14. |
| D7 | Parity 6: the /{type}s indexes | **Drop the indexes. Keep edit**, in the overflow menu. | coherence-16. |
| D8 | Parity 7: dropped item-page pieces | **Restore Item.checkIns now.** Add a one-tap brand correction only. The gallery comes later. | coherence-17. |
| D9 | Parity 8: recipe availability, heart, semantic search | **Rebuild availability for real; semantic search inside universal search; Love replaces the heart.** | coherence-18. |
| D10 | Parity 9: search tabs and the cap | **Restore them as sections**, after N01. | coherence-19. |
| D11 | Parity 10: place want-to-visit / G22 | **Revive want-to-visit as Want to try. Drop G22. No third rating scale.** | map-11. |
| D12 | Parity 11: G32 | **Keep** (it already works). | coherence-21. |
| D13 | Parity 12 and 13: counts and order | **Count bottles; order your cellars by activity.** | coherence-22. |
| D14 | Parity 15: geolocation | **Ask on demand**, with a pre-prompt. | coherence-24. |
| D15 | Parity 16: categories | **Add the retail slugs; keep one taxonomy.** | coherence-25. |
| D16 | Parity 17: Places budget | **Configure one with alerting.** Show a calm "details pending" otherwise. | coherence-26. |
| D17 | Parity 18: failed AI calls | **Release the reservation when no response arrived. Retries are free. Settle on any response.** | budget.ts:334. |
| D18 | Parity 19: G22, G29, G30 | **Drop G22. G29 first, after the recipe data step. G30 later.** | coherence-27. |
| D19 | Parity 20: social-first sign-in | **Ratify.** Fix returnTo (X17). Apple sign-in later. Remove the dead `/forgot-password` and `/verify` entries. | coherence-28, shell-20. |
| D20 | Component platform | **Stay on Joy behind app primitives.** Joy is the at-risk dependency: it is paused at `5.0.0-beta.52`. So primitives with no Joy counterpart (BottomSheet logic, Toast, SegmentedControl, LabelPlate, Score, ActionBar) are **Joy-free from day one**, on CSS variables plus framer-motion 14.0.0. A future swap then touches only the Joy-wrapped inputs, menus and modals. Re-implement on a headless library only if Joy breaks on a React or Next major. | visual-5. Users see primitives, not libraries. |
| D21 | Colour scheme and accent | **Dark is the brand default. Brass becomes the action accent in one global PR; teal means AI only.** Daylight only on evidence. | visual-3, visual-17. Avoids weeks of teal meaning both "action" and "AI". |
| D22 | Recipe visibility | **Private first**; AI output is a draft. | recipes-4. |
| D23 | Bar pantry | **Separate from cellars**: about 30 toggles. | recipes-15. |
| D24 | Private vs missing pages | **Keep the non-oracle copy.** | shell-10. |
| D25 | AI tiers | **Detect capability at install.** Label reading, menu extraction and text work locally. **No pre-extraction classifier call.** Never auto-commit a new catalog item. | ai-capture-19, ai-capture-3. |
| D26 | Scroll model | **Keep the inner scroller.** Custom pull-to-refresh plus re-tap to top. | motion-13. |
| D27 | Unified verdict model (was L11) | **Adopt Save / Log / Rate / Love as a principle**, landing it through X23, X02 and X08. Migrate recipe votes only with usage data. | coherence-1. |
| D28 | Place moderation after async creation | **A rejected or unreviewed place is creator-only and `pending`**, with a visible "Under review". It never appears on the shared map until approved. | Async creation must not silently drop the existing `approved:false` gate (`place-creation-actor.ts:401-405`). |
| D29 | Drinking windows | **Deterministic only**: a style and shelf-life table labelled "typical for <style>", plus the user's own dates. No model-estimated windows. | A model window is the same "quietly plausible number" as valuation (seams.ts:16-22). |

## Keep (strengths the overhaul must not destroy)

- **Abstention-first AI seams**, and the "configured or loudly broken, never quietly plausible" rule (seams.ts:1-37). The same goes for place review: "never a fabricated approval" (place-creation-actor.ts header).
- **The extraction merge** fills only empty fields and reports what it skipped (extraction-merge.ts:195-282).
- **Client-minted idempotent ids** everywhere: check-in, add-to-cellar, onboarding, menu scan, recipe job, create-place.
- **The recipe-photo job UX** (stages, Stop, stalled, 5–10 s), as the template for all async AI.
- **The menu-match bands** (≥0.9 / 0.4–0.9 verifier / <0.4) plus human Accept/Reject.
- **The particle bottle and the LiquidBackground**: the brand moments.
- **Server rendering**: about 200–260 ms to content, CLS ≈ 0, no overflow at 375/390.
- **One parameterised Item model.**
- **Server-side privacy**, with no existence oracle.
- **The social primitives**: co-owned cellars, "who drank with you", mixed item/place tier lists, a privacy-correct feed.
- **The tier-list engine** (dnd-kit, optimistic reorder with rollback, KeyboardSensor) and the insights persona card.
- **The graceful photo-search degradation copy**, and the "Auto-filled from pin" chip (now the seed of AIDraftField).
- **AnimateIn's rule**; the existing reduced-motion handling.
- **The PWA plumbing** and the install dialog's platform branching.
- **The per-type illustrations**, moved to empty states.
- **Bounded enrichment**, attribution, Overture loading and the duplicate-place check.
- **VirtualGrid scroll restore**, and the barcode → ExistingItems fast path.

## Don't build (and why)

- **Valuation or AI price estimates**: an LLM number is the "quietly plausible" output the seams forbid.
- **Model-estimated drinking windows**, for the same reason (D29).
- **A pre-extraction "capture classifier" call**: a full model round trip on the shutter→draft critical path, when every image seam already opens with imageDescription and a legibility verdict.
- **Percentage taste-match or "For you 87%" badges** from cosine similarity over a handful of ratings. Show grounded reasons instead.
- **Rack maps** for now; a free-text location field covers it.
- **Volume badges, drink-count streaks, leaderboards** (responsible-drinking risk).
- **An expert feed**; **email-forward import** (no email, D19); **"tapped nearby" alerts from others' scans** (owner-only).
- **An open-ended chatbot or tool-calling assistant** before its building blocks exist.
- **iOS-impossible features**: widgets, Live Activities, Share Target, vibration.
- **TikTok/video recipe import**.
- **Per-tab stacks and a custom edge-swipe back**.
- **A Material UI 7 migration**.
- **Capability flags for features that don't exist yet**.
- **An AI "People say" summary** before items routinely have 3 or more reviews.
- **A second 1–10 score** from pairwise ranking.
- **Committing or editing inside another worktree** (e.g. to "rescue" stranded code). Archive it read-only, or ask the user.

## Sequencing and critical path

1. **Wave 1 (weeks 1–2): S-sized correctness plus guardrails.**
   - N01, N02 (with N19 first or in the same PR), N03, N04, N06a, N10, N11, N13a (on N27), N22.
   - Guardrails: N05 (eval set) and N20 (mobile e2e), so every later claim of "better" is a number.
   - N29 records the decisions.
2. **Wave 2 (weeks 3–4): foundations and the first visible change.**
   - Foundations: N07 (typed AI outcomes, before any inbox or push); N08 (hybrid retrieval, measured on N05); N09 (bounded place create).
   - Interaction: N12 (tap acknowledgement and labels); N26 (AppBar).
   - **The first screen that visibly changes: N13b + N28 (BottleCard on LabelPlate v0).**
   - Capture and first run: N21 (two cameras and a real ending); N15 (first run); N30 (rating control); N17.
   - **Track B starts with B01**: tokens, and the brass flip as one PR if N11 didn't do it.
3. **Early Next (weeks 5–6):** X11, X23, X24, X27.
4. **Month 2: the core loop.**
   - **X02 is the critical-path migration.** Pour, "I'm having this", the feed, recap and profile all sit on it.
   - In parallel: X01 (tabs, mapping, ＋ chooser) and X05 (snap-once) → X06. X04 and X09 make the cellar and item pages bottle-state first.
   - Track B: B02, then B03.
5. **Month 3: coherence and growth.** X10, X12, X14, X15, X16, X17, X18, X19, X20. Track B: B04, then B05 (after N12 and X24), then B06.
6. **Later.** L01–L12.

**Critical paths:**
- Capture: N19 → N02, then N21 → X05 → X06.
- Menus: N05 → N08 + N06a → X07 → L10.
- **The longest pole:** X02 → X03, X07, L03, L04.
- Growth: X17 (returnTo) → L04.
- Motion: N12 + X24 → B05 → B06.

Small fixes never wait for Track B. Track B never restyles a page without a primitive behind it.

---

## Appendix: refuted or already-existing findings

- **coherence-21**: G32 already behaves as recommended; only "run on the front label" survives, inside N21 and X05.
- **"Rankings Friends scope shows strangers"**: refuted; the rows were authored by Riley's friend (05-search.spec.ts:333-337).
- **"Check-in shows no visible change"**: refuted; a dated avatar row appeared (flows/03/13→14).
- **"The board collapses under the finger during tier drag"**: refuted; bands have min-heights.
- **"The matcher should embed search_name"**: it already does.
- **"Restore beverage-specific place categories"**: they already exist; only the retail slugs are missing.
- **"Brand is uneditable"**: the mutations exist; only the UI is missing.
- **"Auto-link brand and barcode on capture"**: already done at create.
- **"Build a formatting module"**: it exists, but isn't wired into tier lists.
- **"Password reset flow"**: deliberately absent (decision 20).
- **"'This cellar is private, ask Riley' copy"**: rejected, because it would create an existence oracle.
- **"BUDGET_DENIED silently ignored"**: that is the correct behaviour.
- **"Country/Region/ABV blank because inference is forbidden"**: those values are printed on the label; the blanks are transcription misses.
- **"'Something smoky' ranked Cloudy Bay first"**: invalid evidence; that cellar holds no smoky item.
- **"'3 4 oz'"**: not visible in the cited PNGs; the likely cause is the model output.
- **"The photo pipeline bound tequila to the Negroni gin line"**: e2e residue. The UI defect is still real.
- **"Spirit age/cask captured but not shown"**: those columns don't exist.
- **"Document scroll restores pull-to-refresh"**: refuted on iOS standalone.
- **"Per-tab stacks" and "edge-swipe back"**: infeasible or harmful.
- **"A five-dollar per-user cap"**: per-user caps are request counts.
- **"OPEN_FIRST unused"**: it is the overview's sort.

---

## Critique response

| # | Point | Verdict | What changed / why |
|---|---|---|---|
| 1 | Split N29; the taste-profile rescue is not an unblocker | **Accepted** | Verified: the sibling worktree has `functions/` and a root `src/`, so it is the pre-migration tree. N29 is now decisions only. The code moved to L03 as "archive as a patch, port the presentational components, rewrite the data layer". Committing in that worktree is now on Don't build. |
| 2 | A minimal BottomSheet and Undo Toast in Now | **Accepted, reconciled with #18** | New **N27**. BottomSheet's API and styling are app-owned. v0 borrows Joy Modal only for portal and focus trap; B04 replaces it with framer physics behind the same props. Toast is Joy-free and sits above the tab bar. |
| 3 | A visible quality win in Now: LabelPlate v0 | **Accepted** | New **N28**, paired with N13b. It ships the `itemTypeTokens` module itself, so it doesn't wait for the whole of B01. |
| 4 | Cut capture taps without waiting for X05 | **Accepted** | Verified `machines.ts:73-77` keeps front, back and display separately. N21: display = front, the back label is optional, and the order becomes barcode → front → (back). |
| 5 | The star-rating input | **Accepted** | Verified in the installed `react-simple-star-rating@5.1.7` dist: `aria-hidden="true"`, `touch-action:none`, `onPointerLeave`. New **N30**. |
| 6 | An offline eval set before N08 and N14 | **Accepted** | New **N05**, in wave 1. N08 and X04's cutoff are judged on it. |
| 7 | N09 drops a moderation gate | **Accepted, with a refinement** | Now's N09 is the S fix: an ~8 s timeout onto the **existing** `review: null` path (the actor already treats "no model ran" this way), plus a converging retry on the same `placeId`. The explicit rejection gate stays synchronous. Insert-first moderation moved to **X27**, with D28 defining a creator-only `pending` state. |
| 8 | The brass/teal switch as one global flip | **Accepted** | N11 either is the flip or uses dark ink until B01's single flip PR. Its test covers brass with `#1A1408`. Teal arrives only as `--ca-ai` with AIDraftField (D21). |
| 9 | One AIDraftField, introduced in N19 | **Accepted** | N19 ships `AIDraftField source=…` and migrates the pin chip. X05 adds `confidence`; X19 uses `source="suggested"`; B02 only restyles. |
| 10 | Tab work duplicated; ＋ coupled to X05 | **Accepted** | Labels and prefix live only in N12. X01's ＋ opens a chooser sheet over today's flows; X06 replaces it. |
| 11 | Where Recipes, Tier lists and Rankings live | **Accepted** | An explicit mapping in D1 and X01. |
| 12 | Replace the serial captureClassifier | **Accepted, refined** | No classifier call. Rather than parsing free-text `imageDescription`, the itemDefaults abstention prefix gains an optional `surfaceKind` enum, declared before the values (generation order). Still zero extra calls. The classifier budget kind is dropped. |
| 13 | Remove the AI drink-window seam | **Accepted** | L02 is deterministic, labelled "typical for <style>", and user dates override it. New D29 and a Don't-build entry. |
| 14 | Predicted affinity as reasons, not percentages | **Accepted, gone further** | X07 shows grounded chips only. L03 shows agreement as counts ("7 of 9 shared wines") above a minimum-overlap gate, never a cosine %. |
| 15 | Fix sizing; split overloaded Now items | **Mostly accepted** | N13 → N13a (S, data loss) and N13b (M). N06 → N06a (truth); readability became X07's first slice. N15's split sections moved to X11. N14, N18, N24 and N25 moved to early Next or into Next items. Now is two waves; wave 1 is all S apart from N06a. **Not fully met:** Now is still 26 items (17 S, 9 M), because the critique's own additions (N05, N20, N27, N28, N30) land here. The plan states the parallelism it assumes, and the fallback if work is single-threaded. |
| 16 | Mobile-viewport e2e in Now | **Accepted** | New **N20**, with a note not to create places (the shared 25/day cap). |
| 17 | Where "Home" is before X10 | **Accepted** | All landings go to `/`, which keeps redirecting to `/search` until X10 changes what it renders (D1, X01). |
| 18 | Touch hygiene; Joy-maintenance risk | **Accepted** | N12 gains callout, user-select, tap-highlight and 44 pt targets. D20 and the design brief now name Joy as the at-risk dependency, and require that primitives with no Joy counterpart are Joy-free (framer-motion 14.0.0 confirmed in `services/client/package.json`). |
| 19 | Cheap delight before the B06 chain | **Accepted** | Immediate particle mount → N21. Scan Complete auto-advance → N06a. |
| 20 | A testable N02 criterion; the N02→N19 dependency | **Accepted** | N02's acceptance criterion and test location are written in (`adapter.test.ts`, the E2c guard describe). N02 depends on N19, which moved into wave 1. |
