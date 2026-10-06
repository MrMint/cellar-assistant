/**
 * New API shapes → the old item components' props.
 *
 * The six `82450ad1:src/components/{wine,…}/{T}Details.tsx` and
 * `Cellar{T}Details.tsx` built their children's props inline from Hasura
 * rows (`formatVintage(coreData.vintage)`, `x.cellar.co_owners.map(…)`); this
 * is those mappings, lifted out so they are unit-tested, over the fields in
 * `./fragments.ts`.
 *
 * Plain module (no `"use client"`): server pages and client leaves both
 * import it. Inputs are structural, so a test can feed them without a
 * GraphQL round trip.
 */

import {
  type ApiItemType,
  cellarItemHref,
} from "@/components/cellar-api/itemTypes";
import { richTextFromReviewText } from "@/components/common/rich-text";
import { type FragmentOf, readFragment } from "@/lib/api/graphql";
import {
  ItemAttributesFragment,
  ItemBrandFragment,
  ItemCoreFragment,
} from "@/lib/api/items";
import { formatAsPercentage, formatEnum, formatVintage } from "@/utilities";
import {
  formatBeerStyle,
  formatCountry,
  formatSpiritType,
  formatWineVariety,
} from "@/utilities/formatters";
import {
  ItemPageItemFragment,
  ItemPageRecipesFragment,
  ItemPageRelationsFragment,
  ItemPageReviewFragment,
} from "./fragments";
import type { ItemBrand } from "./ItemBrands";
import type { ItemCellar, ItemCellarUser } from "./ItemCellars";
import type { ItemRecipeIngredient } from "./ItemRecipes";
import type { Review } from "./ItemReviews";
import type { ItemTierListEntry } from "./ItemTierLists";

/* -------------------------------------------------------------------------- */
/* Routes                                                                      */
/* -------------------------------------------------------------------------- */

const SEGMENTS: Record<ApiItemType, string> = {
  WINE: "wines",
  BEER: "beers",
  SPIRIT: "spirits",
  COFFEE: "coffees",
  SAKE: "sakes",
  TEA: "teas",
};

/** `/wines/<id>` — the item's own page. */
export const itemPageHref = (type: ApiItemType, itemId: string): string =>
  `/${SEGMENTS[type]}/${itemId}`;

/** The share target: absolute, with its scheme (the old QR had neither). */
export const itemShareUrl = (
  origin: string,
  type: ApiItemType,
  itemId: string,
): string => `${origin.replace(/\/+$/, "")}${itemPageHref(type, itemId)}`;

/** `/cellars/<c>/wines/<bottleId>` — one bottle's page (decision 1). */
export const bottleHref = (
  cellarId: string,
  type: ApiItemType,
  bottleId: string,
): string => cellarItemHref(cellarId, type, bottleId);

/**
 * Where a cellar-item URL goes when its id is not simply a bottle of the
 * URL's type in that cellar (decision 1).
 *
 * - a bottle of another type → that bottle's own segment;
 * - a catalog item id with exactly one bottle here (`Cellar.bottleFor`) → that
 *   bottle;
 * - anything else → the item page, which says "not found" itself when the id
 *   is not an item either.
 *
 * `null` means "render the bottle".
 */
export const cellarItemRedirect = ({
  cellarId,
  type,
  id,
  bottle,
  bottleForId,
}: {
  cellarId: string;
  type: ApiItemType;
  id: string;
  bottle: { id: string; itemType: ApiItemType } | null;
  bottleForId: string | null;
}): string | null => {
  if (bottle !== null) {
    return bottle.itemType === type
      ? null
      : bottleHref(cellarId, bottle.itemType, bottle.id);
  }
  if (bottleForId !== null) return bottleHref(cellarId, type, bottleForId);
  return itemPageHref(type, id);
};

/* -------------------------------------------------------------------------- */
/* Attributes                                                                  */
/* -------------------------------------------------------------------------- */

