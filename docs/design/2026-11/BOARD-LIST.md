# Board list: every remaining screen, state and flow

Surveyor report for DECISIONS 39. Tree: HEAD `e9286284` (branch `claude/cellar-design-pass-dfc4d3`); `git status --porcelain` at start showed two untracked scripts (`services/actors/scripts/dp-before-seed.ts`, `dp-photos.ts`), nothing else. Source read only; nothing run. Date 2026-11-25.

Sources: `D/JOBS.md` (643 branch jobs B-001..B-643, 321 main jobs; all 643 ids confirmed present by script), `D/PARITY-MAIN-BRANCH.md`, `D/DECISIONS.md` rows 27-40, `D/PLAN.md` 88-99, `DP/canvas/project/canvas.json`, the reports named in the brief, `DP/real/*.json` `_about`, `services/actors/scripts/demo-seed-data.ts`. `D` = `docs/design/2026-11`, `DP` = `.builds/design-pass-2026-11`.

**Reading the "to draw" rows.** Screen names and job ranges come from JOBS.md route groups. Where a settled board already draws part of a route, the row says so or is marked unconfirmed: the boards are large and I matched them by search of their reports and word counts, not by playing them. Data codes: **Owner** = `DP/real/owner.json` (counts only: 335 items, 190 ratings, 240 bottles now, 113 places, 25 favourites, 2 tier lists, 9 friends); **Owner places** = `DP/real/places.json` (113-row tier list, nearby, map); **Demo seed people** = fictional people from `demo-seed-data.ts` (USERS line 252, FRIENDSHIPS 275, CELLARS 294, BOTTLES 352, PLACES 441, TIER_LISTS 684, RECIPES 836, PANTRY 778, BREW_PREFS 1039, MENU_SCAN 1073); **None** = no data, chrome only. Row 40g: anything showing another person uses the demo seed, said once per board in one quiet line.

## 1. Drawn (settled boards)

| Board | Covers | Jobs | Source |
|---|---|---|---|
| combined/Cellar-flow | Cellar list (ratings, notes, wide tile), item page, Check in (one-tap toast with Undo), quick look, empty, error, loading, fly-in; renders combined-01..24, -empty, -error, -loading, -fly, -item, -ql, -qlb | B-076..083, 088..106, 109..125, 149..156 in part; Check in is a toast only, so the pour, log, Your bottles, freshness and add-to-cellar jobs are NOT drawn | `DP/combined/REPORT.md`; `DP/render/out` |
| screens/Landing | Home: greeting, Open rail, nearby, place-aware states; search pill | B-029..031, 057..061 | `DP/screens/Landing-REPORT.md` |
| screens/Map | Map with list under it, pins, filters | B-251..267 (257 unconfirmed) | `DP/screens/Map-REPORT.md` |
| screens/Tier-list | Rows (no collapsing bands), left scrubber, Arrange, Show only filter (DECISIONS 37, 38, 40b) | B-393, 406..408, 410, 412..413, 415..425 | `DP/screens/Tier-list-REPORT.md` |
| onboarding/Add-bottle | Tap ＋, camera, match, draft with floor and Finish later, quick add, success, declined match, No vintage (DECISIONS 34, 40c) | B-197..227 in part | `DP/onboarding/REPORT.md`; renders add-bottle-* |
| motion/Study | Motion tokens and transitions (tab, sheet, fly-in, haptic vocabulary reference) | no jobs (cross-cutting) | `DP/motion/SPEC.md` |
| desktop/Cellar | Desktop cellar list and item pane (names wrap to two lines, row 40d) | B-088..106 desktop | `DP/desktop/REPORT.md` |
| desktop/Places | Desktop places list, map and place pane | B-251..267, 281..303 desktop | `DP/desktop/REPORT.md` |

