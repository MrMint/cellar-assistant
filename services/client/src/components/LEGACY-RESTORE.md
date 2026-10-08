# Restored UI building blocks (UI parity wave 1a)

The production UI at `82450ad1` is the spec (`docs/architecture/ui-parity-decisions.md`).
These are its shared pieces, restored once so each domain wave ports its own
pages on top of them instead of re-porting them six ways.

## Where they live, and why there

**At their old paths.** A domain wave porting an old file (say
`82450ad1:src/components/cellar/Cellars.tsx`) can keep its imports —
`@/components/common/HeaderBar`, `@/hooks/useMediaQuery`, `@/utilities`,
`@/components/item/ItemCard` — unchanged. None of the old paths collides with a
file the rewrite owns: `common/` already held the old `DebouncedInput`, `Link`,
`UserAvatar`, `SideNavigationBar` byte-for-byte, and `cellar/`, `forms/`, `item/`,
`hooks/` held nothing that is restored here.

| Old path (`82450ad1:src/…`) | New path (`services/client/src/…`) | Change |
|---|---|---|
| `components/common/HeaderBar.tsx` | same | verbatim |
| `components/common/ServerBreadcrumbs.tsx` | same, rule in `components/common/breadcrumbs.ts` | rule moved to a plain module; sake and tea added to the item segments |
| `components/common/VirtualGrid.tsx` | same | verbatim |
| `components/common/InteractiveCard.tsx` | same | verbatim |
| `components/common/ItemTypeIcon.tsx` | same | `ItemTypeValue` → SDL `ItemType` |
| `components/common/PageLoading.tsx` | same | verbatim |
| `components/common/RichTextDisplay.tsx`, `RichTextEditor.tsx` | same, reader in `components/common/rich-text.ts` | `"use client"` added; new reader |
| `components/forms/EnumSelect.tsx` | same | `EnumKey` from `hooks/enum-options.ts` |
| `components/item/ItemCard/index.tsx` | same, plus `types.ts`, `fragments.ts`, `adapter.ts` | see substitutions |
| `components/cellar/CellarItemsFilter.tsx` | same, plus `cellarItemCounts.ts` | `ItemTypeValue` → SDL `ItemType` |
| `hooks/useMediaQuery.ts`, `useColumnCount.ts`, `useDebouncedCallback.ts`, `useAnimatedPlaceholder.ts` | same | verbatim |
| `hooks/useEnum.ts` | same, plus `hooks/enum-options.ts` | rewritten over `useReferenceOptions` |
| `utilities/hooks.ts` | same | safe `?types=` parse (`utilities/types-param.ts`); `useReviewersFilterState` left to rankings |
| `utilities/index.ts` | same (pure half only) | see below |
| `functions/_packages/shared/utility/index.ts` (formatters) | `utilities/formatters.ts` | copied; "Vieena" typo fixed |

Not restored: `common/Breadcrumbs.tsx`, `ThemeToggle.tsx`, `ConfidenceIndicator.tsx`
(no importers at `82450ad1`); `common/OnboardingWizard/*`, `BarcodeScanner`,
`CameraCapture`, `QuickAddCard`, `AnimatedPlaceholder` (one domain each, and
they need xstate, react-webcam, barcode-detector, framer-motion — the waves that
own them add those); the recipe and place hooks (`useCanonicalRecipe`,
`useRecipe*`, `useOptimizedRecipeGroupSearch`, `usePlaceEnrichment`,
`useBarcodeScanner`), which are Hasura queries in hook form, not shared UI.

## Substitutions (Hasura/Nhost → the new data layer)

