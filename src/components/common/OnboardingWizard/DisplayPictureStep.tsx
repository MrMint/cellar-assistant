import { Button, Card, CardContent, Grid, Typography } from "@mui/joy";
import { useState } from "react";
import { CameraCapture } from "../CameraCapture";

export type DisplayPictureStepProps = {
  onBack: () => void;
  onSkip: () => void;
  onCapture: (result: string) => void;
};

export const DisplayPictureStep = ({
  onCapture,
  onBack,
  onSkip,
}: DisplayPictureStepProps) => {
  const [image, setImage] = useState<string>();

  return (
    <Grid container spacing={2}>
      <Grid xs={12} sm={12} md={6}>
        <Card sx={{ padding: "1rem" }}>
          <Typography level="h4" textAlign="center">
            Lets take a photo that will be used for display
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
                  This photo will be used for display when viewing the item
                </li>
              </ul>
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};