/** `...ItemAttributes`, read loosely: the six types' columns by name. */
export type ItemAttributesSource = { __typename?: string } & Record<
  string,
  unknown
>;

export type ItemCoreSource = {
  name: string;
  description?: string | null;
  country?: string | null;
};

const str = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;
const text = (value: unknown): string | number | undefined =>
  typeof value === "string" || typeof value === "number" ? value : undefined;

/**
 * The line under the title, per type, exactly as each old `{T}Details` built
 * it (`subTitlePhrases`). `undefined` entries are dropped by `ItemDetails`.
 * `style` is aliased per type in `ItemAttributesFragment` (`wineStyle`,
 * `beerStyle`, `spiritStyle`).
 */
export const itemSubtitlePhrases = (
  type: ApiItemType,
  core: ItemCoreSource,
  attributes: ItemAttributesSource,
): Array<string | undefined> => {
  const country = formatCountry(core.country);
  const abv = formatAsPercentage(num(attributes.alcoholContentPercentage));
  switch (type) {
    case "WINE":
      return [
        formatVintage(str(attributes.vintage)),
        formatWineVariety(str(attributes.variety)),
        country,
        str(attributes.region),
        abv,
      ];
    case "BEER":
      return [
        formatVintage(str(attributes.vintage)),
        country,
        formatBeerStyle(str(attributes.beerStyle)),
        abv,
      ];
    case "SPIRIT":
      return [
        formatVintage(str(attributes.vintage)),
        formatSpiritType(str(attributes.spiritType)),
        str(attributes.spiritStyle),
        country,
        abv,
      ];
    case "COFFEE":
      return [
        formatEnum(str(attributes.roastLevel)),
        country,
        formatEnum(str(attributes.species)),
        formatEnum(str(attributes.cultivar)),
      ];
    case "SAKE":
      return [
        formatEnum(str(attributes.category)),
        formatEnum(str(attributes.sakeType)),
        country,
        str(attributes.region),
      ];
    case "TEA":
      return [
        formatEnum(str(attributes.category)),
        formatEnum(str(attributes.form)),
        country,
        str(attributes.region),
      ];
  }
};

export type Characteristic = { label: string; value: string | number };

/**
 * The "Sake Characteristics" / "Tea Characteristics" chips, in the old
 * order and with the old labels and formatting; empty values are dropped,
 * as the old `.filter` did. Other types have none.
 */
export const itemCharacteristics = (
  type: ApiItemType,
  attributes: ItemAttributesSource,
): Characteristic[] => {
  const rows: { label: string; value: string | number | undefined }[] =
    type === "SAKE"
      ? [
          { label: "Category", value: formatEnum(str(attributes.category)) },
          { label: "Type", value: formatEnum(str(attributes.sakeType)) },
          {
            label: "Polish Grade",
            value:
              num(attributes.polishGrade) === undefined
                ? undefined
                : `${num(attributes.polishGrade)}%`,
          },
          {
            label: "ABV",
            value:
              num(attributes.alcoholContentPercentage) === undefined
                ? undefined
                : `${num(attributes.alcoholContentPercentage)}%`,
          },
          { label: "SMV", value: num(attributes.sakeMeterValue) },
          { label: "Acidity", value: num(attributes.acidity) },
          { label: "Rice Variety", value: str(attributes.riceVariety) },
          { label: "Yeast Strain", value: str(attributes.yeastStrain) },
          {
            label: "Serving Temp",
            value: formatEnum(str(attributes.servingTemperature)),
          },
          { label: "Vintage", value: num(attributes.vintageYear) },
        ]
      : type === "TEA"
        ? [
            { label: "Category", value: formatEnum(str(attributes.category)) },
            { label: "Form", value: formatEnum(str(attributes.form)) },
            {
              label: "Caffeine",
              value: formatEnum(str(attributes.caffeineLevel)),
            },
            {
              label: "Oxidation",
              value: formatEnum(str(attributes.oxidationLevel)),
            },
            {
              label: "Processing",
              value: formatEnum(str(attributes.processing)),
            },
            { label: "Cultivar", value: str(attributes.cultivar) },
            { label: "Harvest Year", value: text(attributes.harvestYear) },
            { label: "Steep Temp", value: str(attributes.steepingTemperature) },
            { label: "Steep Time", value: str(attributes.steepingTime) },
            {
              label: "Organic",
              value: attributes.isOrganic === true ? "Yes" : undefined,
            },
            {
              label: "Fair Trade",
              value: attributes.isFairTrade === true ? "Yes" : undefined,
            },
          ]
        : [];
  return rows.filter(
    (row): row is Characteristic => row.value !== undefined && row.value !== "",
  );
};

