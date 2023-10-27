import { Button, Card, CardContent, Grid, Typography } from "@mui/joy";
import { Barcode } from "@/constants";
import { BarcodeScanner } from "../BarcodeScanner";

export type BarcodeStepProps = {
  onBarcodeChange: (result: Barcode) => void;
  barcode: Barcode | undefined;
  onSkip: () => void;
};

export const BarcodeStep = ({
  barcode,
  onBarcodeChange,
  onSkip,
}: BarcodeStepProps) => (
  <Grid container spacing={2}>
    <Grid xs={12} sm={12} md={6}>
      <Card sx={{ padding: "1rem" }}>
        <Typography level="title-lg" textAlign="center">
          Lets start by scanning the barcode
        </Typography>
        <BarcodeScanner onChange={onBarcodeChange} />
        <CardContent
          orientation="horizontal"
          sx={{ justifyContent: "flex-end" }}
        >
          <Button onClick={onSkip} disabled={barcode !== undefined}>
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
                Make sure the barcode is horizontal, with the numbers below the
                bars
              </li>
              <li>Adjust the distance so your camera is able to focus</li>
              <li>
                The reader is using the bars so make sure they are clear and
                well lit
              </li>
            </ul>
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  </Grid>
);
