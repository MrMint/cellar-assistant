import {
  AspectRatio,
  Card,
  CardOverflow,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/joy";
import Image from "next/image";
import bot3 from "@/images/bot3.png";
import warehouse1 from "@/images/warehouse1.png";
import { getRandomInt } from "@/utilities";

const images = [bot3, warehouse1];

export const Searching = () => (
  <Card>
    <CardOverflow>
      <AspectRatio ratio="1">
        <Image
          src={images[getRandomInt(images.length)]}
          alt="An image of a warehouse"
          fill
          placeholder="blur"
        />
      </AspectRatio>
    </CardOverflow>
    <Stack spacing={2}>
      <Typography level="title-lg" textAlign="center">
        Adding your item...
      </Typography>
      <LinearProgress />
    </Stack>
  </Card>
);
