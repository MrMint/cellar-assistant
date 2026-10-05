/**
 * The schema. Every module is a side-effect import that adds its types and
 * fields to the shared builder; the order is alphabetical and does not matter.
 */
import { builder } from "./builder.ts";
import "./scalars.ts";
import "./brand.ts";
import "./cellar.ts";
import "./enums.ts";
import "./errors.ts";
// A7c: `ItemImage.file` returns `File`, so the ref exists before `item.ts` uses it.
import "./file.ts";
import "./item.ts";
// B2: both add fields that reference `Item`, so they follow the module that
// declares the interface.
import "./barcode.ts";
import "./item-onboarding.ts";
import "./ping.ts";
// B6: `RecipeIngredient` resolves through the `Item` interface and the
// `GenericItem` type, both declared by `item.ts`.
import "./recipe.ts";
import "./reference-data.ts";
import "./tier-list.ts";
// B5 grows `tier-list.ts`'s one-field `Place` stub rather than declaring a
// second type, so it follows the module that creates the ref.
import "./place.ts";
// C1 (§2.3): the search fields. `search.ts` follows `item.ts` and `brand.ts`,
// `place-search.ts` follows `place.ts` and `tier-list.ts` — every hit links to
// a type one of those declares, and a ref has to exist before it is used.
import "./search.ts";
import "./place-search.ts";
// A7f (§2.4): the two C2 view actors. `map.ts` reuses `MapBoundsInput` and
// `VisitStatusFilter` from `place-search.ts`, so it follows it; `rankings.ts`
// links each entry to the `Item` interface.
import "./map.ts";
import "./rankings.ts";
// A7f (§2.6): the one job actor a user starts from a request. Follows nothing
// in particular — it references only its own types and the scalars.
import "./recipe-photo.ts";
// B8: `MenuScan` links to `Item`, `Recipe` and the `Place` stub, so it follows
// the three modules that declare them.
import "./menu-scan.ts";
import "./viewer.ts";
// B4 adds a field to `Viewer`, so it is imported after the module that
// declares it — `builder.objectField` needs the ref to exist.
import "./user.ts";
// UI parity G4: profile edges on five types from five modules, all resolved
// through `user.ts`'s `UserProfile` loader — so it comes after every one.
import "./profile-edges.ts";
// UI parity wave B: reverse edges on `Item`, `Place`, `Cellar`, `CellarItem`,
// `Brand`, `TierListItem`, `RecipeIngredient` and `ItemBrand` — refs from six
// modules, so it comes after every one of them.
import "./reverse-edges.ts";
// UI parity wave C: map, place and menu-scan edges on `Place`,
// `PlaceInteraction`, `MenuItemMatch`, `MenuScan` and `MatchSuggestion` —
// refs from five modules, so it too comes after every one of them.
import "./place-edges.ts";

export const schema = builder.toSchema();
