import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import {
  formatBeerStyle,
  formatCountry,
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
import beer1 from "@/images/beer1.png";
import { formatAsPercentage, formatVintage, parseDate } from "@/utilities";
import {
  BeerCoreFragment,
  BeerRelationshipsFragment,
  BeerReviewsFragment,
  BeerUserDataFragment,
  CellarBeerCheckInsFragment,
  CellarBeerDataFragment,
  type CellarBeerDetailsFragment,
  CellarBeerItemFragment,
  UserWithFriendsFragment,
} from "./fragments";

interface CellarBeerDetailsProps {
  cellarItem: FragmentOf<typeof CellarBeerDetailsFragment>;
  user: FragmentOf<typeof UserWithFriendsFragment>;
  itemId: string;
  cellarId: string;
  userId: string;
  cellarName?: string;
  itemName?: string;
}

export function CellarBeerDetails({
  cellarItem,
  user,
  itemId,
  cellarId,
  userId,
  cellarName,
  itemName,
}: CellarBeerDetailsProps) {
  if (isNil(cellarItem) || isNil(user)) {
    notFound();
  }

  // Read specific fragments for child components
  const itemData = readFragment(CellarBeerItemFragment, cellarItem);
  const beerData = readFragment(CellarBeerDataFragment, cellarItem);
  const checkInsData = readFragment(CellarBeerCheckInsFragment, cellarItem);
  const userData = readFragment(UserWithFriendsFragment, user);

  // Read beer-specific fragments
  const beerCore = readFragment(BeerCoreFragment, beerData.beer);
  const beerUserData = readFragment(BeerUserDataFragment, beerData.beer);
  const beerReviews = readFragment(BeerReviewsFragment, beerData.beer);
  const beerRelationships = readFragment(
    BeerRelationshipsFragment,
    beerData.beer,
  );

  // Null safety checks
  if (!beerCore || !beerUserData || !beerReviews) {
    notFound();
  }

  const isOwner = getIsCellarOwner(userId, itemData.cellar);

  return (
    <Stack spacing={2}>
      <CellarItemHeader
        itemType={"BEER"}
        itemId={itemId}
        itemName={itemName || beerCore?.name}
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
            fallback={beer1}
            itemId={beerCore?.id}
            itemType="BEER"
            cellarItemId={itemId}
          />
        </Grid>
        <Grid container xs={12} sm={8}>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <ItemDetails
                itemId={beerCore?.id}
                type={"BEER"}
                favoriteId={nth(0, beerUserData?.item_favorites || [])?.id}
                title={beerCore?.name || ""}
                subTitlePhrases={[
                  formatVintage(beerCore?.vintage),
                  formatBeerStyle(beerCore?.style),
                  formatCountry(beerCore?.country),
                  formatAsPercentage(beerCore?.alcohol_content_percentage),
                ]}
                description={beerCore?.description}
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
              <ItemShare itemId={beerCore?.id} itemType={"BEER"} />
            </Stack>
          </Grid>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <AddReview beerId={beerCore?.id} />
              <ItemReviews reviews={beerReviews?.reviews || []} />
              {beerRelationships?.brands &&
                beerRelationships.brands.length > 0 && (
                  <ItemBrands
                    brands={beerRelationships.brands}
                    title="Beer Brands"
                  />
                )}
            </Stack>
          </Grid>
        </Grid>
      </Grid>
    </Stack>
  );
}
