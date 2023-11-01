import cellar1 from "@/images/cellar1.png";
import cellar2 from "@/images/cellar2.png";
import cellar3 from "@/images/cellar3.png";
import cellar4 from "@/images/cellar4.png";
import cellar5 from "@/images/cellar5.png";
import InteractiveCard from "../common/InteractiveCard";
import { AspectRatio, CardOverflow, Typography } from "@mui/joy";
import Image from "next/image";
import Link from "../common/Link";
import { isNil, isNotNil } from "ramda";

const cellarImages = [cellar1, cellar2, cellar3, cellar4, cellar5];

type CellarCardProps = {
  cellar: {
    id: string;
    name: string;
  };
  index: number;
  onClick?: (cellarId: string) => void;
};

export const CellarCard = ({ cellar, index, onClick }: CellarCardProps) => (
  <InteractiveCard>
    <CardOverflow>
      <AspectRatio ratio="2">
        <Image
          src={cellarImages[index % 5]}
          alt="An image of a wine cellar"
          fill
          placeholder="blur"
        />
      </AspectRatio>
    </CardOverflow>
    {isNil(onClick) && (
      <Link overlay href={`cellars/${cellar.id}/items`}>
        <Typography level="title-lg">{cellar.name}</Typography>
      </Link>
    )}
    {isNotNil(onClick) && (
      <Typography level="title-lg">{cellar.name}</Typography>
    )}
  </InteractiveCard>
);
