import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import {
  formatBeerStyle,
  formatCountry,
} from "@cellar-assistant/shared/utility";
import { Grid, Stack } from "@mui/joy";
import { notFound } from "next/navigation";
import { isNil, nth } from "ramda";
import { ItemBrands } from "@/components/item/ItemBrands";
import { ItemCellars } from "@/components/item/ItemCellars";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemHeaderServer } from "@/components/item/ItemHeaderServer";
import { ItemImage } from "@/components/item/ItemImage";
import { ItemReviews } from "@/components/item/ItemReviews";
import { ItemShare } from "@/components/item/ItemShare";
import { ItemTierLists } from "@/components/item/ItemTierLists";
import { AddReview } from "@/components/review/AddReview";
import beer1 from "@/images/beer1.png";
import { formatAsPercentage, formatVintage } from "@/utilities";
import {
  BeerCellarsFragment,
  BeerCoreFragment,
  type BeerDetailsFragment,
  BeerImagesFragment,
  BeerRelationshipsFragment,
  BeerReviewsFragment,
  BeerUserDataFragment,
} from "./fragments";

interface BeerDetailsProps {
  beer: FragmentOf<typeof BeerDetailsFragment>;
  cellars: Array<{ id: string; name: string }>;
  itemId: string;
}

export function BeerDetails({ beer, cellars, itemId }: BeerDetailsProps) {
  if (isNil(beer)) {
    notFound();
  }

  // Read specific fragments for child components
  const coreData = readFragment(BeerCoreFragment, beer);
  const imageData = readFragment(BeerImagesFragment, beer);
  const userData = readFragment(BeerUserDataFragment, beer);
  const reviews = readFragment(BeerReviewsFragment, beer);
  const cellarItems = readFragment(BeerCellarsFragment, beer);
  const relationships = readFragment(BeerRelationshipsFragment, beer);

  const displayImage = nth(0, imageData.item_images ?? []);

  return (
    <Stack spacing={2}>
      <ItemHeaderServer
        itemId={itemId}
        itemName={coreData.name}
        itemType={"BEER"}
        cellars={cellars}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          <Stack spacing={1}>
            <ItemImage
              fileId={displayImage?.file_id}
              placeholder={displayImage?.placeholder}
              fallback={beer1}
            />
            <ItemShare itemId={coreData.id} itemType={"BEER"} />
          </Stack>
        </Grid>
        <Grid container xs={12} sm={8}>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <ItemDetails
                itemId={coreData.id}
                type={"BEER"}
                favoriteId={nth(0, userData.item_favorites)?.id}
                title={coreData.name}
                subTitlePhrases={[
                  formatVintage(coreData.vintage),
                  formatCountry(coreData.country),
                  formatBeerStyle(coreData.style),
                  formatAsPercentage(coreData.alcohol_content_percentage),
                ]}
                description={coreData.description}
              />
              <ItemCellars
                cellars={cellarItems.cellar_items.map((x) => ({
                  ...x.cellar,
                  co_owners: x.cellar.co_owners.map((y) => y.user),
                }))}
              />
              {relationships?.brands && relationships.brands.length > 0 && (
                <ItemBrands brands={relationships.brands} title="Breweries" />
              )}
              <ItemTierLists entityId={coreData.id} entityType="beer" />
            </Stack>
          </Grid>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <AddReview beerId={coreData.id} />
              <ItemReviews reviews={reviews.reviews} />
            </Stack>
          </Grid>
        </Grid>
      </Grid>
    </Stack>
  );
}
