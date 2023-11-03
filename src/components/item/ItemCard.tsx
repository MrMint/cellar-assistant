import { AspectRatio, CardOverflow, Typography } from "@mui/joy";
import Image from "next/image";
import { isNil, isNotNil } from "ramda";
import { ItemType } from "@/constants";
import beer1 from "@/images/beer1.png";
import spirit1 from "@/images/spirit1.png";
import wine1 from "@/images/wine1.png";
import {
  formatVintage,
  getNextPlaceholder,
  nhostImageLoader,
} from "@/utilities";
import InteractiveCard from "../common/InteractiveCard";
import Link from "../common/Link";

export type ItemCardProps = {
  item: {
    id: string;
    name: string;
    vintage?: string;
    displayImageId?: string;
    placeholder?: string | null;
  };
  href?: string;
  onClick?: (itemId: string) => void;
  type: ItemType;
};
export const ItemCard = ({ item, href, onClick, type }: ItemCardProps) => {
  return (
    <InteractiveCard
      onClick={isNotNil(onClick) ? () => onClick(item.id) : undefined}
    >
      <CardOverflow>
        {isNotNil(item.displayImageId) && (
          <AspectRatio ratio="1" maxHeight={300}>
            <Image
              src={item.displayImageId}
              alt="An image of a beer glass"
              height={300}
              width={300}
              loader={nhostImageLoader}
              placeholder={getNextPlaceholder(item.placeholder)}
            />
          </AspectRatio>
        )}
        {isNil(item.displayImageId) && (
          <>
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
          </>
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
};
