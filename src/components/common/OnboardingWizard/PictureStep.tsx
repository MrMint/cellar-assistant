import { Box, Button, Card, CardContent, Grid, Typography } from "@mui/joy";
import { CameraCapture } from "../CameraCapture";
import { ReactNode } from "react";

export type PictureStepProps = {
  onCapture: (result: string) => void;
  picture: string | undefined;
  onSkip: () => void;
  onBack: () => void;
  header: ReactNode;
};

export const PictureStep = ({
  picture,
  onCapture,
  onSkip,
  onBack,
  header,
}: PictureStepProps) => (
  <Grid container spacing={2}>
    <Grid xs={12} sm={12} md={6}>
      <Card sx={{ padding: "1rem" }}>
        <Typography level="h4" textAlign="center">
          {header}
        </Typography>
        <CameraCapture onCapture={onCapture} />
        <CardContent
          orientation="horizontal"
          sx={{ justifyContent: "space-between" }}
        >
          <Button onClick={onBack} color="neutral">
            Back
          </Button>
          <Button onClick={onSkip} color="neutral">
            Skip
          </Button>
        </CardContent>
      </Card>
    </Grid>
    <Grid xs={12} sm={12} md={6}>
      <Card>
        <Typography level="title-lg" textAlign="center">
          Tips
        </Typography>
        <CardContent>
          <Typography level="body-md">
            <ul>
              <li>
                This picture will be used to generate the product information
              </li>
              <li>
                Focus on trying to get all of the text on the label visible
              </li>
            </ul>
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  </Grid>
);
