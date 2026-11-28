# Cellar Assistant design and motion direction

> **The stack and the look as they are (2026-11 redesign).** This brief was written in 2026-10.
> Where it disagrees with this box, the box wins; §1, §3.1, §3.2, §3.8, §4.2, §4.5 and §4.11 are
> rewritten to match, and elsewhere a mention of Fraunces reads as Inter and of brass as the
> action teal. Values live in `docs/design/2026-11/KIT.md` and `services/client/src/app/globals.css`;
> the decisions are D20 ([`decisions.md`](decisions.md)) and the redesign's DECISIONS 40a, 43 and 46
> (`docs/design/2026-11/DECISIONS.md`).
>
> - **Platform:** Tailwind CSS v4 + shadcn-derived primitives on Radix + `motion`. App primitives
>   in `components/app`, vendored shadcn in `components/ui`. Joy, Emotion and `framer-motion` are gone.
> - **Colour:** teal is the action colour (fills, links, focus, Undo). The AI is marked by the
>   sparkle glyph and its words ("Read from the label"), never by a colour. Gold is only the
>   owner's own verdict (their stars, the crown on their #1). Brass is retired.
> - **Type:** Inter only. Fraunces is dropped.
> - **Themes:** dark (the default) and light are both designed, and Settings offers Dark / Light /
>   Phone. This replaces D21's "light mode only on evidence".
> - **Motion:** `lib/motion.ts` holds motion/SPEC.md's tokens; route transitions are
>   `app/view-transitions.css`.
> - **Feedback:** `lib/feedback` fires a haptic and a quiet sound by one name, under one "Sound and
>   haptics" setting.

**Brief:** "a candlelit cellar, a sommelier's notebook, and a little magic."

This is the brief for the intentional overhaul. It is Track B of `ux-review-roadmap.md`:
- **B01–B06** are the overhaul itself.
- **N11, N27 and N28** are its first, small, Now-horizon pieces.
- **D20 and D21** are its platform and palette decisions.

It deliberately replaces the "restored verbatim" look (docs/archive/nhost-migration/ui-parity-decisions.md). It is grounded in two sources:
- the 2026-10-05 capture, taken on tree b2c5f541;
- the verified findings: visual-1…18, motion-1…18, shell-3/12/13, map-13/15/16 and recipes-11.

Contrast ratios here are computed (WCAG 2.x relative luminance), not estimated.

**Rule zero:** Track A fixes never wait for this brief, and Track B never restyles a page without a primitive behind it. Four exceptions ship early on purpose:
- **N11:** contrast and fonts.
- **N27:** the sheet and toast APIs.
- **N28:** LabelPlate v0, on today's type colours.
- **The one-PR brass flip (§3.1).** Without it, teal would have meant "action" and "AI" at the same time. (Superseded in 2026-11: teal is action again, and the AI has no colour; see the box above.)

---

## 1. Platform

**Tailwind CSS v4, shadcn-derived primitives on Radix, and `motion`** (D20). The 2026-10 brief
recommended staying on Joy behind a primitive layer; D20 replaced that, and the migration is done:
`@mui/joy`, Emotion, `sx`, `react-icons` and `framer-motion` are gone, and
`src/lib/dev-checks/ui-platform.test.ts` fails on any use of them.

| Layer | Where | What it holds |
|---|---|---|
| Tokens | `src/app/globals.css` (`--ca-*`, both themes), `src/lib/tokens.ts` | colour, type, spacing; `tokens-parity.test.ts` keeps the two equal |
| Vendored shadcn | `src/components/ui/*` | Radix-backed parts (dialog, sheet, select, …), not edited in feature work |
| App primitives | `src/components/app/*` | AppShell, TabBar, AppBar, Page, ListRow, BottomSheet, Toast, Score, RatingInput, … (its README) |
| Motion | `src/lib/motion.ts`, `src/app/view-transitions.css` | every duration, curve, spring, distance and gesture threshold (§4.2) |
| Feedback | `src/lib/feedback` | haptics and sound by one name (§4.11) |

Pages use app primitives first, then `ui/*`, then Tailwind on plain elements.

**The primitive set (2026-10 plan, kept for its history).** Each primitive owns its tokens, states, accessibility and reduced-motion behaviour. "Ships in" is the first roadmap item that introduces it.

