import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import {
  formatCountry,
  formatSpiritType,
  getIsCellarOwner,
} from "@cellar-assistant/shared/utility";
import { Grid, Stack } from "@mui/joy";
import { notFound } from "next/navigation";
import { isNil, isNotNil, nth } from "ramda";
import { CellarItemHeader } from "@/components/item/CellarItemHeader";
import { ItemBrands } from "@/components/item/ItemBrands";
import { ItemCheckIns } from "@/components/item/ItemCheckIns";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemImageWithCaptureClient } from "@/components/item/ItemImageWithCaptureClient";
import { ItemRemainingSlider } from "@/components/item/ItemRemainingSlider";
import { ItemReviews } from "@/components/item/ItemReviews";
import { ItemShare } from "@/components/item/ItemShare";
import { AddReview } from "@/components/review/AddReview";
import spirit1 from "@/images/spirit1.png";
import { formatAsPercentage, formatVintage, parseDate } from "@/utilities";
import {
  CellarSpiritCheckInsFragment,
  CellarSpiritDataFragment,
  type CellarSpiritDetailsFragment,
  CellarSpiritItemFragment,
  SpiritCoreFragment,
  SpiritRelationshipsFragment,
  SpiritReviewsFragment,
  SpiritUserDataFragment,
  UserWithFriendsFragment,
} from "./fragments";

interface CellarSpiritDetailsProps {
  cellarItem: FragmentOf<typeof CellarSpiritDetailsFragment>;
  user: FragmentOf<typeof UserWithFriendsFragment>;
  itemId: string;
  cellarId: string;
  userId: string;
  cellarName?: string;
  itemName?: string;
}

export function CellarSpiritDetails({
  cellarItem,
  user,
  itemId,
  cellarId,
  userId,
  cellarName,
  itemName,
}: CellarSpiritDetailsProps) {
  if (isNil(cellarItem) || isNil(user)) {
    notFound();
  }

  // Read specific fragments for child components
  const itemData = readFragment(CellarSpiritItemFragment, cellarItem);
  const spiritData = readFragment(CellarSpiritDataFragment, cellarItem);
  const checkInsData = readFragment(CellarSpiritCheckInsFragment, cellarItem);
  const userData = readFragment(UserWithFriendsFragment, user);

  // Read spirit-specific fragments
  const spiritCore = readFragment(SpiritCoreFragment, spiritData.spirit);
  const spiritUserData = readFragment(
    SpiritUserDataFragment,
    spiritData.spirit,
  );
  const spiritReviews = readFragment(SpiritReviewsFragment, spiritData.spirit);
  const spiritRelationships = readFragment(
    SpiritRelationshipsFragment,
    spiritData.spirit,
  );

  // Null safety checks
  if (!spiritCore || !spiritUserData || !spiritReviews) {
    notFound();
  }

  const isOwner = getIsCellarOwner(userId, itemData.cellar);

  return (
    <Stack spacing={2}>
      <CellarItemHeader
        itemType={"SPIRIT"}
        itemId={itemId}
        itemName={itemName || spiritCore?.name}
        cellarId={cellarId}
        cellarName={cellarName || itemData.cellar?.name}
        isOwner={isOwner}
        userId={userId}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          <ItemImageWithCaptureClient
            fileId={itemData.display_image?.file_id}
            placeholder={itemData.display_image?.placeholder}
            fallback={spirit1}
            itemId={spiritCore?.id}
            itemType="SPIRIT"
            cellarItemId={itemId}
          />
        </Grid>
        <Grid container xs={12} sm={8}>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <ItemDetails
                itemId={spiritCore?.id}
                type={"SPIRIT"}
                favoriteId={nth(0, spiritUserData?.item_favorites || [])?.id}
                title={spiritCore?.name || ""}
                subTitlePhrases={[
                  formatVintage(spiritCore?.vintage),
                  formatSpiritType(spiritCore?.type),
                  spiritCore?.style,
                  formatCountry(spiritCore?.country),
                  formatAsPercentage(spiritCore?.alcohol_content_percentage),
                ]}
                description={spiritCore?.description}
              />
              {isNotNil(itemData.open_at) && (
                <ItemCheckIns
                  checkIns={checkInsData.check_ins}
                  itemId={itemData?.id}
                  friends={userData?.friends?.map((x) => x.friend) || []}
                  user={userData}
                />
              )}
              <ItemRemainingSlider
                itemId={itemId}
                cellarId={cellarId}
                isCellarOwner={isOwner}
                percentageRemaining={itemData.percentage_remaining}
                opened={parseDate(itemData?.open_at)}
                emptied={parseDate(itemData?.empty_at)}
              />
              <ItemShare itemId={spiritCore?.id} itemType={"SPIRIT"} />
            </Stack>
          </Grid>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <AddReview spiritId={spiritCore?.id} />
              <ItemReviews reviews={spiritReviews?.reviews || []} />
              {spiritRelationships?.brands &&
                spiritRelationships.brands.length > 0 && (
                  <ItemBrands
                    brands={spiritRelationships.brands}
                    title="Spirit Brands"
                  />
                )}
            </Stack>
          </Grid>
        </Grid>
      </Grid>
    </Stack>
  );
}
