import { LabelPlate } from "@/components/app/LabelPlate";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow, Page } from "@/components/app/Page";
import { ItemCocktails } from "@/components/bar/ItemCocktails";
import { YourLog } from "@/components/drink-log/YourLog";
import { AddReview } from "@/components/review/AddReview";
import type { ItemView } from "./adapter";
import { ChangeBrand } from "./ChangeBrand";
import { ItemActionBar } from "./ItemActionBar";
import { ItemActionsProvider } from "./ItemActions";
import { ItemAppBar } from "./ItemAppBar";
import { ItemBrands, shownItemBrand } from "./ItemBrands";
import { type ItemCellar, ItemCellars } from "./ItemCellars";
import { ItemFacts } from "./ItemFacts";
import { ItemHero } from "./ItemHero";
import { ItemImage } from "./ItemImage";
import { ItemImageWithCaptureClient } from "./ItemImageWithCaptureClient";
import { type ItemRecipeIngredient, ItemRecipes } from "./ItemRecipes";
import { ItemReviews } from "./ItemReviews";
import { type ItemTierListEntry, ItemTierLists } from "./ItemTierLists";
import {
  bottleStateLine,
  cookingRecipes,
  defaultLogBottle,
  producerTitle,
  tasteCells,
  type YourBottle,
} from "./item-page-model";
import { TasteHeader } from "./TasteHeader";
import { YourBottles } from "./YourBottles";

/** The bottle a bottle URL names (`/cellars/<c>/<type>s/<bottleId>`). */
export type SelectedBottle = YourBottle & {
  /** Creator or co-owner of its cellar: may pour, log from, delete it. */
  isOwner: boolean;
  displayImage: { url: string; placeholder: string | null } | null;
};

export type ItemPageViewProps = {
  item: ItemView;
  /** X09 "Your bottles": yours, still in your cellars, open first. */
  bottles: YourBottle[];
  bottlesTotal?: number | null;
  /** The bottle the URL names, on a bottle's URL; null on the item's. */
  selected?: SelectedBottle | null;
  /** Where Back goes on a cold deep link. */
  parent: string;
  /** "Located in" — cellars you may see holding a bottle (G9). */
  cellars: ItemCellar[];
  /** Exact counts where the API stops a list at 100 rows (null: unknown). */
  cellarsTotal?: number | null;
  tierLists: ItemTierListEntry[];
  tierListsTotal?: number | null;
  recipes: ItemRecipeIngredient[];
  /** The viewer's cellars "Add to cellar" offers. */
  addableCellars: { id: string; name: string }[];
  /** The creator's edit page (D7), or null. */
  editHref: string | null;
};

/**
 * X09 — **one item page**. The item route and the bottle route both render
 * this; on a bottle's URL that bottle is *selected* (marked in "Your
 * bottles", its level inline, its photo in the hero, Delete in `⋯`) — a
 * bottle id keeps meaning a bottle (D-gating answer 1), it just stops being
 * a different page.
 *
 * One column, phone first (design §2 "Detail screens"): the hero, the taste
 * header (You · Friends · Everyone), "Your bottles" with Pour and Log, "Your
 * log" (D8: `Item.checkIns(scope: MINE)`), the fact sheet for all six types,
 * "Cocktails with this" (X14 — so spirits show recipes), food recipes, your
 * review and everyone's, the producer under one title per type (with D8's
 * one-tap brand change for the creator), where it is, and the lists it is
 * on. The ActionBar — Log a drink · Add to cellar · Want to try · `⋯` — rides
 * 12 pt above the tab bar, in flow after the last section so nothing hides
 * under it.
 */