| Primitive | Ships in | Replaces | Notes |
|---|---|---|---|
| `AIDraftField` | **N19** | plain inputs after "Analyzing…", the "Auto-filled from pin" one-off, amber "?" boxes | `source: "label" \| "suggested" \| "pin" \| "barcode"`; `confidence` added in X05; see §3.8 |
| `BottomSheet` | **N27** (v0, no physics) → B04 | hand-rolled place drawer, centred modals, black popovers | same props in v0 and v1; see §4.6 |
| `Toast` | **N27** | toasts that cover the nav (obs 41) | above the tab bar; `action="Undo"` slot |
| `LabelPlate` | **N28** (6 silhouettes) → B03 (~15) | per-type PNG clip art | see §3.5 |
| `itemTypeTokens` (module) | **N28** | ITEM_TYPE_COLORS vs ITEM_TYPE_JOY_COLORS; swapped spirit/sake icons; two type orders | one order, one colour set, six glyphs |
| `AppBar` | **N26** → B02 restyle | breadcrumbs-only headers, five title styles | Back (nav-depth counter → `router.back()`, else the declared parent); large title collapsing on scroll; at most 2 trailing icons plus a `⋯` overflow (a sheet on phones) |
| `EmptyState` | **N15** (v0) → B02 | grey one-liners, blank tier boards | illustration, one serif line, exactly one action |
| `Page` | B02 | ad-hoc 6–52 pt gutters | one 16 pt gutter token, safe area, max-width 720 (1120 with a rail on desktop) |
| `InsetSection` | B02 | bordered "box soup" cards | overline label, tonal surface-1, hairline rows, no border |
| `ItemTile` | B02 | ItemCard plus the Recent Activity row | `density="row" \| "grid"`; no zero stats |
| `Score` | B02 | six score renderings | `inline` (4.5★, tabular), `pill`, `hero`; one decimal, only when non-zero |
| `TypeChip` / `TypeGlyph` | B02 | icon-only type toggles | always glyph plus word on touch |
| `ActionBar` | B02 | header button rows, a top-level red Delete | one primary, floating above the tab bar, safe-area aware |
| `SegmentedControl` | B02 | icon-only ToggleButtonGroups with `aria-label="text formatting"` | always text labels |

---

## 2. The mobile shell and IA this brief assumes

**Targets:**
- Viewports: 390×844 first, 375×667 second, desktop third.
- Platform: an installed PWA (standalone) on iPhone and Android, so no browser chrome; the edge swipe back and pull to refresh are the app's. Haptics: Android vibrates; iPhone ticks only inside a real tap (§4.11).
- Grip: one-handed, within thumb reach.

```
┌──────────────────────────────┐
│ ‹  Home Cellar          ⋯    │  AppBar: Back (in-app history), collapsing title
│                              │
│  …content (inner scroller)…  │  Page: 16pt gutter
│                              │
│      [  Pour · Check in  ]   │  ActionBar: floats 12pt above the tabs
├──────────────────────────────┤
│ Home  Cellar  (＋)  Map  Me  │  Tab bar: labelled, frosted, under the home indicator
└──────────────────────────────┘
```

**Tab bar: five labelled tabs (Home · Cellar · ＋ · Map · Me, roadmap X01).**
- Labels are visible.
- A tab counts as active when the current route starts with its path.
- The highlight changes the moment you tap (N12).
- Re-tapping a tab scrolls to the top, then pops to its root.
- The bar is 49 pt plus the safe area, on a frosted `surface-glass`.

**Centre ＋ is the capture button, in the action teal.** It is 56 pt and sits 8 pt proud of the bar.
- **X01:** it opens a chooser sheet (Bottle · Menu · Recipe · Place) that leads into today's flows, so there is a single capture entry right away.
- **X06:** it opens the full-screen capture surface instead.
  - The shutter is bottom-centre, with Library on the left and Torch on the right.
  - A mode row offers Bottle · Menu · Recipe. It defaults to **the last mode used**; there is no classifier call.
  - When a label read abstains with `surfaceKind: menu`, the draft offers "Looks like a menu, scan it as a menu?"

**Where every current destination lives (D1):**

| Today | Goes to |
|---|---|
| /search (de-facto home) | Home. A search field at the top opens a full-screen search sheet (from X10; until then `/` keeps redirecting to `/search`). |
| /cellars, /cellars/[id], /cellars/[id]/items | Cellar tab: cellar switcher plus Collection · Open · Finished · **Bar**. |
| /recipes, recipe pages, the AI generator | Cellar › **Bar** segment, plus a Recipes section in search, plus ＋ › Recipe. |
| /tier-lists | Me › Lists, pinned first, plus a Home "Friends ranked" card. |
| /rankings | Me › Lists › "Top rated", plus the You · Friends · Everyone header on item pages. |
| /favorites | Me › Lists › "Loved". |
| /friends | Me › Friends, with a request badge. |
| /brands | Reached from item pages and search; not in the nav. |
| /discoveries, /map/scans | Home "Waiting on you", plus the Map sheet's Loved · Been · Want · My scans. |
| /{type}s indexes | Redirect to Loved, filtered by type (D7). |