/** Tea's two free-text cards ("Flavor Profile", "Ingredients"). */
export const teaTextCards = (
  type: ApiItemType,
  attributes: ItemAttributesSource,
): { flavorProfile: string | null; ingredients: string | null } => {
  if (type !== "TEA") return { flavorProfile: null, ingredients: null };
  const flavor = str(attributes.flavorProfile);
  const ingredients = str(attributes.ingredients);
  return {
    flavorProfile: flavor === undefined || flavor === "" ? null : flavor,
    ingredients:
      ingredients === undefined || ingredients === "" ? null : ingredients,
  };
};

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

type Profile = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
};

/**
 * A `UserProfile` → the old `User`. `avatarUrl` was non-null under Nhost;
 * `""` makes `UserAvatar` show the initial.
 */
export const userFromProfile = (profile: Profile): ItemCellarUser => ({
  id: profile.id,
  displayName: profile.displayName,
  avatarUrl: profile.avatarUrl ?? "",
});

/** A deleted or invisible author (`user` null) still gets a row. */
const UNKNOWN_USER = (id: string): ItemCellarUser => ({
  id,
  displayName: "Unknown user",
  avatarUrl: "",
});

export type ReviewSource = {
  id: string;
  score: number;
  text?: unknown;
  createdAt: string;
  userId: string;
  user?: Profile | null;
};

/** `ItemReview` (+ `user`, G4) → the old `Review`. */
export const reviewFromRow = (row: ReviewSource): Review => {
  const user =
    row.user === null || row.user === undefined
      ? UNKNOWN_USER(row.userId)
      : userFromProfile(row.user);
  return {
    id: row.id,
    score: row.score,
    user: { displayName: user.displayName, avatarUrl: user.avatarUrl },
    text: richTextFromReviewText(row.text),
    createdAt: row.createdAt,
  };
};

/** `Item.myReview` → `AddReview`'s pre-fill. */
export const myReviewFromRow = (
  row: { id: string; score: number; text?: unknown } | null | undefined,
): { id: string; score: number; text: string | null } | null =>
  row === null || row === undefined
    ? null
    : { id: row.id, score: row.score, text: richTextFromReviewText(row.text) };

export type CellarSource = {
  id: string;
  name: string;
  createdById: string;
  createdBy?: Profile | null;
  coOwners?: { edges: readonly { node: Profile }[] } | null;
};

/** `Item.cellars` node (G9, G4) → the old `ItemCellars` cellar. */
export const cellarFromNode = (node: CellarSource): ItemCellar => ({
  id: node.id,
  name: node.name,
  createdBy:
    node.createdBy === null || node.createdBy === undefined
      ? UNKNOWN_USER(node.createdById)
      : userFromProfile(node.createdBy),
  co_owners: (node.coOwners?.edges ?? []).map((edge) =>
    userFromProfile(edge.node),
  ),
});

/** `Item.tierListEntries` node (G8) → the old row. */
export const tierListEntryFromNode = (node: {
  id: string;
  band: number;
  tierList?: { id: string; name: string } | null;
}): ItemTierListEntry => ({
  id: node.id,
  band: node.band,
  tier_list:
    node.tierList === null || node.tierList === undefined
      ? null
      : { id: node.tierList.id, name: node.tierList.name },
});

