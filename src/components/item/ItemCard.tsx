import { ItemType } from "@/constants";
import InteractiveCard from "../common/InteractiveCard";
import { AspectRatio, CardOverflow, Typography } from "@mui/joy";
import Image from "next/image";
import beer1 from "@/images/beer1.png";
import spirit1 from "@/images/spirit1.png";
import wine1 from "@/images/wine1.png";
import { isNotNil } from "ramda";
import Link from "../common/Link";
import { formatVintage } from "@/utilities";

export type ItemCardProps = {
  item: {
    id: string;
    name: string;
    vintage?: string;
  };
  href?: string;
  onClick?: (itemId: string) => void;
  type: ItemType;
};
export const ItemCard = ({ item, href, onClick, type }: ItemCardProps) => (
  <InteractiveCard
    onClick={isNotNil(onClick) ? () => onClick(item.id) : undefined}
  >
    <CardOverflow>
      {type === ItemType.Beer && (
        <AspectRatio ratio="1" maxHeight={300}>
          <Image
            src={beer1}
            alt="An image of a beer glass"
            fill
            placeholder="blur"
          />
        </AspectRatio>
      )}
      {type === ItemType.Wine && (
        <AspectRatio ratio="1" maxHeight={300}>
          <Image
            src={wine1}
            alt="An image of a wine bottle"
            fill
            placeholder="blur"
          />
        </AspectRatio>
      )}
      {type === ItemType.Spirit && (
        <AspectRatio ratio="1" maxHeight={300}>
          <Image
            src={spirit1}
            alt="An image of a liquor bottle"
            fill
            placeholder="blur"
          />
        </AspectRatio>
      )}
    </CardOverflow>
    {isNotNil(href) && (
      <Link overlay href={`${ItemType[type].toLowerCase()}s/${item.id}`}>
        <Typography level="title-md">
          {type === ItemType.Wine &&
            `${formatVintage(item.vintage)} ${item.name}`}
          {type !== ItemType.Wine && item.name}
        </Typography>
      </Link>
    )}
    {isNotNil(onClick) && (
      <Typography level="title-md">
        {type === ItemType.Wine &&
          `${formatVintage(item.vintage)} ${item.name}`}
        {type !== ItemType.Wine && item.name}
      </Typography>
    )}
  </InteractiveCard>
);