**Other screens:**
- **Map:** a full-bleed map under a three-snap sheet, with search at thumb height.
- **Detail screens** all follow one recipe: a hero (a photo or a LabelPlate), then a state line, then InsetSections, then one ActionBar primary. Edit, Share, Move and Delete live in `⋯`, with Delete last and a confirm sheet behind it.
- **Tab bar on detail routes:** it stays visible, with the ActionBar floating above it. It hides only in capture, make mode and full-screen sheets.
- **Scrolling:** keep the inner scroller (D26). Add a custom pull-to-refresh on tab roots (§4.9).

---

## 3. Visual language

### 3.1 Palette: two designed themes, built as roles

Dark is the default and light is designed alongside it (DECISIONS 46). Every value is a role
token in `globals.css`, so the theme is a swap of values, never of names. The full table, with the
overlays, is `docs/design/2026-11/KIT.md` § 1.

| Role | Dark | Light | Use |
|---|---|---|---|
| Background | `#111015` | `#f5f4f8` | page; also `themeColor` |
| Card | `#221f2a` | `#ffffff` | sections, tiles |
| Raised | `#332f3e` | `#ebe9f0` | sheets, the no-photo well |
| Selected | `#443f53` | `#dedbe7` | pressed and selected |
| Edge | `#433f4d` | `#d6d3de` | fields, tiles, chips, buttons |
| Ink 1 / 2 / 3 | `#ffffff` / `#b8b5c0` / `#aea9bd` | `#17151c` / `#4a4656` / `#5c576b` | text |
| Action | `#70a2a9` with ink `#111015` | `#5f949b` with ink `#0e0d12` | primary, Add, a switch that is on |
| Action text | `#8cc0c6` | `#2d6a71` | links, focus ring, Undo |
| Gold | `#d59d24` | `#b07a10` | the owner's own verdict only, never text alone |
| Heart | `#fe0000` | `#e0001b` | hearts only |
| Danger | `#f0c5c8` | `#b3261e` | text and outline only, never solid |

