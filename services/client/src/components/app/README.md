# App primitives (`src/components/app/`)

The building blocks every converted screen uses first, before reaching for
`src/components/ui/*` (vendored shadcn) or Tailwind on plain elements.
Decision D20 (`docs/product/decisions.md`); tokens, type and motion from
`docs/product/design-direction.md` §3–§5. AGENTS.md "UI and styling" has the
rules; this file has the **how**.

Every primitive here is Joy-free and has tests (`primitives.test.tsx` for the
server-rendered ones, `interactive.test.tsx` under happy-dom for the rest).
Files with no `"use client"` (Link, IconButton, Page, FilterChip, TypeChip,
Score, EmptyState, AIDraftField, ActionBar, UserAvatar, icons, nav, notify)
can be rendered from server components.

## Converting a Joy file: the mapping

A component is **either Joy or Tailwind, never both** (see "Coexistence"
below). Convert a file whole.

### Layout and surfaces

| Joy | shadcn / Tailwind |
|---|---|
| `Box` | `div` |
| `Stack` | `div` + `flex flex-col gap-*` (`direction="row"` → `flex-row`) |
| `Grid` | `grid grid-cols-*` / `sm:grid-cols-*` |
| `Sheet` (surface) | `div` + `bg-surface-1` / `bg-surface-2` (no border) |
| `Card` / `CardContent` | `ui/card`, or `InsetSection` for a titled group of rows. **No borders** (design §3.3). |
| `List` / `ListItem` / `ListItemContent` / `ListItemDecorator` | `InsetSection` + `ListRow` (`leading`, `title`, `description`, `trailing`) |
| `Divider` / `ListDivider` | `ui/separator`, or `divide-y divide-line` on the parent |
| `AspectRatio` | `aspect-[3/4]` (or `ui/aspect-ratio`) |
| `Container` | `Page` |
| `Skeleton` | `ui/skeleton` |
| `CircularProgress` | `ui/spinner` |
| `LinearProgress` | `ui/progress` |

### Spacing and breakpoints

| Joy | Tailwind |
|---|---|
| `sx={{ p: 2, gap: 1 }}` | `p-4 gap-2` — Joy is 8 px × n, Tailwind 4 px × n: **double the number** |
| `{ xs: …, sm: …, md: … }` | base class, `sm:`, `md:` — the breakpoints are already Joy's: `sm` 600, `md` 900, `lg` 1200, `xl` 1536 |
| `useMediaQuery(breakpointUp("md"))` | keep it for logic; for styling use `md:` |

### Typography

| Joy `Typography level=` | class |
|---|---|
| `h1` | `type-large-title` |
| `h2` | `type-title-1` |
| `h3`, `h4` | `type-title-2` |
| `title-lg`, `title-md` | `type-headline` |
| `title-sm` | `type-callout font-semibold` |
| `body-lg`, `body-md` | `type-body` |
| `body-sm` | `type-callout` |
| `body-xs` | `type-footnote` (already `ink-3`) |
| `textColor="text.secondary"` | `text-ink-2` |
| `textColor="text.tertiary"`, `neutral.500` | `text-ink-3` |
| numbers | add `tabular` |
| vintages, hero names, rank numerals | Fraunces: `type-title-1` / `type-numeral-xl` / `font-display` |

Pick the element for meaning (`h1`, `h2`, `p`, `span`), the class for looks.
No ALL CAPS except `type-overline`.

### Colour

| Joy | Tailwind |
|---|---|
| `color="primary"` on an **action** | `bg-primary text-primary-foreground` (brass, dark ink) — via `Button` |
| `color="primary"` on **decoration** (an icon, a heading, a count) | `text-ink-2`. **Brass is not decoration. Teal is never an action.** |
| `color="danger"` | `text-destructive` (+ `border-destructive/60`); solid only in `ConfirmSheet` |
| `color="success"` | `text-success` — never a solid slab |
| `color="neutral" variant="soft"` | `bg-surface-2 text-ink-1` |
| `palette.background.body / surface / level1-3` | `bg-background` / `bg-surface-1` / `bg-surface-2` / `bg-surface-3` |
| AI-drafted / AI-working | `AIDraftField`, `text-ai` — **only** there |
| hearts, #1 crown | `text-brand` / `fill-brand` |
| item types | `itemTypeTokens[type]` (`TypeChip`, `TypeGlyph`) |
| tier bands | `bg-band-5` … `bg-band-1`, Unrated `bg-surface-3`; always print the band word |
| hex / `rgb(` | not allowed in `.ts(x)` (the guard); add a token to `globals.css` + `lib/tokens.ts` |

