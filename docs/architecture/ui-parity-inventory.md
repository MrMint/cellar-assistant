# UI parity inventory: production UI (`82450ad1`) vs the rewritten client

**Purpose.** The user has decided that the **original UI is the spec**. The migration rewrote most
pages as new `*-api` components instead of porting them. Any visual overhaul will be a separate,
intentional piece of work. The plan has four steps:

1. This inventory.
2. Close the API gaps.
3. Restore the old components domain by domain, behind thin adapters that turn new API shapes into
   old props.
4. Screenshot parity per route.

This document is input for planning and delegating steps 2–4.

**Measured against.** Old tree: `82450ad1`, the production Nhost/Hasura client at the repo root
`src/`. New tree: `dbc17ec7` (`services/client/src/`, SDL `packages/schema/schema.graphql`,
resolvers in `services/api/src/schema/`). Only `services/actors/src/lib/ai/*` was uncommitted, from
an unrelated agent. Written 2026-10-04.

**How it was measured.** Six read-only analysts each took one domain and read both trees in full:
cellars; items; map/places; recipes; tier lists and rankings; and search, brands, favorites,
friends and the app shell. The synthesis and spot checks are mine. Tags:

- **V**: read in code at the cited path.
- **I**: inferred, not executed.

Nothing here was run against a live stack. Old paths are written `82450ad1:src/…`. New paths are
relative to `services/client/src/` unless stated. Each field/SDL claim in the tables below was read
by the analyst for that domain. I re-checked the most consequential ones myself (marked
"re-checked").

---

## Status (2026-10-05)

This inventory is a snapshot of `dbc17ec7`; the tables below are kept as written, with fixed rows
marked. Since then every domain in it has been restored behind adapters, in this order:

| Wave | What landed | Commits |
|---|---|---|
| API A | counts, filters, profile edges, card fields (G1–G3, G6, G7, G36) | `dd27948f`, `05a02fcd`, `ea121f30`, `603f3955` |
| API B | reverse edges on items, bottles and brands (G8–G11, G14, G15, G23–G25); sake/tea attributes (G12, G13) | `d5af26a7`, `3ea4e037`, `f3ddd309` |
| API C | place, menu-scan and recipe edges (G16, G18–G20, G26, G27) | `2b8f9fb6`, `ad6a400f` |
| 1 — shell | HeaderBar, breadcrumbs, VirtualGrid, EnumSelect, CellarItemsFilter, ItemCard | `6e048434`, `c2dce77e`, `2ce95f9a` |
| 2 — cellars | `/cellars` grid, cellar form, cellar items page, add-item chooser; co-owner save bug | `e3341e09`, `bba49620`, `da1f77af` |
| 3a — items | item, bottle and edit pages; `/add`; `/{type}s` restyled | `f075cda9`, `5179e24d` |
| 4 — onboarding | wizard with camera, barcode and quick add | `5118d90e`, `31603a1a`, `24a99479` |
| 5 — rankings, favourites, brands | `/rankings`, `/favorites`, `/brands` and brand pages | `0f093954`, `026cf37f`, `1b52903d` |
| 6 — tier lists | tier-list pages and board | `9fcae3ab`, `bac44377` |
| 7 — map | map, place, scan and discovery pages | `ca446978` |
| 8 — recipes | recipe pages | `8578d05c`, `75ab7cc5` |
| 9 — search | `/search` | `6f6be2ed`, `391b7f9c`, `33ec5b80` |
| Follow-ups | per-session API token cache and 429 handling; friends placeholder; e2e 09; place-review categories follow the restored form; dead documents and modules removed | `c1948887`, `93dabcc2`, `cd177b96`, `94c8b2ff`, `e70e647b`, `90d1e8e9`, `6d305148`, `a177384b` |

Product questions the evidence did not settle, with the defaults that were implemented, live in
[`ui-parity-decisions.md`](ui-parity-decisions.md), not here.

---

## 1. Summary

### Counts (V)

| | Old (`82450ad1`) | New (`dbc17ec7`) |
|---|---|---|
| `page.tsx` routes | 56 | 70 |
| Old URLs that still resolve | — | **56 of 56** (none missing by URL) |
| New-only routes | — | 14: `/{type}s` ×6, `/{type}s/[itemId]/edit` ×6, `/cellars/[c]/{sakes,teas}/[itemId]/edit` ×2 |
| Component files under `src/components` | 256 in 24 dirs | 98 in 16 dirs |
| Old component dirs with no successor of the same name | — | 17 (beer brand coffee favorites forms item map ranking recipe review sake search shared spirit tea tier-list wine) |
| Client runtime deps | — | 27 dropped in `62d9fdf9`. The ones a restore needs are listed in §8 |

Every URL survived. **Almost no page did.** By domain:

- **At parity already:** `/friends`, `/users/edit`, `/`, `/sign-in` and `/sign-up` (minor copy
  differences), `/~offline`, and the authenticated shell. D8 and D1 rewrote these in place and kept
  the old JSX.
- **Rebuilt with a different UI:** everything else. That is cellars, all six item types, add and
  onboarding, map/places/scans/discoveries, recipes, tier lists, rankings, search, brands and
  favorites.

### Top risks (read these before planning)

1. **The cellar-item URL changed meaning (V).**
   - Old: `/cellars/C/{type}s/[itemId]` took a **`cellar_items.id`**, meaning one bottle
     (`82450ad1:src/app/(authenticated)/cellars/[cellarId]/getCellarItemData.ts`,
     `wine/fragments.ts:285-297` `cellar_items_by_pk`).
   - New: the same segment is the **catalog item id** (`cellar-api/itemTypes.ts:43-50`).
   - Consequences: old bookmarks break, two bottles of one wine share a URL, and the old
     bottle-level page (remaining slider, per-bottle check-ins, display photo) cannot be restored
     without a decision and the API field G10.
   - This decision gates both the cellars and items domains.
2. **Most of the old recipe UI never worked in production (V, re-checked).**
   - In Hasura metadata at `82450ad1`, `recipe_votes` and `recipe_reviews` have **no permissions
     and no relationships**.
   - `recipes` exposes only `createdBy`, `recipe_group`, `ingredients`, `instructions` and
     `recipe_vectors`.
   - So `/recipes/[id]`, `/recipes/groups/[id]` and `/versions` threw on load, and reviews and
     votes could never be written.
   - For recipes, "original UI as spec" can only mean the original *visual design*. Its data
     contract must be built, not restored (§5, Recipes).
3. **The shared building blocks are gone, and every domain needs them.**
   - Components: `HeaderBar`/`ServerBreadcrumbs` (breadcrumbs on every page), `VirtualGrid`
     (cellars, search, favorites, brands, rankings, tier lists), `ItemCard` (cellars, search,
     favorites, rankings, onboarding match), `InteractiveCard`, `ItemTypeIcon`, `EnumSelect` +
     `EnumProvider`, `CellarItemsFilter` (cellars, favorites, rankings), `PageLoading`.
   - Hooks: the whole `src/hooks/` directory.
   - Deps: `@tanstack/react-virtual` and others.
   - These must come first, or six domain agents will each re-port them differently.
4. **`ItemCard` cannot be filled from the API today.** Two fields it shows exist nowhere in the
   SDL (re-checked):
   - the **favourite count** (`item_favorites_aggregate`);
   - the **"you reviewed this" star** (`user_reviews` aggregate).

   Both are needed by four domains: G6 and G7.
5. **The e2e suite is pinned to the new UI's copy and controls.** These would break on a faithful
   restore:
   - `02-cellars`, `03-friends` (one placeholder), `04-onboard-item`, `05-search`,
     `06-map-places` (create-place), `07-tier-lists` (add-entry, band buttons), `08-recipes`
     (vote aria-labels).

   Specs must be rewritten **in the same change** as each restore (§9).
6. **New-only features overlap the old UI.** Each needs a keep/drop call before its domain starts
   (§11):
   - the `/cellars/[id]` detail page and check-ins (the old one was an id-printing stub);
   - per-card bottle controls;
   - in-page tier-list add;
   - search tabs (brands, people, recipes);
   - `/{type}s` index pages;
   - item edit for sake and tea.
7. **Some restores need dependencies back** (§8): `xstate`, `@tanstack/react-virtual`, `recharts`,
   `framer-motion`, `lexical`, `react-webcam`, `barcode-detector`, `react-simple-star-rating`,
   `react-qr-code`, `date-fns`. Whether to re-add them (pixel parity, smallest diff) or approximate
   them is one cross-cutting decision, not six separate ones.

### Present bugs found on the new side (fix regardless of the restore)