/** `Item.recipeIngredients` node (G11) → the old `ItemRecipeIngredient`. */
export const recipeIngredientFromNode = (node: {
  id: string;
  quantity?: number | null;
  unit?: string | null;
  isOptional: boolean;
  recipe: {
    id: string;
    name: string;
    type: string;
    imageUrl?: string | null;
    difficultyLevel?: number | null;
  };
}): ItemRecipeIngredient => ({
  id: node.id,
  quantity: node.quantity ?? null,
  unit: node.unit ?? null,
  is_optional: node.isOptional,
  recipe: {
    id: node.recipe.id,
    name: node.recipe.name,
    type: node.recipe.type,
    image_url: node.recipe.imageUrl ?? null,
    difficulty_level: node.recipe.difficultyLevel ?? null,
  },
});

/** `Item.brands` node → the old `ItemBrand`. */
export const brandFromNode = (node: {
  id: string;
  isPrimary: boolean;
  brand: {
    id: string;
    name: string;
    brandType?: string | null;
    logoUrl?: string | null;
  };
}): ItemBrand => ({
  id: node.id,
  is_primary: node.isPrimary,
  brand: {
    id: node.brand.id,
    name: node.brand.name,
    logo_url: node.brand.logoUrl ?? null,
    brand_type: node.brand.brandType ?? null,
  },
});

export type CheckInRow = {
  id: string;
  createdAt: string;
  user: ItemCellarUser;
};

/** `CellarItem.checkIns` node (G14, G4) → the old `ItemCheckIns` row. */
export const checkInFromNode = (node: {
  id: string;
  createdAt: string;
  userId: string;
  user?: Profile | null;
}): CheckInRow => ({
  id: node.id,
  createdAt: node.createdAt,
  user:
    node.user === null || node.user === undefined
      ? UNKNOWN_USER(node.userId)
      : userFromProfile(node.user),
});

/**
 * The old `groupBy(format(createdAt, "yyyy-MM-dd"))`, by **UTC** day (the
 * key is the ISO string's date part, so server and browser agree). Groups
 * keep first-seen order, which is the API's newest-first order.
 */
export const groupCheckInsByDay = <T extends { createdAt: string }>(
  checkIns: readonly T[],
): [string, T[]][] => {
  const groups = new Map<string, T[]>();
  for (const checkIn of checkIns) {
    const key = checkIn.createdAt.slice(0, 10);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [checkIn]);
    else group.push(checkIn);
  }
  return Array.from(groups.entries());
};

/**
 * The cellars "Add to Cellar" offers: `myCellars` is everything the viewer
 * may *see*, and only the creator or a co-owner may add (`CellarActor`
 * refuses anyone else) — the old page passed the viewer's own cellars.
 */
export const addableCellars = (
  nodes: readonly {
    id: string;
    name: string;
    createdById: string;
    coOwnerIds: readonly string[];
  }[],
  viewerId: string | null,
): { id: string; name: string }[] =>
  viewerId === null
    ? []
    : nodes
        .filter(
          (node) =>
            node.createdById === viewerId || node.coOwnerIds.includes(viewerId),
        )
        .map((node) => ({ id: node.id, name: node.name }));

/** The old `getIsCellarOwner`: creator or co-owner. */
export const isCellarOwner = (
  cellar: { createdById: string; coOwnerIds: readonly string[] },
  viewerId: string | null,
): boolean =>
  viewerId !== null &&
  (cellar.createdById === viewerId || cellar.coOwnerIds.includes(viewerId));

/* -------------------------------------------------------------------------- */
/* Whole pages                                                                 */
/* -------------------------------------------------------------------------- */

