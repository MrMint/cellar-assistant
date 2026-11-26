# Kit: one look for every screen

Written by the `kit` designer from the settled boards (2026-11-26), saved by the lead, with the
lead's rulings at the end (they win where they differ). Boards:
`.builds/design-pass-2026-11/canvas/project/kit/Kit.dc.html` ("Kit · Look", 390 wide) and
`Kit-desktop.dc.html` ("Kit · Desktop", 1440×900); renders `render/out/kit-*`. Both pass the
board checker; text contrast is at least 4.5:1 and glyphs 3:1 in both themes.

## 1. Tokens

### Colour (dark / light → today's token)

Surfaces: bg `#111015` / `#f5f4f8` (`--ca-bg`); card `#221f2a` / `#ffffff` (`--ca-surface-1`);
raised `#332f3e` / `#ebe9f0` (`--ca-surface-2`; also the no-photo well); sel `#443f53` /
`#dedbe7` (`--ca-surface-3`, pressed and selected).

Lines: edge `#433f4d` / `#d6d3de` (`--ca-line`: fields, tiles, chips, buttons); edge-2 `#71678a`
/ `#978fa9` (new: switch track, avatar ring, selected chip, toast edge; 3:1 on card); hair
`#2c2936` / `#e4e2ea` (new: row dividers); rule `#3c3847` / `#e1dee7` (new: section rules); dash
`#5d5870` / `#a39db3` (new: dashed add outlines, desktop hover edge).

Text: ink `#ffffff` / `#17151c` (`--ca-ink-1`); ink-2 `#b8b5c0` / `#4a4656`; ink-3 `#aea9bd` /
`#5c576b`; glyph `#857e9f` / `#7d7791` (new: icons that are not text, 3:1 minimum).