Superseded and not counted: `directions/`, `trial/`, `flow/`, `push/`, and the three `Old-*` screenshots. **Drawn: 8 settled boards.** Job coverage is by job range and is unconfirmed per job (how to confirm: search each board for the job's control).

## 2. To draw

Phone only unless the Device column says both. Area numbers are PLAN § 6 (1 Shell+Home, 2 Cellars+items, 3 Capture, 4 Places+map+menus, 5 Social+recap+taste+tiers, 6 Recipes+search).

| # | Lot | Screen | Where | Jobs | Does | Data | Device | Area |
|---|---|---|---|---|---|---|---|---|
| 1 | Shell-Entry | Sign in | /sign-in | B-018..021 | email+password, errors, to /cellars | None (chrome only) | phone | 1 Shell+Home |
| 2 | Shell-Entry | Sign up | /sign-up | B-023..025 | create account, errors | None (chrome only) | phone | 1 Shell+Home |
| 3 | Shell-Entry | Invite, signed out | /invite/[token] | B-026, 345..347 | who invited you, sign in or up to accept | Demo seed people | phone | 1 Shell+Home |
| 4 | Shell-Entry | Invite, signed in | /invite/[token] | B-027..028, 348..350 | accept or decline friend invite | Demo seed people | phone | 1 Shell+Home |
| 5 | Shell-Entry | Invite, dead link | /invite/[token] | B-351 | link expired or used | None (chrome only) | phone | 1 Shell+Home |
| 6 | Shell-Entry | Install dialog | any page (install prompt) | B-011..013 | iPhone steps, Android prompt, installed (DECISIONS 35) | None (chrome only) | phone | 1 Shell+Home |
| 7 | Shell-Entry | Offline | /~offline | B-014..015 | no network, what still works | None (chrome only) | phone | 1 Shell+Home |
| 8 | Shell-Entry | Route error | error boundary | B-016 | something broke, retry | None (chrome only) | phone | 1 Shell+Home |
| 9 | Shell-Entry | Not found | not-found page | B-017 | dead route, way home | None (chrome only) | phone | 1 Shell+Home |
| 10 | Shell-Entry | Share error / not found | /share/* | B-474..475, 472..473 | shared link gone or private | None (chrome only) | phone | 1 Shell+Home |
| 11 | Shell-Home | Waiting on you | / Home | B-035..040 | matches to confirm, drafts to finish, unconfirmed fields (DECISIONS 34, 40c) | Owner | both | 1 Shell+Home |
| 12 | Shell-Home | AI work tray | / Home | B-032..034 | jobs running or done | Owner | phone | 1 Shell+Home |
| 13 | Shell-Home | AI job finished toast | any page | B-041 | done, tap to open | None (chrome only) | phone | 1 Shell+Home |
| 14 | Shell-Home | Continue | / Home | B-042..044 | resume drafts and half-done pours | Owner | phone | 1 Shell+Home |
| 15 | Shell-Home | Drink soon | / Home | B-045..048 | freshness-driven picks | Owner | phone | 1 Shell+Home |
| 16 | Shell-Home | Home, new person (empty) | / Home | B-049 | no cellar, no friends, first step | None (chrome only) | phone | 1 Shell+Home |
| 17 | Shell-Home | Friends feed + Friends ranked | / Home | B-050..055 (+M-028 chips, row 40f) | what friends rated; activity filter as chips | Demo seed people | both | 1 Shell+Home |
| 18 | Shell-Home | Friends feed empty | / Home | B-056 | no friends yet, add one | None (chrome only) | phone | 1 Shell+Home |
| 19 | Shell-Home | App bar: breadcrumbs and More | any page | B-008..010 | where am I, page actions | Owner | phone | 1 Shell+Home |
| 20 | Shell-Me | Me hub | /me | B-062..063 | profile header, shortcuts | Owner | phone | 1 Shell+Home |
| 21 | Shell-Me | Stamps | /me > Stamps | B-064..065, 368..369 | achievements earned and locked | Owner | phone | 1 Shell+Home |
| 22 | Shell-Me | Lists hub | /me > Lists | B-066..071, 401..402 | my lists, Loved, Want to try | Owner | phone | 1 Shell+Home |
| 23 | Shell-Me | People hub | /me > People | B-072, 344 | friends, requests, invites | Demo seed people | phone | 1 Shell+Home |
| 24 | Shell-Me | Settings | /me > Settings | B-073..075 | account, sign out | None (chrome only) | phone | 1 Shell+Home |
| 25 | Shell-Me | Haptics setting (new) | /me > Settings | none (DECISIONS 36) | on/off switch, test tick, reduced motion note | None (chrome only) | phone | 1 Shell+Home |
| 26 | Shell-Me | Edit profile | /users/edit | B-074, 367 | name, photo | Owner | phone | 1 Shell+Home |
| 27 | Shell-Me | Loved | /favorites | B-643 only (partial) | hearted items and recipes, type filter | Owner | both | 1 Shell+Home |
| 28 | Shell-Me | Want to try | /want-to-try | none | items saved to try | Owner | phone | 1 Shell+Home |
| 29 | Cellars-Shelves | Cellars index | /cellars | B-076..082 | my cellars as cards (7 jobs; cellar list itself is settled) | Owner | both | 2 Cellars+items |
| 30 | Cellars-Shelves | Cellars empty | /cellars | B-083 | no cellar yet | None (chrome only) | phone | 2 Cellars+items |
| 31 | Cellars-Shelves | Add cellar | /cellars/add | B-084..085 | name, privacy | None (chrome only) | phone | 2 Cellars+items |
| 32 | Cellars-Shelves | Edit cellar | /cellars/[id]/edit | B-086..087 | rename, privacy, delete cellar | Owner | phone | 2 Cellars+items |
| 33 | Cellars-Shelves | Cellar items empty | /cellars/[id]/items | B-104, 107..108 | empty shelf, add entry | None (chrome only) | phone | 2 Cellars+items |
| 34 | Cellars-Shelves | Cellar filter, sort, search sheet | /cellars/[id]/items | B-088..103 (unconfirmed which are drawn) | filters, sort, selection | Owner | phone | 2 Cellars+items |
| 35 | Cellars-Shelves | Brand page | /brands/[id] | B-628..635 | maker, its items, places-from-brand (M not-sure) | Owner | phone | 2 Cellars+items |
| 36 | Cellars-Shelves | Brand page empty | /brands/[id] | B-636 | no items from this maker | None (chrome only) | phone | 2 Cellars+items |
| 37 | Cellars-Shelves | Brand results | /brands?q= (via search) | B-622..627 merged (row 40f) | makers matching a term | Owner | phone | 2 Cellars+items |
| 38 | Cellars-Shelves | Change brand + Brand field | item page, add/edit | B-181, 637..642 | pick or create a maker | Owner | phone | 2 Cellars+items |
| 39 | Cellars-Pour | Pour sheet | item page > Pour | B-136..142 | pick open bottle, amount | Owner | phone | 2 Cellars+items |
| 40 | Cellars-Pour | Pour: last pour | Pour sheet | B-143..144 | finishing the bottle | Owner | phone | 2 Cellars+items |
| 41 | Cellars-Pour | Pour: rate step | Pour sheet | B-145..146 | stars and note | Owner | phone | 2 Cellars+items |
| 42 | Cellars-Pour | Pour: band step | Pour sheet | B-147 | place in tier band | Owner | phone | 2 Cellars+items |
| 43 | Cellars-Pour | Log a drink sheet | item page | B-161..169 | log without a bottle, date, place | Owner | phone | 2 Cellars+items |
| 44 | Cellars-Pour | Your log | item page | B-159..160, 170..172 | dated history, row actions | Owner | phone | 2 Cellars+items |
| 45 | Cellars-Pour | Bottle freshness sheet | Your bottles | B-157..158 | open date, drink-by | Owner | phone | 2 Cellars+items |
| 46 | Cellars-Pour | Item page, visitor view | /{type}/[id] | B-187, 183 | not mine, no sightings | Demo seed people | phone | 2 Cellars+items |
| 47 | Cellars-Pour | Item edit | /{type}/[id]/edit | B-188..192 | edit fields, unconfirmed marks (row 40c) | Owner | phone | 2 Cellars+items |
| 48 | Cellars-Pour | Item taste header | item page | B-392 | how it fits my taste, friends ratings | Demo seed people | phone | 2 Cellars+items |
| 49 | Cellars-Bottles | Add to cellar sheet | item page | B-126..129 | which cellar, how many, vintage (+1 bottle confirms, row 40c) | Owner | phone | 2 Cellars+items |
| 50 | Cellars-Bottles | Add to cellar, no cellar | item page | B-130 | first-cellar prompt | None (chrome only) | phone | 2 Cellars+items |
| 51 | Cellars-Bottles | Another bottle added dialog | Add to cellar | B-131 | added, add more | Owner | phone | 2 Cellars+items |
| 52 | Cellars-Bottles | Photo of this bottle dialog | Add to cellar | B-132 | take a label photo | Owner | phone | 2 Cellars+items |
| 53 | Cellars-Bottles | Your bottles | item page | B-133..135 | bottles by state: open, sealed, finished | Owner | phone | 2 Cellars+items |
| 54 | Cellars-Bottles | Selected bottle | Your bottles | B-148..156 | open, move, edit, finish | Owner | phone | 2 Cellars+items |
| 55 | Cellars-Bottles | Delete bottle dialog | Selected bottle | B-153..155 | confirm sheet | Owner | phone | 2 Cellars+items |
| 56 | Cellars-Bottles | Share sheet with QR | item page, recipe | B-123, 477 (M-068, M-082; row 40f) | link, copy, QR (no QR code exists today) | Owner | phone | 2 Cellars+items |
| 57 | Cellars-Bottles | Item action menu (disc) | item page | B-476 (row 40f) | actions live in the menu disc | Owner | phone | 2 Cellars+items |
| 58 | Capture-Camera | Add entry and mode switch | /add | B-193..196 | Bottle / Menu / Recipe, pinned cellar | Owner | phone | 3 Capture |
| 59 | Capture-Camera | Cellar picker | /add, pinned | B-250 | choose the cellar to add to | Owner | phone | 3 Capture |
| 60 | Capture-Camera | Camera denied / none | /add camera | B-197..201 | permission denied, no camera, library only | None (chrome only) | phone | 3 Capture |
| 61 | Capture-Camera | Menu mode: shoot | /add Menu | B-229..234 | frame a menu, several pages | None (chrome only) | phone | 3 Capture |
| 62 | Capture-Camera | Menu mode: reading | /add Menu | B-242 (+AI progress) | reading in background | None (chrome only) | phone | 3 Capture |
| 63 | Capture-Camera | Recipe mode: shoot | /add Recipe | B-243..247 | photo a recipe or paste | None (chrome only) | phone | 3 Capture |
| 64 | Capture-Camera | Barcode and torch states | /add Bottle | B-202..212 (board covers 9 barcode words; unconfirmed) | scan, not found, torch | None (chrome only) | phone | 3 Capture |
| 65 | Capture-Camera | Manual entry by type | /add/[itemType] | B-248..249 | no camera, pick type | Owner | phone | 3 Capture |
| 66 | Capture-Place | Place picker sheet | Menu mode | B-235..238 | which place is this menu from | Owner places | phone | 3 Capture |
| 67 | Capture-Place | New place sheet | Place picker | B-239..241 | add a place by name | Owner places | phone | 3 Capture |
| 68 | Capture-Place | Resume a draft | /add?draft=id | B-228 | pick up where I left off | Owner | phone | 3 Capture |
| 69 | Capture-Place | Finished later list | Home, cellar count | B-213..222 (DECISIONS 34) | count of "To finish" bottles | Owner | phone | 3 Capture |
| 70 | Capture-Place | Background work state | /add, Home tray | B-032..034 | leave while the label is read | None (chrome only) | phone | 3 Capture |
| 71 | Capture-Place | Quick add + success variants | /add Bottle | B-223..227 | board covers one path; other kinds undrawn | Owner | phone | 3 Capture |
| 72 | Places-Place | Place page: header, tiers | /places/[id] | B-281..290, 298..303 | rating, my tier, photos | Owner places | both | 4 Places+map+menus |
| 73 | Places-Place | Menu tab | /places/[id] | B-291..292 | menu lines found | Owner places | phone | 4 Places+map+menus |
| 74 | Places-Place | Scan menu tab | /places/[id] | B-293..296 | start a scan, past scans | Owner places | phone | 4 Places+map+menus |
| 75 | Places-Place | Info tab | /places/[id] | B-297 | address, hours, website | Owner places | phone | 4 Places+map+menus |
| 76 | Places-Place | Place drawer on map | /map | B-269..280 | pin tapped, drawer states (unconfirmed which drawn) | Owner places | phone | 4 Places+map+menus |
| 77 | Places-Place | Map, no results | /map | B-257 | search finds nothing here | None (chrome only) | phone | 4 Places+map+menus |
| 78 | Places-Place | Map deep link | /map?placeId= | B-268 | opens on one place | Owner places | phone | 4 Places+map+menus |
| 79 | Places-Place | Create place | /map/create-place | B-304..309 | name, find on map, duplicates block (M-173) | Owner places | phone | 4 Places+map+menus |
| 80 | Places-Place | Edit place | /places/[id]/edit | B-310..311 | fix fields | Owner places | phone | 4 Places+map+menus |
| 81 | Places-Menus | Scan: reading | /map/scans/[scanId] | B-312..313 | progress | None (chrome only) | phone | 4 Places+map+menus |
| 82 | Places-Menus | Scan: result | /map/scans/[scanId] | B-314..317 | lines read, matched counts | Owner places | phone | 4 Places+map+menus |
| 83 | Places-Menus | Scan: failed | /map/scans/[scanId] | B-316..317 | could not read, retry | None (chrome only) | phone | 4 Places+map+menus |
| 84 | Places-Menus | Menu line: matched | Menu line sheet | B-318..327 | confirm the match | Owner | phone | 4 Places+map+menus |
| 85 | Places-Menus | Menu line: not in catalog | Menu line sheet | B-318..327 | add as new | Owner | phone | 4 Places+map+menus |
| 86 | Places-Menus | Menu line: ambiguous | Menu line sheet | B-318..327 | pick one of several | Owner | phone | 4 Places+map+menus |
| 87 | Places-Menus | Add to catalog sheet | Menu line sheet | B-328..330 | fields, unconfirmed ok (row 40c) | Owner | phone | 4 Places+map+menus |
| 88 | Places-Menus | Added confirmation | Add to catalog | B-328..330 | toast with Undo | None (chrome only) | phone | 4 Places+map+menus |
| 89 | Social-Friends | Friends list | /friends | B-331..343 | friends, requests | Demo seed people | both | 5 Social+recap+taste+tiers |
| 90 | Social-Friends | Friends empty | /friends | B-331..343 | no friends yet | None (chrome only) | phone | 5 Social+recap+taste+tiers |
| 91 | Social-Friends | Reset sheet | /friends | B-333 | reset invite link | Demo seed people | phone | 5 Social+recap+taste+tiers |
| 92 | Social-Friends | Add friend: link + QR | Friends, Me | B-345 (row 40f QR) | share my invite | Demo seed people | phone | 5 Social+recap+taste+tiers |
| 93 | Social-Friends | Person profile | /users/[id] | B-353..362 | their ratings, lists, recent | Demo seed people | both | 5 Social+recap+taste+tiers |
| 94 | Social-Friends | Person profile: private or none shared | /users/[id] | B-353..362 | nothing visible to me | Demo seed people | phone | 5 Social+recap+taste+tiers |
| 95 | Social-Friends | Compare taste | /users/[id]#compare | B-363..366 | side by side with me | Demo seed people | both | 5 Social+recap+taste+tiers |
| 96 | Social-Friends | Copied toast | any share | B-365 | copied link | None (chrome only) | phone | 5 Social+recap+taste+tiers |
| 97 | Social-Recap | Recap: month | /recap | B-370..376 | cards for the month | Owner | both | 5 Social+recap+taste+tiers |
| 98 | Social-Recap | Recap: year | /recap?period=YYYY | B-379 | year in review | Owner | both | 5 Social+recap+taste+tiers |
| 99 | Social-Recap | Recap: empty month | /recap | B-377 | nothing logged | None (chrome only) | phone | 5 Social+recap+taste+tiers |
| 100 | Social-Recap | Recap share card | /api/recap/... | B-378, 380 | image card for sharing | Owner | phone | 5 Social+recap+taste+tiers |
| 101 | Social-Recap | Taste profile | /taste-profile | B-381..385 | archetype, flavours | Owner | both | 5 Social+recap+taste+tiers |
| 102 | Social-Recap | Taste profile: locked | /taste-profile | B-382 | n more ratings to unlock | None (chrome only) | phone | 5 Social+recap+taste+tiers |
| 103 | Social-Recap | Taste profile: no friends | /taste-profile | B-386 | friend comparison empty | None (chrome only) | phone | 5 Social+recap+taste+tiers |
| 104 | Social-Recap | Rankings | /rankings | B-387..390 | top by type | Owner | phone | 5 Social+recap+taste+tiers |
| 105 | Social-Recap | Rankings empty | /rankings | B-391 | no ratings | None (chrome only) | phone | 5 Social+recap+taste+tiers |
| 106 | Social-Lists | Lists index | /tier-lists | B-393..397, 399..400 | my lists, friends lists | Owner | phone | 5 Social+recap+taste+tiers |
| 107 | Social-Lists | Lists empty | /tier-lists | B-398 | no list yet | None (chrome only) | phone | 5 Social+recap+taste+tiers |
| 108 | Social-Lists | New list | /tier-lists/add | B-403..405 | kind (items, places), name, privacy | Owner | phone | 5 Social+recap+taste+tiers |
| 109 | Social-Lists | Edit list | /tier-lists/[id]/edit | B-457..459 | rename, privacy, delete | Owner | phone | 5 Social+recap+taste+tiers |
| 110 | Social-Lists | Add to Tier List sheet | item or place | B-460..462 (AddToTierListButton dead; confirm) | choose list and band | Owner | phone | 5 Social+recap+taste+tiers |
| 111 | Social-Lists | Added to list toast | after add | B-463 | with Undo | None (chrome only) | phone | 5 Social+recap+taste+tiers |
| 112 | Social-Lists | Arrange lock (row 40f) | Arrange bar | B-415, M-249 | lock guards reordering; no lock today | Owner | phone | 5 Social+recap+taste+tiers |
| 113 | Social-Lists | Shared tier list (signed out) | /share/tier-lists/[id] | B-464..466 | public view | Owner | phone | 5 Social+recap+taste+tiers |
| 114 | Social-Lists | Shared item and recipe pages | /share/items, /share/recipes | B-467..471 | public view | Owner | phone | 5 Social+recap+taste+tiers |
| 115 | Social-Placing | Add entry: search | Add entry sheet | B-426..435 | find item or place to add | Owner | phone | 5 Social+recap+taste+tiers |
| 116 | Social-Placing | Add entry: not found | Add entry sheet | B-426..435 | create or scan instead | Owner places | phone | 5 Social+recap+taste+tiers |
| 117 | Social-Placing | Pairwise: question | Pairwise placement | B-436..444 | A or B, which is better | Owner places | phone | 5 Social+recap+taste+tiers |
| 118 | Social-Placing | Pairwise: landed | Pairwise placement | B-436..444 | where it settled, Undo | Owner places | phone | 5 Social+recap+taste+tiers |
| 119 | Social-Placing | Insights: loading | /tier-lists/[id] Insights | B-445..453 | AI reading the list | Owner places | phone | 5 Social+recap+taste+tiers |
| 120 | Social-Placing | Insights: ready | /tier-lists/[id] Insights | B-445..453 | Hot Take, Palate Profile, Blind Spots | Owner places | phone | 5 Social+recap+taste+tiers |
| 121 | Social-Placing | Try this next | Insights card | B-454..455 | suggested place | Owner places | phone | 5 Social+recap+taste+tiers |
| 122 | Social-Placing | Try this next, empty | Insights card | B-456 | owner, nothing yet | None (chrome only) | phone | 5 Social+recap+taste+tiers |
| 123 | Social-Placing | List empty | /tier-lists/[id] | B-414 | no entries | None (chrome only) | phone | 5 Social+recap+taste+tiers |
| 124 | Social-Placing | Place list variant + ?item= | /tier-lists/[id] | B-409, 411 | list of places, item deep link | Owner places | phone | 5 Social+recap+taste+tiers |
| 125 | Recipes-Browse | Recipes index | /recipes | B-478, 495 | my recipes, bar card, all | Demo seed people | both | 6 Recipes+search |
| 126 | Recipes-Browse | New recipe sheet | /recipes | B-479..481 | Photo, Paste, Type | None (chrome only) | phone | 6 Recipes+search |
| 127 | Recipes-Browse | Your drafts | /recipes | B-483 | unfinished | Demo seed people | phone | 6 Recipes+search |
| 128 | Recipes-Browse | All recipes, empty | /recipes | B-492 | nothing yet | None (chrome only) | phone | 6 Recipes+search |
| 129 | Recipes-Browse | Recipe search results | /recipes?q= | B-494 | meaning-based results | Demo seed people | phone | 6 Recipes+search |
| 130 | Recipes-Browse | Recipe group page | /recipes/groups/[id] | B-496..498 | one dish, top version | Demo seed people | phone | 6 Recipes+search |
| 131 | Recipes-Browse | Versions list | .../versions | B-499..505 | vote, canonical | Demo seed people | phone | 6 Recipes+search |
| 132 | Recipes-Browse | Bar card + My recipes | /recipes | B-482, 484..485 | bar shortcut | Demo seed people | phone | 6 Recipes+search |
| 133 | Recipes-Page | Recipe page | /recipes/[id] | B-506..512, 583 | ingredients, steps, love, share | Demo seed people | both | 6 Recipes+search |
| 134 | Recipes-Page | Recipe More menu | /recipes/[id] | B-513..515 | owner and visitor actions | Demo seed people | phone | 6 Recipes+search |
| 135 | Recipes-Page | Delete recipe sheet | /recipes/[id] | B-516..517, 554..555 | confirm | Demo seed people | phone | 6 Recipes+search |
| 136 | Recipes-Page | My draft / mine saved | /recipes/[id] | B-519..522 | state banners | Demo seed people | phone | 6 Recipes+search |
| 137 | Recipes-Page | Reviews | /recipes/[id] | B-523..528 | list and write | Demo seed people | phone | 6 Recipes+search |
| 138 | Recipes-Page | Composer: choose | /recipes/new | B-529..532 | photo, paste, type | None (chrome only) | phone | 6 Recipes+search |
| 139 | Recipes-Page | Composer: reading | /recipes/new | B-533..534 | AI reading | None (chrome only) | phone | 6 Recipes+search |
| 140 | Recipes-Page | Composer: failed or stopped | /recipes/new | B-535..536 | retry | None (chrome only) | phone | 6 Recipes+search |
| 141 | Recipes-Page | Composer: picked photo | /recipes/new | B-537 | photo chosen | None (chrome only) | phone | 6 Recipes+search |
| 142 | Recipes-Page | Edit recipe | /recipes/[id]/edit | B-539..553 | 15 jobs: fields, steps, More | Demo seed people | both | 6 Recipes+search |
| 143 | Recipes-Make | Make mode: step | /recipes/[id]/make | B-557..567 | big step, timers, wake lock | Demo seed people | phone | 6 Recipes+search |
| 144 | Recipes-Make | Make mode: ingredients | /recipes/[id]/make | B-557..567 | scale, check off | Demo seed people | phone | 6 Recipes+search |
| 145 | Recipes-Make | Made it toast | Make mode | B-568..569 | with Undo | None (chrome only) | phone | 6 Recipes+search |
| 146 | Recipes-Make | Made it screen | Make mode | B-570..571 | rate, log | Demo seed people | phone | 6 Recipes+search |
| 147 | Recipes-Make | Bar | /recipes/bar | B-572..578 | what I can make | Demo seed people | phone | 6 Recipes+search |
| 148 | Recipes-Make | Bar empty | /recipes/bar | B-576, 579 | nothing makeable | None (chrome only) | phone | 6 Recipes+search |
| 149 | Recipes-Make | Pantry | /recipes/bar/pantry | B-580..581 | staples I own | Demo seed people | phone | 6 Recipes+search |
| 150 | Recipes-Make | Cocktails with this | item page | B-584..586 | recipes using this bottle | Demo seed people | phone | 6 Recipes+search |
| 151 | Recipes-Make | Use it up | item page | B-585 | recipes for an open bottle | Demo seed people | phone | 6 Recipes+search |
| 152 | Recipes-Make | Brew guide | item page tea, coffee | B-587..592 | dose, water, time | Owner | phone | 6 Recipes+search |
| 153 | Recipes-Search | Search, no query | /search | B-593..603 (601) | recents, scan, camera | Owner | both | 6 Recipes+search |
| 154 | Recipes-Search | Search results | /search?q= | B-593..603, 621 | sections | Owner | both | 6 Recipes+search |
| 155 | Recipes-Search | See all section | /search?in= | B-604..606 | one type | Owner | phone | 6 Recipes+search |
| 156 | Recipes-Search | Search nothing found | /search | B-613 | no match, add instead | None (chrome only) | phone | 6 Recipes+search |
| 157 | Recipes-Search | Search unavailable | /search | B-614 | search down | None (chrome only) | phone | 6 Recipes+search |
| 158 | Recipes-Search | Scan and camera sheets | /search | B-596, 598 | barcode, photo | None (chrome only) | phone | 6 Recipes+search |
| 159 | Recipes-Search | Barcode result: found, none, failed | /search?barcode= | B-615..617 | three states | None (chrome only) | phone | 6 Recipes+search |
| 160 | Recipes-Search | Image result: found, expired | /search?image= | B-618..620 | two states | None (chrome only) | phone | 6 Recipes+search |
| 161 | Recipes-Search | People results + add friend | /search | B-607..609 | people matches | Demo seed people | phone | 6 Recipes+search |

**To draw: 161 screens or states, covering 550 distinct job ids** (computed from the rows by script; ranges that straddle drawn jobs overcount).

## 3. Dropped or merged

| What | Jobs | Ruling | Source |
|---|---|---|---|
| `/brands` index (orphan, no nav entry) | B-622..627 | No index; brand page reached from an item's maker and from search; results only through search Brands (row 40f). Merged into Cellars-Shelves "Brand results". | DECISIONS 40f; JOBS.md 1090 |
| QR share fallback (gone on branch) | M-068, M-082 | KEPT, moved into the Share sheet (row 40f). Not dropped: a build job, drawn in Cellars-Bottles. | DECISIONS 40f; PARITY Gone |
| Tier-list lock (retired padlock) | M-249 | KEPT, guards reordering (row 40f). Conflicts with `tier-list/actions.ts:24`; drawn in Social-Lists. | DECISIONS 40f; PARITY Gone |
| Home activity filter (gone) | M-028 | KEPT as chips on the feed (row 40f). Drawn in Shell-Home. | DECISIONS 40f |
| Item actions | B-476 | Sit in the item page menu disc (row 40f). | DECISIONS 40f |
| Per-type index pages | M-093..095 | Gone by design; the type filter lives on Loved. Nothing to draw. | PARITY Gone |
| Tips card on capture | M-106 | Dead code on branch (`TipsCard` imported nowhere). Not drawn. | PARITY Gone |
| `/users` index | B-352 | Redirect to `/me`; no screen. | JOBS.md 1091 |
| `/recipes/ai-generator` | B-538 | Redirect to `/recipes/new?from=photo`; no screen. | JOBS.md 1093 |
| `/recipes?semantic=` | alias of B-494 | Old alias; no screen. | JOBS.md 1095 |
| Share redirects for signed-in viewers | part of B-466, 469 | Redirect to canonical; no screen. | JOBS.md 1094 |
| `/discoveries`, `/map/scans` list, `/cellars/[id]` | M-051..056, 200..212 (orphans) | Redirects or orphans on main; not lost. | PARITY orphans |
| `AddToTierListButton` | B-460..463 | Looks dead (imported only by its test); the Add to Tier List sheet row stays until the lead rules. | JOBS.md 1100 |

**Dropped or merged rows: 13** (of which 5 are kept-by-ruling, listed so nobody drops them).

## 4. Lots

Each lot is one board file (`Area-Lotname.dc.html`). No screen is in two lots (each row above has one lot). Doors name other lots or settled boards.

| Lot | Area | Screens | Borrows most from | Doors |
|---|---|---|---|---|
| Shell-Entry | 1 Shell+Home | **10**: Sign in; Sign up; Invite, signed out; Invite, signed in; Invite, dead link; Install dialog; Offline; Route error; Not found; Share error / not found | Landing (type, empty-state voice) | Home (settled) via sign-in; /add via Install; Social-Lists for share pages |
| Shell-Home | 1 Shell+Home | **9**: Waiting on you; AI work tray; AI job finished toast; Continue; Drink soon; Home, new person (empty); Friends feed + Friends ranked; Friends feed empty; App bar: breadcrumbs and More | Landing (rails, greeting) | Search pill to Recipes-Search; Waiting-on-you rows to Capture-Place (resume) and Cellars-Pour; Friends rows to Social-Friends |
| Shell-Me | 1 Shell+Home | **9**: Me hub; Stamps; Lists hub; People hub; Settings; Haptics setting (new); Edit profile; Loved; Want to try | Combined Cellar-flow (rows, insets) | Lists to Social-Lists; People to Social-Friends; Stamps to Social-Recap; Loved to settled item page |
| Cellars-Shelves | 2 Cellars+items | **10**: Cellars index; Cellars empty; Add cellar; Edit cellar; Cellar items empty; Cellar filter, sort, search sheet; Brand page; Brand page empty; Brand results; Change brand + Brand field | Combined Cellar-flow + desktop/Cellar | Cellar items to settled item page; Brand page to Recipes-Search; Add items to Capture-Camera |
| Cellars-Pour | 2 Cellars+items | **10**: Pour sheet; Pour: last pour; Pour: rate step; Pour: band step; Log a drink sheet; Your log; Bottle freshness sheet; Item page, visitor view; Item edit; Item taste header | Combined Cellar-flow (Check in, item page) | Pour/rate to Social-Placing (band step); Log to settled item page |
| Cellars-Bottles | 2 Cellars+items | **9**: Add to cellar sheet; Add to cellar, no cellar; Another bottle added dialog; Photo of this bottle dialog; Your bottles; Selected bottle; Delete bottle dialog; Share sheet with QR; Item action menu (disc) | Combined Cellar-flow (item page) | Add to cellar from Capture-Camera success; Delete to settled cellar list; Share to Social-Lists share pages |
| Capture-Camera | 3 Capture | **8**: Add entry and mode switch; Cellar picker; Camera denied / none; Menu mode: shoot; Menu mode: reading; Recipe mode: shoot; Barcode and torch states; Manual entry by type | onboarding/Add-bottle | Menu mode to Capture-Place then Places-Menus; Recipe mode to Recipes-Page composer; Bottle mode to settled Add-bottle |
| Capture-Place | 3 Capture | **6**: Place picker sheet; New place sheet; Resume a draft; Finished later list; Background work state; Quick add + success variants | onboarding/Add-bottle (sheets) | Place picker to Places-Place; resume to Shell-Home tray; manual entry to settled Add-bottle draft |
| Places-Place | 4 Places+map+menus | **9**: Place page: header, tiers; Menu tab; Scan menu tab; Info tab; Place drawer on map; Map, no results; Map deep link; Create place; Edit place | screens/Map + desktop/Places | Map settled; Create place to Capture-Place picker; Menu tab to Places-Menus; place to Social-Placing (place list) |
| Places-Menus | 4 Places+map+menus | **8**: Scan: reading; Scan: result; Scan: failed; Menu line: matched; Menu line: not in catalog; Menu line: ambiguous; Add to catalog sheet; Added confirmation | screens/Map (drawer) + Combined sheets | Scan from Places-Place Scan tab; Add to catalog to Cellars-Bottles; ambiguous to Recipes-Search |
| Social-Friends | 5 Social+recap+taste+tiers | **8**: Friends list; Friends empty; Reset sheet; Add friend: link + QR; Person profile; Person profile: private or none shared; Compare taste; Copied toast | Combined Cellar-flow (rows) | Compare to settled item page; Add friend to Shell-Me People; invite to Shell-Entry |
| Social-Recap | 5 Social+recap+taste+tiers | **9**: Recap: month; Recap: year; Recap: empty month; Recap share card; Taste profile; Taste profile: locked; Taste profile: no friends; Rankings; Rankings empty | screens/Landing (cards) | Taste to Social-Placing insights; Rankings to settled Tier-list; Share cards to Social-Lists |
| Social-Lists | 5 Social+recap+taste+tiers | **9**: Lists index; Lists empty; New list; Edit list; Add to Tier List sheet; Added to list toast; Arrange lock (row 40f); Shared tier list (signed out); Shared item and recipe pages | screens/Tier-list | Lists open settled Tier-list; Add to list from Cellars-Bottles and Places-Place; share pages to Shell-Entry |
| Social-Placing | 5 Social+recap+taste+tiers | **10**: Add entry: search; Add entry: not found; Pairwise: question; Pairwise: landed; Insights: loading; Insights: ready; Try this next; Try this next, empty; List empty; Place list variant + ?item= | screens/Tier-list (Arrange, rows) | Entered from settled Tier-list; Insights to Social-Recap taste; pairs to Cellars-Pour band step |
| Recipes-Browse | 6 Recipes+search | **8**: Recipes index; New recipe sheet; Your drafts; All recipes, empty; Recipe search results; Recipe group page; Versions list; Bar card + My recipes | Combined Cellar-flow (list rows) | New recipe to Capture-Camera/Recipes-Page composer; group to Recipes-Page; Bar to Recipes-Make |
| Recipes-Page | 6 Recipes+search | **10**: Recipe page; Recipe More menu; Delete recipe sheet; My draft / mine saved; Reviews; Composer: choose; Composer: reading; Composer: failed or stopped; Composer: picked photo; Edit recipe | Combined Cellar-flow (item page) | Make to Recipes-Make; Reviews to Social-Friends profile; composer from Capture-Camera |
| Recipes-Make | 6 Recipes+search | **10**: Make mode: step; Make mode: ingredients; Made it toast; Made it screen; Bar; Bar empty; Pantry; Cocktails with this; Use it up; Brew guide | motion/Study (step transitions) | Brew guide from Cellars item page; pantry from Recipes-Browse Bar; Made it to Cellars-Pour log |
| Recipes-Search | 6 Recipes+search | **9**: Search, no query; Search results; See all section; Search nothing found; Search unavailable; Scan and camera sheets; Barcode result: found, none, failed; Image result: found, expired; People results + add friend | screens/Landing (search pill) | Entered from Shell-Home pill and settled tab bar; scan to Capture-Camera; People to Social-Friends; Brands to Cellars-Shelves |

**18 lots, 161 screens** (6 to 10 per lot). The brief asked for 6 to 9 lots; the app needs 18 to stay at 6 to 10 screens each: the six PLAN areas hold 161 undrawn screens, about 3 lots per area. To hold to 9, merge Capture-Place into Capture-Camera, Recipes-Make into Recipes-Page, and the Shell and Cellars pairs, at 15+ screens per lot, which breaks "draw, play and render in one sitting".

## 5. Facts to check

- Jobs with no row above: B-001..007 (tab bar, side rail, ＋ button) are chrome covered by Motion Study and Landing; B-109..110 (type-redirects) and B-088..106 (cellar items, 18 jobs) are mostly drawn on Cellar-flow. Unconfirmed per job; settle by searching the board for each control.
- Routes with no job: `/want-to-try` (none), `/favorites` (only B-643), `global-error.tsx`, the Haptics setting (new, DECISIONS 36), `/discoveries`, `/map/scans` list, `/cellars/[id]` (redirects).
- Row 40f conflicts with the code: QR sharing and the tier-list lock "stay", but neither exists on the branch (no QR component; padlock retired, `tier-list/actions.ts:24`). They are new build jobs, not parity. The lead should confirm that is intended.
- Not-sure parity items still open (PARITY 70-80): cellar semantic search (M-046), map link from a tier list (M-147), who-favourited list, places from a brand, recipe vote undo. Drawn rows assume none of these exist.
- B-074 and B-367 share `/users/edit`; B-104 is an empty state inside the 18-job items route; B-533..536 overlap states. Counts per row are by range, not one-to-one.
- Settings has only edit profile and sign out; the Haptics row has no job and no code (`haptics` grep found none).
- Place and menu data: the owner's places hold 113 tier rows (band counts 11/15/42/22/23); menu lines come from the demo seed `MENU_SCAN`, not production.
- Not verified: no board was opened or played; "drawn" is from reports and word counts. No route was run. JOBS.md "Not verified" notes (lines 1116-1126) carry over.

## Checklist

- [x] JOBS.md read in full (643 ids confirmed by script)
- [x] PARITY lists (Gone, Harder, Moved, New, Not sure)
- [x] DECISIONS 27-40 and PLAN 6
- [x] Board index, 8 settled boards listed
- [x] Reports read (combined, 3 screens, onboarding, desktop, motion headings)
- [x] Route tree confirmed (redirects, dead code)
- [x] Data sources read (owner, places, demo seed)
- [x] Public routes, error, empty, permission states, Haptics setting
- [ ] Boards played to confirm drawn jobs per job (not covered; unconfirmed)
- [ ] Desktop-differs list beyond Home, Recipes, Friends, Recap (not covered)

Counts: drawn 8 boards; to draw 161 screens in 18 lots, 550 job ids; dropped or merged 13 rows; covered 8 of 10 checklist items.
