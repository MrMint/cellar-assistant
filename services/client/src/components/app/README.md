# App primitives (`src/components/app/`)

The building blocks every converted screen uses first, before reaching for
`src/components/ui/*` (vendored shadcn) or Tailwind on plain elements.
Decision D20 (`docs/product/decisions.md`); tokens, type and motion from
`docs/product/design-direction.md` §3–§5. AGENTS.md "UI and styling" has the
rules; this file has the **how**.

Every primitive here has tests (`primitives.test.tsx` for the
server-rendered ones, `interactive.test.tsx` under happy-dom for the rest).
Files with no `"use client"` (IconButton, Page, FilterChip, TypeChip,
Score, EmptyState, AIDraftField, ActionBar, UserAvatar, LabelPlate, LoadingShell,
icons, nav, notify)
can be rendered from server components.

## The vocabulary, by the Joy names it replaced

MUI Joy, Emotion, `sx` and react-icons were removed in the migration's
removal step (2026-10-08); `lib/dev-checks/ui-platform.test.ts` and Biome's
`noRestrictedImports` fail on any return of them. The tables below stay as
the vocabulary: where the old code (or your memory of it) reaches for the
left column, use the right.

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
| `{ xs: …, sm: …, md: … }` | base class, `sm:`, `md:` — the breakpoints are `sm` 600, `md` 900, `lg` 1200, `xl` 1536 |
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
| Tailwind palette (`text-red-500`, `bg-zinc-800`) | not allowed anywhere (the guard): use the roles above |

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
| `Link` (Joy) | `app/Link` (`overlay`, `underline`, `className`) |
| `next/link` for a visible link | `app/Link` too: it infers the View Transition kind (B05); `navigation-guard.test.ts` fails on any other `next/link` import |
| `useRouter().push/replace/back` | `useNavigate()` (`kind?: "forward" \| "back" \| "tab" \| "none"`, inferred when absent); `refresh`/`prefetch` stay on `useRouter` |
| `Avatar` | `app/UserAvatar`; a stack is `flex -space-x-2` with `ring-2 ring-background` on each |
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
| MdBookmark, MdBookmarkBorder | `WantToTry` (on: `className="fill-current text-ink-1"`; X08's Save verb) |
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
| MdPersonAdd | `PersonAdd` |
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
| (new, X03) a pour from a bottle | `Pour` |
| MdUndo / MdRedo | `Undo` / `Redo` (D4's history steps — the Arrange bar, ⌘Z) |
| MdLock / MdLockOpen | `Lock` / `Unlock` |
| MdSwapVert | `Arrange` (X23: the tier list's editing mode — the padlock it replaced is gone) |
| MdRemoveCircleOutline | `RemoveFromList` (a row's minus while arranging; never `Delete`, which is for whole things) |
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
active tab scrolls the scroller to the top, then pops to the tab's root, then
goes to the tab's `rootTap` if it has one (Home's opens the search sheet,
X10). The brass ＋ (56 pt, 8 pt proud) is `CaptureButton`, a link to the
full-screen capture surface `/add` (`CAPTURE_HREF`, X06): the camera with
Bottle · Menu · Recipe, on the last mode used. `AppShell` hides the phone's tab
bar on capture routes (`isCaptureRoute`: `/add…` and a cellar's add pages;
Close is the way out there) and on `/search`, a full-screen sheet
(`contentLayout`).

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

**`SkipLink`** — rendered once by the root layout. `main-content.tsx` holds
`MAIN_CONTENT_ID` / `mainContentProps` for a frame's `<main>`, and
`MainContent` for a frame that is only a message (see "Accessibility
baseline"). Those live apart from `SkipLink` because it is a client module,
and a plain object imported from one reaches a server component as a client
reference, not as the object.

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
`initialSnap?`, `dismissible?`, `role?`, `footer?`. Without `snapPoints` it
sizes to its content (action lists, confirms; capped at 90dvh). With them the
sheet is `full` (94dvh) tall and only moves: peek shows 30% of the screen,
half 55%, full 94% (`vaulSnapPoint` converts these to vaul's fractions —
never hand vaul the visible fraction). Glass surface, safe-area bottom
padding, no background scaling; under reduced motion it fades instead of
sliding (`globals.css`).

**`ResponsiveDialog`** — the same props (+ `role="alertdialog"`): a
`BottomSheet` below `md`, a centred `ui/dialog` from `md`. Use it for every
former Joy `Modal`.

**`ConfirmSheet`** — `title`, `description`, `confirmLabel`, `onConfirm`,
`pending?`. The only place a solid danger button exists. Reversible actions
don't confirm — they toast with Undo.

**`notify`** — `notify("Removed from Garage", { undo: () => restore() })`.
5 s with an Undo action; `tone: "success" | "error" | "loading"`; `id` to
update a toast in place (an update without `undo` drops the earlier
action); `actionLabel` ("Try again"), `keepOnAction` (the toast stays up
while the caller reports the action's progress), `onAutoClose` / `onClose`;
`dismissNotification(id)`. Don't import `sonner` directly. The single `<Toaster/>` is mounted in `AppClientProviders`
and sits above the tab bar.

**`EmptyState`** — `illustration?`, `title` (one Fraunces line),
`description?` (one Inter line), `action?` (exactly one element). Copy:
design §3.6.

### Controls and display

**`IconButton`** — `<IconButton aria-label="Share"><Share /></IconButton>`;
`variant` as `Button`, `size` `default` (44) / `sm` (36 visual — or smaller
via `className` — in a centred 44 target) / `lg`; `asChild` to wrap an
`app/Link`.

**`SegmentedControl`**

```tsx
<SegmentedControl
  aria-label="Show"
  value={status}
  onValueChange={setStatus}
  options={[{ value: "open", label: "Open" }, { value: "finished", label: "Finished" }]}
/>
```

`radiogroup` of `radio`s; the current segment cannot be tapped off. An
option's `count` prints after its label in `ink-3` ("Finished 12") and is
part of its name.

**`FilterChip`** — `<FilterChip selected={on} onClick={toggle} count={12}>Open</FilterChip>`.
`aria-pressed`; selected is ink, not brass; zero counts hidden.

**`SortChip`** — `<SortChip options={[{ value: "open", label: "Open first" }, …]} value={sort} onValueChange={setSort} />`.
"Sort by: Open first ▾", shaped like a `FilterChip`: a sheet of `radio`
rows on a phone (a tap picks and closes; one tab stop, arrows move between
rows), a radio menu from `md`.
`overriddenBy="Best match"` shows that and disables it while something else
orders the list (a search). `label` (default "Sort by") heads the sheet.

**`TypeChip` / `TypeGlyph` / `itemTypeTokens` / `ITEM_TYPES_IN_ORDER`** —
`<TypeChip type="WINE" />` is glyph + word on the type's tint;
`itemTypeTokens[type]` has `label`, `glyph`, `textClass`, `tintClass`,
`deepClass`. Order is always wine, beer, spirit, sake, coffee, tea. On touch,
a glyph never stands without its word.

**`LabelPlate` / `VesselSilhouette`** — `<LabelPlate type="WINE" plate={labelPlateFrom(…)} />`
(N28): what an item looks like with no photo. A deterministic plate — the
producer in Fraunces small caps, the name, a big Fraunces vintage ("NV" only
for wine), region · ABV — on the type tint with one vessel per type at 12%.
It fills its box; the caller sets the aspect. Decorative (`aria-hidden`) by
default; `labelled` makes it an image named by its text (a detail hero);
`muted` dims it (a finished bottle). Build the data with `labelPlateFrom`
(`lib/items/label-plate.ts`) — never invent a field it does not have.

**`Score`** — `<Score value={4.5} />` "4.5★" inline; `variant="pill"` on
tiles; `variant="hero"` the Fraunces numeral; `count?`. One decimal only when
non-zero; renders nothing when not rated.

**`RatingInput` / `RatingDisplay`** — `RatingInput` (`value`, `onChange`,
`onClear?`, `disabled?`, `label?`) is ux/rating's control on the tokens; its
behaviour is `common/rating/useStarRatingInput` and `rating.ts`.
`RatingDisplay` is the read-only row (`value`, `size?: "sm" | "md"`).

**`AIDraftField`** — `source`, `drafted`, `className`, plus `confidence?: "sure" | "likely" | "check"` (X05). The 2 pt teal
rule and the source mark. **Teal enters the UI only here** (and AI progress
states). `proposal?: { display, label, onUse, onDismiss }` (X19) draws a value
the AI proposes but the field does not hold as a chip under it — "From
label: 2016 · Use", dashed "Suggested: Zinfandel · Use" — plus a dismiss
button; nothing is applied until `onUse`, after which the caller marks the
field `drafted` with the same source.

**`ActionBar`** — one brass `Button` (a second, secondary one at most),
sticky 12 pt above the tab bar on glass. Give the page `withActionBar`.

**`Link`** — `next/link` + `overlay` (stretched over the nearest `relative`
ancestor) + `underline` (`hover` default, `always`, `none`).

**`UserAvatar`** — `avatarUrl`, `displayName`, `size` `sm|md|lg`, `className`.

### Loading and optimistic state (X24)

**`LoadingShell` + `ShellBlocks`** — a route's `loading.tsx` (or a Suspense
fallback) drawn in the page's own frame, so a tap commits into it at once
(design §4.7, §4.10):

```tsx
<LoadingShell label="cellars">           {/* sr-only status: "Loading cellars…" */}
  <p className="type-headline">Cellars</p>  {/* chrome: real, from frame one */}
  <ShellBlocks className="grid gap-4">    {/* placeholders: after 120 ms, faded in */}
    <Skeleton className="h-24" />
  </ShellBlocks>
</LoadingShell>
```

Chrome the page will certainly draw (a tab root's title, the map's search
pill, the Me hub's rows, a place's server-read name) goes in as itself;
anything that waits on data goes in `ShellBlocks`, which stays invisible for
`--ca-skeleton-delay` (120 ms) so a fast route never flashes grey. One
shimmer: `ui/skeleton`'s pulse. The shells are `CellarsShell`, `MapShell`
(every map stage: route, Suspense, the lazy renderer, the location wait),
`MeHubShell`, `SearchLandingShell` and `PlaceDetailsShell` (with a `hero`, the
real name and category tile). Scope a `loading.tsx` to one page with a route
group when the folder has child routes (`cellars/(list)/`, `map/(canvas)/`),
and keep a missing-row `notFound()` in a `layout.tsx` above it — thrown inside
the boundary it arrives as a 200 (`places/[placeId]/layout.tsx`).

**`useOptimisticToggle`** (`@/hooks/useOptimisticToggle`) — `{ value,
commit, onError }` → `{ on, pending, toggle }`. `on` is the tapped state from
the tap's own frame; `commit(next)` resolves `{ ok: true, value? }` or `{ ok:
false, message }`; a refusal falls back to what the server last confirmed and
calls `onError` (toast it). One write at a time: taps during a write flip
what is drawn, and the hook writes again only if the last tapped state is not
what the server then holds — safe even over a mutation that flips rather than
sets, though every write wired to it sets (`setFavorite`,
`recordPlaceInteraction`), so a retry can never flip one back. The state is
per subject: key a component that is reused for another item or place (the
map drawer keys its content by place id).
Never disable the control while `pending` (`aria-busy` only) and never swap
its glyph for a spinner. Used by ItemCard's heart and the place Save / Visited
toggles (`usePlaceToggles`). Check-ins are not toggles: they go through the
drink-log sheet (X02), which mints the log's id so a retry is the same log,
and answers with a toast that carries Undo.

**`TogglePop`** — `<TogglePop on={on} pop={pending}><Love … /></TogglePop>`:
the glyph pops 1 → 1.18 → 1 on `spring.celebrate` when the user turns a
toggle on (not off, not on mount, and not when data arriving turns it on —
`pop` is the toggle's `pending`); reduced motion keeps only the colour
change.

**Prefetch on pointerdown** (`prefetch.ts`) — `AppShell` installs one
capture-phase `pointerdown` listener that `router.prefetch`es the nearest
in-app anchor, so a route's shell is on its way ~100 ms before the click.
It covers every `app/Link` (tabs included) without making `Link` a client
component. Opt a link out with `data-prefetch="false"`. Buttons that navigate
warm their destination themselves: AppBar's Back (its `parent` on a cold deep
link). ＋ is a link, so the shared listener covers it.

## Accessibility baseline (X21)

Every page, held by tests rather than by review:

- **A title of its own.** Export `metadata` (`{ title: "Cellars" }`) or
  `generateMetadata` from the `page.tsx` — the words only; the root
  layout's template adds " · Cellar Assistant" (`{ absolute }` when the app
  is already named). A name from data comes from the page's own read
  wrapped in React `cache()` (see `ItemPage`'s `loadItemPage`), so the title
  costs no request. Guard: `lib/dev-checks/page-titles.test.ts`.
- **Exactly one h1.** An `AppBar` with a string `title` is it; a page whose
  heading lives in the content (an item's name) passes the bar a `<p>`. A
  page with no visible headline (the map, `/search`) renders an `sr-only` h1.
  Headings go down one level at a time.
- **One `<main>`, the skip link's target.** `SkipLink` (rendered once, by
  the root layout) focuses `MAIN_CONTENT_ID` — by script, so it adds no
  history entry for Back to land on; every frame spreads `mainContentProps`
  on its `<main>` (`AppShell`, `AuthPage`, `ShareFrame`), and a message with
  no frame around it renders in `MainContent` (the offline page, the
  signed-out and shared-link not-found pages, the share and global error
  pages). A new frame without one breaks the skip link.
- **Every control named.** `IconButton` requires `aria-label`; anything else
  icon-only needs one too. Guard: `lib/dev-checks/control-names.test.ts`.
- **Focus visible.** Controls draw `focus-visible:ring-[3px]
  ring-ring/50` (the primitives do); `outline-none` never ships without a
  focus-visible replacement on something a keyboard can reach.
- **The gate:** `packages/e2e/specs/mobile/m21-axe.spec.ts` — axe at 390,
  serious + critical = 0 over the main routes, plus the structural checks
  above, the skip link and a keyboard walk (each stop's look focused against
  its look after focus moves on: a ring that is always there is not one).

## Layering (z-index)

- App overlays — `BottomSheet`, `ResponsiveDialog`, `ui/dialog`, `ui/sheet`,
  tooltips, popovers, menus, selects — portal to `<body>` at `z-50`, and
  need no `z-[…]` of their own anywhere in the app. The tab bar is `z-40`,
  `ActionBar` `z-30`, in-card stretched links and their buttons `z-10`.
- The map is the one surface with its own scale (controls, the results list,
  the place drawer, the pin: `z-[12]` … `z-[1250]`). Its canvas container is
  `isolate` (`map/maplibre/MapLibreRenderer.tsx`), so all of those order
  themselves *inside* the map and a `z-50` sheet, tooltip or toast opened
  from the drawer still draws above it. Keep new map overlays inside that
  container; don't raise an app overlay to clear one.

## Not built here (roadmap, design §3.4 of the migration plan)

`ItemTile` density variants, pull-to-refresh,
View Transitions (B05 — `app/Link` is where type inference will go), the
collapsing large title (B02), custom beverage glyphs.

## Imagery (B03)

`LabelPlate` takes an optional `styleFields` and draws one of fourteen vessels from
`label-plate/silhouettes.ts` (`vesselFor`), falling back to the type's; `vesselShape` and
`VesselSilhouette` take the same fields. A recipe with no photo is `recipe/RecipePlate` (a coupe
coloured by `recipe/glass-colors.ts`, or a cloche) or, in a row, `RecipeThumb`. A place with no photo
is `map/places/PlaceHero`, toned from its category. All three are deterministic and use tokens only.

## Route motion (B05)

Pushes slide forward, Back slides back, a tab switch crossfades, and the
bars stay put. The pieces:

- **`transition-kind.ts`** — pure: `inferKind(from, to)` (same path → none,
  another tab's root → tab, an ancestor → back, else forward),
  `popKind(stack, to)` for browser Back/Forward, `transitionTypesFor(kind,
  env)` (no types under reduced motion or without the API), `morphName`.
- **`useNavigate`** and **`Link`** turn a kind (given or inferred) into
  Next's `transitionTypes`. `navigate.back()` tells `RouteTransition` its kind.
- **`RouteTransition`** wraps the shell's `<main>` in React's
  `<ViewTransition>` and, on `popstate`, adds the kind's type to the
  traverse's transition (from `nav-history`'s stack).
- **`MorphTitle`** — wrap a card's title (`href` = the card's link) and the
  page's heading (no props) and the title flies between them on forward and
  back. Names come from the path, so a name must appear once per page.
- **`app/view-transitions.css`** — the classes, and the anchors: anything
  with `data-slot="tab-bar"`, `"side-rail"` or `"app-bar"` is named and does
  not animate. Render at most one `AppBar` at a time (two would share a name
  and the browser skips the transition).