Action: act `#70a2a9` / `#5f949b` with on-act `#111015` / `#0e0d12` (action fills: primary,
Add, switch on; replaces brass in `--ca-accent`; `--on-act` → `--ca-on-accent`). act-ink
`#8cc0c6` / `#2d6a71` (action text, links, focus ring, Undo; takes `--ca-ai`'s place). The AI is
marked by the sparkle glyph and its words, never by colour.

Gold `#d59d24` / `#b07a10`: the owner's own verdict (see rulings). Heart `#fe0000` / `#e0001b`:
hearts only. Danger `#f0c5c8` / `#b3261e`: text and outline only, never solid.

Bands (both themes): k5 `#4fb469`, k4 `#9cc25a`, k3 `#e5c84a`, k2 `#ec8f3e`, k1 `#e8615a`, ink
on band `#111015` (`--ca-band-5..1`). Map "you are here" `#3d7ef0` (new).

No-photo face: the raised well; a drink shows a drawn label plate (card fill, 1 px edge, r8,
52 % × 58 %, the name inside); a place shows its flat kind glyph in glyph colour. Never a stock
image.

Overlays (new): scrim `rgba(8,7,12,.62)` / `rgba(23,21,28,.42)`; quick-look scrim
`rgba(8,7,12,.78)` / `rgba(23,21,28,.62)` with an 8 px backdrop blur under its counter; glass
`rgba(17,16,21,.86)` for discs on photos; toast fill `#332f3e` edge `#71678a` (dark) and
`#2a2733` (light: the toast stays dark), ink `#fff`, action `#8cc0c6`; skeleton `#3c3847` /
`#e2dfe8`. Desktop only: ring `#e6e3ee` / `#17151c` (2 px selection), sh-dlg (below).

### Type (Inter only; `t-*` replaces `type-*`; tabular figures for numbers)

| Style | Size/line, weight | Use | Today |
|---|---|---|---|
| t-score | 40/44 700, -.02em | rank numerals, big score | type-numeral-xl |
| t-title | 24/28 700, -.01em | page and hero names, section heads | large-title, title-1, title-2 |
| t-quote | 20/28 400 | the owner's note | new |
| t-head | 16/20 600 | row titles, buttons | headline |
| t-body | 16/22 400 | body, field values | body |
| t-cap | 13/17 400 | meta, toast, subtitles | footnote, callout |
| t-micro | 11/14 600, +.01em, sentence case | tab labels, tags | overline (never caps) |
| t-pin | 12/15 600 | map pins, "Open · 16%" badges | new |

### Spacing, radii, elevation

Spacing 4, 8, 12, 16, 24, 32; gutter 16, row gap 12, section gap 24 to 32; touch targets
44 × 44 or more. Radii: 2 grabber, 4 no-photo plate, 6 small badges, 7 segment, 8 fields, chips,
tiles, buttons, toast, 16 sheet tops, switch, avatar, desktop dialog, 22 the 44 px discs.
Elevation: sh-bar `0 10px 12px -10px rgba(4,3,8,.9)` / `rgba(40,36,52,.22)` (sticky bars);
sh-pop `0 12px 32px rgba(4,3,8,.6)` / `rgba(40,36,52,.18)` (sheets, toast, popover); sh-dlg
`0 20px 48px rgba(4,3,8,.7)` / `rgba(40,36,52,.24)`. Containers are tonal; nothing else casts a
shadow.

### Motion, haptics, sound

Motion as `.builds/design-pass-2026-11/motion/SPEC.md` and `lib/motion.ts`: micro 90, short 160,
medium 240, long 400 ms, exits at ⅔; springs snappy (settles ~302 ms), sheet (~350),
celebrate (~597); press .97; hold 400 ms, slop 10 px, edge 20 px committing at 35 %, fling
.5 px/ms, pull arms at 64 px, sheets dismiss past 30 %; rows arrive 8 px up, 30 ms apart, at
most 6; toast 5000 ms; skeleton after 120 ms, held 300 ms. Transform and opacity only; reduced
motion becomes a cross-fade at micro.

Haptics (Fettle): tick [10], detent [8], hold [14], undo [8,30,8], success [12,40,18], medium
[14,50,14,50,20], big [18,60,18,60,30,90,40], refuse [30,40,30]; under reduced motion success,
medium and big play as one beat.

Sound (DECISIONS 42, SPEC § Sound): press asus-kbd-soft (press and release), primary
asus-kbd-medium, toggle and success asus-kbd-space; volume 0.3, pitch ±0.05.

## 2. Components (settled; sizes at 390)

- **Tab bar** (Cellar-flow → TabBar): 64 tall; Cellars, Search, Map, Lists, More as glyph over a
  t-micro label; Add as a teal pill; Me as a 32 avatar. Current = ink and weight; press .97;
  tick on change. Never hides on scroll.
- **Top bar and discs** (item page, Landing → AppBar, IconButton): 44 glass discs over photos
  (back, menu); plain icon buttons on surfaces; always an aria-label.
- **Search field** (Cellar-flow → new): 44 tall, r8, edge, glyph at 12; focus ring act-ink;
  clear button while typing; a no-match state.
- **Sort button and sheet** (Cellar-flow → SortChip + BottomSheet): 44 tall, glyph plus the
  current order in words; sheet "Arrange" with "Jump to a letter", groups Name A to Z / By maker
  / By style / Shelves and Newest / Latest activity / My rating best / Not rated yet / Least left;
  a check on the current one; detent on choose.
- **Count strip** (→ new): 44, r8, edge; "240 bottles · A–Z", "· 12 match" when filtered.
- **Cellar tile** (→ new): card, 1 px edge, r8, square photo, name t-head (two lines then
  ellipsis), maker t-cap, foot of stars and score or "Not rated"; wide tile spans two columns
  with the note in t-quote; no-photo plate; "Open · 16%" badge; press .97.
- **Place row** (Map, Landing → ListRow): 56 minimum, 54 thumb, name, kind · distance, public
  rating at right.
- **Rank chip and band bar** (Tier-list → new): filled chip "#n"; band bar in k5..k1; the band
  sheet; move toast "Moved to Very Good · #27 · Cafe Blue" with Undo; detent at each band
  boundary in the scrubber.
- **Stars** (→ Score, RatingInput): owner's gold, half steps, tabular score, tap to rate;
  empty outline in glyph colour; public "4.7 (240)" in ink-3 with the people glyph, never gold;
  tick per star.
- **Heart**: 44 target, outline in glyph, filled in heart; celebrate spring and success.
- **Buttons** (→ ActionBar, buttons): 44, r8, t-head. Primary act fill (one per screen);
  secondary edge outline; quiet act-ink text; destructive only inside a confirm, outlined in
  danger with a trash glyph beside "Keep it". Press .97; disabled 40 %.
- **Chips** (→ FilterChip): 44, r8, edge; on = sel fill, edge-2, ink.
- **Toast with Undo** (→ notify): 48 minimum, r8, one line (ellipsis), Undo in act; 16 from the
  sides, 76 from the bottom or 12 above an open sheet; pauses while a quick look is open; one at
  a time; undo haptic.
- **Bottom sheet** (→ BottomSheet): r16 tops, 36 × 4 grabber, max 788, sh-pop; closes on drag
  past 30 %, scrim tap, Esc; sheet spring.
- **Quick look** (Motion study → new): full-bleed card over its scrim; photo, name, meta, stars,
  Open page; places add Directions on its own row; counter "3 of 240" on a blurred disc; swipe
  for next; Esc or X closes; opens on a 400 ms hold with the hold haptic.
- **Page hero** (item page → Page): 300 photo, glass discs, name t-title below.
- **History row** (→ new): 32 glyph disc, the event ("Checked in", "Rated 4.0"), date t-cap.
- **Skeleton** (→ LoadingShell), **empty state** (glyph, title, one action) and **error state**
  (what happened, one way out) (→ EmptyState).

## 3. Pilots (accepted by the lead, see rulings)

- **Settings list:** profile row (32 avatar, "Edit profile"); Appearance segmented Dark / Light
  / Phone (42 tall, r7); **Sound and haptics**: Sounds switch (default on, "Follows the
  iPhone's silent switch") and Haptics On / Off as segments (a switch would tick on iPhone even
  with haptics off); Use my location (switch); Who sees your cellars (value row); Sign out.
  Switch 52 × 32, r16, off = sel with edge-2, on = act; toggle sound and tick. Rows 44 minimum.
- **Form:** text field 44 r8; picker opening a sheet; number with unit (accepts a comma); field
  in error with danger text below, keeping its value; a read-from-the-label field with the
  sparkle and "From the label" (→ AIDraftField).
- **Person row and avatar:** initials on raised with an edge-2 ring, 32 or 44; never a real
  person's photo; demo seed names.
- **Activity feed item:** check-in, rating, new #1 (with the crown); avatar, one line, time.
- **Chart:** the owner's stars histogram in one hue (act), 4 px rounded bar ends, 2 px gaps,
  value labels in ink-2; one trend line 2 px with a tap crosshair; one axis, no legend.
- **Stat tile:** one t-score number, a t-cap label, an optional delta in words.
- **Share sheet with QR:** QR, link, Copy ("Link copied"), Share. (The board's QR is a stand-in.)
- **Sign-in:** email, password, primary Sign in, quiet links; wrong password shows danger text
  under the field; no photos before sign-in.
- **Confirm sheet:** "Delete A Song of Fire?", "Its rating, note and history go too.", Keep it
  and an outlined Delete (→ ConfirmSheet; desktop ResponsiveDialog at 440).
- **Permission request:** ask in our words first, then the phone asks; denied shows the way to
  Settings; never a dead end (the map works without location).
- **Offline:** a 40 strip "Offline · changes wait"; changes queue; clears to "Back online".
- **Desktop** (Kit-desktop): 88 rail replacing the tab bar (64 items, Add a teal 48 × 40,
  tooltip with its key after 400 ms); 76 header with title, 320 search ("/") and sort; grid
  columns `max(2, ⌊(width+16)/200⌋)`, gap 16; hover brightens the edge to dash and scales the
  photo 1.03; selected = 2 px ring (act-ink when moved by keyboard); 440 pane replacing the quick
  look; 280 popover at its control replacing a sheet; 440 dialog replacing a confirm sheet; toast
  centred over the list, 460 wide. Keys: J/K or arrows, Enter, Esc, 1–5 rate, ⌫ clear rating,
  / search, T tiles or rows, M map, F favourite, O open page, ? keys.

## 4. Rules

- **Word ceilings** (visible words, not names or data): list screen 40, page 60, sheet 25,
  confirm 15, empty 12, error 15, toast 8 plus Undo, setting label 2 to 4 with a subtitle of at
  most 6, button 1 or 2. When a state needs a sentence, draw the state instead.
- **Never moves:** the tab bar or rail; a list's sticky top bar; the owner's stars on a tile;
  the tier list's scrubber (left). Destructive is never first or primary.
- **Touch:** 44 × 44, 10 px slop on holds; a glyph is never a control's only label.
- **Contrast:** text 4.5:1, glyphs and boundaries 3:1, on every surface, both themes; gold is
  never text alone.
- **Sheet or page:** a sheet chooses, confirms, or holds a short form (6 fields or fewer) and
  returns to where you were; a page has its own history, can be linked or shared, or is longer.
  Desktop: a sheet becomes a popover at its control, a confirm becomes a dialog.
- **Quick look:** peek without losing your place (hold 400 ms, or the photo in a dense grid);
  Open page is always one tap away; on desktop it is the pane.
- **Toast or confirm:** confirm only when Undo cannot bring back something the owner made
  (deleting a bottle with its rating, note and history; deleting a list). Everything else acts
  at once with Undo. One toast at a time.
- **Esc and back** close what is on top: quick look, sheet, dialog, popover, pane.
- **Empty and error wording:** say what is missing in the person's own terms and the one action
  ("No bottle matches “q”" · Clear search); errors say what happened and the one way out, no
  apology, no code; offline: changes wait, nothing is lost.
- **Sound** only for what the person touches or holds; on iPhone it carries the hold, band
  boundaries and pull arming; follows the silent switch; Sounds on by default.
- **Haptics** is a two-segment choice; reduced motion plays celebrations as one beat.
- **Formatting:** narrow no-break space before units ("1.2 mi"); tabular figures; sentence case.

## 5. Conflicts between settled boards, and the picks

1. Gold: the crown and trophies are gold too → gold means the owner's own verdict (ruled below).
2. Motion constants: Cellar-flow drifts from SPEC → SPEC and `lib/motion.ts` win.
3. Press scale .95 to .98 → .97.
4. No-photo face → drawn label plate for drinks, kind glyph for places.
5. Destructive confirm: one board drew solid danger → outlined danger with "Keep it", everywhere
   (stricter than AGENTS.md; drop the solid variant).
6. Chip radius: the map drew pills → r8 everywhere.
7. Place-row thumb → the tier list's 54.
8. Field border: two greys → one edge token.
9. Toast 4000 vs 5000 → 5000.
10. Action colour: README says brass → teal (DECISIONS 40a); brass is retired.
11. Typeface: AGENTS.md says Fraunces for hero names; every settled board draws Inter → Inter.
12. Refinements: quick-look counter on a blur; Directions on its own row in the place quick look.

## 6. Flags from the designer

- Profile edit today is the name only; the pilot says "Name and picture" (the picture is new work).
- The QR is a stand-in, not a real encoding.
- Light values are proposed; no settled board drew light.
- Keys T and M are listed but not wired on the board.
- New tokens for `globals.css` and `tokens.ts`: ring, sh-dlg, here, glyph, hair, rule, dash,
  edge-2, the overlays.
- No primitive yet for: switch, tile, quick look, pane, popover, kbd and tooltip, history row,
  chart, stat tile, permission request, offline strip.

## Lead's rulings on the kit (2026-11-26, DECISIONS 43)

1. **Accepted**, pilots included, as the look every area board draws in. Area designers use the
   kit's parts as drawn; a part the kit lacks is drawn in its language and listed in the
   designer's report.
2. **Gold** means the owner's own verdict: their stars, the crown on their #1, their own
   trophies and stamps. Never another person's, never the public rating, never text alone.
3. **Light theme:** the values stand as proposed; area boards are drawn in dark (the default)
   only. Light is checked per area in the review round by contrast audit, not drawn by hand.
4. **Inter only** and **teal action**: `AGENTS.md`, `design-direction.md` and the primitives'
   README are updated to match at hand-off, not now.
5. **Word ceilings** stand as proposed; the critic checks them.
6. **Profile picture:** yes, as new work (an initials avatar until one is set; still never a
   photo of another person on any board).
