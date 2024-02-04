import {
  AspectRatio,
  Avatar,
  AvatarGroup,
  Box,
  CardOverflow,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/joy";
import Image from "next/image";
import { isNil, isNotNil } from "ramda";
import { MdEdit } from "react-icons/md";
import cellar1 from "@/images/cellar1.png";
import cellar2 from "@/images/cellar2.png";
import cellar3 from "@/images/cellar3.png";
import cellar4 from "@/images/cellar4.png";
import cellar5 from "@/images/cellar5.png";
import { InteractiveCard } from "../common/InteractiveCard";
import { Link } from "../common/Link";

const cellarImages = [cellar1, cellar2, cellar3, cellar4, cellar5];
type user = {
  id: string;
  displayName: string;
  avatarUrl: string;
};

type CellarCardProps = {
  cellar: {
    id: string;
    name: string;
    createdBy: user;
    coOwners: user[];
  };
  index: number;
  userId: string;
  onEditClick: (cellarId: string) => void;
  onClick?: (cellarId: string) => void;
};

export const CellarCard = ({
  userId,
  cellar,
  index,
  onClick,
  onEditClick,
}: CellarCardProps) => (
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
    <Stack direction="row" spacing={1} justifyContent="space-between">
      {isNil(onClick) && (
        <Link overlay href={`cellars/${cellar.id}/items`}>
          <Typography level="title-lg">{cellar.name}</Typography>
        </Link>
      )}
      {isNotNil(onClick) && (
        <Typography level="title-lg">{cellar.name}</Typography>
      )}
      <Stack direction="row" spacing={1}>
        {(userId === cellar.createdBy.id ||
          cellar.coOwners.map((x) => x.id).includes(userId)) && (
          <Tooltip title="Edit Cellar">
            <IconButton onClick={() => onEditClick(cellar.id)}>
              <MdEdit />
            </IconButton>
          </Tooltip>
        )}
        <AvatarGroup>
          <Tooltip title={cellar.createdBy.displayName}>
            <Avatar src={cellar.createdBy.avatarUrl} size="sm" />
          </Tooltip>
          {cellar.coOwners.map((x) => (
            <Tooltip key={x.id} title={x.displayName}>
              <Avatar src={x.avatarUrl} alt={x.displayName} size="sm" />
            </Tooltip>
          ))}
        </AvatarGroup>
      </Stack>
    </Stack>
  </InteractiveCard>
);