/** Everything both views show of the catalog item, in the old props' shapes. */
export type ItemView = {
  itemId: string;
  type: ApiItemType;
  name: string;
  description: string | null;
  createdById: string;
  isFavorite: boolean;
  subTitlePhrases: Array<string | undefined>;
  characteristics: Characteristic[];
  flavorProfile: string | null;
  ingredients: string | null;
  image: { url: string; placeholder: string | null } | null;
  brands: ItemBrand[];
  reviews: Review[];
  reviewsEndCursor: string | null;
  reviewsHasNextPage: boolean;
  myReview: { id: string; score: number; text: string | null } | null;
};

/** `...ItemPageItem` → {@link ItemView}. */
export const itemViewFromFragment = (
  data: FragmentOf<typeof ItemPageItemFragment>,
): ItemView => {
  const item = readFragment(ItemPageItemFragment, data);
  const core = readFragment(ItemCoreFragment, item);
  const attributes = readFragment(
    ItemAttributesFragment,
    item,
  ) as unknown as ItemAttributesSource;
  const type = core.type as ApiItemType;
  const image = item.images.edges[0]?.node ?? null;
  const tea = teaTextCards(type, attributes);
  return {
    itemId: core.id,
    type,
    name: core.name,
    description: core.description ?? null,
    createdById: core.createdById,
    isFavorite: item.isFavorite,
    subTitlePhrases: itemSubtitlePhrases(type, core, attributes),
    characteristics: itemCharacteristics(type, attributes),
    flavorProfile: tea.flavorProfile,
    ingredients: tea.ingredients,
    image:
      image === null
        ? null
        : { url: image.file.url, placeholder: image.placeholder ?? null },
    brands: item.brands.edges.map((edge) =>
      brandFromNode(readFragment(ItemBrandFragment, edge.node)),
    ),
    reviews: item.reviews.edges.map((edge) =>
      reviewFromRow(readFragment(ItemPageReviewFragment, edge.node)),
    ),
    reviewsEndCursor: item.reviews.pageInfo.endCursor ?? null,
    reviewsHasNextPage: item.reviews.pageInfo.hasNextPage,
    myReview: myReviewFromRow(item.myReview),
  };
};

/** `...ItemPageRelations` → "Located in:" and "On Lists". */
export const itemRelationsFromFragment = (
  data: FragmentOf<typeof ItemPageRelationsFragment>,
): {
  cellars: ItemCellar[];
  tierLists: ItemTierListEntry[];
  /** `tierListEntries.totalCount` — exact, where the rows stop at 100. */
  tierListsTotal: number | null;
} => {
  const relations = readFragment(ItemPageRelationsFragment, data);
  return {
    cellars: relations.cellars.edges.map((edge) => cellarFromNode(edge.node)),
    tierLists: relations.tierListEntries.edges.map((edge) =>
      tierListEntryFromNode(edge.node),
    ),
    tierListsTotal: relations.tierListEntries.totalCount ?? null,
  };
};

/** `...ItemPageRecipes` → "Used in Recipes". */
export const itemRecipesFromFragment = (
  data: FragmentOf<typeof ItemPageRecipesFragment>,
): ItemRecipeIngredient[] =>
  readFragment(ItemPageRecipesFragment, data).recipeIngredients.edges.map(
    (edge) => recipeIngredientFromNode(edge.node),
  );

/** `recipeIngredients.totalCount` — exact, where the rows stop at 100. */
export const recipeIngredientsTotal = (
  data: FragmentOf<typeof ItemPageRecipesFragment>,
): number | null =>
  readFragment(ItemPageRecipesFragment, data).recipeIngredients.totalCount ??
  null;

/**
 * "Showing N of M" for a list the API stops at 100 rows (`cellars`,
 * `tierListEntries`, `recipeIngredients`, a bottle's `checkIns`), or null
 * when nothing was held back — so a capped list is never a silent one.
 */
export const heldBackNote = (
  shown: number,
  total: number | null | undefined,
  noun: string,
  order: "first" | "newest" = "first",
): string | null =>
  total === null || total === undefined || total <= shown
    ? null
    : `Showing the ${order} ${shown} of ${total} ${noun}.`;
