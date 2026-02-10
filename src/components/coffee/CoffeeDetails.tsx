import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import { formatCountry, formatEnum } from "@cellar-assistant/shared/utility";
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
import coffee1 from "@/images/coffee1.png";
import {
  CoffeeCellarsFragment,
  CoffeeCoreFragment,
  type CoffeeDetailsFragment,
  CoffeeImagesFragment,
  CoffeeRelationshipsFragment,
  CoffeeReviewsFragment,
  CoffeeUserDataFragment,
} from "./fragments";

interface CoffeeDetailsProps {
  coffee: FragmentOf<typeof CoffeeDetailsFragment>;
  cellars: Array<{ id: string; name: string }>;
  itemId: string;
}

export function CoffeeDetails({ coffee, cellars, itemId }: CoffeeDetailsProps) {
  if (isNil(coffee)) {
    notFound();
  }

  // Read specific fragments for child components
  const coreData = readFragment(CoffeeCoreFragment, coffee);
  const imageData = readFragment(CoffeeImagesFragment, coffee);
  const userData = readFragment(CoffeeUserDataFragment, coffee);
  const reviews = readFragment(CoffeeReviewsFragment, coffee);
  const cellarItems = readFragment(CoffeeCellarsFragment, coffee);
  const relationships = readFragment(CoffeeRelationshipsFragment, coffee);

  const displayImage = nth(0, imageData.item_images ?? []);

  return (
    <Stack spacing={2}>
      <ItemHeaderServer
        itemId={itemId}
        itemName={coreData.name}
        itemType={"COFFEE"}
        cellars={cellars}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          <Stack spacing={1}>
            <ItemImage
              fileId={displayImage?.file_id}
              placeholder={displayImage?.placeholder}
              fallback={coffee1}
            />
            <ItemShare itemId={coreData.id} itemType={"COFFEE"} />
          </Stack>
        </Grid>
        <Grid container xs={12} sm={8}>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <ItemDetails
                itemId={coreData.id}
                type={"COFFEE"}
                favoriteId={nth(0, userData.item_favorites)?.id}
                title={coreData.name}
                subTitlePhrases={[
                  formatEnum(coreData.roast_level),
                  formatCountry(coreData.country),
                  formatEnum(coreData.species),
                  formatEnum(coreData.cultivar),
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
                <ItemBrands brands={relationships.brands} title="Roasters" />
              )}
              <ItemTierLists entityId={coreData.id} entityType="coffee" />
            </Stack>
          </Grid>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <AddReview coffeeId={coreData.id} />
              <ItemReviews reviews={reviews.reviews} />
            </Stack>
          </Grid>
        </Grid>
      </Grid>
    </Stack>
  );
}
