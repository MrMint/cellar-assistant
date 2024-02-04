import {
  Button,
  CardContent,
  CardOverflow,
  Divider,
  Typography,
} from "@mui/joy";
import { SxProps } from "@mui/joy/styles/types";
import { useUserId } from "@nhost/nextjs";
import { ItemType } from "@shared/gql/graphql";
import { addFavoriteMutation, deleteFavoriteMutation } from "@shared/queries";
import Image from "next/image";
import { always, cond, equals, isNil, isNotNil } from "ramda";
import { MouseEvent } from "react";
import {
  MdFavorite,
  MdFavoriteBorder,
  MdOutlineComment,
  MdStar,
} from "react-icons/md";
import { useMutation } from "urql";
import { InteractiveCard } from "@/components/common/InteractiveCard";
import { Link } from "@/components/common/Link";
import beer1 from "@/images/beer1.png";
import coffee1 from "@/images/coffee1.png";
import spirit1 from "@/images/spirit1.png";
import wine1 from "@/images/wine1.png";
import {
  formatItemType,
  formatVintage,
  getNextPlaceholder,
  nhostImageLoader,
  typeToIdKey,
} from "@/utilities";

const overflowItemStyles: SxProps = {
  justifyContent: "center",
  textAlign: "center",
  flexGrow: 1,
  py: 1,
};

const getFallback = (type: ItemType) =>
  cond([
    [equals(ItemType.Beer), always({ image: beer1, alt: "A beer glass" })],
    [equals(ItemType.Wine), always({ image: wine1, alt: "A wine bottle" })],
    [
      equals(ItemType.Coffee),
      always({ image: coffee1, alt: "A bag of coffee beans" }),
    ],
    [
      equals(ItemType.Spirit),
      always({ image: spirit1, alt: "A bottle of spirits" }),
    ],
  ])(type);

export type ItemCardItem = {
  id: string;
  itemId: string;
  name: string;
  vintage?: string;
  displayImageId?: string;
  placeholder?: string | null;
  score?: number | null;
  reviewCount?: number | null;
  reviewed?: boolean | null;
  favoriteCount?: number | null;
  favoriteId?: string | null;
};

export type ItemCardProps = {
  item: ItemCardItem;
  href?: string;
  onClick?: (itemId: string) => void;
  type: ItemType;
};

export const ItemCard = ({ item, href, onClick, type }: ItemCardProps) => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Invalid user id");
  const [{ fetching: fetchingAdd }, addFavorite] =
    useMutation(addFavoriteMutation);
  const [{ fetching: fetchingDelete }, deleteFavorite] = useMutation(
    deleteFavoriteMutation,
  );
  const fallback = getFallback(type);

  const handleFavoriteClick = async (
    event: MouseEvent<HTMLAnchorElement, globalThis.MouseEvent>,
  ) => {
    event.stopPropagation();
    if (isNil(item.favoriteId)) {
      await addFavorite({
        object: { [typeToIdKey(type)]: item.itemId },
      });
    } else {
      await deleteFavorite({
        id: item.favoriteId,
      });
    }
  };
  const fetching = fetchingAdd || fetchingDelete;

  return (
    <InteractiveCard
      onClick={isNotNil(onClick) ? () => onClick(item.id) : undefined}
    >
      <CardOverflow
        sx={{ aspectRatio: { xs: 1.2, sm: 1 }, padding: 0, overflow: "hidden" }}
      >
        {isNotNil(item.displayImageId) && (
          <Image
            style={{
              aspectRatio: "1",
              objectFit: "cover",
              height: "auto",
              width: "auto",
            }}
            src={item.displayImageId}
            alt={fallback.alt}
            height={400}
            width={400}
            loader={nhostImageLoader}
            placeholder={getNextPlaceholder(item.placeholder)}
          />
        )}
        {isNil(item.displayImageId) && (
          <Image
            src={fallback.image}
            alt={fallback.alt}
            fill
            placeholder="blur"
          />
        )}
      </CardOverflow>
      {isNotNil(href) && (
        <CardContent>
          <Link
            overlay
            href={`${formatItemType(type).toLowerCase()}s/${item.id}`}
          >
            <Typography level="title-md" noWrap>
              {type === ItemType.Wine &&
                `${formatVintage(item.vintage)} ${item.name}`}
              {type !== ItemType.Wine && item.name}
            </Typography>
          </Link>
        </CardContent>
      )}
      {isNil(href) && isNotNil(onClick) && (
        <Typography level="title-md" noWrap>
          {type === ItemType.Wine &&
            `${formatVintage(item.vintage)} ${item.name}`}
          {type !== ItemType.Wine && item.name}
        </Typography>
      )}
      <CardOverflow
        variant="soft"
        sx={{
          display: "flex",
          flexDirection: "row",
          gap: 1,
          justifyContent: "space-around",
          overflow: "hidden",
          alignItems: "center",
          padding: 0,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        {isNotNil(item.favoriteCount) && (
          <>
            <Button
              sx={{
                zIndex: 2,
                flexGrow: 1,
              }}
              onClick={handleFavoriteClick}
              variant="soft"
              color="neutral"
              size="sm"
              loading={fetching}
              endDecorator={
                isNotNil(item.favoriteId) ? (
                  <MdFavorite
                    style={{
                      color: "red",
                      fontSize: "2rem",
                    }}
                  />
                ) : (
                  <MdFavoriteBorder
                    style={{
                      fontSize: "2rem",
                    }}
                  />
                )
              }
            >
              <Typography level="title-md">{item.favoriteCount}</Typography>
            </Button>
          </>
        )}
        <Divider orientation="vertical" />
        {/* {isNil(item.reviewCount) && (
          <Typography sx={overflowItemStyles}>No Reviews</Typography>
        )} */}
        {isNotNil(item.reviewCount) && (
          <Typography
            sx={overflowItemStyles}
            endDecorator={<MdOutlineComment />}
            level="title-md"
          >
            {item.reviewCount}
          </Typography>
        )}
        <Divider orientation="vertical" />
        {/* {isNil(item.score) && (
          <Typography sx={overflowItemStyles}>No Scores</Typography>
        )} */}
        {isNotNil(item.score) && (
          <Typography
            sx={overflowItemStyles}
            endDecorator={
              <MdStar
                style={{
                  color: item.reviewed ? "#ffba26" : "var(--Icon-color)",
                  fontSize: "2rem",
                }}
              />
            }
            level="title-md"
          >
            {item.score.toFixed(2)}
          </Typography>
        )}
      </CardOverflow>
    </InteractiveCard>
  );
};