Naming trap: shadcn's `accent` (`bg-accent`) is the **hover/pressed surface**,
not the brass accent. Brass is `primary` (or `brass`).

### Controls

| Joy | replacement |
|---|---|
| `Button` solid primary | `<Button>` (brass, 44 px) |
| `Button variant="soft"` | `<Button variant="secondary">` |
| `Button variant="outlined"` | `<Button variant="outline">` |
| `Button variant="plain"` | `<Button variant="ghost">` |
| `Button color="danger"` | `<Button variant="destructive">` (text + outline) |
| `IconButton` | `app/IconButton` — `aria-label` required by type, 44×44 |
| `Chip` (static) | `ui/badge` |
| `Chip` (clickable filter) | `FilterChip` |
| `Chip` (item type) | `TypeChip` |
| `ToggleButtonGroup` | `SegmentedControl` (text labels always) |
| `Input` (+ `startDecorator`) | `ui/input`, or `ui/input-group` for decorators |
| `Textarea` | `ui/textarea` |
| `Select` / `Option` | `ui/select` (Radix — keeps the `combobox`/`option` roles the e2e uses) |
| `Autocomplete` | `ui/command` inside `ui/popover` (combobox) |
| `Checkbox` / `Switch` / `Radio` | `ui/checkbox` / `ui/switch` / `ui/radio-group` |
| `Slider` | `ui/slider` |
| `FormControl` / `FormLabel` / `FormHelperText` | `ui/field` (`Field`, `FieldLabel`, `FieldDescription`, `FieldError`) + react-hook-form `Controller` |
| `Tabs` | `ui/tabs` |
| `Accordion*` | `ui/accordion` |
| `Breadcrumbs` | `AppBar breadcrumbs` (desktop only) |
| `ButtonGroup` | `ui/button-group` |
| `Link` (Joy, `common/Link`) | `app/Link` (`overlay`, `underline`, `className`) |
| `next/link` for a visible link | `app/Link` too (B05 hooks View Transitions in here) |
| `Avatar`, `common/UserAvatar` | `app/UserAvatar`; a stack is `flex -space-x-2` with `ring-2 ring-background` on each |
| `Tooltip` | `ui/tooltip` — hover-capable devices only; on touch the `aria-label`/visible label does the job |

### Overlays and feedback

| Joy | replacement |
|---|---|
| `Modal` + `ModalDialog` (+ `DialogTitle`/`DialogContent`/`DialogActions`) | `ResponsiveDialog` (sheet on phones, dialog from `md`) |
| a destructive confirm `Modal` | `ConfirmSheet` |
| a phone-only sheet / action list | `BottomSheet` |
| `Dropdown` + `Menu` | `AppBar overflow`, or `ui/dropdown-menu` on desktop / `BottomSheet` list on phones |
| `Snackbar` | `notify(message, { undo })` |
| `Alert` | `ui/alert` |
| empty / error / first-run copy | `EmptyState` |

### Motion

| before | after |
|---|---|
| `from "framer-motion"` | `from "motion/react"` |
| `{ type: "spring", stiffness: 400, damping: 30 }` | `spring.snappy` / `spring.sheet` / `spring.celebrate` from `@/lib/motion` |
| `transition={{ duration: 0.2 }}` | `transition={tween("short")}` |
| `matchMedia("(prefers-reduced-motion…")` | `useReducedMotion()` from `motion/react` (the root `MotionConfig` already honours the setting) |
| inline `@keyframes` in `sx` | `tw-animate-css` classes (`animate-in fade-in-0 …`) or `motion` |
| CSS durations / easings | `duration-(--ca-dur-short) ease-standard` |

