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
// X19: `Item.correction` and the three correction mutations reference `Item`,
// `ItemBrand` and the onboarding actor's types.
import "./item-correction.ts";
import "./ping.ts";
// B6: `RecipeIngredient` resolves through the `Item` interface and the
// `GenericItem` type, both declared by `item.ts`.
import "./recipe.ts";
// X14: availability, makeability, Love, the Bar pantry and What can I make —
// fields on `Recipe`, `RecipeIngredient` and `Item`, so after both modules.
import "./bar.ts";
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
// X02: the drink log. Adds `place`/`photo` to `item.ts`'s `ItemCheckIn` and
// links `tier-list.ts`'s `Place` stub and `file.ts`'s `File`, so it follows all
// three.
import "./check-in.ts";
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
// UI parity G31: `/search`'s discovery fields on `Viewer` — activity entries
// link `UserProfile`, `Item`, `ItemReview`, `TierListItem` and `Cellar`,
// nearby places link `Place`, so it comes after every module declaring them.
import "./discovery.ts";
// X10: Home's `Viewer.openBottles`, `Viewer.aiJobs` and `CellarItem.cellar` —
// references `cellar.ts`, `item.ts` and `errors.ts`, so it follows them.
import "./home.ts";
// X08: `Viewer.wantToTry` and the `isWantToTry` edges on `Item` and `Recipe`
// reference `Viewer`, `Item`, `Recipe` and the `Place` stub, so it comes last.
import "./want-to-try.ts";
// X17: the share reads and friend invites. Reuses enums from `item.ts`,
// `recipe.ts` and `tier-list.ts`, and adds a field to `Viewer`.
import "./share.ts";
// X18: `Viewer.counts` and `friendProfile`, whose sections are `TierList`,
// `Cellar` and `ItemCheckIn` connections and whose person is a `UserProfile`
// — refs from four modules, so it comes after every one of them.
import "./friend-profile.ts";
// L03 (wave C "taste"): the taste profile and agreement. References
// `ItemType` from `item.ts`; adds three Query fields.
import "./taste.ts";

export const schema = builder.toSchema();