export function ItemPageView({
  item,
  bottles,
  bottlesTotal,
  selected = null,
  parent,
  cellars,
  cellarsTotal,
  tierLists,
  tierListsTotal,
  recipes,
  addableCellars,
  editHref,
}: ItemPageViewProps) {
  const producer = shownItemBrand(item.brands);
  const owned = selected?.isOwner;
  // A selected bottle of yours leads the list — a finished one too (the list
  // itself holds bottles still in the cellar), so its Restore is where its
  // row is — and the others follow in the API's open-first order.
  const shownBottles = owned
    ? [selected, ...bottles.filter((bottle) => bottle.id !== selected.id)]
    : bottles;
  const logBottle = defaultLogBottle(shownBottles, owned ? selected.id : null);

  const plate = (
    <LabelPlate
      type={item.type}
      plate={item.plate}
      labelled
      muted={selected !== null && selected.emptyAt !== null}
    />
  );
  const heroShape = "aspect-[4/3] sm:aspect-square";
  const picture = selected?.isOwner ? (
    <ItemImageWithCaptureClient
      url={selected.displayImage?.url ?? item.image?.url}
      placeholder={
        selected.displayImage?.placeholder ?? item.image?.placeholder
      }
      fallback={plate}
      itemId={item.itemId}
      itemType={item.type}
      cellarId={selected.cellarId}
      cellarItemId={selected.id}
      className={heroShape}
    />
  ) : (
    <ItemImage
      url={selected?.displayImage?.url ?? item.image?.url}
      placeholder={
        selected?.displayImage?.placeholder ?? item.image?.placeholder
      }
      fallback={plate}
      className={heroShape}
    />
  );

  return (
    <ItemActionsProvider
      subject={{
        itemType: item.type,
        itemId: item.itemId,
        itemName: item.name,
      }}
      defaultBottle={
        logBottle === null
          ? null
          : { cellarId: logBottle.cellarId, cellarItemId: logBottle.id }
      }
    >
      <Page className="gap-5">
        <ItemAppBar
          parent={parent}
          cellarName={selected?.cellarName ?? undefined}
          itemName={item.name}
          share={{ itemId: item.itemId, itemType: item.type }}
        />
        <ItemHero
          itemId={item.itemId}
          type={item.type}
          name={item.name}
          isFavorite={item.isFavorite}
          producer={producer}
          subtitle={item.subTitlePhrases}
          picture={picture}
          stateLine={
            selected === null ? undefined : (
              <p data-testid="selected-bottle" className="type-footnote">
                This bottle · {selected.cellarName ?? "a cellar"} ·{" "}
                {bottleStateLine(selected)}
              </p>
            )
          }
        />
        <TasteHeader
          cells={tasteCells({
            mine: item.myReview?.score ?? null,
            friends: item.friends,
            everyone: item.everyone,
          })}
        />

        {selected !== null && !selected.isOwner && (
          // A bottle in someone else's cellar you may see: what it is and
          // where, read-only — pouring and logging from it are its owner's.
          <InsetSection label="This bottle">
            <ListRow
              title={
                <Link
                  href={`/cellars/${selected.cellarId}/items`}
                  overlay
                  underline="none"
                >
                  {selected.cellarName ?? "Their cellar"}
                </Link>
              }
              description={bottleStateLine(selected)}
            />
          </InsetSection>
        )}
        <YourBottles
          itemType={item.type}
          itemName={item.name}
          bottles={shownBottles}
          total={
            bottlesTotal === null || bottlesTotal === undefined
              ? null
              : // `myBottles` counts bottles still in the cellar, so only a
                // finished selected bottle is one it did not count. (Comparing
                // list lengths would also count an active selected bottle
                // that sits past the first page as an extra one.)
                bottlesTotal + (owned && selected.emptyAt !== null ? 1 : 0)
          }
          selectedId={owned ? selected.id : null}
        />
        <YourLog
          subject={{
            itemType: item.type,
            itemId: item.itemId,
            itemName: item.name,
          }}
        />
        <ItemFacts
          facts={item.facts}
          description={item.description}
          flavorProfile={item.flavorProfile}
          ingredients={item.ingredients}
        />
        {/* X14: "Cocktails with this" / "Use it up" — every type, spirits
            first among them; renders nothing when no cocktail uses it. */}
        <ItemCocktails itemId={item.itemId} type={item.type} />
        <ItemRecipes
          recipeIngredients={cookingRecipes(recipes)}
          title="Cook with this"
          itemName={item.name}
          // Only the food recipes are drawn, so `recipeIngredients`'
          // totalCount (every recipe) is not this list's total; a held-back
          // page is past 100 recipes using this one item.
          total={null}
        />
        <AddReview
          itemId={item.itemId}
          type={item.type}
          myReview={item.myReview}
        />
        <ItemReviews
          reviews={item.reviews}
          itemId={item.itemId}
          type={item.type}
          endCursor={item.reviewsEndCursor}
          hasNextPage={item.reviewsHasNextPage}
        />
        <ItemBrands
          brands={item.brands}
          title={producerTitle(item.type, item.brands.length)}
          change={
            // D8: the creator — the one person `editHref` is set for — can
            // correct the brand from here in one tap.
            editHref === null ? undefined : (
              <ChangeBrand
                type={item.type}
                itemId={item.itemId}
                itemName={item.name}
                shown={producer}
                linkedBrandIds={item.brands.map((link) => link.brand.id)}
              />
            )
          }
        />
        <ItemCellars cellars={cellars} total={cellarsTotal} />
        <ItemTierLists entries={tierLists} total={tierListsTotal} />

        <ItemActionBar
          itemId={item.itemId}
          itemType={item.type}
          itemName={item.name}
          isWantToTry={item.isWantToTry}
          addableCellars={addableCellars}
          editHref={editHref}
          pourable={
            owned && selected.emptyAt === null
              ? {
                  cellarId: selected.cellarId,
                  cellarItemId: selected.id,
                  openAt: selected.openAt,
                  percentageRemaining: selected.percentageRemaining,
                }
              : null
          }
          deletable={
            owned
              ? {
                  cellarId: selected.cellarId,
                  bottleId: selected.id,
                  openAt: selected.openAt,
                  emptyAt: selected.emptyAt,
                  percentageRemaining: selected.percentageRemaining,
                }
              : null
          }
        />
      </Page>
    </ItemActionsProvider>
  );
}
