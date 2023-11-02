import {
  AspectRatio,
  Card,
  CardOverflow,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/joy";
import Image from "next/image";
import bot4 from "@/images/bot4.png";
import bot5 from "@/images/bot5.png";
import { getRandomInt } from "@/utilities";

const images = [bot4, bot5];

export const Analyzing = () => (
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
        Analyzing...
      </Typography>
      <LinearProgress />
    </Stack>
  </Card>
);