| Old | New | Where |
|---|---|---|
| `getNhostStorageUrl(file_id)` into `next/image` | presigned `ItemImage.file.url` into `next/image`, as before. Read URLs are stable per 6-day window (`services/actors/src/lib/s3-presign.ts`, "Stable read URLs"), so the optimizer's cache hits; the file host's `remotePatterns` entry is derived from `PUBLIC_FILES_HOST` (`next.config.mjs`, `imagesConfig`). Was a plain `<img>` under D10 until 2026-10-06 | `ItemCard`, `ItemImage`, `PlaceDetails`, `PlaceDetailsContent` |
| `next/image` `placeholder` from a base64 body | unchanged (`getNextPlaceholder` adds the `data:image/` prefix) | `ItemCard`, `ItemImage` |
| `next/image` on `brand.logo_url` / `recipe.image_url` | a plain `<img>`: both are free-form URLs on any host, and a `remotePatterns` entry that admits any host is an open SSRF proxy | `BrandCard`, `BrandDetails`, `ItemBrands`, recipe components |
| `addFavoriteAction` / `deleteFavoriteAction(favoriteId)` server actions | `toggleFavorite(itemId, type)` via URQL, reconciled to the payload's `favorited`; optimistic flip and revert kept | `ItemCard` |
| `favoriteId` prop | `isFavorite` (from `Item.isFavorite`) | `ItemCardItem` |
| `displayImageId` prop | `displayImageUrl` | `ItemCardItem` |
| six `*ItemCardFragment`s on Hasura tables | one `ItemCardFragment` on `Item` | `item/ItemCard/fragments.ts` |
| `reviews_aggregate { count avg }` | `score { count average }` | adapter |
| `item_favorites_aggregate.count` | `Item.favoriteCount` (G6) | fragment + adapter |
| viewer's `reviews_aggregate` count > 0 | `Item.myReview !== null` (G7) | fragment + adapter |
| `brands(order_by: is_primary desc, limit: 1)` | `brands(first: 1)`, primary picked client-side | adapter |
| relative `wines/<id>` link built inside the card | the caller's absolute `href` (§7: relative hrefs were a bug) | `ItemCard` |
| six `items_aggregate` per-type aliases | `Cellar.itemCounts` (G1) via `filterCountsFromItemCounts` | `cellar/cellarItemCounts.ts` |
| `EnumProvider` + `getEnumOptions` over Hasura enum tables | `useReferenceOptions` (ten `referenceData` aliases), `STATIC_OPTIONS`, SDL `PermissionType` | `hooks/useEnum.ts`, `hooks/enum-options.ts` |
| `@cellar-assistant/shared` `ItemTypeValue`, `ITEM_TYPES` | `ApiItemType`, `ITEM_TYPES` from `cellar-api/itemTypes` | everywhere |
| `@cellar-assistant/shared/utility` formatters | `utilities/formatters.ts` | `EnumSelect`, `buildItemSubtitle` |
| date-fns `formatVintage` | year sliced from the ISO string (no `Date`, so no timezone) | `utilities/index.ts` |
| `JSON.parse(?types=)` | `parseTypesParam` (bad input = no filter) | `utilities/hooks.ts` |
| Lexical state as the only review shape | `richTextFromReviewText` also wraps the rewrite's `{ body }` and plain strings | `common/rich-text.ts` |

Dropped from `utilities/index.ts`: `getNhostStorageUrl`, `dataUrlToFile`,
`compressImage` (base64 upload path, E2d/E2f), `formatIsoDateString`,
`convertYearToDate` (date-fns; dates render through `common/Timestamp.tsx`),
`typeToIdKey`, `getItemType` (Hasura names), `getRandomInt`.

## Using them

```ts
import { ItemCard } from "@/components/item/ItemCard";
import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import { itemCardFromFragment, itemCardFromCellarItem } from "@/components/item/ItemCard/adapter";
```

Spread `...ItemCard` into the query, then `itemCardFromFragment(node)` (or
`itemCardFromCellarItem({ id, item })` for a bottle, so the card's `id` is the
bottle's — decision 1). Any other fragment works with `itemCardFromItem` as long
as it selected the fields; what it did not select hides the matching card
section, as a null aggregate did in the old card.

## Onboarding wizard, camera and barcode (UI parity wave 4)

Restored at their old paths: `common/OnboardingWizard/*` (both xstate
machines, the four steps, `ExistingItems`, `FinalPrompt`),
`common/CameraCapture.tsx` (react-webcam), `common/BarcodeScanner.tsx` +
`hooks/useBarcodeScanner.ts` (native `BarcodeDetector`, zxing-wasm ponyfill
from `public/zxing/`), `common/QuickAddCard.tsx`, `common/AnimationShowcase.tsx`,
`brand/BrandPicker.tsx`. The six `{type}/{T}Onboarding.tsx` are one
`common/OnboardingWizard/ItemOnboarding.tsx`; the six `{T}Form`s' create mode is
`OnboardingItemForm.tsx`, drawing fields through `item/ItemFormField.tsx` (moved
out of `ItemForm`, unchanged). Adapters: `OnboardingWizard/adapter.ts`.

| Old | New |
|---|---|
| `uploadLabelImagesAction(FormData)` (base64 via a server action) | `uploadFile(label-front/back)` — presigned PUT; `startItemOnboarding` verifies |
| `{type}_defaults(hint)` | `startItemOnboarding` → E2c merge (`formDefaultsFromOnboarding`) |
| `barcodes_by_pk { wines beers spirits coffees }` | `barcode(code).items` (all six), `...ItemCard` |
| `searchByImage` / `chooseExistingImage` | dropped (G32) |
| `insert_{type}s_one` + barcode `on_conflict` + `ensureAndLinkBrand` | `confirmItemOnboarding(brandName)` → poll → typed code via `ensureBarcode` + `linkBarcodeItem` |
| `insert_cellar_items_one(display_image_id)` | `attachItemImage` → `addItemToCellar(cellarItemId, displayImageId)` |
| quick add at confidence ≥ 0.9 | also needs a label photographed and no NOT NULL column missing (E2c) |
| `CameraCapture.onCapture(dataUrl)` | unchanged; callers decode with `lib/items/dataUrlToFile` |