| Bug | Evidence (V unless I) |
|---|---|
| ~~A co-owner cannot save the cellar edit form: it always sends `coOwnerIds`, and the actor requires the creator for that (runtime outcome I)~~ **Fixed in `da1f77af`** | `cellar-api/CellarForm.tsx:138-141`, `services/actors/src/actors/cellar-actor.ts:344-346` |
| `/search` collection stats count every *visible* cellar, including strangers' PUBLIC ones and friends' cellars. Old counted own and co-owned only, as distinct items | `search-api/SearchWorkbench.tsx`, `cellars-collection-actor.ts:35` |
| `/map` fetches only the first 100 `mapBrowse` features; `limit` allows 500 via `first`/`after` | `place-api/PlaceExplorer.tsx:274-282` |
| Google attributions are selected but never rendered (old code didn't render them either). Google Places terms require them | `place-api/PlaceDetailView.tsx`, SDL `PlaceEnrichment.attributions` |
| ~~Friends placeholder says "by name or email", but search matches the name only~~ **Fixed in `cd177b96`**: the placeholder now says "name" | `friend/FriendsClient.tsx:343`, `services/actors/src/lib/profile-store.ts:144` |
| Stale "field does not exist" comments: the client still tallies votes and ignores `Recipe.netScore`/`myVote` and `RecipeSearchResult.recipe`, which exist (A7d) | `lib/api/recipes.ts:11-21,386-389`, `recipe-api/RecipeVersions.tsx:57-68` |
| Old review text is stored as `JSON.stringify(LexicalEditorState)`; the new reader likely shows raw JSON for migrated rows (I) | `82450ad1:src/components/common/RichTextEditor.tsx`, `item-api/ItemReviews.tsx` |
| `MenuScansList` never sends `placeHint`. This is a feature gap rather than a bug | `place-api/MenuScansList.tsx` |
| Doc drift: `e4-decisions.md` §6c still says `Brand` has no edges, but A7g (`38f34c9d`) added all four | `e4-decisions.md:780-788` |
| Doc drift: `e4-decisions.md` §6d says the old items page had a "text filter". It was a semantic re-sort, so the real loss is the type filter, the hidden empty bottles and name order | `82450ad1:src/components/cellar/cellarItemsServer.ts:42-56,116-126` |

---

## 2. Route table

Key:

- **Status:** `parity` = same UI; `rebuilt` = same URL, different UI; `new` = no old counterpart.
- **Gap classes:** **A** = AVAILABLE (adapter only), **D** = DERIVABLE client-side,
  **G#** = API gap (§3), **X** = DROPPED-ON-PURPOSE (§4).
- **Effort:** S ≤ 1 agent-session, M 1–3, L 3+. Effort covers the client restore only; API work is
  sized in §3.

### Cellars

| Old route | New route | Status | Old components (transitive) | Old data needs | Gap classes | Keep from new | Effort |
|---|---|---|---|---|---|---|---|
| `/cellars` | same | rebuilt | `Cellars` → `HeaderBar` ("Home / Cellars", Add cellar) → `VirtualGrid` → `CellarCardClient` → `CellarCard` (`InteractiveCard`, edit button for creator/co-owner, `AvatarGroup` of creator + co-owners, six per-type count icons at 0.3 opacity when zero) | id, name, createdBy and co-owner profiles, non-empty count per type | A: id, name, createdById, coOwnerIds. D: canEdit. **G1** per-type counts, **G4** profiles | Relay `myCellars` + Load more; `unwrapResult`/`ApiError`; `cellarRole.ts`; Your/Shared split (decision 10, ask); privacy chip (ask) | M |
| `/cellars/add` | same | rebuilt | `AddCellarClient` → `CellarForm` (RHF; Name; `EnumSelect` privacy, default FRIENDS; co-owner multi-select with avatars; "Add") → `/cellars/{id}/items` | friends | A: `myFriends`, `PermissionType` | client-minted id; `createCellar` union handling | S |
| `/cellars/[cellarId]` | same | **new** in substance | old was a stub printing the id, and breadcrumbs went to `/items` | — | — | New detail page, `CellarCheckIns`, `CheckInButton` (e2e 04 depends on it): **ask** | — |
| `/cellars/[cellarId]/edit` | same | rebuilt | `EditCellarClient` → `CellarForm` (button still says "Add") → `/cellars` | name, privacy, owners, friends | A | Creator-only `DeleteCellarButton`; owner gate; keep non-friend co-owners; set-diff patch. **Fix the co-owner save bug** | S |
| `/cellars/[cellarId]/items` (+ `error`, `loading`, `searchParams`) | same | rebuilt | `CellarItemsControls` (`HeaderBar` breadcrumb, 300 ms `DebounceInput` semantic search, `CellarItemsFilter` type toggles with active counts, Add item) + `CellarItemsGrid` (`@tanstack/react-virtual`, 50/page, eager infinite load, sessionStorage scroll restore) → `ItemCard` | see `ItemCard` below; type filter; active-only; name order | A: semantic order, `Item.score`, `isFavorite`, `toggleFavorite`, subtitle fields, images. **G1, G2, G3, G6, G7**; optional thumbnail G37 | Relay paging + totalCount; `item-ordering.ts` (test-pinned); `68ead15a` refresh-keeps-ordering fix; per-card open/pour/empty/remove/check-in (**ask**) | L |
| `/cellars/[cellarId]/items/add` | same (`AddItemChooser`) | rebuilt | `AddItemClient` (heading, permission note, six `InteractiveCard`s with `@/images/{t}1.png`) | name, owners | A (images still in `src/images/`, imported by nothing) | `addItemHref`; don't link when `!canAdd` | S |

**`ItemCard` data contract** (shared by cellars, search, favorites, rankings and the onboarding
match). Old: `82450ad1:src/components/item/ItemCard/{index.tsx,fragments.ts}`.

| Old field | New equivalent | Class |
|---|---|---|
| name; wine vintage prefix | `Item.name`; `Wine.vintage: Date` | A / D (`slice(0,4)`; old used `date-fns`) |
| `subtitle_field` | `Beer.style`, `Wine.variety`, `Spirit.style`, `Coffee.roastLevel`, `Sake/Tea.category` | D (inline fragments) |
| primary brand | `Item.brands{isPrimary brand{name}}` | D (pick `isPrimary`) |
| `item_images(limit 1)` + `getNhostStorageUrl` | `Item.images(first:1){placeholder file{url}}` (presigned, one `FileActor` call each) | A (costly; G37 optional) |
| `reviews_aggregate{avg count}` | `Item.score{average count}` | A (old `toFixed(2)`) |
| favourite id + insert/delete | `Item.isFavorite` + `toggleFavorite` | A |
| `item_favorites_aggregate.count` | — | **G6** |
| `user_reviews` aggregate (gold star) | — | **G7** |
| href | old was relative `{type}s/{id}` and ignored the `href` prop; use `itemHref()`/`cellarItemHref()` | fix |

### Items (six types; `{type}` ∈ wines, beers, spirits, coffees, sakes, teas)

| Old route | New route | Status | Old components (transitive) | Old data needs | Gap classes | Keep from new | Effort |
|---|---|---|---|---|---|---|---|
| `/{type}/[itemId]` | same (`item-api/ItemDetail`) | rebuilt | `{T}Details` → `ItemHeaderServer` (`HeaderBar`, `AddToTierListButton`, `AddToCellarActions`), `ItemImage` (fallback `{t}1.png`), `ItemShare` (QR), `ItemDetails` (favourite + subtitle), `ItemCellars` ("Located in"), `ItemTierLists` ("On Lists"), `AddReview` (Lexical + stars), `ItemReviews`, `ItemBrands` (per-type title: Wine Brands / Breweries / Distilleries / Roasters / Tea Brands). Wine/sake/tea also: `ItemRecipes` + `CompactRecipeRecommendations`. Sake/tea: Characteristics card. Tea: Flavor Profile + Ingredients cards | core attributes, first image, favourite, 10 reviews with author, cellars holding it, brands, recipe ingredients, tier-list entries, viewer's cellars | A: core, favourite, reviews, images, brands, add-to-cellar (`myCellars`, now including co-owned). **G4** (author), **G8** (tier lists), **G9** (cellars), **G11** (recipes), **G12/G13** (sake/tea attributes), G29 (recommendations) | `Item.isFavorite`; loading-before-unwrap guard (`ItemDetail.tsx:105-115`); one review per user with edit/delete and `ScoreInput` 0.5 steps; creator-only brand link/unlink; image gallery public/private/detach; Edit link; `Item.checkIns` (ask) | M (shared view + per-type config) |
| `/cellars/[c]/{type}/[itemId]` | same path, **param now the item id** | rebuilt | `Cellar{T}Details` → `CellarItemHeader` (tier-list button, Edit always `disabled`, Delete with confirm), `ItemImageWithCaptureClient` (camera, set display image), `ItemDetails`, `ItemCheckIns` (when open; check in, bulk with friends, grouped by day), `ItemRemainingSlider` ("Open it!", debounced %, empty at 0), `ItemShare`, `ItemBrands`, `AddReview`, `ItemReviews` | cellar item (open, empty, %, display image, owners), its check-ins with users, friends, item core | A: `openCellarItem`, `setCellarItemPercentage`, `emptyCellarItem`, `removeItemFromCellar`, `checkIn`, `bulkCheckIn`, `myFriends`, `updateCellarItem.displayImageId`. **G10** (one cellar item), **G14** (per-bottle check-ins), **G15** (display image object), G4 | client-minted `cellarItemId`; upload verify flow | L |
| `/cellars/[c]/{wines,beers,spirits,coffees}/[itemId]/edit` | same, plus `/{type}/[itemId]/edit` | rebuilt | `{T}Form` in edit mode (`EnumProvider` with server-prefetched enums, `EnumSelect`, `BrandPicker`) | `{t}s_by_pk`, update | A (enum keys map 1:1 to `useReferenceOptions`, `items.ts:463-548`). G12/G13 for sake/tea | `ItemEditForm`/`itemFormRules.ts` (test-pinned); `patch.ts` semantics. **Old edit was broken**: it passed a cellar-item id to `wines_by_pk` | S–M |
| `/cellars/[c]/{type}/add`, `/add/[itemType]` | same (`ItemOnboardingWizard`) | rebuilt; **the new wizard has no image input at all** (`ItemOnboardingWizard.tsx:116-127`) | `{T}Onboarding` (xstate `OnboardingMachine`) → `OnboardingWizard` (xstate `pictureOnboardingMachine`: `BarcodeStep`/`BarcodeScanner`, back and front `PictureStep`/`CameraCapture`, `DisplayPictureStep`, `ExistingItems` → `ItemCard`), `QuickAddCard` (15 s auto-confirm at ≥0.9), `ConfidenceIndicator`, `{T}Form`, `FinalPrompt` | label uploads, AI defaults, barcode match, image match, create with barcode + brand, display image, add to cellar | A: `uploadFile(label-front/back)` → `startItemOnboarding`, `ItemOnboarding.defaults`/`confidence`, `barcode(code).items` (all six types), `confirmItemOnboarding`/`createItem`, `resolveBrand`/`linkItemBrand`, `attachItemImage`, `addItemToCellar`. **X: image match** (e4 §6a; G32 if wanted) | outbox poll after confirm (`ItemOnboardingWizard.tsx:189-194`); X11 `attachBarcode` after the poll, with no guessed `barcodeType`; E2c fill-empty-only merge + server `requireExtractableInput`; `ITEM_FORM_RULES` required fields | L |
| `/add`, `/cellars/[c]/items/add` | same (`AddItemChooser`) | rebuilt | `AddItemClient` (six image cards) | cellar name and owners | A | `addItemHref` | S |
| — | `/{type}s` (×6) | **new** | — | — | — | `ItemTypeLanding` (the viewer's favourites of a type). A list-by-type root was declined (`migration-plan.md:1779-1781`). **Ask** | — |
| — | `/{type}s/[itemId]/edit`, cellar sake/tea edit | **new** | — | — | — | Keep (old had no working edit) | — |

Per-type differences (V):

- Old barcode and image matching searched only wine, beer, spirit and coffee.
- Beer, spirit and coffee fetched `recipe_ingredients` but never rendered them.
- Old required fields: wine = name, vintage, style; spirit = name, type. Sake/tea required fields:
  see the `{T}Form` files.

### Map, places, scans, discoveries

| Old route | New route | Status | Old components (transitive) | Old data needs | Gap classes | Keep from new | Effort |
|---|---|---|---|---|---|---|---|
| `/map` (+ `layout`, `actions.ts`, `place-actions.ts`, `searchParams.ts`) | same (`place-api/PlaceExplorer`) | rebuilt | `MapWrapper` → `MapView` → `MapMachineProvider` (xstate `mapMachine`, 888 lines) → `MapLibreRenderer` (`POISymbolLayer`, `SelectedPlaceLayer`, `UserLocationLayer`, `iconLoader`, `geoJsonTransform`), `MapControls` + `MapFilter` + `ItemTypeCategoryMapper`, `SearchResultsList`, `CenterPinOverlay`, `PlaceDetailsDrawer` → `PlaceDetailsContent` → `PlaceMenuItems`/`AddToTierListModal`. Hooks: geolocation, deep link, initial flight, selection, nuqs search params, tier-list filter. Pure config: categories/keywords/scoring/colors | server action `searchMapPlaces` (geocode → hybrid → adaptive cluster); place by id; drawer details; favourite/visited; viewer's place tier lists; enrichment | A: `mapBrowse` (`MapCluster \| MapPlace`), `placeSearch` (global = omit `bounds`), `geocode` (unused by new), `place(id)` for the drawer (A7f: "the drawer fetches the 18 dropped columns by id"), `myPlaceInteraction`/`recordPlaceInteraction`, `enrichPlaceFromGoogle`. D: place tier lists from `myTierLists`. **G18** (matched-item name); G34 (favourite filter). X: cluster diagnostics, address on markers | `mapBrowse` viewport semantics; no `userId` anywhere; `__typename` branching; `layerGate`/latest-only; `useLocateMe` cookie writer (D5c); tier-list gate via `canSeeTierList` | L |
| `/places/[placeId]` (+ `queries.ts`) | same (`PlaceDetailView` + `PlaceInteractionPanel`) | rebuilt | `PlaceDetails` (963 lines; Menu / Camera Scan / Info tabs), `PlaceMenuItems`, `MenuScanner` → `CameraCapture`, `AddToTierListModal`, `ItemTierLists`, `usePlaceEnrichment` | place with current menu, enrichment, interaction, photos, tier lists | A: `Place.*`, `Place.enrichment`, `Place.photos{file{url}}`, `Place.menuItems`. D: interaction via `myPlaceInteraction`; "current menu" (`place_menus` is empty and has no writer). **G18**, **G8** (place half) | `recordPlaceAccess`; enrichment button + bounded poll (never during render); server-computed `visitCount`; interaction superset (`wantToVisit`, rating, notes, tags) | M |
| `/map/create-place` | same (`place-api/CreatePlaceForm`) | rebuilt; Google helpers removed | `CreatePlaceForm` (744 lines), `GooglePlaceSuggestions`, `GooglePlaceSearch`, `DuplicatePlaceCheck`; category Autocomplete | reverse geocode, Google nearby/autocomplete, details prefill, duplicates, create | A: `reverseGeocode`, `googlePlaceSuggestions` (`GooglePlaceSuggestionsQuery` exists but is unused), `duplicatePlaces` (radius ≤5000, limit ≤5), `createPlace`. **G21** (pre-create details prefill, or an alternative sequence). X: client-posted `google_place_id` | client-minted `placeId`; server-side rate limit, duplicate and AI review; `nearbyDuplicates`/`ConflictError`; a stale "no API budget" claim at `CreatePlaceForm.tsx:296` (check) | M |
| `/map/scans` | same (`MenuScansList`) | rebuilt | `ScanHistory` | menu scans + place | A: `myMenuScans` | presigned upload → `createMenuScan(menuScanId)` with verify | S |
| `/map/scans/[scanId]` | same (`MenuScanDetail`) | rebuilt | `MenuScanResults` (lines grouped by category, matched item name) | scan + every extracted line | A: `menuScan`. **G18**, **G19** (all lines, not just suggestions) | suggestion accept/reject; summarised `processingError` | S–M |
| `/discoveries` | same (`DiscoveriesList` + `SuggestionCard`) | rebuilt (old was already broken, §5 `migration-plan.md:621`) | `DiscoveryDashboard` (tabs: Pending Matches / Recent Additions / Saved Places) | suggestions with place context; cellar items by source; saved places + menu counts | A: `myDiscoveries`, `actOnMenuScanSuggestion`. D: saved places (`myPlaceInteractions` + `PlacesByIdQuery`). **G20** (suggestion place context), **G22** (recent additions, ask) | owner-only scope (old scoped to other users' scans, a disclosure leak); `propagated` flag | M |

### Recipes (see risk 2: the old data contract never worked)

| Old route | New route | Status | Old components (mounted, transitive) | Old data needs | Gap classes | Keep from new | Effort |
|---|---|---|---|---|---|---|---|
| `/recipes` (+ `loading`, identical) | same (`RecipeGroupsIndex` + `RecipeSearchPanel`) | rebuilt. The old ilike grid **did** work | `RecipeGroupSearch` → `useOptimizedRecipeGroupSearch` (ilike, 12/page, LRU), base-spirit Select (never reached the query), category Select, hand-rolled `VirtualizedRecipeGroupGrid`, `RecipeGroupCard`(+Skeleton) | groups, recipe counts, canonical summary (never rendered: `canonical_recipe_rel` vs `canonical_recipe`), total, free text | A: `recipeGroups(category, baseSpirit)`, `recipeCount`, `totalCount`. D: canonical summary, spirit options (`referenceData(SPIRIT_TYPE)`; value match unverified). **G26** (group free text); G28 optional | server paging + totals; semantic search with keyword fallback; all five categories; correct `/recipes/groups/{id}` hrefs | S–M |
| `/recipes/[recipeId]` | same | rebuilt (old threw in production) | `RecipeDetails` → `RecipeHeaderServer` (`HeaderBar`), image or fallback, `RecipeShare`, `RecipeDetailsCard`, variations card, `RecipeIngredientList` (availability icons from `Math.random()`), instructions, `AddRecipeReview` (stars + Lexical), `RecipeReviews` (accordion, avatars, `date-fns`) | recipe, ingredients with items, instructions, reviews with authors, variations, creator | A: `Recipe.*`, `RecipeIngredient.item`/`GenericItem`, `instructions`, `reviews`, `addRecipeReview`. D: author/creator via `user(id)` (G4), variations via `recipeGroup.recipes`. G29 (real availability). X: recipe favourite (it was a TODO no-op) | 404 for not-found and not-yours; `REVIEW_ALREADY_EXISTS` → edit; server ingredient order; "Community pick" chip | M |
| `/recipes/ai-generator` | same (`RecipePhotoScanner`) | rebuilt (new flow is real, D6b) | marketing page (features, tips, "95% / 150+ / <30s" claims, How It Works), `RecipePhotoProcessor` (fake 10/50/100 progress) → server action with client `userId` → inline `RecipeDetails` per recipe | upload, start, result list, counts, menu analysis | A: `startRecipePhotoJob`/`recipePhotoJob`/`cancelRecipePhotoJob`. D: counts. **G30** (multi-recipe + menuAnalysis, ask). X: `placeId`/`menuItemId` (menu linking moved to MenuScan, B8c; I) | client-minted jobId; verified upload; real stage progress; cancel; stalled state; **never send userId** (C4) | S–M |
| `/recipes/groups/[groupId]` | same | rebuilt (old threw) | header with "View all N versions" (a 404 link), canonical `RecipeDetails`, "no canonical = data issue" error | group + canonical recipe | A | "Top version" vs "Community pick" (`migration-plan.md:1680-1682`); no-votes Alert; correct link | S |
| `/recipes/groups/[groupId]/versions` | same (`RecipeVersions`) | rebuilt (old threw) | `RecipeVersionsTab` (Joy Tabs per version, score, `CanonicalRecipeBadge`, `RecipeVoteButtons` up/down/net, info, ingredients, instructions) | per-version scalars, creator, up/down/net, myVote | A: `Recipe.netScore`, `Recipe.myVote`, `voteOnRecipe`, `removeRecipeVote`. **G27** (up/down split) | aria-labels `Upvote {name}`/`Downvote {name}` (e2e 08); 15 s poll + latest-only gate; switch the client tally to `netScore`/`myVote` | M |

Never mounted at `82450ad1`, so **do not restore** (V, importer grep): `RecipeDashboard`,
`RecipeSearch` (§9 of the migration plan), `RecipeCompatibility`, `RecipeMatchingScreen`,
`RecipesListClient`, `RecipeCard`, `example-queries`, `useRecipeGroupAggregates`,
`useCanonicalRecipe`, `semantic-recipe-group-search`, `recipe-search`, `recipe-group-utils`.

### Tier lists and rankings

| Old route | New route | Status | Old components (transitive) | Old data needs | Gap classes | Keep from new | Effort |
|---|---|---|---|---|---|---|---|
| `/tier-lists` | same (`TierListsIndex`) | rebuilt | `TierListsPage` → `HeaderBar`, `VirtualGrid`, `TierListCard` (privacy icon, type chip, count, creator avatar + name) | lists, creator profile, count | A (`myTierLists`, `itemCount`). **G4** (creator) | `unwrapResult`; Load more; Yours/Shared split (ask) | S |
| `/tier-lists/add` | same | rebuilt | `AddTierListClient` → `TierListForm` → `EnumSelect` | create | A | static `PermissionType`; typed errors. Default list type: old `place`, new `wine` (ask) | S |
| `/tier-lists/[id]/edit` | same | rebuilt | `EditTierListClient` → `TierListForm` (no delete, no lock) | settings, update | A | creator-only refusal; `DeleteTierListButton` (old had no delete UI, ask) | S |
| `/tier-lists/[id]` | same (`TierListDetail` → `TierListBoard`, `TierListInsights`, `AddEntryModal`) | rebuilt, much reduced | `TierListViewPage` (privacy, count, `/map?tierLists=` link, share, owner lock toggle, Edit, URL tabs `?tab=`, `?item=` scroll-to) → `TierListView` (@dnd-kit board, rank badges, **viewer's own score**, **Google rating + count**, remove confirm) + `TierListInsightsPanel` (archetype hero, `BandDistributionChart` + `CategoryDonutChart` (recharts), Hot Take, `PalatePassport` + badges, `CountryHeatmap` (maplibre + third-party GeoJSON), Palate Profile, Blind Spots, Try This Next, stale notice, 15 s × 8 poll) | list, entries with item/place details, viewer review scores, viewer place ratings, Google rating, `aiInsights`, timestamps, lock | A: `TierList.*` incl. `aiInsights`, `isEditingLocked`, `items`; `Place.enrichment.googleRating` (the new board shows `Place.rating`, a different source); all mutations. **G7** (viewer score), **G16** (viewer place rating). `reorderTierListBand` needs full band membership: adapt the old per-row diff | keyboard band up/down buttons (e2e); full-band reorder contract; network-only re-read; "Unavailable" row; insights for all list types; poll gate `contentUpdatedAt > insightsGeneratedAt`; client-minted `tierListItemId` | L |
| `/rankings` | same (`RankingsBoard` + `RankingsScopeFilter`) | rebuilt | `RankingsClient` → `RankingsFilter` (ME/FRIENDS), `CellarItemsFilter`, `VirtualGrid`, `ItemCard`; URL `?types=`/`?reviewers=` as JSON | `item_scores(reviewers)` + `ItemCard` fields | A: `rankings(scope, types)`. **G6, G7**. X: client-built reviewer list (`migration-plan.md:1296-1309,1917-1921`) | `scope` enum only (map the old toggles via `scopeFromReviewers`); two distinct friends empty states; sake and tea included; paging | M |
| cross-ref: item and place pages | none | **lost (unrecorded for items)** | `AddToTierListButton` → `AddToTierListModal` (lists of the matching type, "already in (band)"); `ItemTierLists` "On Lists" card | viewer's lists by type + membership; visible lists containing the entity | **G8** (`e4-decisions.md` §6e); G33 optional | new add flow (band 0, client-minted id) | M |

### Search, brands, favorites, friends, user, shell

| Old route | New route | Status | Old components (transitive) | Old data needs | Gap classes | Keep from new | Effort |
|---|---|---|---|---|---|---|---|
| `/search` | same (`search-api/SearchWorkbench`) | rebuilt; most old UI gone | `AnimateIn`, `Greeting`, `CollectionStats`, `ClientSearchInterface` (`BarcodeScanner`, `CameraCapture`, xstate `interactiveSearch`, animated placeholder, framer-motion modal), quick-link chips, `RecentActivity` (`?activity=`) + `NearbyPlaces`, `ServerSearchResults` → `SearchResultGrid` → `VirtualGrid` → `ItemCard`. Dead at `82450ad1`: `ItemSearch.tsx`, `actors/searchItems.ts`, `searchByText.ts` | stats, text search, image search, barcode search (an old stub returning `[]`), activity feed, nearby places + summaries, `ItemCard` fields | A: `itemSearch(text)`, `barcode(code)` (better than old). D: stats (own/co-owned filter; G36 optional), nearby (`mapBrowse` + `place(id)`). **G6, G7**. **X / G31: activity feed** (e4 §6b, chosen). **X / G32: image search** (e4 §6a, chosen) | `unwrapResult`; per-tab Back fix (`lib/search/search-slots.ts`) if tabs stay; results in state, not URL | L |
| `/brands` | same (`BrandsIndex`) | rebuilt | `BrandsListClient` (debounced ilike, 200) → `VirtualGrid` → `BrandCard` (logo or placeholder, type, description, "N items", "Part of …", which never rendered) | brand core, item count | A: `brands(first, after, brandType)`, `brandSearch`, `parentBrand`. **G23** (item count) | paging; anonymous `ForbiddenError` | M |
| `/brands/[brandId]` | same (`BrandDetailView`, `BrandItemList`) | rebuilt | `BrandDetails` (hero, parent link, child chips, items by type with "Primary" chip, places with relationship) | core + hierarchy + item links + place links | A: all four edges (A7g, `38f34c9d`). **G24** (primary flag per item) | `isNotFound` → 404; paged edges with totals | S–M |
| `/favorites` | same (`FavoritesList`) | rebuilt | `FavoritesClient` (`CellarItemsFilter`, URL `?types=`), `VirtualGrid`, `ItemCard`. The old server query result was discarded | favourites by type → `ItemCard` | A: `me.favorites` (all six types; old omitted sake and tea). **G6, G7, G25** (type filter arg) | session-expired branch; paging | M |
| `/friends` | same (`friend/*`, rewritten in place) | **parity** except a banner and one placeholder | `Friends` → `FriendsClient` | friends, requests, user search, four mutations | A: `myFriends`, `myFriendRequests`, `userSearch`, mutations. X: subscriptions → 15 s poll | B4b `reason` classifier; "Accept their request" banner; poll | S (placeholder + e2e 03) |
| `/users/edit` | same | **parity** | `EditProfileClient` | profile, update | A: `me.profile`, `updateProfile` | `me === null` notice | done |
| `/`, `/~offline`, manifest, sw, serwist | same | **parity** (manifest screenshots removed deliberately: they showed real people's data, `app/manifest.ts:21-42`) | — | — | — | screenshots stay removed | done |
| `/sign-in`, `/sign-up` | same (`SignInApiClient`, `SignUpApiClient`) | **parity** (sign-up is a superset: display name + sign-in link) | `SignInClient` (LiquidBackground, OAuth buttons, dead "Forgot your password?" `#replace-with-a-link`), `SignUpClient` | — | — | better-auth flow; `sanitize-return-to`; don't restore the dead link without a real flow | S |
| shell: root and `(authenticated)` layouts | same | **parity**: 9 nav entries and the avatar menu are identical; `NhostClientProvider` → `AppClientProviders` | `InstallPwaDialog`, `SideNavigationBar`, `ConditionalPaddingWrapper` | session | — | single `ApiUrqlProvider`; E2a browser sign-out | done |

Old `Breadcrumbs.tsx`, `ThemeToggle.tsx` and `ConfidenceIndicator.tsx` had **no importers** at
`82450ad1` (V). The old UI showed no theme toggle; do not add one in the name of parity.

---

## 3. API gaps (consolidated, deduplicated)

Ids are stable references for planning; G5 and G17 are unused. Owner is the actor or module that would serve the field. Where it is a guess, the guess is marked
(I). "Unblocks" lists the restores that need the field. **Without** shows what the client can do in
the meantime.

| Id | Old Hasura field(s) | Proposed new schema | Owner | Unblocks | Without | Size |
|---|---|---|---|---|---|---|
| **G1** | `cellars.items_aggregate(where empty_at null){count per type}` | `Cellar.itemCounts: { total, active, byType: [{type, count}] }` (non-empty bottles) | `CellarActor` `#toDto` (already holds every row and its type, `cellar-actor.ts:179,792`); resolver `services/api/src/schema/cellar.ts` | `/cellars` cards, items filter badges | nothing: not derivable from a paged list | S |
| **G2** | `cellar.items(where:{empty_at null, type _in})` | `Cellar.items(types: [ItemType!], status: CellarItemStatus = ALL)`; `totalCount` follows the filter | `CellarActor.items` (filter before paging, `cellar-actor.ts:266-279`) | items page type filter, hidden empties (e4 §6d: "do it first") | client filter short-pages the connection | S |
| **G3** | client sort `distance, name` | `CellarItemSort.NAME_ASC` + name tie-break after `semanticQuery` | `CellarActor` (needs a name join; it holds item refs only, I) | items page order | — | S–M |
| **G4** | `createdBy{displayName avatarUrl}`, `co_owners{user}`, review/check-in `user{…}` | `Cellar.createdBy`/`coOwners: [UserProfile!]!`; `TierList.createdBy`; `ItemReview.user`; `CheckIn.user`/`ItemCheckIn.user`; `RecipeReview.author`; `Recipe.createdBy` | api resolvers only, via the existing `UserProfile` DataLoader (`services/api/src/schema/user.ts:94-108`) → `UserActor.getProfile` | avatars on cellar and tier-list cards; review, check-in and recipe rows | N × `user(id)` (urql dedups; `cellar-api/UserName` pattern) | S |
| **G6** | `item_favorites_aggregate.count` | `Item.favoriteCount: Int!` (batched) | api loader over `item_favorites` (written by `UserActor`); `ItemActor` or `FavoritesCollectionActor` (I) | `ItemCard` everywhere | hide the count | S |
| **G7** | `reviews_aggregate(where user=me)`; per-item viewer review score | `Item.myReview: ItemReview` (nullable; "reviewed" = non-null) | batched loader beside `Item.isFavorite` (`services/api/src/schema/item.ts:277`); `ItemActor` (I) | `ItemCard` gold star, tier-list row score | hide | S |
| **G8** | `tier_list_items(where entity){band tier_list{id name}}` | `Item.tierListEntries` / `Place.tierListEntries: [{tierListItemId, band, tierList}]`, **reduced by `canSeeTierList`** (old leaked private list names) | `TierListsCollectionActor` (only has `list()` today, :57), or a reverse lookup on `idx_tier_list_items_*` | "On Lists" cards; add-to-list modal "already in" (no unique index, so no check means duplicates) | scan `myTierLists` (viewer's own lists only) | M |
| **G9** | `cellar_items(where empty_at null){cellar{…}}` per item | `Item.cellars(first): CellarConnection` (non-empty, `canSeeCellar`) | `CellarsCollectionActor` / `CellarItemSearchActor` (I) | item page "Located in" | hide | M |
| **G10** | `cellar_items_by_pk(id)` | `Cellar.item(id): CellarItem` (or root `cellarItem`) | `CellarActor` | bottle-level page with old URL semantics (risk 1) | page `Cellar.items` and match | S |
| **G11** | `{wine,sake,tea}.recipe_ingredients{recipe{…} qty unit optional}` | `Item.recipeIngredients(first, after)` + `RecipeIngredient.recipe: Recipe` | read projection: `RecipeSearchActor`/`RecipeActor` (writer `RecipeActor`, `packages/db/src/writers.ts:163`) (I) | item "Used in Recipes": **an unrecorded drop** | hide | M |
| **G12** | sake `sake_meter_value, acidity, amino_acid, yeast_strain` (DB columns exist, `packages/db/src/schema/tables.ts:901-904`) | add to `ITEM_TYPE_SPECS.SAKE` (`packages/contracts/src/item-types.ts`); the SDL derives | `ItemActor` | sake detail/form | hide | S |
| **G13** | tea `oxidation_level, processing, ingredients, steeping_temperature, steeping_time, flavor_profile, is_organic, is_fair_trade` (`tables.ts:973-981`) | same path; needs a **boolean** `ItemAttributeKind` (`item-types.ts:76-81`) | `ItemActor` | tea detail cards/form | hide | M |
| **G14** | `cellar_items.check_ins{createdAt user}` | `CellarItem.checkIns` or `Cellar.checkIns(cellarItemId:)`; also a root for "show more" (`migration-plan.md:1545`) | `CellarActor` | per-bottle check-ins | page `Cellar.checkIns` + filter | S |
| **G15** | `cellar_items.display_image{file_id placeholder}` | `CellarItem.displayImage: ItemImage` | `CellarActor` resolver via `ItemActor`'s image loader | bottle display photo | `Item.images` | S |
| **G16** | `places.user_place_interactions{rating}` on the board | `Place.myInteraction: PlaceInteraction` (batched) | `UserActor` (served today by `myPlaceInteraction`, `services/api/src/schema/user.ts:447`) | tier-list board, map drawer | N × `myPlaceInteraction` | S |
| **G18** | `place_menu_items.{wine,beer,spirit,coffee}{name,…}` | `MenuItemMatch.item: Item` | api resolver via the Item loader (`services/api/src/schema/place.ts`) | place menu, scan results | N × `item(id,type)` aliases | S |
| **G19** | `place_menu_items(where menu_scan_id)` | `MenuScan.menuItems(first, after)` or `Place.menuItems(menuScanId:)` | `PlaceActor` (writer of `place_menu_items`) | scan results incl. unmatched lines | page all of the place's lines + filter | S |
| **G20** | `item_match_suggestions.place_menu_item{…, place{…}}` | `MatchSuggestion.placeMenuItem`, `MatchSuggestion.place` | `MatchSuggestionsCollectionActor` + `PlaceActor` reads | discoveries pending tab | `menuScan(id){place}` per distinct scan | S |
| **G21** | `enrich_place_from_google({googlePlaceId})` before create | `Query.googlePlaceDetails(googlePlaceId)` (budget-charged) **or** no schema change: prefill from `GooglePlaceSuggestion` + `reverseGeocode`, then `enrichPlaceFromGoogle(placeId, {googlePlaceId})` after create | `GooglePlacesActor` | create-place prefill | the alternative sequence | S |
| **G22** | `cellar_items(source_type in [menu_discovery, menu_scan])` | `myCellarItems(sourceTypes, first, after)` | new collection actor or `CellarsCollectionActor` (I) | discoveries "Recent Additions" (**ask**) | drop the tab | M |
| **G23** | `brands.item_brands_aggregate.count` | `Brand.itemCount: Int!` | `BrandLinksCollectionActor` (batched) or `BrandsCollectionActor` projection | `BrandCard` | hide | S |
| **G24** | `item_brands.is_primary` per brand item | `Brand.items` → `ItemBrandConnection` (exposing `isPrimary`) | `BrandLinksCollectionActor` | brand detail "Primary" chip | N × `item.brands` | S |
| **G25** | `item_favorites(where type _in)` | `Viewer.favorites(types: [ItemType!])` | `FavoritesCollectionActor` | favorites filter | client filter on the loaded page | S |
| **G26** | `recipe_groups(_ilike name/description/recipes.name)` | `recipeGroups(term: String, orderBy)` | `RecipeGroupsCollectionActor` (WHERE `:136-139`) | `/recipes` single search box | `recipeSearch` → dedupe groups → `recipeGroup(id)` | S |
| **G27** | `votes_aggregate` up/down | `Recipe.upvotes`, `Recipe.downvotes` | `RecipeGroupActor.voteSummaries` (already computes them, `migration-plan.md:1726-1734`) | vote buttons | net only, or tally `RecipeGroup.votes` | S |
| **G28** | canonical summary on group cards | `RecipeGroup.canonical*` projection columns (optional) | `RecipeGroupsCollectionActor` | group cards (never rendered in production) | `canonicalRecipe` (one activation per card) | S |
| **G29** | client `recipe-compatibility.ts` over all the viewer's cellar items | `Recipe.compatibility` (viewer-scoped) + `Query.recipeRecommendations` | new viewer-keyed actor or `RecipeSearchActor` via `CellarItemSearchActor` (I) | "Recipes You Can Make" (invisible in production), ingredient availability (old = `Math.random()`) | leave dropped (**ask**) | L |
| **G30** | `processRecipePhoto` results[] + `menuAnalysis` | `RecipePhotoJob.results: [RecipePhotoProgress]` or a batch job | `RecipePhotoJobActor` | multi-recipe photos (**ask**) | one recipe per job | M |
| **G31** | recent reviews / tier-list entries / cellar adds by viewer + friends | built as `Viewer.recentActivity(kinds, limit)` (friend ids resolved server-side, `canSeeTierList`/`canSeeCellar` in SQL) and `Viewer.nearbyPlaces(location)` | `FriendsCollectionActor.recentActivity`; nearby composes `MapActor.browse` | `/search` RecentActivity + NearbyPlaces (**restored**, user 2026-10-05) | restored | M |
| **G32** | `create_search_vector(image)` + `image_search` | `itemImageSearch(fileId)` via `EmbeddingActor.embedImage` (not exposed) | `EmbeddingActor`/`ItemSearchActor`; **every AI provider rejects image embeddings today** | `/search` camera; onboarding existing-item match | **restored 2026-10-05**: `itemSearch(imageFileId:)` → `EmbeddingActor.embedImage` (`gemini-embedding-2`, photo alone) → `item_vectors` ∪ `item_image_vectors`; `IMAGE_SEARCH_UNAVAILABLE` on Ollama | M |
| G33 | `tier_lists(where list_type, created_by_id=me)` | `myTierLists(listType, ownedOnly)` (optional) | `TierListsCollectionActor` | add-to-list modal, map filter | client filter (`PlaceExplorer.tsx:216-235` does it) | S |
| G34 | `visitStatuses=favorites` (UI only, never reached SQL) | `VisitStatusFilter.FAVORITE` (optional) | `MapActor` SQL | map filter | omit | S |
| G35 | — | batched `places(ids:)` (optional) | `PlaceActor` loader | saved places | 8-alias `PlacesByIdQuery` | S |
| G36 | `cellars_aggregate` + per-type aggregates (own/co-owned, distinct items) | `myCellars(scope:)` or `Viewer.collectionStats` (optional) | `CellarsCollectionActor` | `/search` stats | client filter by `createdById`/`coOwnerIds` (rows, not distinct items) | S |
| G37 | cheap card image | `Item.primaryImage` / `CellarItem.image` (optional; performance) | `ItemActor` + `FileActor` | `ItemCard` image cost | `Item.images(first:1)` | S |
| G38 | `libphonenumber` E.164 normalisation | validation in `PlaceCreationActor` (`place-creation-actor.ts:649`, currently trims only) | `PlaceCreationActor` | create-place | none | S |

Each new type needs `graphcache-keys` regenerated (it is part of schema codegen since X6) and a
snapshot update in `services/api/src/schema/schema.test.ts`. Error-union fields must be selected
with `ActorErrorFields` (`actor-error-selections.test.ts`).

**Must-have before the shared `ItemCard` and cellars restore:** G1, G2, G4, G6, G7.
**Must-have for items:** G8–G15. **Product decisions first:** G22, G29, G30, G31, G32.

---

## 4. Dropped on purpose (stays dropped unless the user overrides)

| What | Evidence |
|---|---|
| Image search (`/search` camera, onboarding image match) | `e4-decisions.md` §6a "chosen"; `migration-plan.md:1952-1956` |
| `/search` discovery/activity feed and nearby-places strip | `e4-decisions.md` §6b "chosen"; `migration-plan.md:1958-1962` |
| Client-built `$reviewers` uuid array on `/rankings` (a profiling primitive; friendless viewers silently saw everyone's scores) | `migration-plan.md:1296-1309,1917-1926` |
| Subscriptions → 15 s network-only polling | `migration-plan.md:1511-1512` |
| Old `DiscoveryDashboard` raw-string queries and nonexistent `processMatchSuggestion` | `migration-plan.md:621` |
| `ADD_MENU_ITEM_TO_CELLAR` (dead reference; handler was `alert()`) | `migration-plan.md:623` |
| `userId` variables anywhere (map, place interactions, recipe photo) | A7f `migration-plan.md:1840-1849`; C4 `:1389-1395` |
| Client-posted `google_place_id` on place insert | `CreatePlaceInput` doc (SDL), `place-api/CreatePlaceForm.tsx:63-70` |
| Cluster diagnostics (`cluster_bounds`, density, …) and address fields on map markers | SDL `MapCluster` doc ("nothing renders them"); A7f "the drawer fetches the 18 dropped columns by id" (`migration-plan.md:1860-1862`) |
| List-all-items-of-a-type root field (affects nothing old; the new `/{type}s` pages show favourites instead) | `migration-plan.md:1779-1781` |
| `RecipeSearch`/`RecipeDashboard` (never mounted) | `migration-plan.md` §9 |
| Recipe favourite button (a TODO no-op) | `82450ad1:src/components/recipe/RecipeDetailsCard.tsx:49-52` |
| Manifest screenshots | `app/manifest.ts:21-42` |

**Unrecorded drops** (nobody decided; restore or ratify):

- cellar type filter and empty hiding (e4 §6d);
- "which tier lists rank this" (e4 §6e);
- item "Used in Recipes" (G11; not in any doc);
- sake and tea extra attributes (G12/G13; not in any doc);
- the onboarding wizard's image steps and quick-add;
- favourite count and reviewed star on cards;
- tier-list lock semantics (see §11).

---

## 5. Domain notes the tables don't carry

**Cellars.**

- Bottle counts changed meaning. Old counts and grids **excluded finished bottles**. New
  `Cellar.itemCount` = `aggregate.items.length` includes them (`cellar-actor.ts:792`), and
  `Cellar.items` shows them with an "Empty" chip.
  - `DeleteCellarButton` correctly blocks on the total.
- Default privacy changed: old FRIENDS, new PRIVATE.
- Post-save destination changed: old went to `/items` (add) and `/cellars` (edit); new goes to the
  detail page.

**Items.**

- **Strategy.** Restore the old leaf components nearly verbatim, since they take plain props:
  `ItemDetails`, `ItemCellars`, `ItemReviews`, `ItemCheckIns`, `ItemBrands`, `ItemRecipes`,
  `ItemRemainingSlider`, `ItemShare`, `ItemImage`.
  - Replace the six `{T}Details` with one `ItemPageView` + `CellarItemPageView` driven by
    `ITEM_VIEW_CONFIG[type]`: subtitle, fallback image, brand title, characteristic chips, recipes
    flag, extra cards.
  - Add one adapter, `toOldItemProps(ItemDetailQuery)`.
  - Map the six `{T}Form`s onto one form ordered and labelled as before, over the `ITEM_FORM_RULES`
    keys.
- **xstate machines.** Port them with actors swapped:
  - `uploadFiles` → `uploadFile(label-*)`
  - `fetchDefaults` → `startItemOnboarding` + JSON mapper
  - `searchByBarcode` → `barcode(code).items`
  - `searchByImage` → skipped (G32)
  - `insertCellarItem` → `addItemToCellar`
  - `uploadItemImage` → `uploadFile` + `attachItemImage`
  - create → `confirmItemOnboarding` + poll + `attachBarcode`

**Map.** Pure config ports unchanged: `scoring.ts`, `ItemTypeCategoryMapper`, categories, keywords,
colours. `@turf/turf` and `supercluster` were **never imported** by the old map (V); clustering was
always server SQL. `place_menus` is empty and has no writer in the new stack
(`place-actor.ts:1505-1514`), so "current menu" needs a new definition (§11).

**Recipes.**

- **Working in production:** the `/recipes` grid (with filters, part-broken), the ai-generator
  upload, and the item "Used in Recipes" list (wine, sake and tea have that relationship).
- **Broken in production:**
  - the detail, group and versions pages;
  - reviews and votes;
  - "Recipes You Can Make" (invisible: an invalid query returned null);
  - group card hrefs (pointed a group id at the recipe route);
  - the canonical summary on cards.

**Tier lists.** Insights in the old UI fed **places only**:
`82450ad1:src/app/(authenticated)/tier-lists/[tierListId]/page.tsx:243-252`. So a wine list showed
"Add items to see insights". The old gate also required `blindSpots`, which is now optional
(`services/actors/src/lib/ai/prompts.ts:96-118`); gate on `palateProfile`/`archetype`.
`CountryHeatmap` keys on ISO codes, and `Item.country` may not be one (I). `AIAnalysis.tsx` was
dead code.

**Search.** The old `ClientSearchInterface` auto-navigated on a debounce with an animated
placeholder and no submit button. Results for image and barcode searches were **serialized into the
URL** (forgeable, unbounded). Keep results in state.

---

## 6. Keep from the new implementation (cross-cutting)

Every restored component sits on top of these. An adapter that bypasses one of them is a
regression.

**Data access and errors**
- Result unions + `unwrapResult`/`isNotFound` (`lib/api/result.ts`). Branch on `reason`, then
  `code`, never `message`.
- "Not found" and "not yours" both render 404 (§1.6).
- Never key fallbacks on `response.error` (A7e).

**Paging and freshness**
- Relay paging via `usePagedConnection`/`pageOf` (`lib/paging/*`), with real `totalCount`.
- Page-size constants live in plain modules, never in `"use client"` modules (E2b).
- `createLatestOnly` / `layerGate` staleness guards.
- A 15 s network-only poll instead of subscriptions.

**Auth and server/client boundary**
- better-auth session/cookie/token flow. The RSC token exchange stays `cache: "no-store"` (D1).
- `proxy.ts` matcher exclusions.
- E2a sign-out runs in the browser.
- `sanitize-return-to` parses the URL.
- No value imports from `"use client"` into server pages. No `next/link` as a prop; use
  `common/Link.tsx` (E2b/E2e, `client-boundary.test.ts`).
- One `ApiUrqlProvider` on `(authenticated)`, so there is one graphcache.

**Writes and uploads**
- Client-minted ids on every create, so retries are idempotent: cellar, cellar item, check-in,
  place, menu scan, tier-list item, recipe-photo job.
- Uploads go `createUploadTarget` → PUT → `verifyUpload` → attach (`lib/api/files.ts`).
  - Camera capture comes back only as a *source of a `File`*, never as base64 to a server action.
- Patch semantics (`services/api/src/schema/patch.ts`): an omitted field is left alone, and
  `updateCellar` takes a set diff.
- Never send `userId` (map, place interactions, recipe photo).

**Domain safeguards**
- Item onboarding:
  - A7c boundary validation, with `itemFormRules.ts` required fields;
  - E2c fill-empty-only merge;
  - X11 `attachBarcode` after the outbox poll, with no guessed `barcodeType`.
- `Item.isFavorite`, not a diff over `me.favorites(first:100)` (D3c).
- Tier lists: the full-band `reorderTierListBand` contract and keyboard band buttons.
- Rankings: the `scope` enum and both friends empty states.
- Map:
  - `mapBrowse` is viewport-shaped (a whole-world box returns empty);
  - server-owned Google binding;
  - enrichment only as `QUEUED`/`FRESH` with a bounded poll;
  - `PlacePhoto.file` mirrored photos (no Google host in CSP);
  - `duplicatePlaces` caps;
  - `myDiscoveries` stays owner-only.
- Recipes: keyword fallback when semantic fails; server ingredient order; "Top version" when there
  is no canonical.

**Rendering**
- `common/Timestamp.tsx` is the only date/locale formatter (`hydration-safety.test.ts`).
- No `.toPromise()` outside the exemptions (`no-to-promise.test.ts`).

---

## 7. Old behaviours that were bugs: do not restore

Rows marked *withheld* are security defects that are still live in the legacy production stack
(Nhost, and the frontend deployed from `82450ad1`) until it is retired; the new stack does not
have them. Their specifics are deliberately not
written down in this public repository until then.

| Bug | Where (V) |
|---|---|
| E2c: quick-add auto-confirmed at ≥0.9 after 15 s, fabricating an item from no image | `82450ad1:src/components/common/OnboardingWizard/machines.ts:205-216`, `QuickAddCard` |
| X11: typed barcode silently discarded; guessed `barcodeType` (measured Forbidden) | `migration-plan.md:2304-2312` |
| Old item edit flow broken: Edit hard-`disabled`; edit page passed a cellar-item id to `wines_by_pk` | `CellarItemHeader.tsx:82`, `cellars/[c]/wines/[itemId]/edit/page.tsx:16` |
| Add-to-cellar listed only cellars the viewer created | `wine/fragments.ts:169` |
| Nondeterministic display image (`item_images(limit:1)` with no order) | `wine/fragments.ts:29` |
| `AddReview` allowed a text-only submit (score NOT NULL, so it failed) and unlimited reviews per user | `AddReview.tsx:98`, `tables.ts:394` |
| `ItemShare` called `navigator.canShare` unguarded; QR value had no scheme | `ItemShare.tsx:26,43` |
| Base64 images through server and Hasura actions (4.5 MB limit); a file-handling security defect (E2d/E2f; *withheld*) | `OnboardingWizard/actors/uploadFiles.ts:7-10` |
| Cellar form spinner stuck after a failed submit (`isSubmitted`); label always "Add" | `cellar/CellarForm.tsx:139` |
| Co-owner edits always failed (delete-all/re-insert owners is creator-only in Hasura) while co-owners saw the edit button; co-owner avatars under-counted by select permissions | `app/actions/cellars.ts:16-31`, `CellarCard.tsx:53-55`, `public_cellar_owners.yaml` |
| No owner check on the cellar edit page; add-item links live without permission | `EditCellarClient`, `AddItemClient.tsx:123-150` |
| A server-side caching defect in the cellar items page (*withheld*) | — |
| Relative hrefs everywhere (`cellars/add`, `{type}s/{id}`, `wines/<id>`) | `ItemCard/index.tsx:163`, `RankingsClient.tsx:129`, `FavoritesClient.tsx:131` |
| Check-ins gated on friendship only (co-owners couldn't see each other's) | `cellar-actor.ts:59-63` |
| Rankings had no sake or tea fragments | `ranking/fragments.ts:168-204`; `migration-plan.md:1928-1930` |
| `ItemTierLists`: a visibility defect (*withheld*); the new field must reduce through `canSeeTierList` | `e4-decisions.md` decision 6 |
| Tier-list insights for places only; `blindSpots` gate | `tier-lists/[tierListId]/page.tsx:243-252,268` |
| Non-atomic reorder (`allSettled` row updates); race on add (max-position read then insert) | `app/actions/tierLists.ts:357-367,441-511` |
| `processRecipePhoto`: an authorization defect, not fixed in the legacy stack, which E4 retires (*withheld*); a `wines` row per "2 oz red wine" | `migration-plan.md` C4 outcome |
| Recipe ingredient availability from `Math.random()` (and a hydration mismatch) | `RecipeIngredientList.tsx:99-129` |
| Vote counts: unaliased duplicate `votes_aggregate` (down always 0); `myVote` filter on the literal string `"X-Hasura-User-Id"` | `RecipeVersionsTab.tsx:112-118` |
| Broken recipe links (`/recipes/${groupId}/versions`, breadcrumbs, card hrefs) | `groups/[groupId]/page.tsx:865`, `VirtualizedRecipeGroupGrid.tsx:153` |
| Fake progress percentages and marketing capability stats on ai-generator | `RecipePhotoProcessor.tsx`; `capability-claims.test.ts` polices this class |
| Map: client-computed `visit_count`/`last_visited_at`; abuse and server-access defects in the place and menu-scan actions (*withheld*); enrichment during SSR; "favorites" visit filter that did nothing; auto `watchPosition` on mount (product call, §11) | `map/hooks/useGeolocation.ts:110-117` |
| `searchByBarcode` stub returning `[]`; search results serialized into the URL | `search/actions.ts:185-191,259-293` |
| Old feed: a visibility defect (*withheld*) | — |
| Favorites omitted sake and tea; server query result discarded | `favorites/fragments.ts:17-30`, `Favorites.tsx:11` |
| `JSON.parse` of raw `?types=`/`?reviewers=` (crash on bad input); use nuqs parsers | `utilities/hooks.ts:172,196` |
| Dead "Forgot your password?" link | `auth/SignInClient.tsx:159` |
| `CountryHeatmap` fetched GeoJSON from a third-party CloudFront URL (vendor it; CSP) | `tier-list/insights/CountryHeatmap.tsx:126` |

---

## 8. Dependencies

Compared: the old root `package.json` at `82450ad1` vs `services/client/package.json`. Most were
removed in `62d9fdf9` ("drop 27 unused client deps").

| Dep | Old use | New status | Needed by | Options |
|---|---|---|---|---|
| `@tanstack/react-virtual` | `VirtualGrid`, `CellarItemsGrid` | dropped | cellars, search, favorites, brands, rankings, tier lists | re-add, or Joy Grid + Load more (not pixel parity) |
| `xstate`, `@xstate/react` | onboarding machines, `mapMachine`, `interactiveSearch` | dropped | items wizard, map, search | re-add (verbatim port, actors swapped), or `useReducer` rewrites. AGENTS.md still says XState is in use |
| `recharts` | tier-list insights charts | dropped | tier lists | re-add |
| `framer-motion` | search animations, `AnimatedPlaceholder` | dropped | search | re-add, or CSS keyframes |
| `lexical`, `@lexical/react` | `RichTextEditor`/`Display` (reviews) | **dropped** (re-checked: absent from both package.json files) | items, recipes | re-add, with a reader for plain text, `{body}` and stringified Lexical; or keep plain text in the old shell |
| `react-simple-star-rating` | review stars | dropped | items, recipes | re-add, or Joy icons over `ScoreInput` |
| `react-webcam` | `CameraCapture` | dropped. **No camera capture anywhere in the new client** | onboarding, menu scan, search | re-add, or `<input type=file capture=environment>` |
| `barcode-detector` | `BarcodeScanner` | dropped (the zxing wasm still ships: `public/zxing/zxing_reader.wasm`, cached by `src/app/sw.ts:32`) | onboarding, search | re-add |
| `react-qr-code` | `ItemShare` | dropped | items | re-add |
| `date-fns` | vintage/date formatting, `formatDistanceToNow` | dropped | several | `common/Timestamp.tsx` / `Intl` (hydration rule) |
| `@uidotdev/usehooks` | slider debounce | dropped | items | local hook |
| `@nhost/nhost-js` | auth, storage, functions | dropped | — | better-auth client, `lib/api/files.ts`, actors |
| `libphonenumber-js` | phone normalisation | dropped | create-place | G38 |
| `@turf/turf`, `supercluster`, `convert`, `react-responsive`, `js-cookie`, `react-intersection-observer` | **no importers at `82450ad1`** | dropped | nothing | don't re-add |
| `maplibre-gl`, `react-map-gl`, `@dnd-kit/*`, `nuqs`, `react-hook-form`, `ramda`, `react-icons`, `@vercel/*` | — | **kept** | — | — |

Old `@cellar-assistant/shared` formatters (`formatVintage`, `formatCountry`, `formatWineVariety`, …)
are gone; partial equivalents are `search-api/searchFormat.ts` and `humanizeReferenceValue`. Old
hooks are pure and can be copied back: `useMediaQuery`, `useColumnCount`, `useDebouncedCallback`,
`useAnimatedPlaceholder`. `getNhostStorageUrl` is replaced by `ItemImage.file.url`. Any new upload
input must satisfy `lib/dev-checks/image-inputs.test.ts` and `csp.test.ts`.

---

## 9. What a restore breaks

### e2e (`packages/e2e/specs`)

**Breaks on a faithful restore.** Rewrite each spec in the same change as its restore:

| Spec | Selectors that break | Owner domain |
|---|---|---|
| `02-cellars` | heading "New cellar", label "Who can see it", button "Create cellar", redirect to `/cellars/<uuid>`, detail page | cellars |
| ~~`03-friends:81`~~ | ~~placeholder "Search for users by name or email..."~~ **Fixed in `cd177b96`** (copy and spec changed together) | friends |
| `04-onboard-item:52-109,394-410` | "Add a wine", "Save wine", Style/Vintage labels, redirect to `/wines/<uuid>`, E2c regression. The old wizard opens on a camera barcode step (Skip ×4) | items |
| `04-onboard-item:176-205` | "Check in" → "Just me" on `/cellars/{id}` | cellars |
| `05-search:84-86` | placeholder "Describe what you are looking for", button "Search" | search |
| `06-map-places:106-175` | `/map/create-place` without lat/lng (old redirects), "Add a place", "What is it" chips, client-minted `placeId`, redirect to `/places/{id}` | map |
| `07-tier-lists:47-137` | "Add entry", search placeholder, "Move … up a band" buttons | tier lists |
| `08-recipes:121-153` | `button /^Upvote /`. Keep the aria-label | recipes |

**Survive if the page renders cleanly:**

- `00-routes` (every route; fails on page errors, console warnings or errors, failed requests, and
  `GRAPHQL_VALIDATION_FAILED`).
  - Note: restored framer-motion, auto geolocation, or `useSearchParams` without Suspense can emit
    console warnings.
  - It also asserts `/add/wine` returns 404 and that `/wines`, `/beers` resolve.
- `01-sign-in`, `09-menu-scan`.
- `10-graphcache` (`/friends`, `/search`, `/tier-lists`, `/favorites`; no heuristic fragment
  matching).

### Client unit tests (`services/client/src`)

**Pinned to new files or patterns.** These need a deliberate edit when the file moves:

- `lib/cellars/item-ordering.test.ts:74-100` reads the cellar page sources for `sort:` constants.
- `lib/items/barcode.test.ts:233-275` reads `item-api/ItemOnboardingWizard.tsx` by path. It also
  forbids `BarcodeType`, which is exactly what the old scanner emits.
- `lib/dev-checks/no-to-promise.test.ts` has an exemption list naming:
  - `PlaceExplorer` (7 calls)
  - `place-api/CreatePlaceForm` (1)
  - `CellarCheckIns` (1)
  - `AddEntryModal` (2)
  - `RecipePhotoScanner`, `RecipeSearchPanel`, `RecipeVersions`
  - `BrandsIndex`
  - `ItemOnboardingWizard` (2)

  "Every exempt file makes exactly the calls it declares" fails when one is deleted. The old
  `BrandPicker.tsx:81` would violate the rule.
- `lib/search/search-slots.test.ts` tests the search tabs; dead if the tabs go.
- `lib/api/brand-documents.test.ts` asserts BrandDetail selections and page sizes.
- `lib/latest-only.test.ts` imports `lib/recipes/group-snapshot.ts`.
- `lib/api/documents.test.ts` has a hard-coded `MODULES` list. Every new adapter document module
  must be added, or it goes unvalidated. Documents selecting GAP fields fail until the SDL has
  them.
- `lib/dev-checks/item-spec.test.ts`, `item-form-keys.test.ts`, `static-options.test.ts` import
  `item-api/itemFormRules.ts` and `itemTypes.ts`. **Keep those modules.**
- `lib/dev-checks/upload-surface.test.ts` covers `ItemImages`/`files.ts`.

**Guards every restored component must pass:**

- `client-boundary`
- `hydration-safety`: old slider `useState(new Date())`; old `formatDistanceToNow`.
- `actor-error-selections`
- `capability-claims`: restored copy that asserts capabilities, or says "not available", trips it.
- `csp`, `image-inputs`, `graphcache-keys`, `graphcache-schema`.

**Plumbing that stays untouched:** all of `lib/api/*` auth/proxy/token/session/urql/files/round-trip,
`geo-cookie`, `paging`, `items/extraction-merge`.

No unit test imports a `*-api` component directly (V, grep). Breakage is via source-reading tests
and e2e only.

---

## 10. Proposed order

Principle: decisions first, then the shared layer and the API wave it needs, then domains in order
of use and of how much they share. **API work is grouped by owning actor**, so one agent per actor
can run in parallel with the client work of the previous phase.

| Phase | Work | Needs | Effort | Parallel with |
|---|---|---|---|---|
| **0** | User answers §11 (especially Q1–Q6). Fix the present bugs in §1 (co-owner save, `mapBrowse` paging, stats scope, attributions, placeholder, stale comments) | — | S | — |
| **1a** | **Shared client foundation**: dependency decision (§8); port `HeaderBar`/`ServerBreadcrumbs`, `VirtualGrid`, `InteractiveCard`, `ItemTypeIcon`, `PageLoading`, `EnumSelect` over `useReferenceOptions`, hooks, formatters, `common/RichText*` (if Lexical returns), `ItemCard` with adapter, `CellarItemsFilter` | §8 decision | M | 1b |
| **1b** | **API wave A** (cheap and widely shared): G4 profile edges (api only), G6 `favoriteCount`, G7 `myReview`, G1 cellar counts, G2 items filter, G3 name order | — | M (split by `CellarActor` and api/`ItemActor`) | 1a |
| **2** | **Cellars** (most used; e4 §6d "do first") | 1a, G1–G4, G6, G7, Q1, Q3 | L | 3b |
| **3a** | **Item detail + cellar-item page + forms** (one view, six configs) | 1a, Q1, G8–G15 (or hide sections) | L | 3b |
| **3b** | **API wave B**: G8 tier-list entries (`TierListsCollectionActor`), G9 item cellars, G10/G14/G15 (`CellarActor`), G11 recipe ingredients, G12/G13 sake/tea attributes (contracts + `ItemActor`) | — | M | 2, 3a |
| **4** | **Onboarding wizard** (xstate, camera, barcode, quick-add without E2c) | 1a, 3a, deps, Q7 | L | 5 |
| **5** | **Favorites, brands, rankings** (`ItemCard` reuse); API G23, G24, G25 | 1a, G6, G7 | M each, S–M with reuse | 4 |
| **6** | **Tier lists** (board, insights with recharts, add-to-list modal on item and place pages) | 1a, G4, G7, G8, G16 | L | 7-API |
| **7** | **Map / places / scans / discoveries** (xstate `mapMachine`, drawer, create-place, scans); API G16, G18–G21 (G22 if chosen) | 1a, Q8–Q10 | L (map alone L) | 6 |
| **8** | **Recipes** (old visual design over the new contract); API G26, G27 (G28–G30 if chosen) | 1a, G4, Q11 | M | 9 |
| **9** | **Search** (shell, greeting, stats, barcode camera, `ItemCard` results; feed and image search only if chosen) | 1a, 4 (camera/barcode), G31/G32 decisions | L | 8 |
| **10** | Screenshot parity per route against `82450ad1` (the old app can be served from a `git worktree add --detach … 82450ad1` with its own Nhost stack, or from production) | all | M | — |

Friends, user edit, auth pages and the shell need only the one placeholder fix. They can go in
phase 0.

---

## 11. Open questions for the user

**Gating**: these decide scope across domains.

1. **Cellar-item URL.** Go back to `/cellars/C/{type}s/<cellarItemId>`, a bottle-level page with
   the old slider, check-ins and display photo (needs G10, G14, G15)? Or keep the item-id URL
   (bottle controls on the list)?
2. **New-only features that overlap the old UI.** Keep or remove each:
   - the `/cellars/[id]` detail page with check-ins (old: an id-printing stub; e2e 04 uses it);
   - the "Your / Shared with you" split and privacy chips;
   - per-card open/pour/empty/remove/check-in controls;
   - `Item.checkIns` across cellars;
   - in-page tier-list add (`AddEntryModal`; e2e 07 uses it);
   - `DeleteTierListButton`;
   - the `/{type}s` favourites-of-type pages;
   - search tabs for brands, people and recipes, plus the extra quick-link chips.
3. **Dependencies.** Re-add `@tanstack/react-virtual`, `xstate`, `recharts`, `framer-motion`,
   `lexical`, `react-webcam`, `barcode-detector`, `react-simple-star-rating` and `react-qr-code`
   for pixel parity? Or approximate (Joy Grid + Load more, reducers, CSS)? Infinite scroll with
   scroll restore vs Load more is part of this.
4. **Empty bottles.** Hide them by default and count active bottles only (old)? Or show them with
   an "Empty" chip and count the total (new)?
5. **Recipes.** Given the old detail, group and versions pages never worked in production, is the
   spec their visual design over the new data? Or only what demonstrably worked (the grid, and
   item "Used in Recipes")?
6. **Reviews.** Restore Lexical rich text (one column then mixes formats) or keep plain text in the
   old visual shell? Either way, migrated rows that hold Lexical JSON need a reader.

**Per domain:**

7. **Onboarding quick-add.** Bring back the 15 s auto-confirm at ≥0.9 only when a label image was
   actually sent (the E2c fix)? Or drop it?
8. **Map geolocation.** Prompt and `watchPosition` on mount (old), or on click only (new, D5c)?
9. **Scan-a-menu entry point.** Place page only, with `placeHint` (old)? `/map/scans` only (new)?
   Or both? And what does "current menu" mean, now that `place_menus` has no writer: all lines, or
   the latest scan's?
10. **Google Places budget in production.** Is one configured? `CreatePlaceForm.tsx:296` hardcodes
    "no API budget is configured", the X11 stale-claim pattern. If a budget exists, the old Google
    helpers restore as-is. For prefill: G21 as a new field, or the post-create sequence?
11. **Recipe extras.** Which to build: up/down counts (G27, S), group free-text search (G26, S),
    "Recipes You Can Make" with real compatibility (G29, L), multi-recipe photos with menu
    analysis (G30)?
12. **Chosen drops.** Keep both dropped? The activity feed (G31; about half of `/search`'s old
    content) and image search (G32; 1–2 sessions plus provider work).
13. **Unrecorded drops.** Restore or ratify:
    - discoveries "Recent Additions" (G22);
    - sake and tea extra attributes (G12/G13);
    - item "Used in Recipes" (G11).
14. **Tier-list lock.** Old: a locked list hides remove and disables drag. New: lock blocks reorder
    only. Neither server enforces it. Which semantics, and should the server enforce it?
15. **Tier-list board ratings.** Old showed the viewer's own score plus Google's rating; new shows
    the public average plus `Place.rating`. Confirm old (needs G7, G16). For item lists, should the
    charts, passport and heatmap use `Item.country`, or show band distribution and AI text only?
16. **Small defaults.**
    - Cellar privacy: FRIENDS (old) or PRIVATE (new).
    - Tier-list type: `place` (old) or `wine` (new).
    - Post-save destinations.
17. **Avatars.** Did `migrate-users` copy Nhost `avatarUrl` into better-auth `user.image`?
    Unverified. If not, avatar restores show initials for every migrated user.
18. **Lists over 100 entries.** `reorderTierListBand` needs a band's full membership, and the page
    cap is 100. Does any real list exceed it?
