import { CardContent, CardOverflow, Divider, Typography } from "@mui/joy";
import { ItemType } from "@shared/gql/graphql";
import Image from "next/image";
import { always, cond, equals, isNil, isNotNil } from "ramda";
import { MdOutlineComment, MdStar } from "react-icons/md";
import beer1 from "@/images/beer1.png";
import coffee1 from "@/images/coffee1.png";
import spirit1 from "@/images/spirit1.png";
import wine1 from "@/images/wine1.png";
import {
  formatItemType,
  formatVintage,
  getNextPlaceholder,
  nhostImageLoader,
} from "@/utilities";
import InteractiveCard from "../common/InteractiveCard";
import Link from "../common/Link";

export type ItemCardItem = {
  id: string;
  name: string;
  vintage?: string;
  displayImageId?: string;
  placeholder?: string | null;
  score?: number | null;
  reviewCount?: number | null;
};

export type ItemCardProps = {
  item: ItemCardItem;
  href?: string;
  onClick?: (itemId: string) => void;
  type: ItemType;
};
export const ItemCard = ({ item, href, onClick, type }: ItemCardProps) => {
  const fallback = cond([
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
          py: 1,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        {isNil(item.reviewCount) && <Typography>No Reviews</Typography>}
        {isNotNil(item.reviewCount) && (
          <Typography endDecorator={<MdOutlineComment />} level="title-md">
            {item.reviewCount}
          </Typography>
        )}
        <Divider orientation="vertical" />
        {isNil(item.score) && <Typography>No Scores</Typography>}
        {isNotNil(item.score) && (
          <Typography
            endDecorator={
              <MdStar style={{ color: "#ffba26", fontSize: "2rem" }} />
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