Animate transform and opacity only.

### Icons (`react-icons` → `app/icons`)

Import semantic names from `@/components/app/icons`, never `lucide-react`
directly in feature code. Stroke 1.75 (`ICON_STROKE`).

| react-icons | app/icons |
|---|---|
| MdArrowBack | `Back` |
| MdAdd | `Add` |
| MdClose, MdClear | `Close` |
| MdMoreHoriz | `More` |
| MdSearch | `Search` |
| MdSearchOff | `NoResults` |
| MdEdit | `Edit` |
| MdDelete, MdDeleteOutline | `Delete` |
| MdShare | `Share` |
| MdCheck | `Check` |
| MdCheckCircle | `Success` |
| MdError, MdErrorOutline | `ErrorIcon` |
| MdWarning, MdWarningAmber | `Warning` |
| MdInfoOutline | `Info` |
| MdHelp | `Help` |
| MdRefresh | `Refresh` |
| MdFavorite, MdFavoriteBorder | `Love` (filled: `className="fill-brand text-brand"`) |
| MdStar | `Star` |
| MdThumbUp / MdThumbDown | `ThumbsUp` / `ThumbsDown` |
| MdHome | `Home` |
| MdWarehouse | `Cellar` |
| MdMap, MdExplore | `MapIcon`, `Explore` |
| MdPlace, MdLocationOn | `Place` |
| MdAddLocationAlt | `AddPlace` |
| MdMyLocation | `MyLocation` |
| MdDirections | `Directions` |
| MdLayers | `Layers` |
| MdPerson | `Person` |
| MdPeople, MdGroup | `People` |
| MdCameraAlt, MdCamera, MdPhotoCamera, BsCamera | `Camera` |
| MdPhotoLibrary, BsImages | `PhotoLibrary` |
| MdScanner | `Scan` |
| BsUpcScan | `Barcode` |
| MdAutoAwesome, MdPsychology | `AI` |
| MdAutoFixHigh | `AutoFill` |
| MdLocalBar, MdSportsBar, FaCocktail | `Cocktail` |
| MdRestaurant | `Restaurant` |
| MdStorefront, MdBusiness | `Store`, `Business` |
| MdLocalCafe, MdCoffee, MdWineBar, FaWineGlass, FaBeer, FaCoffee, FaGlassWhiskey, FaMugHot | `TypeGlyph type=…` (the six beverage glyphs) |
| MdMenuBook | `Recipe` |
| MdFormatListNumbered | `Ranked` |
| MdViewList | `ListView` |
| MdLeaderboard, FaRankingStar | `Leaderboard` |
| AiFillTrophy | `Trophy` |
| FaCrown | `Crown` (claret for #1: `text-brand`) |
| MdTrendingUp | `Trending` |
| MdLocalFireDepartment | `Popular` |
| MdAccessTime | `Time` |
| MdSchedule, MdUpdate | `Schedule` |
| MdHourglassEmpty | `Pending` |
| MdHistory | `History` |
| MdLock / MdLockOpen | `Lock` / `Unlock` |
| MdVisibility | `Visible` |
| MdPublic, MdLanguage | `Public` |
| MdVerified | `Verified` |
| MdCategory | `Category` |
| MdFilterList | `Filter` |
| MdArrowDownward | `SortDescending` |
| MdDragIndicator | `DragHandle` |
| MdRadioButtonUnchecked | `Unrated` |
| MdOutlineComment | `Comment` |
| MdPhone | `Phone` |
| MdMonetizationOn | `Price` |
| MdSettings | `Settings` |
| MdDarkMode / MdLightMode | `DarkMode` / `LightMode` |
| MdWifiOff, MdCloudOff | `Offline`, `CloudOff` |
| MdSignalCellular1Bar | `WeakSignal` |
| BsLightbulb, BsLightbulbFill | `Idea` |
| FcGoogle, BsFacebook, BsDiscord | **not in Lucide** (v1 ships no logos): inline the provider's own SVG mark in `SocialButtons` |

A missing meaning: add one line to `icons.ts` (integration owner) rather than
importing `lucide-react` in a feature file.

## The primitives

### Shell

**`AppShell`** — `<AppShell>{children}</AppShell>`. `SideRail` from `sm`,
`TabBar` below it, and between them the inner scroller (`<main
data-app-scroller>`, D26): padded `p-4` except on `/map/*`, clipping instead of
scrolling on `/map` itself. Layout only — `components/shell/AppShell.tsx`
keeps the GraphQL provider and the install prompt and renders this inside
(S1 wires it, and deletes `SideNavigationBar` / `ConditionalPaddingWrapper`).
It also records in-app history for `AppBar`'s Back.

**`TabBar` / `SideRail`** — no props beyond `className`. Five labelled
destinations from `nav.ts`: Home `/` · Cellar `/cellars` · ＋ · Map `/map` ·
Me `/me` (D1; the `/me` hub page is S1's). A tab lights for its route and
everything under it (`activeTab`), and lights at once on tap. Re-tapping the
active tab scrolls the scroller to the top, then pops to the tab's root. The
brass ＋ (56 pt, 8 pt proud) opens `CaptureChooser`.

**`CaptureChooser`** — `open`, `onOpenChange`, `options?`. Bottle · Menu ·
Recipe · Place as rows into today's flows (`CAPTURE_OPTIONS` in `nav.ts`).

**`AppBar`**

```tsx
<AppBar
  title="Barolo 2016"
  parent="/cellars/abc"                 // where Back goes on a cold deep link
  actions={[{ label: "Share", icon: Share, onSelect: share }]}   // ≤ 2
  overflow={[
    { label: "Edit", onSelect: edit },
    { label: "Delete", onSelect: askDelete, destructive: true }, // last
  ]}
  breadcrumbs={[{ label: "Cellars", href: "/cellars" }, { label: "Barolo" }]} // md+ only
/>
```

Back is `router.back()` when an in-app page sits behind this one, `parent`
otherwise; no Back on a tab root without history. Overflow is an action
sheet on phones and a dropdown from `md`. (`HeaderBar` keeps its props and
renders this — S1.)

**`Page`** — `<Page>` centred 720 px column, sections 24 pt apart; `wide`
→ 1120; `withActionBar` adds bottom room for an `ActionBar`.

**`InsetSection` + `ListRow`**

```tsx
<InsetSection label="In this cellar" action={<Link href="…">See all</Link>}>
  <ListRow
    leading={<TypeGlyph type="WINE" />}
    title={<Link href={href} overlay underline="none">Barolo</Link>}
    description="2016 · 2 bottles"
    trailing={<Score value={4.5} />}
  />
</InsetSection>
```

### Overlays and feedback

**`BottomSheet`** — vaul Drawer behind design §4.6's props:
`open`, `onOpenChange`, `title` (required; `hideTitle` keeps it for screen
readers only), `description?`, `snapPoints?: ("peek"|"half"|"full")[]`,
`initialSnap?`, `dismissible?`, `footer?`. Without `snapPoints` it sizes to
its content (action lists, confirms). Glass surface, safe-area bottom
padding, no background scaling.

**`ResponsiveDialog`** — the same props (+ `role="alertdialog"`): a
`BottomSheet` below `md`, a centred `ui/dialog` from `md`. Use it for every
former Joy `Modal`.

**`ConfirmSheet`** — `title`, `description`, `confirmLabel`, `onConfirm`,
`pending?`. The only place a solid danger button exists. Reversible actions
don't confirm — they toast with Undo.

**`notify`** — `notify("Removed from Garage", { undo: () => restore() })`.
5 s with an Undo action; `tone: "success" | "error"`; `id` to update a
toast in place. The single `<Toaster/>` is mounted in `AppClientProviders`
and sits above the tab bar.

**`EmptyState`** — `illustration?`, `title` (one Fraunces line),
`description?` (one Inter line), `action?` (exactly one element). Copy:
design §3.6.

### Controls and display

**`IconButton`** — `<IconButton aria-label="Share"><Share /></IconButton>`;
`variant` as `Button`, `size` `default` (44) / `sm` (36 visual in a 44 target)
/ `lg`; `asChild` to wrap an `app/Link`.

**`SegmentedControl`**

```tsx
<SegmentedControl
  aria-label="Show"
  value={status}
  onValueChange={setStatus}
  options={[{ value: "open", label: "Open" }, { value: "finished", label: "Finished" }]}
/>
```

`radiogroup` of `radio`s; the current segment cannot be tapped off.

**`FilterChip`** — `<FilterChip selected={on} onClick={toggle} count={12}>Open</FilterChip>`.
`aria-pressed`; selected is ink, not brass; zero counts hidden.

**`TypeChip` / `TypeGlyph` / `itemTypeTokens` / `ITEM_TYPES_IN_ORDER`** —
`<TypeChip type="WINE" />` is glyph + word on the type's tint;
`itemTypeTokens[type]` has `label`, `glyph`, `textClass`, `tintClass`,
`deepClass`. Order is always wine, beer, spirit, sake, coffee, tea. On touch,
a glyph never stands without its word.

**`Score`** — `<Score value={4.5} />` "4.5★" inline; `variant="pill"` on
tiles; `variant="hero"` the Fraunces numeral; `count?`. One decimal only when
non-zero; renders nothing when not rated.

**`RatingInput` / `RatingDisplay`** — `RatingInput` has the same props as
ux/rating's `common/rating/StarRating` (`value`, `onChange`, `onClear?`,
`disabled?`, `label?`) and the same behaviour (its hook and `rating.ts`), on
the tokens: switch the import, nothing else. `RatingDisplay` replaces
`StarRatingDisplay` (`value`, `size?: "sm" | "md"`).

**`AIDraftField`** — `common/AIDraftField`'s props with `className` instead
of `sx`, plus `confidence?: "sure" | "likely" | "check"` (X05). The 2 pt teal
rule and the source mark. **Teal enters the UI only here** (and AI progress
states).

**`ActionBar`** — one brass `Button` (a second, secondary one at most),
sticky 12 pt above the tab bar on glass. Give the page `withActionBar`.

**`Link`** — `next/link` + `overlay` (stretched over the nearest `relative`
ancestor) + `underline` (`hover` default, `always`, `none`).

**`UserAvatar`** — `avatarUrl`, `displayName`, `size` `sm|md|lg`, `className`.

## Coexistence (until the Joy removal step)

- Tailwind's utilities live in cascade layers; Emotion's (Joy's) styles are
  **unlayered and always win**. A Tailwind class on a Joy component silently
  loses, and `sx` on a new component is banned. One system per element.
- Composition across the line is fine: a Tailwind `div` around a Joy `Card`,
  a Joy `Stack` around a shadcn `Button`.
- Joy reads the same tokens (`providers/ThemeRegistry.tsx` builds its palette
  from `lib/tokens.ts`), so unconverted screens already show the brass and the
  warm surfaces.
- Preflight sets `svg, img { display: block }`; `globals.css`'s `joy-compat`
  block reverts that inside Joy markup. A react-icon in a *plain* element
  outside Joy is block-level now — convert it to `app/icons` (they are meant
  to be block-in-flex anyway).
- z-index: shadcn overlays use `z-50`; Joy's popups are `1000`+ (`Modal`
  1300, `Snackbar` 1400). A Joy popup opened inside a new sheet stacks
  correctly; a new sheet opened over a Joy element with its own large
  `zIndex` (some map controls) may not — convert that element in the same
  slice.
- Old Joy-era shared components with Joy-only props (`common/Link`,
  `common/UserAvatar`, `common/InteractiveCard`, `common/AIDraftField`,
  `common/rating/StarRating`) stay until the removal step; switch your own
  imports to the `app/` version as you convert.

## Not built here (roadmap, design §3.4 of the migration plan)

LabelPlate beyond what N28 ships, `ItemTile` density variants, pull-to-refresh,
View Transitions (B05 — `app/Link` is where type inference will go), the
collapsing large title (B02), custom beverage glyphs (B03).
