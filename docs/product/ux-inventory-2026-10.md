# Phase 0 inventory: Cellar Assistant (ux-review-inventory, 2026-10-05)

Repo root: /Users/jaredprather/workspace/cellar-assistant/.claude/worktrees/app-review-improvement-plan-8072ba (client = services/client/src). V = verified in code, I = inferred. Nothing was run in a browser.

There are 66 page.tsx under (authenticated), plus `/`, `/sign-in`, `/sign-up` and `/~offline`.

## 1. Route map (ORPHAN = no in-app link reaches it)

### Cellars and bottles
- `/cellars`: every visible cellar (own, co-owned, friends', and public ones) mixed in one list, newest first. Edit pencil and per-type counts on each card, plus "Add cellar". Reached from nav item 1.
- `/cellars/add`: CellarForm (name, privacy, co-owners), then redirects to `/items`.
- `/cellars/[id]`: overview page with a bottle preview, a one-tap Check in per card (CellarOverviewItems → cellar-api/CheckInButton) and check-in history. **ORPHAN.** Cards, breadcrumbs and redirects all go to `/items`, so **the main check-in surface is unreachable.**
- `/cellars/[id]/edit`: edit the cellar; only the creator can delete.
- `/cellars/[id]/items`: the main cellar view.
  - 300 ms debounced semantic search, type toggles with counts, Add item, and a virtualized ItemCard grid of non-empty bottles.
  - Has the app's only loading.tsx and error.tsx outside recipes.
  - No sort control, though the API supports ADDED_*, OPEN_FIRST and PERCENTAGE_*.
- `/cellars/[id]/items/add`: six type cards (AddItemClient).
- `/cellars/[id]/{type}s/add` (×6): OnboardingWizard into this cellar.
- `/cellars/[id]/{type}s/[bottleId]` (×6): the bottle page.
  - Sections: camera photo, details and favourite, characteristics (sake/tea only), share/QR, recipes (sake/tea only), brands, reviews.
  - Check-ins appear only after the bottle is opened (`CellarItemPageView.tsx:107`).
  - Remaining slider ("Open it!", %, empty).
  - Header: tier list and delete.
- `/cellars/[id]/{type}s/[bottleId]/edit` (×6): edit the item from the bottle page.

### Item catalog and onboarding
- `/{type}s` (×6): ItemTypeIndex. It actually shows the viewer's favourites of that type, plus an Add button. Reachable only from a breadcrumb crumb.
- `/{type}s/[itemId]` (×6): the item page (ItemPageView).
  - Sections: image, share/QR, details and favourite, characteristics (sake/tea), "Located in" cellars, "On lists", reviews, brands.
  - "Used in recipes" appears for wine, sake and tea only, **not spirits**.
  - Header: add to cellar, add to tier list, edit.
- `/{type}s/[itemId]/edit`: the item edit form.
- `/add` and `/add/[itemType]` (plural, `/add/wines`): create a catalog item **outside any cellar**. Reached from search's "Add an item".

### Map, places and menu scans
- `/map`: full-screen MapLibre with an xstate machine.
  - Asks for geolocation on load.
  - Hybrid semantic place search with a typewriter placeholder.
  - Filter popover: categories, visited, rating, tier lists.
  - Place drawer, which on mobile is a hand-rolled drag-snap bottom sheet: favourite, visited, share, tier list, details.
  - Pin-placement mode for create-place, and a map dark toggle.
  - Deep links: `?placeId`, `?tierLists`.
- `/map/create-place?lat&lng`: reverse geocode, Google suggestions, duplicate check; an AI place review runs server-side. Reachable only through pin placement.
- `/places/[id]`: tabs Menu / Camera Scan / Info, plus enrichment, favourite/visited, tier lists, share and "view on map". This is **the only place a menu scan can start**.
- `/map/scans`: scan history. **ORPHAN.**
- `/map/scans/[scanId]`: lines by category, with AI match suggestions to Accept or Reject.
- `/discoveries`: tabs Pending Matches (AI menu matches) and Saved Places (the only list of favourited and visited places). **ORPHAN.**

### Recipes
- `/recipes`: "Recipe Groups" grid with KEYWORD search only (semantic recipeSearch exists in the API but no UI uses it), category and base-spirit filters. It is in the "…" overflow on phones.
- `/recipes/groups/[id]`: the canonical version, plus "View all N versions".
- `/recipes/groups/[id]/versions`: tabs with up/down votes.
- `/recipes/[id]`: ingredients, instructions, variation chips, share, reviews.
- `/recipes/ai-generator`: photo to one recipe, as an async job with stage progress, Stop and a stalled state. **ORPHAN, and the only way to create a recipe.** There is no manual recipe form.

### Social and taste
- `/favorites`: favourited ITEMS only, filterable by type.
- `/rankings`: top items by average review, with ME/FRIENDS scope.
- `/tier-lists`: own, friends' and public lists mixed together.
- `/tier-lists/add`: create a list.
- `/tier-lists/[id]`: dnd-kit board (250 ms touch press-delay), Add entry modal, lock (UI-only), share, map link, and an AI insights panel.
- `/tier-lists/[id]/edit`: settings and delete.
- `/brands` and `/brands/[id]`.
- `/friends`: requests and search by name.
- `/users/edit`: **display name only**.
- There is NO user profile page, and no "my reviews" or "my check-ins" view.

### Shell
- `/` redirects to `/search`, so **search is the de-facto home**. The landing view has:
  - a greeting, a stats line and the search box (debounced, no submit button);
  - barcode and photo buttons;
  - five quick-link chips (Cellars, Map, Tier Lists, Favorites, Rankings);
  - Recent Activity, and Nearby Places (only if a geo cookie exists).
  - Results are items only, capped at 10.
- `/sign-in` and `/sign-up`: social-first (Google, Discord, Facebook); the password form is collapsed in production. There is a LiquidBackground animation.
- `/~offline`: static, with hardcoded colours. Navigations are NetworkOnly, so **nothing is viewable offline**.
- InstallPwaDialog is a modal shown on every authenticated page on first visit; "remind later" lasts 7 days.

## 2. Navigation shell
- Files: `components/common/SideNavigationBar.tsx`, `app/(authenticated)/layout.tsx`, `ConditionalPaddingWrapper.tsx`, `HeaderBar.tsx`.
- Desktop: a left icon rail with 9 icons and hover tooltips (Cellars, Search, Map, Tier Lists, Rankings, Favorites, Recipes, Brands, Friends), and an avatar menu.
- Mobile: the same Sheet becomes a bottom bar via `column-reverse`. It shows `floor((width−120)/60)` icons, which is **4 at 375–390 px** (Cellars, Search, Map, Tier Lists), then "…", then the avatar.
  - Rankings, Favorites, Recipes, Brands and Friends are hidden in the overflow.
  - **No text labels.** Tooltips need hover, so they are useless on touch.
  - The active state is an exact pathname match, so **no tab is highlighted on sub-pages**.
- There is no app bar. HeaderBar breadcrumbs appear on about 10 surfaces; other pages use an ad-hoc h1/h2.
- **No Back button anywhere** except CreatePlaceForm and MenuScanResults, which is a problem in an iOS standalone PWA.
- Breadcrumb bugs:
  - the "Profile" crumb on `/users/edit` links to `/users`, which is a 404;
  - "Home" goes to `/` and redirects;
  - slug crumbs are title-cased ("Ai-generator", "Tier-lists").
- Layout risk (I): several pages set `height: 100dvh` inside a root that already reserves safe-area padding and the bottom nav: map/page.tsx:24, map/layout.tsx:21, map/scans/page.tsx:9, places/[placeId]/page.tsx:35, discoveries/page.tsx:10, SearchResultsList.tsx:106, PlaceDetailsDrawer.tsx:359. This is likely to clip under the bottom bar.
- Missing from primary nav: a global "+"/capture action, check-in, discoveries, scans, the AI recipe generator, a profile/me hub, saved places, and notification or friend-request badges.
- Taps at 375 px:

  | Task | Taps |
  |---|---|
  | Add a bottle | ~10 (cellar → Add → **choose type by hand** → barcode or skip → front, back and display photos → sync "Analyzing…" → review → Save → Done) |
  | Check in | 5–6, and the bottle must first be "opened" |
  | Find a place | 2 + typing |
  | Search | 1 + typing |
  | Make a cocktail | 3 + typing (… → Recipes); no "what can I make" |

## 3. Concepts
- "How much do I like this" is split across **seven** mechanisms:
  - item favourite;
  - place favourite (a separate store, invisible from /favorites);
  - review (0–5 in 0.5 steps plus Lexical text; ONE per user per item, ever);
  - tier-list band (0–5);
  - rankings (an aggregate of reviews);
  - recipe up/down votes AND recipe star reviews;
  - place `rating:Int` (API only).
- A check-in is a TIMESTAMP ONLY: no score, note, place or photo (`schema.graphql:885`). Logging the same wine twice is impossible as a review.
- `/{type}s` sounds like a catalog but shows favourites.
- The item page and the bottle page show the same wine with different sections. Brand section titles disagree (`components/item/itemViewConfig.ts`):

  | Type | Item page | Bottle page |
  |---|---|---|
  | Wine | "Wine Brands" | "Wineries" |
  | Beer | "Breweries" | "Beer Brands" |
  | Spirit | "Distilleries" | "Spirit Brands" |
  | Tea | "Tea Brands" | "Brands" |

  The brands column also flips sides between the two pages.
- There are two "add" entry points: `/add`, which creates an item with no cellar, and the cellar add flow.
- "Discover" is split four ways: Discoveries, Recent Activity, Nearby Places and the map.
- Recipe vocabulary is heavy: groups, versions, canonical, Top version, Community pick.
- `/cellars` and `/tier-lists` mix mine with others' and don't separate them.
- Six-type inconsistencies:
  - Recipes show for wine, sake and tea on the item page, but only sake and tea on the bottle page, and **never for spirits**.
  - The characteristics card exists only for sake and tea.
  - Required fields differ by type (`item-api/itemFormRules.ts`).

## 4. AI seams (services/actors/src/lib/ai/seams.ts)
- Provider: `AI_PROVIDER` is one of ollama, vertex-ai, google-ai or openai-compatible. **When it is unset, every seam throws.** Each call is metered by BudgetActor, and BUDGET_EXCEEDED has no dedicated UI.
  - Ollama models: gemma3:4b (low and medium), gemma3:12b (high), nomic-embed-text.
  - Vertex / Google AI: gemini-3.x flash-lite/flash, gemini-embedding-2.
- **SHARED STACK ON 2026-10-05 RUNS AI_PROVIDER=ollama** (host models gemma3:4b and nomic-embed-text only). Photo search therefore answers IMAGE_SEARCH_UNAVAILABLE by design. That is not a bug.
- The seams:
  - **Text embedder**: `/search`, cellar semantic search, map place search, AddEntryModal. `recipeSearch(semanticQuery)` has NO UI. Sync.
  - **Document embedder**: item and recipe vectors, via the outbox. Async and invisible.
  - **Image embedder (G32)**: the `/search` Photo button and the onboarding display-photo match. Needs Gemini/Vertex.
  - **itemDefaults** (ItemOnboardingActor.start): reads the front and back labels (plus barcode) and returns attributes, confidence and brandName. It abstains on an illegible label.
    - The call is SYNC on the "high" tier, while the AnimationShowcase particle animation shows "Analyzing…".
    - A failure gives confidence 0 and an empty form.
    - Quick-add appears at confidence ≥ 0.9.
  - **menuExtraction** (MenuScanActor): async via the outbox; the client polls every 2.5 s, then goes to `/map/scans/[id]`.
  - **menuMatchVerifier**: async, producing Pending Matches with Accept/Reject.
  - **recipePhotoExtractor**: async job with progress and Stop. It lives on the orphaned generator and produces one recipe per photo.
  - **insightsGenerator** (tier lists):
    - triggered through the outbox, needs ≥ 3 entries, throttled to once per 24 h;
    - the panel polls 15 s × 8;
    - "Generating Insights" may show **indefinitely** (`:103`).
  - **placeReviewer** (create-place): sync. **`suggestedCategories`, `rejectionReason` and `flags` are never shown in the UI.**
- Where users still type or choose by hand although AI could do it:
  1. Choosing the item type before the photo. The label could classify it.
  2. The barcode step comes first and must be skipped. The label photo could yield the barcode.
  3. Three separate photo steps (front, back, display). One photo could serve all three.
  4. Brand picking, although `brandName` is already returned.
  5. Review and score are typed from scratch; check-ins capture nothing.
  6. Tier-list placement is manual, and insights' "try this next" is plain text, not linked items.
  7. Place name and category are typed; the AI's suggestedCategories are discarded.
  8. Recipes: no semantic search UI, no "what can I make" (G29), no recipe from text, the generator is orphaned with one recipe per photo (G30), and no recipes shown for spirits.
  9. Menu scan lines cannot be added to a cellar, tier list or want-to-try list. Scans start only from a place page, and `placeHint` is never sent.
  10. Search is items only (10 results): no places, recipes, brands or people.
  11. No sort in the cellar view.
  12. No "re-read label" on item edit.

## 5. Motion and visual baseline
- **Theme** (ThemeRegistry.tsx, 54 lines):
  - Joy `extendTheme` overrides ONLY the dark palette: neutral purple-grey, `background.body #111015`, primary muted teal (`500 #70a3a9`).
  - `defaultColorScheme="dark"`, so both modes render dark. **There is no light theme.**
  - No typography, radius, shadow, spacing or motion tokens.
  - Inter is loaded twice (`@fontsource` and `next/font`).
  - Joy UI 5.0.0-beta.52 is a beta that MUI has largely stopped developing, which matters for any overhaul.
- **framer-motion 14** is used in 8 files:
  - `search/motion-variants.ts`;
  - ClientSearchInterface (scanner modal);
  - RecentActivity and NearbyPlaces (staggered entrances, reduced-motion aware);
  - AnimatedPlaceholder (map search);
  - PlaceDetailsDrawer (bottom sheet with hand-rolled drag snapping);
  - SearchResultsList (spring);
  - MapFilter (popover).
  - `search/AnimateIn.tsx` uses CSS keyframes.
  - There are other ad-hoc CSS transitions in LiquidBackground, recipe and tier-list cards, BarcodeScanner, CameraCapture, MapControls and PlaceDetails.
  - **No route transitions, no shared-element or layout animation, and no haptics.** The drawer, MapFilter and AnimationShowcase ignore `prefers-reduced-motion`.
- **AnimationShowcase.tsx** (850 lines, a canvas particle morph through drink silhouettes) is live, but only inside onboarding. It is the app's single delight moment.
- **Loading:**
  - only 2 loading.tsx files and 1 error.tsx; no not-found or global-error;
  - 55 files are force-dynamic, so a tap shows nothing until the server responds (I);
  - map, place, scans and discoveries pages use plain "Loading…" text;
  - search sections use `fallback={null}`, so content pops in;
  - toasts exist only on map places and tier lists.
- **Hardcoded colours:** 89 hex literals and 54 rgb(a) calls, concentrated in map/constants/colors.ts, CategoryDonutChart, POISymbolLayer, tier-list band constants and the offline page.
- Heading levels are inconsistent.

## 6. Dead ends and open decisions
- **Orphans:** `/cellars/[id]`, `/map/scans`, `/discoveries`, `/recipes/ai-generator`; `/{type}s` is reachable only by breadcrumb.
- **The API supports these but the UI never shows them:**
  - recipeSearch (semantic);
  - the PlaceReview fields: suggestedCategories, rejectionReason, flags;
  - the PlaceInteraction fields: rating, notes, tags, wantToVisit;
  - place favourites outside `/discoveries`;
  - cellar sorts;
  - Item.checkIns, the item gallery, brand link/unlink, the barcode field;
  - brand, people and recipe search on `/search`;
  - `menu_item_recipes` and `place_menus`;
  - a manual recipe create/edit form;
  - an avatar or profile.
- **e2e runs DESKTOP ONLY** (1440×900), so no mobile viewport is tested.
- **Open decisions** in `docs/archive/nhost-migration/ui-parity-decisions.md` §"Awaiting the user", items 1–20. In brief:
  - 1–6: new-only features that were kept;
  - 7–11: features that were dropped (gallery, brand link, check-ins list, semantic recipe search, search tabs, the place notes panel);
  - 12–16: behaviour choices (empty bottles counted, geolocation on load, lock is UI-only);
  - 17: is there a Google Places budget?
  - 18: should failed AI calls count against the budget?
  - 19: G22, G29 and G30 — build or drop?
  - 20: social-first sign-in.
  - Also `ui-parity-inventory.md` §11 Q9 (scan entry point) and Q15–18.

Key files:
- SideNavigationBar.tsx, breadcrumbs.ts, (authenticated)/layout.tsx, search/page.tsx
- item/itemViewConfig.ts, item/CellarItemPageView.tsx
- OnboardingWizard/{machines.ts,ItemOnboarding.tsx,index.tsx}
- providers/ThemeRegistry.tsx
- actors lib/ai/{seams,install,config}.ts
- docs/archive/nhost-migration/{ui-parity-decisions,ui-parity-inventory,LEGACY-RESTORE}.md
