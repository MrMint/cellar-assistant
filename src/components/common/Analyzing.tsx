import {
  AspectRatio,
  Card,
  CardOverflow,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/joy";
import Image from "next/image";
import warehouse from "@/images/warehouse1.png";

export const Analyzing = () => (
  <Card>
    <CardOverflow>
      <AspectRatio ratio="1">
        <Image
          src={warehouse}
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
