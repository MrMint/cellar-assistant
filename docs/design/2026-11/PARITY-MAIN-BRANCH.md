# Parity: main jobs vs branch jobs

Date 2026-11-23. Shas: main `d3a5b1e9`, branch `987681bc` (the inventory's label), worktree HEAD `a68fb8bb`.
Inputs: `docs/design/2026-11/JOBS.md` (main M-001..M-321, branch B-001..B-643), plus a source check of the branch in `services/client/src` and main at `/Users/jaredprather/workspace/cellar-assistant/services/client/src`. Both inventories are source-read, not run, so every `reach` value is an estimate.

## Counts per verdict (main's 321 jobs)

| verdict | jobs |
|---|---|
| Gone | 8 |
| Harder to reach or reduced | 28 |
| Not sure | 2 numbered, plus 3 unnumbered |
| Orphan on main (not reachable on main either, so not counted as lost) | 25 |
| Moved, same or easier | 258 (321 minus the rest) |

The 258 is a remainder, not a row-by-row check. Areas I read in detail are named in the Moved section.

## Gone

| main id | main surface | job | what I checked on the branch |
|---|---|---|---|
| M-068, M-082 | item page and bottle page share | Show a QR code and link modal ("Link to item page") when the system share sheet is missing or dismissed | Branch `components/item/ItemShare.tsx:22-23` says the QR fallback went with the change. There is no QR component. Only `useItemShare` (system share sheet, else copy link) remains (B-123, B-477). Main's `ItemShare.tsx` has the `QRCode` modal. |
| M-249 | tier list view | Lock or unlock tier-list editing | `components/tier-list/fragments.ts:12` says the padlock is retired. `components/tier-list/actions.ts:24` says the lock is gone and Arrange replaces it. Main `TierListViewPage.tsx` has `isEditingLocked` and `MdLockOpen`. Replaced by Arrange mode (B-415) rather than lost in effect, but the lock itself is gone. |
| M-093, M-094, M-095 | `/{type}s` index pages | Per-type index (wines, beers, spirits and so on) | `app/(authenticated)/wines/` holds only `[itemId]`. No `page.tsx`. They were breadcrumb-only on main. The type filter lives on Loved (`/favorites`, `CellarItemsFilter` with `?types=`), so M-096 and M-097 are covered. |
| M-106 | capture | Tips card shown during capture | `TipsCard` is defined in `components/common/OnboardingWizard/StepCard.tsx` but nothing imports it (grep shows only `StepCard` used, by `CatalogMatchPrompt.tsx`). |
| M-028 | Home | Filter recent activity by added, reviewed or tier-listed | Branch `FriendsFeed.tsx` has no kind filter (grep for kinds, ToggleButtonGroup and filter found nothing). |

## Harder to reach or reduced

| main id | branch id | job | what changed |
|---|---|---|---|
| M-067 | B-159 | See who checked in this bottle and when | Branch item page has "Your log" only (`ItemPageView.tsx:72`, `Item.checkIns(scope: MINE)`). `checkInFromNode` exists in `item/adapter.ts:457` but no UI lists other people's check-ins. Friends' logs show on Home and a friend's profile (B-357). |
| M-027, M-029 | B-052 | See my own recent activity (adds, reviews, tier placements) on Home | Schema `packages/schema/schema.graphql:9162`: the Home Friends section is "what your friends did, never your own rows". Main's `me.recentActivity` (schema near line 9249) was "done by you or a friend". My own recent activity is no longer on Home. |
| M-111 | B-193..250 | Tap to focus in the camera | `components/capture/CaptureCamera.tsx` has no tap-to-focus. The old `common/CameraCapture.tsx` has it, but only `search/ClientSearchInterface.tsx` and `map/scanning/MenuScanner.tsx` use it now. |
| M-049, M-050 | B-080 | Favourite toggle and count on cellar bottle cards | `BottleCard.tsx:65` says love and reviews live on the item page. Favourite count and toggle remain on favourites, search and ranking grids (`ItemCard/index.tsx`, `shownFavoriteCount`). |
| M-267, M-268, M-269, M-270 | B-622..627 | Brands index and browse | `/brands` has no nav entry on the branch. The only way in is search, then Brands, then See all (`/brands?q=`). Main was 1 tap by rail, or 2 by the phone "…" overflow. Brand detail pages are still reached from the item page, search and sub-brand links. |
| M-277..M-286 (10 jobs) | B-478..528 | Browse the recipe list and open a recipe | Main reach was 1 (desktop) or 2 (phone). Branch is 2 (Cellar, then Bar segment), and opening a card goes from 2 to 3. All the jobs still exist. |
| M-076, M-077, M-078, M-089 | B-121..125 | Add to tier list, edit item, delete bottle, add to tier list from the item page | Moved from header buttons into the item page's More actions overflow. One extra tap, and less visible. |
| M-018 | B-008, B-009 | Breadcrumbs | Breadcrumbs are desktop only (B-009). Phone has Back (B-008). |
| M-025 | B-030, B-063, B-080 | Per-type counts on Home | Home shows total bottles and cellars. Me shows counts of bottles, logs, places and lists. Per-type counts stay on cellar cards only. |
| M-026 | B-062..072 | Home quick-link chips | Replaced by the Me hub (1 tap more for Rankings, Favourites, Friends and Tier lists). |
| M-117 | B-210 | Automatic retry when a label read fails | Replaced by a manual Try again. |

## Moved, same or easier

One line per area. Counts are of main ids, in the 258 remainder.

- Shell and sign-in: M-002..M-009 to B-018..B-025; profile and sign-out M-013, M-014, M-016 to B-073..B-075 (reach 1); install M-019..M-022 to B-011..B-013; offline M-023 to B-014.
- Cellars and items: add to a cellar M-048 to B-105 (reach 3 to 2); opened and emptied dates M-064 to `ItemRemainingSlider.tsx`; pour, log and rate to B-136..B-172; item cellars ("Located in") to `ItemCellars.tsx`.
- Capture and onboarding: M-100..M-128 (less M-106, M-111, M-117) to B-193..B-250.
- Places, map and menus: M-129..M-199 to B-251..B-330. The drink-type filter is kept (`core/MapFilter.tsx:435`), as are clustering (`POISymbolLayer.tsx`) and the user location layer.
- Social and tier lists: friends M-213..M-222 to B-331..B-343; rankings M-223..M-228 to B-387..B-391 (adds an "Everyone" scope); tier lists M-229..M-266 (less M-249) to B-393..B-463; the insights panel is the same as main's.
- Recipes and search: recipes M-277..M-302 (less browse) to B-478..B-528, with ingredient links kept (`ingredientItemHref`, M-295); search M-309..M-321 to B-593..B-621 (Home search pill, reach 1 to 0).

## New on the branch

Counts are of branch ids in each range.

- Home: inbox and AI work tray B-032..041 (10); Continue and Drink soon shelves B-042..049 (8); friends feed B-052..056 (5).
- Me: hub and Stamps B-062..072 (11); recap B-368..380 (13); taste profile B-381..386 (6).
- Friends: profiles, compare, clone B-353..366 (14); invites B-026..028, B-331..333, B-345..351 (13).
- Sharing: share pages and OG cards B-464..477 (14).
- Items: pour sheet, drink log and Your log B-136..172 (37); bottle freshness B-156..158; add-to-cellar extras B-126..132 (7); brew guide and timers B-173..174, B-587..592 (8); Seen at B-182..183 (2); correction panel B-189..191 (3).
- Capture surface B-193..250 (58, mostly a rebuild of main's wizard).
- Places and map: menu line sheet B-318..330 (13); place review panel B-298..303 (6).
- Tier lists: Arrange with undo and redo B-415..425 (11); pairwise placement B-436..444 (9); add-entry suggestions B-426..435 (10); try-next cards B-453..456 (4).
- Recipes: Make mode B-557..571 (15); bar and pantry B-572..586 (15).
- Want to try: B-120, B-286 and others.

## Not sure

| main id | question | what would settle it |
|---|---|---|
| M-046 | Is cellar-level search by meaning still on the branch? | Grep the branch's cellar page for the semantic search input, or run the cellar page. I did not reach it. |
| M-147 | Is there still a map link from a tier list? | Grep `tier-list/` for a `/map` href. Not checked. |
| (unnumbered) | The "who favourited" count and list | Grep the branch item page for a favourite-users list. |
| (unnumbered) | Places from a brand | Check the brand page for a places section. |
| (unnumbered) | Recipe vote undo | Check the recipe vote component for a toggle-off path. |

Orphans on main, not counted as lost: M-051..056 (cellar overview and check-ins), M-200..203 (`/map/scans`), M-204..212 (`/discoveries`), M-303..308 (`/recipes/ai-generator`). The branch redirects `/recipes/ai-generator` (B-538) and has `/discoveries` and `/recap` routes under `app/(authenticated)`.

## Checklist

- Six areas read in both inventories: covered.
- Gone candidates grep-verified: covered (5 rows).
- Harder rows verified against source: covered, except M-025, M-026 and M-117, which rest on the inventory's own wording. **unconfirmed** by running the app.
- The "Moved" remainder: **unconfirmed** row by row. It is the remainder of the count.
- Not sure: 5 items open.
