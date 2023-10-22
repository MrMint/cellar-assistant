import { Box, Grid, Stack, Typography } from "@mui/joy";
import { OnboardingAssistant } from "../common/OnboardingAssistant";
import { Barcode, BarcodeType } from "@/constants";
import { useState } from "react";
import WineForm from "./WineForm";

type WineOnboardingProps = {
  cellarId: string;
  returnUrl: string;
};

export const WineOnboarding = ({
  cellarId,
  returnUrl,
}: WineOnboardingProps) => {
  const [isWizard, setIsWizard] = useState(true);
  const [defaults, setDefaults] = useState<{
    upc_12?: number;
    ean_13?: number;
  }>();

  const handleOnComplete = ({ barcode }: { barcode?: Barcode }) => {
    if (barcode !== undefined) {
      switch (barcode.type) {
        case BarcodeType.UPC_12:
          setDefaults({ upc_12: parseInt(barcode.text) });
          break;
        case BarcodeType.EAN_13:
          setDefaults({ ean_13: parseInt(barcode.text) });
          break;
        default:
          throw new Error(
            `Unsupported BarcodeType ${barcode.type} provided to handleOnComplete()`,
          );
      }
    }
    setIsWizard(false);
  };

  return (
    <Stack spacing={2}>
      <Typography level="h4">Add Wine</Typography>
      <Grid container spacing={2}>
        {isWizard && (
          <Grid xs={12}>
            <Box sx={(theme) => ({ maxWidth: theme.breakpoints.values.sm })}>
              <OnboardingAssistant onComplete={handleOnComplete} />
            </Box>
          </Grid>
        )}
        {!isWizard && (
          <Grid xs={12} justifyContent="center">
            <WineForm
              cellarId={cellarId}
              returnUrl={returnUrl}
              defaultValues={defaults}
            />
          </Grid>
        )}
      </Grid>
    </Stack>
  );
};