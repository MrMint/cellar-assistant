import { Box, Grid, Stack, Typography } from "@mui/joy";
import { BeerForm } from "./BeerForm";
import { OnboardingAssistant } from "../common/OnboardingAssistant";
import { Barcode, BarcodeType } from "@/constants";
import { useState } from "react";

type BeerOnboardingProps = {
  cellarId: string;
  returnUrl: string;
};

export const BeerOnboarding = ({
  cellarId,
  returnUrl,
}: BeerOnboardingProps) => {
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
      <Typography level="h4">Add Beer</Typography>
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
            <BeerForm
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
