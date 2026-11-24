# Consistency audit of the redesign

What was checked: the redesign running at http://localhost:3103, signed in as test@test.com. Viewport 390×844 at device scale factor 2, dark theme.

Coverage: 93 of the after-pairs in `pairs/pairs.json` were opened and measured. That is every after-pair except these:

- SH04 was skipped because it is sign-up.
- RS06 and RS07 were skipped because the account has no recipe group.
- SH03 was taken at `/` instead.

On each screen, the browser's computed styles were read for every visible text node, control and `data-slot` element: font family, size, weight, colour, height, radius, padding, background and border. Source files were matched through each element's `data-slot` and confirmed with grep.

All GraphQL mutations were aborted at the network layer, so no app data changed.

Files:

- Crops are in `crops/<kind>-<n>.jpg`: 127 crops for 22 kind records.
- Per-variant facts are in `variants.json`.

Every crop matches a record in `variants.json`. Three variants have no crop:

- **score-7:** the share page's 44px "4.3 / 5" sits under a sticky "Join Cellar Assistant" banner in every frame.
- **button-text "Add bottled":** a gold ghost button that was only seen under the CI16a sheet's scrim.
- **page-header:** 13 variants found, 8 cropped.

## Table: kind, variants, difference

| Kind | Variants | What differs |
|---|---|---|
| Page header / app bar | 13 | There are thirteen header shapes. Title size varies: 17/600 Inter in the app bar, 22/600 Inter on capture and search, 28/600 and 34/600 Fraunces with no bar. Back control varies: 44 transparent, 44 filled #1f1b21, 36 filled "Back to map", or none. Close ✕ sits on the left (capture) or the right (search). Share pages use a glass header with a 17/600 serif wordmark. |
| Section heading | 11 | The same 11/600 uppercase #9c9287 overline sits at x16, x20, x32, x48 or x52. Other headings are 17/600 sentence case, 22/600, 15/500 capitalised "Wines (1)", 15/600 ("Address", "Who") and 16/400 tier-band titles. "See all" is a 36 ghost button in one place, a count in another, a "Log a drink" button in a third. One sheet draws the overline in #bdb3a7. |
| Page gutters / rhythm | 4 gaps, 14 edges | The main-column gap between sections is 16, 20, 24 or 32 depending on the screen. The leftmost text sits at 14 different x positions across screens (list below). |
| Add / create entry | 10 | Ten forms: 56 gold circle in the tab bar; full-width gold button under the app bar; inline 116w gold "Add item"; secondary button in the glass action bar; outline 44 "Add to Tier List" (Title Case); icon-only version of that; 36 floating map circle; ghost "Add ingredient"; gold button in an empty state; outline "Add an item" in an empty search; sheet row "Add to tier list" (sentence case). |
| Item / bottle tile | 9 | Widths: 144, 136, 171 (two heights, 324 and 262) and 358. Plate heights: 180, 181, 228 and 269. Name type: 12/600, 15/600, or a 30–72 serif vintage. Radius: r12 on most, but the brand card is r20 #171418. A tier entry is a 310×50 row with a 12/800 rank. |
| List row | 9 | `list-row` is 63h with a 20px glyph; on RS04/RS05 the glyph is 14px. The glyph x is 16, 24 or 28. Cellar and tier-list cards are standalone r20 at 104–108h and 140h. Friend row 56h, drink-log row 69h, menu line 100–166h with a 64px text inset, sheet candidate row 58h at 15/600. |
| Score / rating | 9 | Nine treatments: 28/600 Fraunces stat strip; 24h pill at 12/600; 17/600 number with filled star; 12/500 #bdb3a7; 16/500 #bdb3a7; inline 13/400 "You ★4.5"; 44/500 Fraunces "4.3 / 5"; five 32px outline stars; 88px serif on the recap. |
| Filter / sort | 8 | Segmented control (40h, r10) and a look-alike built from links. Filter chip and sort chip (36 pill). Two tab styles: 36h r12 transparent on the place page, 28h r6 filled #29242b on the tier list. Icon-only 44 r12 map toggles. 44h r6 selects. The capture type-option looks like the filter chip but is a different component. |
| Type marker | 8 | The type-chip is 24h, 12/500, in the type colour. On brand detail it is 28h at 14/500. "Cocktail" (28h) and "Beer Bar" (22h) are neutral badges with no type colour. Rows show the glyph alone. Capture type pills are uncoloured. Map toggles are icon-only. Plates are tinted by type. |
| Empty state | 8 | `EmptyState` (28/600 serif + 15/400 #bdb3a7) appears with no fill or inside a #171418 r20 card. Its action is gold, secondary, outline or absent. `ShellMessage` is a separate component with a 16/400 line. Three empty states are plain sentences: 15/400 #9c9287 left-aligned, 13/400 centred, and 15/400 #bdb3a7. The camera-blocked message is 14/400 sans in a square panel. |
| Cards / containers | 8 | #171418 r20 with padding 0 or 16; #1f1b21 r12; #1f1b21 r0 full band; #1f1b21 r12 nested in r20; glass r20 action bar; border-y-only accordion; r20 camera frame with an r0 inner alert. |
| Secondary button | 6 | 44 r12 #1f1b21; 36 r12; 36 pill; 44 pill; 44 r12 outline (translucent fill, 1px #29242b); 56 pill #29242b. |
| Forms | 6 | Field left edge: x16 w358 on most; x30 w344 with Save at x16 w358 (CA03, CI17, CI23); x16 and x30 mixed in one form (PM08); x32 in a card (SH07); x40 w310 on auth, with fill #0e0c0f. Section gap is 32 on SO11 and 16 on SO12, which have the same fields. The submit is 44, 48 ("Add Place") or a sticky action bar (RS11b). |
| Text button | 5 | Ghost 44 ink; ghost 36 with icon; gold ghost "Add bottled"; underlined 15/400 inline link; gold 15/400 address link with no underline. |
| Primary button | 4 | 44 r12 14/500 (most); 48 r12 16/500 (RS08 "Make it", PM08 "Add Place"); 56 pill 16/600 (make mode); 52 pill full width (recap). |
| Destructive button | 4 (+1) | Red outline 44 r12 with border; red ghost with no border; full-width 48 sheet row; "Reset" on map filters drawn as a destructive outline. Also a red icon-only remove in the SO10 sheet. |
| Icons | 4 | Lucide stroke 1.75 (895 instances), stroke 2 (224: checks, chevrons, glass-water), active tab 2.25. Custom stars at stroke 1.5, and custom filled hearts and stars. Sizes: 11, 14, 16, 18, 20, 24, 28, 32, 40, 48. |
| Search field | 5 | 44 r6 translucent with border (cellar, recipes, friends, brands, sheet); 48 r12 solid #1f1b21 that is a link, not a field (home); 40 r6 with no fill (map); 48 r12 with a Scan pill (/search); brand combobox 44 with no border at x59. |
| Error / loading | 4 | Shell message with Try again; role=alert in the camera frame; server-AI error drawn as an empty state with a serif title; inline r12 card with a raw URL in ui-sans 13px #e8e8e8 (SO13). |
| Sheets / dialogs | 2 | Bottom sheet (one component, consistent) and the map's floating r12 glass card. |
| Toasts | 1 | Only the share-fallback inline card was seen. No toast fired because mutations were blocked. |
| Other | 4 | Title Case versus sentence case for chrome, including the same action spelled both ways: "Add to Tier List" (PM06) and "Add to tier list" (CI16a). The red "Reset" sits beside a gold "Done". The Edit Cellar icon sits right after the name, not trailing. |

Title Case labels seen: Add Friends, Incoming/Outgoing Requests, Mark Visited, Add Wine, Scan Results, Add Place, Menu Items, Minimum Rating, Visit Status, New Places, Tier Lists, List Type, Display Name, Street Address, Postal Code, Country Code, Alcohol Content, All Categories, Base Spirit.

Sentence-case labels seen: Add a bottle, New cellar, Edit profile, Add to tier list.

## Ranking by visibility on the phone

This ranking is my own judgement of how soon a person moving between screens would notice the inconsistency. It is not measured.

1. **Page header.** It is the first thing on every screen, and it changes shape, size, font family and back control from screen to screen.
2. **Add / create entry points.** The same intent appears as ten different controls.
3. **Section headings and gutters.** The overline jumps between x16, x20, x32, x48 and x52, and gaps are 16, 20, 24 or 32.
4. **Score display.** The same 4.5 appears in nine type treatments.
5. **Item tiles.** There are four widths and four plate heights across home, shelf, grid and detail.
6. **Buttons.** Primary heights are 44, 48, 52 and 56; there are six secondaries and four destructives, and "Reset" is drawn as destructive.
7. **Case.** Title Case and sentence case sit side by side, and the same action is spelled both ways.
8. **Empty states.** A styled serif block on some screens, a plain grey sentence on others.
9. **Filter controls.** Two tab styles, and a look-alike segmented control.
10. **Type marker.** Some type-like badges are neutral and others carry the type colour.
11. **List rows.**
12. **Forms.** The x16, x30 and x40 field insets.
13. **Containers.**
14. **Search fields.**
15. **Error states.**
16. **Icons.**
17. **Sheets.**

## Numbers across the 93 audited screens

These counts are of visible text nodes, or of controls for heights, gathered over all screens.

- **Font sizes (px):** 9 (27), 10 (32), 11 (139), 12 (179), 13 (458), 14 (500), 15 (254), 16 (279), 17 (139), 18 (12), 20 (10), 22 (31), 24 (19), 28 (76), 30 (15), 32 (1), 34 (9), 36 (2), 44 (3), 57 (6), 72 (6), 88 (1), 96 (1). That is 23 sizes.
- **Font weights:** 400 (973), 500 (645), 600 (554), 800 (27).
- **Font families:** Inter 1993, Fraunces 184, Helvetica Neue 20 (map attribution only), ui-sans-serif 2 (SO13 share fallback).
- **Text colours:** #f3ede4 (999), #9c9287 (585), #bdb3a7 (400), #1a1408 (93, text on gold), #d06a7c (40), #c9a15b (25), #0e0c0f (21), #e07a6a (8), #c98a2b (7), #6faf7b (6), #7fb3b9 (5), #8e9bd0 (3), #c8925e (2), #b88a72 (2), an oklab value (2), #e8e8e8 (1). That is 16 colours.
- **Corner radii (px), elements with a background or border:** 3 (50), 4 (215), 6 (100), 10 (55), 12 (687), 20 (202), full or pill (404).
- **Button heights (filled or bordered controls):** 28 (4), 36 (153), 40 (20), 44 (231), 48 (7), 52 (1), 56 (3).
- **Content left edge, as the leftmost text x on each screen:** -1 (5, map), 15 (2), 16 (46), 19 (4), 20 (6), 22 (1), 24 (2), 29 (2), 32 (16), 36 (1), 37 (1), 40 (2), 45 (2), 56 (1).
- **Page container x:** 16 on almost every screen; 0 on map, make mode and recap; 40 on SH01/SH02; 32 on CI25/SH09.

## Kinds that are consistent

- **Bottom sheet.** One `BottomSheet` component: top r20, glass at 82%, 22/600 title. It is identical on CI14, CI15, CI16a, PM05, SO10 and X01.
- **Tab bar.** It is the same on every tabbed screen: 56 gold ＋ and Lucide icons with the active tab at stroke 2.25.
- **Default primary button.** 44 r12 gold #c9a15b at 14/500 on most screens; the other primary sizes are the exceptions listed above.
- **Overline type style.** 11/600 uppercase #9c9287 with 0.66 letter-spacing; only its x position varies, and one sheet uses #bdb3a7.
- **Type-chip.** 24h tinted pill in the type colour, consistent everywhere except the larger brand-detail chip.
- **Input field style.** 44 r6 translucent with a 1px border and labels 14/500 above, except on the auth screens.
- **Page container at x16.**
- **Icon set.** Lucide, stroke-only, everywhere except the custom star and heart glyphs.
- **`EmptyState` title style.** 28/600 Fraunces with a 15/400 #bdb3a7 line, wherever that component is used.
- **Required-field asterisk.** It looks the same, although two slot components draw it (`label-asterisk` and `asterisk`).

## What could not be checked

- **Loading states:** none were captured, because the pages had settled before measurement. The source has Skeleton in 30 files, spinners in 65 and `PageLoading` in 3, so there are likely several loading treatments, but none were seen.
- **Toasts and inline confirmations:** none fired, because mutations were blocked. The source calls `toast()` in 15 files.
- **Dialogs, menus and popovers:** none were opened. Only bottom sheets and the map's floating card were seen.
- **Missing pairs:** RS06 and RS07 (no recipe group for the account); SH04 (sign-up, skipped); CI16b, PM07b and PM12b (not present in the after capture).
- **Scrolled frames:** CI04, CI13, CI21, SO09 and RS09 were measured at the top of the page; their start-scroll was not applied.
- **Elements under the tab bar or a sticky banner:** for some screens the measured element sat under the tab bar or a sticky banner (PM06 tabs, CI20 log entries, SO01 empty line, CI05 card names). Those crops were re-shot scrolled or taken from a sibling pair. The share page's score (score-7) has no crop.
- **Light theme:** dark is the only theme.
- **Motion and press states:** not checked.
