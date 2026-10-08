# Cellar Assistant design and motion direction

> **Platform superseded by [`decisions.md`](decisions.md) D20:** the app migrates to shadcn/ui (Tailwind) with `motion`, not "Joy behind app primitives". The palette, type, imagery, motion tokens and signature moments below still apply.

**Brief:** "a candlelit cellar, a sommelier's notebook, and a little magic."

This is the brief for the intentional overhaul. It is Track B of `ux-review-roadmap.md`:
- **B01–B06** are the overhaul itself.
- **N11, N27 and N28** are its first, small, Now-horizon pieces.
- **D20 and D21** are its platform and palette decisions.

It deliberately replaces the "restored verbatim" look (docs/architecture/ui-parity-decisions.md). It is grounded in two sources:
- the 2026-10-05 capture, taken on tree b2c5f541;
- the verified findings: visual-1…18, motion-1…18, shell-3/12/13, map-13/15/16 and recipes-11.

Contrast ratios here are computed (WCAG 2.x relative luminance), not estimated.

**Rule zero:** Track A fixes never wait for this brief, and Track B never restyles a page without a primitive behind it. Four exceptions ship early on purpose:
- **N11:** contrast and fonts.
- **N27:** the sheet and toast APIs.
- **N28:** LabelPlate v0, on today's type colours.
- **The one-PR brass flip (§3.1).** Without it, teal would mean "action" and "AI" at the same time.

---

## 1. Platform recommendation

**Stay on Joy for now, behind an app-owned primitive layer and CSS-variable tokens. Treat Joy, not its successors, as the at-risk dependency.**

`@mui/joy` is `5.0.0-beta.52`, and MUI has paused Joy development. It works today on React 19.2.7 and Next 16.3.4. It will not get fixes for the next React or Next major. The plan is shaped so that the day Joy breaks costs as little as possible.

| Option | Verdict | Reasoning |
|---|---|---|
| A. Joy, themed only | Not enough | It gives no place to enforce hierarchy. 172 files import Joy and there are 722 `sx=` props, so every page invents its own header, inset and score format (visual-1, visual-4). |
| **A+. Joy behind primitives plus tokens** | **Recommended** | `extendTheme` already emits `--joy-*` variables. The design lives in primitives, and users never see the library. Pages migrate one route at a time. |
| B. MUI Material 7 | No | It is a rewrite in practice (`level`→`variant`, no soft or plain variants). It keeps Emotion, and the overhaul would spend its time fighting Material's visual DNA. |
| C. A headless library (e.g. Base UI) plus zero-runtime CSS | Conditional (D20) | It is the end state if Joy breaks on a React or Next major. Pages only talk to primitives, so the swap touches primitive internals only. Pick the library when that day comes, not now. |
| D. Mantine, or Radix plus Tailwind | No | It means a second styling paradigm, or another house look to unlearn. |

**The Joy-free rule.** Some primitives have no Joy counterpart. These are built **without Joy from day one**, on the CSS-variable tokens plus `framer-motion` 14.0.0 (already in `services/client/package.json`):
- BottomSheet (logic and physics)
- Toast
- SegmentedControl
- LabelPlate
- Score
- ActionBar
- TypeChip
- ItemTile

Only inputs, Select, Menu and the Modal-backed dialogs stay Joy-wrapped. A future library swap then touches those files and nothing else. BottomSheet v0 (N27) borrows Joy Modal internally for its portal and focus trap. That borrowing is confined to one file and is removed in B04.

**The primitive set.** Each primitive owns its tokens, states, accessibility and reduced-motion behaviour. "Ships in" is the first roadmap item that introduces it. B02 restyles everything.

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
- Platform: an iOS standalone PWA, so no browser chrome, no swipe-back and no haptics.
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

**Centre ＋ is the brass capture button.** It is 56 pt and sits 8 pt proud of the bar.
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

### 3.1 Palette: dark is the brand default, built as roles so that "Daylight" is a swap

- **Base:** moves from today's cool blue-purple `#111015` to a warm near-black.
- **Action accent:** moves from teal (2.80:1 with white) to **the brass already in the app icon** (`public/icon.svg` `#c4a265`).
- **Teal:** re-assigned to mean **"the AI did this / is working"**. It is already the colour of the particle bottle.

