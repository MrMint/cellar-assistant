import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import {
  formatCountry,
  formatSpiritType,
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
import spirit1 from "@/images/spirit1.png";
import { formatAsPercentage, formatVintage } from "@/utilities";
import {
  SpiritCellarsFragment,
  SpiritCoreFragment,
  type SpiritDetailsFragment,
  SpiritImagesFragment,
  SpiritRelationshipsFragment,
  SpiritReviewsFragment,
  SpiritUserDataFragment,
} from "./fragments";

interface SpiritDetailsProps {
  spirit: FragmentOf<typeof SpiritDetailsFragment>;
  cellars: Array<{ id: string; name: string }>;
  itemId: string;
}

export function SpiritDetails({ spirit, cellars, itemId }: SpiritDetailsProps) {
  if (isNil(spirit)) {
    notFound();
  }

  // Read specific fragments for child components
  const coreData = readFragment(SpiritCoreFragment, spirit);
  const imageData = readFragment(SpiritImagesFragment, spirit);
  const userData = readFragment(SpiritUserDataFragment, spirit);
  const reviews = readFragment(SpiritReviewsFragment, spirit);
  const cellarItems = readFragment(SpiritCellarsFragment, spirit);
  const relationships = readFragment(SpiritRelationshipsFragment, spirit);

  const displayImage = nth(0, imageData.item_images ?? []);

  return (
    <Stack spacing={2}>
      <ItemHeaderServer
        itemId={itemId}
        itemName={coreData.name}
        itemType={"SPIRIT"}
        cellars={cellars}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          <Stack spacing={1}>
            <ItemImage
              fileId={displayImage?.file_id}
              placeholder={displayImage?.placeholder}
              fallback={spirit1}
            />
            <ItemShare itemId={coreData.id} itemType={"SPIRIT"} />
          </Stack>
        </Grid>
        <Grid container xs={12} sm={8}>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <ItemDetails
                itemId={coreData.id}
                type={"SPIRIT"}
                favoriteId={nth(0, userData.item_favorites)?.id}
                title={coreData.name}
                subTitlePhrases={[
                  formatVintage(coreData.vintage),
                  formatSpiritType(coreData.type),
                  coreData.style,
                  formatCountry(coreData.country),
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
                <ItemBrands
                  brands={relationships.brands}
                  title="Distilleries"
                />
              )}
              <ItemTierLists entityId={coreData.id} entityType="spirit" />
            </Stack>
          </Grid>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <AddReview spiritId={coreData.id} />
              <ItemReviews reviews={reviews.reviews} />
            </Stack>
          </Grid>
        </Grid>
      </Grid>
    </Stack>
  );
}
