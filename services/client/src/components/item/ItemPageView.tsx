import type { ReactNode } from "react";
import { LabelPlate } from "@/components/app/LabelPlate";
import { Page } from "@/components/app/Page";
import { ItemCocktails } from "@/components/bar/ItemCocktails";
import { thisContainerLabel } from "@/components/drink-log/type-words";
import { YourLog } from "@/components/drink-log/YourLog";
import { AddReview } from "@/components/review/AddReview";
import type { ItemView } from "./adapter";
import { BrewGuideSection } from "./BrewGuideSection";
import { ChangeBrand } from "./ChangeBrand";
import { ItemActionsProvider } from "./ItemActions";
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
import { AddToListButton } from "./parts/AddToListButton";
import { ItemTop } from "./parts/ItemTop";
import { VisitorBottle } from "./parts/VisitorBottle";
import { SeenAtSection } from "./SeenAtSection";
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
  /** Inside the desktop pane (MC-panes): no bar, no bleed; `⋯` alone. */
  pane?: boolean;
};

function PageBody({ children }: { children: ReactNode }) {
  return <Page className="gap-6">{children}</Page>;
}

/** The pane's column: its own padding, the pane's width. */
function PaneBody({ children }: { children: ReactNode }) {
  return (
    <div data-testid="item-pane-body" className="flex flex-col gap-6 p-4">
      {children}
    </div>
  );
}

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
 * on. There is no bottom bar (Cellars-Bottles 01): Check in and Log sit in
 * the open bottle row, Want to try beside the heart, and everything else in
 * the bar's `⋯` menu (`parts/ItemMenu`). With `pane` the same body renders at
 * pane width, without the full-bleed hero (`ItemPane`).
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
  pane = false,
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
      styleFields={item.plateStyle}
      labelled
      muted={selected !== null && selected.emptyAt !== null}
    />
  );
  const heroShape = pane
    ? "aspect-square"
    : "h-[300px] md:aspect-square md:h-auto";
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

  const Body = pane ? PaneBody : PageBody;

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
      <Body>
        <ItemTop
          pane={pane}
          parent={parent}
          cellarName={selected?.cellarName ?? undefined}
          itemId={item.itemId}
          itemType={item.type}
          itemName={item.name}
          editHref={editHref}
          addableCellars={addableCellars}
          held={bottles.length}
          selected={
            selected === null
              ? null
              : {
                  id: selected.id,
                  cellarId: selected.cellarId,
                  isOwner: selected.isOwner,
                  openAt: selected.openAt,
                  emptyAt: selected.emptyAt,
                  percentageRemaining: selected.percentageRemaining,
                }
          }
          myReview={item.myReview}
        />
        <ItemHero
          itemId={item.itemId}
          type={item.type}
          name={item.name}
          isFavorite={item.isFavorite}
          isWantToTry={item.isWantToTry}
          producer={producer}
          subtitle={item.subTitlePhrases}
          picture={picture}
          bleed={!pane}
          pane={pane}
          stateLine={
            selected === null || !selected.isOwner ? undefined : (
              <p data-testid="selected-bottle" className="t-cap text-ink-2">
                {thisContainerLabel(item.type)} ·{" "}
                {selected.cellarName ?? "a cellar"} ·{" "}
                {bottleStateLine(selected)}
              </p>
            )
          }
        />
        {/* The rating line (C3's taste header: yours, friends, everyone),
            then your stars and note under the photo. */}
        <TasteHeader
          itemId={item.itemId}
          itemType={item.type}
          cells={tasteCells({
            mine: item.myReview?.score ?? null,
            friends: item.friends,
            everyone: item.everyone,
          })}
        />
        <AddReview
          itemId={item.itemId}
          type={item.type}
          myReview={item.myReview}
        />

        {selected !== null && !selected.isOwner && (
          <VisitorBottle itemType={item.type} bottle={selected} />
        )}
        {(shownBottles.length > 0 || selected === null || selected.isOwner) && (
          <YourBottles
            itemId={item.itemId}
            itemType={item.type}
            itemName={item.name}
            bottles={shownBottles}
            addableCellars={addableCellars}
            // `myBottles` counts bottles still in the cellar, which is what
            // the header counts (F-152): a finished selected bottle is
            // listed, not counted.
            total={bottlesTotal ?? null}
            selectedId={owned ? selected.id : null}
          />
        )}
        <ItemTierLists
          entries={tierLists}
          total={tierListsTotal}
          add={
            <AddToListButton
              itemId={item.itemId}
              itemType={item.type}
              itemName={item.name}
            />
          }
        />
        {/* L38: C3's "Your log", where the board draws the dated history. */}
        <YourLog
          subject={{
            itemType: item.type,
            itemId: item.itemId,
            itemName: item.name,
          }}
        />
        {(item.type === "TEA" || item.type === "COFFEE") && (
          <BrewGuideSection item={item} />
        )}
        <ItemFacts
          facts={item.facts}
          description={item.description}
          flavorProfile={item.flavorProfile}
          ingredients={item.ingredients}
        />
        {/* X14: "Cocktails with this" — every type; nothing when none. */}
        <ItemCocktails itemId={item.itemId} type={item.type} />
        <ItemRecipes
          recipeIngredients={cookingRecipes(recipes)}
          title="Cook with this"
          itemName={item.name}
          // Only the food recipes are drawn, so `recipeIngredients`'
          // totalCount (every recipe) is not this list's total.
          total={null}
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
            // D8: the creator can correct the brand from here in one tap.
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
        <SeenAtSection item={item} />
        <ItemCellars cellars={cellars} total={cellarsTotal} />
      </Body>
    </ItemActionsProvider>
  );
}
