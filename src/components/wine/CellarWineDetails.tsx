import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import {
  formatCountry,
  formatWineVariety,
  getIsCellarOwner,
} from "@cellar-assistant/shared/utility";
import { Grid, Stack } from "@mui/joy";
import { notFound } from "next/navigation";
import { isNil, isNotNil, nth } from "ramda";
import { CellarItemHeader } from "@/components/item/CellarItemHeader";
import { ItemCheckIns } from "@/components/item/ItemCheckIns";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemImageWithCaptureClient } from "@/components/item/ItemImageWithCaptureClient";
import { ItemRemainingSlider } from "@/components/item/ItemRemainingSlider";
import { ItemReviews } from "@/components/item/ItemReviews";
import { ItemShare } from "@/components/item/ItemShare";
import { AddReview } from "@/components/review/AddReview";
import wine1 from "@/images/wine1.png";
import { formatAsPercentage, formatVintage, parseDate } from "@/utilities";
import {
  CellarWineCheckInsFragment,
  CellarWineDataFragment,
  type CellarWineDetailsFragment,
  CellarWineItemFragment,
  UserWithFriendsFragment,
  WineCoreFragment,
  WineReviewsFragment,
  WineUserDataFragment,
} from "./fragments";

interface CellarWineDetailsProps {
  cellarItem: FragmentOf<typeof CellarWineDetailsFragment>;
  user: FragmentOf<typeof UserWithFriendsFragment>;
  itemId: string;
  cellarId: string;
  userId: string;
  cellarName?: string;
  itemName?: string;
}

export function CellarWineDetails({
  cellarItem,
  user,
  itemId,
  cellarId,
  userId,
  cellarName,
  itemName,
}: CellarWineDetailsProps) {
  if (isNil(cellarItem) || isNil(user)) {
    notFound();
  }

  // Read specific fragments for child components
  const itemData = readFragment(CellarWineItemFragment, cellarItem);
  const wineData = readFragment(CellarWineDataFragment, cellarItem);
  const checkInsData = readFragment(CellarWineCheckInsFragment, cellarItem);
  const userData = readFragment(UserWithFriendsFragment, user);

  // Read wine-specific fragments
  const wineCore = readFragment(WineCoreFragment, wineData.wine);
  const wineUserData = readFragment(WineUserDataFragment, wineData.wine);
  const wineReviews = readFragment(WineReviewsFragment, wineData.wine);

  // Null safety checks
  if (!wineCore || !wineUserData || !wineReviews) {
    notFound();
  }

  const isOwner = getIsCellarOwner(userId, itemData.cellar);

  return (
    <Stack spacing={2}>
      <CellarItemHeader
        itemType={"WINE"}
        itemId={itemId}
        itemName={itemName || wineCore?.name}
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
            fallback={wine1}
            itemId={wineCore?.id}
            itemType="WINE"
            cellarItemId={itemId}
          />
        </Grid>
        <Grid container xs={12} sm={8}>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <ItemDetails
                itemId={wineCore?.id}
                type={"WINE"}
                favoriteId={nth(0, wineUserData?.item_favorites || [])?.id}
                title={wineCore?.name || ""}
                subTitlePhrases={[
                  formatVintage(wineCore?.vintage),
                  formatWineVariety(wineCore?.variety),
                  formatCountry(wineCore?.country),
                  wineCore?.region,
                  formatAsPercentage(wineCore?.alcohol_content_percentage),
                ]}
                description={wineCore?.description}
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
                isCellarOwner={isOwner}
                percentageRemaining={itemData.percentage_remaining}
                opened={parseDate(itemData?.open_at)}
                emptied={parseDate(itemData?.empty_at)}
              />
              <ItemShare itemId={wineCore?.id} itemType={"WINE"} />
            </Stack>
          </Grid>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <AddReview wineId={wineCore?.id} />
              <ItemReviews reviews={wineReviews?.reviews || []} />
            </Stack>
          </Grid>
        </Grid>
      </Grid>
    </Stack>
  );
}