Rules:
- **Teal means action** (DECISIONS 40a, 46). Nothing decorative is teal.
- **The AI has no colour.** It is marked by the sparkle glyph and its words ("Read from the
  label"), so a drafted value looks like any other value with a mark beside it.
- **Gold is the owner's own verdict:** their stars, the crown on their #1, their own trophies.
  Never another person's rating, never the public rating.
- **Contrast:** text 4.5:1, glyphs and boundaries 3:1, on every surface, in both themes
  (`palette-contrast.test.ts`).

**Six beverage-type hues.** These live in `itemTypeTokens`, which ships with N28. Each type has three values:
- **deep:** pins and rules;
- **tint:** about 18% over surface-2, used behind LabelPlates;
- **text-safe:** a colour that reaches at least 4.5:1, for text on dark.

| Type | deep | text-safe | Glyph |
|---|---|---|---|
| Wine | `#8E2A3A` claret | `#D06A7C` (5.25) | Bordeaux bottle |
| Beer | `#C98A2B` amber | `#C98A2B` (6.22) | tall-neck or can |
| Spirit | `#9A6A3C` oak | `#C8925E` (6.72) | decanter (not a cocktail glass) |
| Sake | `#5E6FA8` indigo | `#8E9BD0` (6.74) | tokkuri (not a whisky tumbler) |
| Coffee | `#6B4A3A` roast | `#B88A72` (6.02) | bag with valve |
| Tea | `#5E8C6A` jade | `#7FB08C` (7.39) | gaiwan or tin |

The canonical order is the same everywhere: **wine, beer, spirit, sake, coffee, tea**.

**Tier bands** are the same in both themes: 5 `#4fb469`, 4 `#9cc25a`, 3 `#e5c84a`, 2 `#ec8f3e`, 1 `#e8615a`, with ink `#111015` on every band. The band word is always printed, so the hue never carries meaning on its own.

**Banned:**
- solid red or green toggle slabs;
- Material default chart hues;
- any hex outside the token file. The B01 vitest guard enforces this, with an allowlist for MapLibre paint and the offline page.

### 3.2 Typography

**Inter only** (DECISIONS 43, 46; Fraunces is dropped), loaded once through `next/font`. Numbers
are always tabular (`tabular`). The `t-*` utilities replace the `type-*` ones.

| Style | Size/line, weight | Use |
|---|---|---|
| `t-score` | 40/44 700, -.02em | rank numerals, a big score |
| `t-title` | 24/28 700, -.01em | page and hero names, section heads |
| `t-quote` | 20/28 400 | the owner's note |
| `t-head` | 16/20 600 | row titles, buttons |
| `t-body` | 16/22 400 | body, field values (16 or more, so iOS never zooms) |
| `t-cap` | 13/17 400 | meta, toast, subtitles |
| `t-micro` | 11/14 600, +.01em | tab labels, tags, in sentence case |
| `t-pin` | 12/15 600 | map pins and their badges |

Rules: sentence case everywhere, no ALL CAPS; names are stored as transcribed and shown in smart
title case (N17).

### 3.3 Shape, spacing and elevation

**Radius:**
- 6 for inputs;
- 12 for tiles and LabelPlates, with a 3 px inner "paper" rect;
- 20 for cards, sheets and the capture surface;
- full pill for filters.

**Spacing:**
- 8 pt grid with a 16 pt gutter.
- 12 within a section, 24 between sections.
- Touch targets at least 44×44 (N12 enforces this on IconButton).

**Elevation is tonal, not shadowed:**

| Level | Surface | Highlight | Shadow | Used for |
|---|---|---|---|---|
| 0 | bg | none | none | page |
| 1 | surface-1 | none | none | InsetSection |
| 2 | surface-2 | 1 px top `rgba(255,240,225,.06)` | none | tiles, inputs |
| 3 | surface-2 + `backdrop-filter: blur(20px) saturate(140%)` | top highlight | `0 12px 32px rgba(0,0,0,.55)` | sheets, tab bar, toasts, ActionBar, capture button |

Containers have no borders. This ends the "box soup": the bottle page currently stacks 7 identical bordered cards (visual-9).

### 3.4 Iconography

- **Base set:** Lucide at a 1.75 px stroke, with a filled variant for active states. It replaces today's MD/FA/FA6/BS/FC/AI mix.
- **Beverage glyphs:** six custom glyphs on the same grid, with the spirit and sake glyphs corrected (visual-7).
- **No bare glyphs:** a glyph is never a control's only label on touch.
- **Accessible names:** every IconButton gets an `aria-label`. Today 25 of 47 have none.
- **Medals:** a gold crown on the owner's #1 alone; every rank is a filled band chip.

### 3.5 Imagery for items with no photo: the biggest visual lever

Today every wine is the same lilac bottle, cocktails get wine art, and a winery gets beer art (visual-2). On `cellars__cellar-items-home__m390__populated__fold.png`, the one tile showing the user's own label photo is instantly recognisable, and the others are interchangeable. That is the whole case for this section.

Images are chosen in this order:

1. **The user's photo** on a type-tint backdrop. The auto-crop to the label comes later, Gemini-only, via `labelBox`. Until then, use a centred 3:4 crop.
2. **A typographic LabelPlate.** It is a deterministic SVG, with zero AI and zero runtime cost.
   - Type tint background, shaded by style, with faint paper grain.
   - An inner paper rect holding:
     - the **producer** in Inter, `t-cap`;
     - the name;
     - **a big vintage** (or "NV");
     - region · ABV.
   - A vessel silhouette at 12% opacity.
   - **v0 (N28):** one silhouette per type, about six in all, drawn inside today's ItemCard fallback slot. That changes the first cellar screen this month, alongside N13b's BottleCard.
   - **B03:** about 15 silhouettes chosen by style: Bordeaux, Burgundy, flute, Alsace, can, tall-neck, stubby, isshobin, tokkuri, decanter, square spirit, coffee bag, tea tin, pouch, sake carton.
3. **Recipes:** a glass silhouette, coloured from known ingredients, plus a garnish glyph.
4. **Places:** a static dark map snippet plus a category glyph, or a Google photo where the budget allows.

The existing illustrations move to EmptyStates and first run. Delete the unused PNGs, about 8.2 MB in the repo.

### 3.6 Empty, error and first-run states

`EmptyState` is one illustration, one `t-head` line, one `t-cap` line and **exactly one** action. v0 ships with N15.

| Surface | Line | Action |
|---|---|---|
| Empty cellar | "Your cellar is waiting." | Snap a bottle |
| Empty tier list | "Nothing ranked yet." | Add from what you've tasted |
| No friends | "Taste is better compared." | Invite a friend |
| Search, no results | "No 'Copper Lantern' on the map yet." | Add it here |
| 404 or no access | "This page doesn't exist or isn't shared with you." | Go home (the tab bar stays) |
| Offline | "You're offline: showing what's saved." | Retry |
| AI paused (budget) | "Label reading resumes at 4:10 pm." | Fill it in yourself |

### 3.7 Data display rules

- Enums always go through `utilities/formatters.ts`.
- Counts name their noun ("53 bottles · 19 open") and are hidden when zero.
- Quantities use Unicode fractions, with an oz/ml preference.
- **Personal predictions are shown as evidence, never as percentages.**
  - Write "Like the Lagavulin 16 you rated ★4.5", "Test Two loved it", or "You agree on 7 of 9 shared wines".
  - Never write "For you 87%" or a cosine "72% match".
  - Below a minimum-overlap gate, show nothing.
- **Never show a model's guess as a figure.** No valuation, and no estimated drinking window. A style-table window reads "typical for Barbaresco: 5–15 years" (D29).

### 3.8 The visual language of AI

**One component, introduced early and restyled later.** `AIDraftField` ships in N19 on today's styles:

```ts
<AIDraftField
  source="label" | "suggested" | "pin" | "barcode"   // N19
  confidence?="sure" | "likely" | "check"            // X05 (schema fields declared after the values)
/>
```

Each source gets its own mark:
- **`label`:** a solid "from label" chip.
- **`suggested`:** world-knowledge inference (X19), shown as a dashed chip. Never applied automatically.
- **`pin`:** today's "Auto-filled from pin" chip, migrated onto this component.
- **`barcode`:** a barcode glyph.

It is marked by the sparkle glyph and its source in words, never by a colour (DECISIONS 40a):
- The sparkle beside the value, and the source as words ("Read from the label").
- Confidence in words: **Sure · Likely · Check this**. "Check this" fields are pre-focused.

Outside the field itself:
- **One Accept / Edit / Not this row** is used everywhere: menu matches, drafts, "try this next".
- **Working state:** the skeleton's shimmer plus the sparkle and a named stage line. Never an unexplained spinner.

---

## 4. Motion language

### 4.1 Principles

1. **Acknowledge every tap within a frame.** A 90 ms press state. A 2 px action-teal hairline if navigation is still pending after 120 ms. The press is also felt and heard (§4.11) where the device allows.
2. **Motion explains place and cause.** Depth for push and pop, continuity from card to hero, cause and effect for pour→level. Be optimistic first, then animate the reconciliation.
3. **Set a latency floor before choreography.** Route animation ships only after N12 (press) and X24 (loading shells). Otherwise a 400 ms slide after a 500 ms freeze makes the app feel slower.
4. **Visible at rest** (AnimateIn's rule). Nothing waits for a JS entrance on first paint.
5. **Animate transform and opacity only.** 60 fps on an iPhone 12-class device. Every animation can be interrupted.
6. **Delight is earned and short.** Only for moments the user owns. Each is 700 ms or less and can be skipped.

### 4.2 Tokens (`src/lib/motion.ts`, from motion/SPEC.md; durations and curves mirrored as `--ca-dur-*` / `--ca-ease-*`)

| Token | Value | Use |
|---|---|---|
| `dur.micro` | 90 ms | press, toggle colour, reduced motion's cross-fade |
| `dur.short` | 160 ms | tab crossfade, menu, list insert |
| `dur.medium` | 240 ms | skeleton→content, sheet fade, toast |
| `dur.long` | 400 ms | route slide, shared-element morph |
| `dur.celebrate` | ≤700 ms total | success moments |
| `exitOf` / `tweenOut` | ⅔ of the enter, on `ease.exit` | every exit (a back is 267 ms) |
| `ease.standard` / `enter` / `exit` | `(.2,0,0,1)` / `(0,0,0,1)` / `(.3,0,1,1)` | default / arrivals / departures |
| `spring.snappy` | 520 / 42 (settles ~302 ms) | reflow, toggles, drop |
| `spring.sheet` | 380 / 36 (~350 ms), with release velocity | sheets, the dock |
| `spring.celebrate` | 300 / 18 (~597 ms) | pops, stamps, heart |
| `distance` | route 60 px · list 8 px · press .97 · lift 1.03 · sheetFrom .94 · fan 56 px | |
| `calm` | fade 150 ms · sheet 120 ms | reduced motion's replacements, where SPEC names one |
| `reduced` | cross-fade at micro, opacity only | every other movement under reduced motion |
| `gesture` | claim 6 px · slop 10 px · edge 20 px, commit at 35 % · fling .5 px/ms (cap 5) · project 200 ms · rubber .2 · lift 150 ms · hold 400 ms · arm 250 ms · pull 64 px at .5 · swipe/dismiss at 30 % · decay τ 325 ms | gesture code |
| `stagger` / `staggerDelay` | 30 ms apart, at most 6 | list arrivals |
| `skeleton` | after 120 ms, held 300 ms | loading |
| `toastMs` · `refreshMs` | 5000 ms · 900 ms | toast, pull to refresh |

No literal spring, duration, curve or threshold anywhere else (`ui-platform.test.ts`).

### 4.3 Route and tab transitions: View Transitions on Next 16.3.4 (B05)

**Feasibility:**
- It works now, with no new dependency: `<ViewTransition>` plus `<Link transitionTypes>` (since 16.2). For `router.push`, use `startTransition` with `addTransitionType`.
- iOS Safari 18.0+ supports same-document view transitions. **Types need 18.2+**, and older versions fall back to today's cut.
- Verify on a real installed iOS 18 device before relying on the type-specific CSS.

**Implementation:**
- **Page-level wrapper.** A `<PageTransition>` wraps each `page.tsx`. Layouts persist and never enter or exit, so the wrapper can't live there.
- **Type inference.** `components/common/Link.tsx` infers the transition type: a deeper href is `nav-forward`, AppBar Back is `nav-back`, the tab bar is `tab`.
- **Codemod.** Move the 22 direct `next/link` imports and the 18 `router.push/replace` sites onto that Link.

| Type | Old page | New page |
|---|---|---|
| `nav-forward` | fade over 150 ms; translateX 0→−60 px | translateX 60→0 over 400 ms; fade delayed 150 ms |
| `nav-back` | mirror | mirror |
| `tab` | 160 ms crossfade, no movement | 160 ms crossfade |

- **Anchored chrome.** The tab bar and the capture button get `view-transition-name: app-nav` with `animation: none`.
- **Inputs during the transition.** Set `::view-transition { pointer-events: none }`.
- **Scroll on back.** The inner scroller restores scroll per route key itself. Next's own restoration targets the window, which never scrolls here.

### 4.4 Shared elements

- **Morph pairs:**
  - ItemTile plate and title → detail hero, with a 3 px blur mid-flight;
  - cellar card → cellar header;
  - tier row → item hero;
  - activity row → item;
  - map sheet header → place page;
  - search pill → search sheet.
- **One name at a time.** Name only the tapped element, on `pointerdown`.
- **Keep heroes outside Suspense,** or the pair never forms.
- **Ship the title morph first.** The image morph only says "this one" once LabelPlates make tiles distinct.

### 4.5 Press, toggles, touch hygiene and visual haptics (N12)

| Interaction | Behaviour |
|---|---|
| Press | scale .97 plus a surface-3 tint, 90 ms in and 160 ms out |
| Touch hygiene | `-webkit-tap-highlight-color: transparent`; `-webkit-touch-callout: none` and `user-select: none` on cards, the nav and sheet headers (obs 33: dragging the drawer selected its title); 44 pt minimum targets |
| Toggle pop | scale 1→1.18→1 on `spring.celebrate`, using `useOptimistic` (X24) |
| Rating | the N30 half-star radio group: 44 pt stars, tap to set, arrow keys, VoiceOver-named, no commit on pointer-leave |
| Slider detents | the thumb pulses at 25%, 50% and 75%; the fill warms below 25% |
| Error | a 3 × 4 px shake over 240 ms, plus an inline message |
| Haptics and sound | `feedback(name)` from `lib/feedback` at the press (§4.11). Never carries meaning on its own: the visual change always does. |

### 4.6 Sheets: one `BottomSheet`, two implementations behind the same props

```ts
<BottomSheet open snapPoints={["peek","half","full"]} initialSnap="half"
             onClose dismissible title>
```

- **v0 (N27, Now).** Bottom-anchored. Snaps are layout positions only, with a 160 ms fade and slide. Its portal, focus trap and Escape come from the vendored Radix/vaul parts.
  - Used by: the Finished-it sheet (N13a), the install prompt (N15), the add/success sheets (N21), the AppBar overflow (N26), the X01 chooser.
- **v1 (B04).** The same props, with `motion` physics (`spring.sheet`, `gesture.rubber`, `gesture.projectMs`, `gesture.dismissAt`):
  - Height fixed at the full snap; only `y` moves.
  - Release snaps to the point nearest the position 200 ms ahead (`y + v·0.2`), on `spring.sheet` with the release velocity; past 30 % of the height it dismisses.
  - A 0.2× rubber-band at the ends.
  - Scroll-to-drag handoff at `scrollTop` 0.
  - The whole header drags, through a native `{passive:false}` listener on the header only.
  - Backdrop opacity tied to `y`.
- **Toast.** Sits above the tab bar, with an Undo slot and a 5 s life (`toastMs`). It is never on top of the nav.
- **Desktop menus.** Scale .97→1 from their trigger.

### 4.7 Lists, skeletons, AI progress

**Lists:**
- Use `AnimatePresence mode="popLayout"` on lists that are not virtualised.
  - Inserts fade up 8 px over 160 ms, 30 ms stagger, capped at 6.
  - Removals collapse over 160 ms.
- VirtualGrid lists get a per-cell enter only.
- Reversible removals get Undo instead of a confirm dialog.

**Skeletons (X24):**
- Shaped like the content they replace.
- One shimmer.
- Shown only after 120 ms; once shown, held at least 300 ms.

**AI progress:**
- Named stages, driven by real events.
- After 8 s, honest copy.
- A hard ceiling, after which the job goes to the inbox.
- Auto-advance into the result.

**Two cheap wins land in Now, before any choreography:**
- **N21** mounts the particle bottle immediately, removing the 0.7 s black "ANALYZING…" gap (obs 26). It has a reduced-motion static.
- **N06a** auto-advances "Scan Complete!" into the results (obs 35).

### 4.8 Pull-to-refresh

- **Where:** tab roots, on the inner scroller.
- **Feel:** a 64 pt threshold with 0.5 resistance; a wine glass fills as you pull.
- **Action:** on release, `router.refresh()` inside `startTransition`.
- **Disabled:** on the map, and whenever a sheet is open.

### 4.9 Reduced motion (one place)

`<MotionConfig reducedMotion="user">` wraps the app (`AppClientProviders`); a component that
must branch reads motion's `useReducedMotion` and takes its replacement from `lib/motion.ts`
(`reduced`: a cross-fade at micro; `calm.fade` 150 ms and `calm.sheet` 120 ms where SPEC names
them). Route transitions do the same in CSS: the `prefers-reduced-motion` block at the end of
`app/view-transitions.css` zeroes every route animation, then gives a push a 150 ms crossfade
and a back a 120 ms fade; a tab switch is instant.

- **Removed:** translation, scale, morphs, springs and particles.
- **Kept:** crossfades of 150 ms or less, and colour changes.
- **Replacements:**
  - Sheets snap with a 120 ms fade.
  - The particle bottle becomes a static silhouette plus a stage list.
  - Map fly-to becomes a jump.
- **Delete the six per-component `matchMedia` checks.**

### 4.10 Perceived performance

- `useOptimistic` for every toggle (X24).
- Shape-matched loading shells (X24).
- Prefetch on `pointerdown`.
- Long term: Cache Components with Activity (L12).

---


### 4.11 Haptics and sound (`src/lib/feedback`; DECISIONS 35, 36, 42)

One call, `feedback(name, { phase? })`, fires the haptic and the sound that share a name, and
honours the person's one "Sound and haptics" setting (Sounds on/off, on by default; Haptics
On/Off). Only for what the person touches or holds; never for scroll, loading, data arriving or
anything the app does on its own. It never throws.

| Name | Haptic (ms) | Sound (Asus-KBD) | When |
|---|---|---|---|
| `press` | none | soft, down on press, up on release | every button, tab, chip, row |
| `primary` | none | medium, down and up | Add, Check in, Save |
| `toggle` | tick | space, down | a switch |
| `tick` | [10] | soft, down | rate, favourite, quick-look step, fan |
| `detent` | [8] | soft, down, ×0.6 | a band boundary, pull arming, snaps |
| `hold` | [14] | medium, down | quick look opens, tier drag arms |
| `undo` | [8,30,8] | soft, up | Undo |
| `success` | [12,40,18] | space, down then up 60 ms later | a commit |
| `medium` | [14,50,14,50,20] | as success | a new #1 |
| `big` | [18,60,18,60,30,90,40] | as success | the biggest moments |
| `refuse` | [30,40,30] | none | an optimistic change refused |

- **Haptics** are Fettle's: pulses at most 40 ms, patterns at most 400 ms. Android uses
  `navigator.vibrate` from anywhere. iPhone has no vibrate: `<HapticOverlay>` lays an invisible
  switch under the finger (iOS 26.5+ ticks once per real tap), and a hidden switch plays the
  pattern on iOS 18 to 26.4. So on iPhone only haptics inside the tap itself play; a hold, a pull
  arming or anything after a network round trip is Android's alone. Reduced motion keeps haptics
  and plays `success`, `medium` and `big` as their one strongest beat.
- **Sound** is Josh Comeau's MIT `button-sounds`, self-hosted in `public/sounds/` with its licence
  and cached by the service worker, played from its sprite layout with Web Audio at volume 0.3,
  pitch ±0.05, a different sample each press. iPhone gets the `ambient` audio session, so sound
  follows the silent switch and never stops the person's music; once the first tap unlocks audio,
  sound can carry the hold, pull and boundary moments iPhone haptics cannot. Reduced motion does
  not change sound. Nothing loops.

## 5. Signature moments

Each moment lists its trigger, its choreography, its reduced-motion version, its dependencies, and **what ships earlier on existing parts**.

1. **"Uncorked": launch and sign-in.**
   - The particle system morphs through the six vessels and condenses into the wordmark.
   - Shown on first launch and sign-in only.
   - It replaces the beer-only LiquidBackground's signal.
   - *Reduced:* a static wordmark that fades in.
   - *Deps:* B06 (brand).
   - *Earlier:* none needed; the AuthLayout fixes in B06 are cheap.

2. **"The label reads itself": capture → draft.**
   - The photo dissolves into particles locked to the vessel.
   - Each read field's chip (Name, 2019, Sangiovese, Toscana) flies into its `AIDraftField`.
   - The one field the AI couldn't read waits for you, focused.
   - *Reduced:* the photo, then a stage list, then the card.
   - *Deps:* X05, B02.
   - *Earlier:* N21 mounts the particle bottle at once (no black gap). N19's provenance chips already show which fields came from the label.

3. **"Into the cellar": bottle added.**
   - The new LabelPlate arcs into the Cellar tab, and the count rolls +1.
   - A toast offers "+1 bottle · Snap another · Open it now".
   - The card gets a one-time glow in the grid.
   - *Reduced:* the toast and the count only.
   - *Deps:* B03, B05.
   - *Earlier:* N21's success sheet, and N28 plates in the grid.

4. **"Pour": the level is the control.**
   - In the Pour sheet, you drag the liquid inside the bottle's own silhouette down. It wobbles on release.
   - A dated stamp lands in "Your log" with Undo.
   - At 0 the liquid drains, then the sheet asks "Finished?" with the N30 rating control and offers a band suggested from that rating.
   - *Reduced:* a plain slider plus the sheet.
   - *Deps:* X03, X02.
   - *Earlier:* N13a's Finished sheet with Undo.

5. **"It slots in": tier placement.**
   - A 250 ms hold arms the drag with a .98→1.03 scale ramp.
   - The band under the finger glows; the drop springs into place and ranks roll.
   - One claret crown shimmer, the first time something reaches #1.
   - *Reduced:* an instant reorder.
   - *Deps:* B06.

6. **"What's good here": the menu scan lands.**
   - Skeleton rows appear, grouped by type.
   - Matches land with evidence chips ("In Bar Cart", "You ★4.5", "Test Two loved it"), never percentages.
   - The list re-sorts into "For you here" order.
   - *Reduced:* the final list with a crossfade.
   - *Deps:* X07.
   - *Earlier:* N06a's auto-advance and the optimistic "Matched".

7. **"Card to bottle": continuity.**
   - The tile's plate and title morph into the hero, and the state line fades up.
   - Back reverses into the same cell.
   - *Reduced:* a crossfade.
   - *Deps:* B05, plus N28/B03 for the image.

8. **"Year in Bottles": recap (later).**
   - A deck of cards, each exportable as a share image.
   - *Deps:* L04, X17.

---

## 6. Build order for Track B

1. **Now:**
   - N11 (contrast, fonts, the contrast test).
   - The brass flip in a single PR (N11 or B01). (Done, then reversed by the 2026-11 redesign: teal is action.)
   - N27 (sheet and toast APIs).
   - N19 (AIDraftField on today's styles).
   - N28 (LabelPlate v0 and `itemTypeTokens`).
   - B01 (tokens, motion tokens, the vitest guard).
2. **B02 primitives.** Migrate the bottle and cellar pages first. Order: Page/AppBar restyle → InsetSection → Score → TypeChip → ActionBar → EmptyState → ItemTile → AIDraftField restyle, which is where teal `--ca-ai` arrives.
3. **B03:** the full LabelPlate set, recipe glasses, place heroes.
4. **B04:** BottomSheet physics, then the map and place rebuild (X20).
5. **B05:** route motion, only after N12 and X24.
6. **B06:** signature moments 2–7 plus the brand (moment 1). Recap later.

**Every Track-B PR must have:**
- screenshots at 390, 375 and desktop;
- an axe pass inside N20's mobile project;
- the contrast test green;
- reduced motion verified;
- no new hex or raw spring;
- verification on the containerised client on :3003, or on the user's dev server via `next-dev-loop`.