**Migration rule (D21).**
- The brass flip is **one global PR**: Joy `palette.primary` changes to the brass ramp, with `--ca-on-accent` ink. It lands either in N11, if the palette is signed off by then, or as B01's first PR.
- N11's contrast unit test covers brass with `#1A1408` (7.61:1).
- From that PR on, nothing that acts is teal.
- Teal comes back only as `--ca-ai`, introduced together with `AIDraftField` (N19's styles in B02).
- Users never spend weeks learning that teal means both "button" and "AI".

**Dark (default)**

| Role | Token | Hex | Contrast and use |
|---|---|---|---|
| Background | `--ca-bg` | `#0E0C0F` | also `themeColor` and the status bar |
| Surface 1 (sections) | `--ca-surface-1` | `#171418` | |
| Surface 2 (raised, sheets) | `--ca-surface-2` | `#1F1B21` | |
| Surface 3 (pressed, inputs) | `--ca-surface-3` | `#29242B` | ink-1 on it is 13.06:1 |
| Hairline | `--ca-line` | `rgba(255,240,225,0.08)` | separators instead of borders |
| Ink 1 | `--ca-ink-1` | `#F3EDE4` parchment | 16.74:1 on bg |
| Ink 2 | `--ca-ink-2` | `#BDB3A7` | 8.85:1 on surface-1 |
| Ink 3 (metadata) | `--ca-ink-3` | `#9C9287` | 5.56:1 on surface-2; replaces Joy's 3.42:1 tertiary |
| Accent (action) | `--ca-accent` | `#C9A15B` brass | text or icon on bg is 8.10:1 |
| On-accent | `--ca-on-accent` | `#1A1408` | 7.61:1 on brass. **Never put white on brass.** |
| Brand | `--ca-brand` | `#7B2233` claret | heart fill, the #1 crown, hero washes; parchment on it is 8.52:1 |
| Brand text | `--ca-brand-ink` | `#D06A7C` | 5.25:1 |
| AI | `--ca-ai` | `#7FB3B9` | 7.87:1. **Only for AI-drafted or AI-working states.** |
| Success | `--ca-success` | `#6FAF7B` | 7.04:1; never a solid slab |
| Danger | `--ca-danger` | `#E07A6A` | 6.23:1; text and outline only, solid only in confirm sheets |

**Daylight.** Tokens are defined now, and the scheme is built only when there is evidence it is needed (D21).

| Role | Hex | Notes |
|---|---|---|
| bg / surface-1 / 2 / 3 | `#F6F1E8` / `#FBF8F2` / `#EFE8DC` / `#E6DDCD` | parchment |
| ink-1 / 2 / 3 | `#2A2420` / `#5E5449` / `#6F6357` | 13.61 / 6.57 / 5.19:1 |
| accent text / fill | `#7A5C24` (5.52:1) / `#8A6A2E` with white (5.02:1) | |
| ai | `#2F6B70` | 5.4:1 |
| brand | `#9C2F43` | 6.43:1 |

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

**Tier bands** use one claret→brass ordinal ramp: Outstanding `#7B2233` → Very Good `#9A4A3A` → Good `#B8783F` → Mediocre `#8C7A62` → Bad `#5E5650`, with Unrated on surface-3. The band word is always printed, so the hue never carries meaning on its own.

**Banned:**
- pure `red` hearts;
- solid red or green toggle slabs;
- Material default chart hues;
- any hex outside the token file. The B01 vitest guard enforces this, with an allowlist for MapLibre paint and the offline page.

### 3.2 Typography

Two families, each loaded once through `next/font` and exposed as CSS variables for Joy's `fontFamily`. This fixes visual-13: Joy's literal "Inter" matched only @fontsource's weight-400 faces, so bold text was faux-bold. N11 delivers the Inter half now.

- **Display: Fraunces** (variable, `opsz`, SOFT 50). For names on heroes, vintages, rank numerals, headlines and empty states. Newsreader is the alternative.
- **UI: Inter** (variable, 400–700). Always use `font-variant-numeric: tabular-nums lining-nums` for numbers.

| Style | Family | Size/line | Weight | Use |
|---|---|---|---|---|
| Large title | Fraunces | 34/40 | 600 | AppBar expanded, Home |
| Title 1 | Fraunces | 28/34 | 600 | detail hero name |
| Title 2 | Inter | 22/28 | 600 | sheet titles |
| Headline | Inter | 17/22 | 600 | row titles |
| Body | Inter | 16/24 | 400 | reading text; inputs at least 16 to avoid iOS zoom |
| Callout | Inter | 15/20 | 400 | secondary rows |
| Footnote | Inter | 13/18 | 400 | metadata (ink-3) |
| Overline | Inter | 11/14 | 600, +6% tracking, uppercase | InsetSection labels, without a colon |
| Numeral XL | Fraunces | 44/44 | 500 | ranks #1–#3, recap stats |

Three rules:
- Vintages are always set in Fraunces.
- Names are stored as transcribed and displayed in smart title case (N17).
- No ALL-CAPS anywhere except overlines.

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
- **Medals:** a claret crown for #1, a brass numeral for #2–#3, plain numerals after that.

### 3.5 Imagery for items with no photo: the biggest visual lever

Today every wine is the same lilac bottle, cocktails get wine art, and a winery gets beer art (visual-2). On `cellars__cellar-items-home__m390__populated__fold.png`, the one tile showing the user's own label photo is instantly recognisable, and the others are interchangeable. That is the whole case for this section.

Images are chosen in this order:

1. **The user's photo** on a type-tint backdrop. The auto-crop to the label comes later, Gemini-only, via `labelBox`. Until then, use a centred 3:4 crop.
2. **A typographic LabelPlate.** It is a deterministic SVG, with zero AI and zero runtime cost.
   - Type tint background, shaded by style, with faint paper grain.
   - An inner paper rect holding:
     - the **producer** in Fraunces small caps;
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

`EmptyState` is one illustration, one Fraunces line, one Inter line and **exactly one** action. v0 ships with N15.

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

In B02 it takes on the AI colour:
- A 2 px `--ca-ai` left rule.
- Confidence in words: **Sure · Likely · Check this**. "Check this" fields are pre-focused.

Outside the field itself:
- **One Accept / Edit / Not this row** is used everywhere: menu matches, drafts, "try this next".
- **Working state:** a teal shimmer plus a named stage line. Never an unexplained spinner.

---

## 4. Motion language

### 4.1 Principles

1. **Acknowledge every tap within a frame.** A 90 ms press state. A 2 px brass hairline if navigation is still pending after 120 ms. iOS has no haptics, so visual haptics stand in for them.
2. **Motion explains place and cause.** Depth for push and pop, continuity from card to hero, cause and effect for pour→level. Be optimistic first, then animate the reconciliation.
3. **Set a latency floor before choreography.** Route animation ships only after N12 (press) and X24 (loading shells). Otherwise a 400 ms slide after a 500 ms freeze makes the app feel slower.
4. **Visible at rest** (AnimateIn's rule). Nothing waits for a JS entrance on first paint.
5. **Animate transform and opacity only.** 60 fps on an iPhone 12-class device. Every animation can be interrupted.
6. **Delight is earned and short.** Only for moments the user owns. Each is 700 ms or less and can be skipped.

### 4.2 Tokens (`src/lib/motion.ts`, mirrored as `--ca-dur-*` / `--ca-ease-*`, shipped in B01)

| Token | Value | Use |
|---|---|---|
| `dur.micro` | 90 ms | press, toggle colour |
| `dur.short` | 160 ms | tab crossfade, menu, list insert |
| `dur.medium` | 240 ms | skeleton→content, sheet fade, toast |
| `dur.long` | 400 ms | route slide, shared-element morph |
| `dur.celebrate` | ≤700 ms total | success moments |
| Exit rule | about ⅔ of the enter | |
| `ease.standard` | `cubic-bezier(.2,0,0,1)` | default |
| `ease.enter` | `cubic-bezier(0,0,0,1)` | arrivals |
| `ease.exit` | `cubic-bezier(.3,0,1,1)` | departures |
| `spring.snappy` | 520 / 42 | reflow, toggles, drop |
| `spring.sheet` | 380 / 36, with release velocity | sheets |
| `spring.celebrate` | 300 / 18 | pops, stamps, heart |
| Distances | route 60 px · list 8 px · press .97 · lift 1.03 | |

These replace today's five springs and the 16 or so transition strings (motion-1).

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
| Real haptics (B06 spike) | a hidden, label-wrapped `<input type=checkbox switch>` may trigger the iOS 18 haptic. Feature-detect it, and never let it carry meaning. |

### 4.6 Sheets: one `BottomSheet`, two implementations behind the same props

```ts
<BottomSheet open snapPoints={["peek","half","full"]} initialSnap="half"
             onClose dismissible title>
```

- **v0 (N27, Now).** Bottom-anchored. Snaps are layout positions only, with a 160 ms fade and slide. It borrows Joy Modal for the portal, focus trap and Escape.
  - Used by: the Finished-it sheet (N13a), the install prompt (N15), the add/success sheets (N21), the AppBar overflow (N26), the X01 chooser.
- **v1 (B04).** The same props, with framer-motion physics:
  - Height fixed at the full snap; only `y` moves.
  - Release snaps to the nearest point using `y + v·0.2`, on `spring.sheet` with the release velocity.
  - A 0.2× rubber-band at the ends.
  - Scroll-to-drag handoff at `scrollTop` 0.
  - The whole header drags, through a native `{passive:false}` listener on the header only.
  - Backdrop opacity tied to `y`.
  - The Joy borrowing goes away.
- **Toast.** Sits above the tab bar, with an Undo slot and a 5 s life. It is never on top of the nav.
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

Wrap the authenticated layout in `<MotionConfig reducedMotion="user">`, then add one CSS block:

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation-duration: 0s !important; }
  ::view-transition-old(root), ::view-transition-new(root) { animation: ca-fade 150ms both; }
  * { scroll-behavior: auto !important; }
}
```

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

## 5. Signature moments

Each moment lists its trigger, its choreography, its reduced-motion version, its dependencies, and **what ships earlier on existing parts**.

1. **"Uncorked": launch and sign-in.**
   - The particle system morphs through the six vessels and condenses into the brass Fraunces wordmark.
   - Shown on first launch and sign-in only.
   - It replaces the beer-only LiquidBackground's signal.
   - *Reduced:* a static wordmark that fades in.
   - *Deps:* B06 (brand).
   - *Earlier:* none needed; the AuthLayout fixes in B06 are cheap.

2. **"The label reads itself": capture → draft.**
   - The photo dissolves into teal particles locked to the vessel.
   - Each read field's chip (Name, 2019, Sangiovese, Toscana) flies into its `AIDraftField`.
   - The one field the AI couldn't read waits for you, focused.
   - *Reduced:* the photo, then a stage list, then the card.
   - *Deps:* X05, B02.
   - *Earlier:* N21 mounts the particle bottle at once (no black gap). N19's provenance chips already show which fields came from the label.

3. **"Into the cellar": bottle added.**
   - The new LabelPlate arcs into the Cellar tab, and the count rolls +1.
   - A toast offers "+1 bottle · Snap another · Open it now".
   - The card gets a one-time brass glow in the grid.
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
   - A deck of Fraunces cards, each exportable as a share image.
   - *Deps:* L04, X17.

---

## 6. Build order for Track B

1. **Now:**
   - N11 (contrast, fonts, the contrast test).
   - The brass flip in a single PR (N11 or B01).
   - N27 (sheet and toast APIs).
   - N19 (AIDraftField on today's styles).
   - N28 (LabelPlate v0 and `itemTypeTokens`).
   - B01 (tokens, motion tokens, the vitest guard).
2. **B02 primitives.** Joy-free where Joy has no counterpart. Migrate the bottle and cellar pages first. Order: Page/AppBar restyle → InsetSection → Score → TypeChip → ActionBar → EmptyState → ItemTile → AIDraftField restyle, which is where teal `--ca-ai` arrives.
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
