import { Box, Button, Card, CardContent, Stack, Typography } from "@mui/joy";
import BarcodeScanner, { BarcodeScanResult } from "./BarcodeScanner";
import { createMachine } from "xstate";
import { useMachine } from "@xstate/react";
import { useEffect, useState } from "react";
import { Barcode, BarcodeType } from "@/constants";

const toggleMachine = createMachine({
  id: "onboarding-wizard",
  initial: "barcode",
  states: {
    barcode: {
      on: { FOUND: "confirm", SKIP: "confirm" },
    },
    front: {
      on: { NEXT: "back" },
    },
    back: {
      on: { NEXT: "confirm" },
    },
    confirm: {
      on: { CONFIRM: "done", BACK: "barcode" },
    },
    done: {
      type: "final",
    },
  },
});

type OnboardingAssistantProps = {
  onComplete: (result: { barcode?: Barcode }) => void;
};

export const OnboardingAssistant = ({
  onComplete,
}: OnboardingAssistantProps) => {
  const [state, send] = useMachine(toggleMachine);
  const [barcode, setBarcode] = useState<Barcode>();
  const handleBarcodeChange = (result: BarcodeScanResult) => {
    if (result.success) {
      setBarcode(result.barcode);
      send({ type: "FOUND" });
    }
  };

  useEffect(() => {
    if (state.value === "done") {
      onComplete({
        barcode,
      });
    }
  }, [state, barcode, onComplete]);
  return (
    <Box>
      {state.value === "barcode" && (
        <Card sx={{ padding: "1rem" }}>
          <Typography level="h4" textAlign="center">
            Lets start by scanning the barcode
          </Typography>
          <BarcodeScanner onChange={handleBarcodeChange} />
          <CardContent
            orientation="horizontal"
            sx={{ justifyContent: "flex-end" }}
          >
            <Button
              onClick={() => send({ type: "SKIP" })}
              disabled={barcode !== undefined}
            >
              Skip
            </Button>
          </CardContent>
        </Card>
      )}
      {state.value === "confirm" && (
        <Card>
          <Typography level="h4" textAlign="center">
            Does this look good?
          </Typography>
          <CardContent>
            <Stack>
              <Typography>Barcode: {barcode?.text}</Typography>
            </Stack>
          </CardContent>
          <CardContent
            orientation="horizontal"
            sx={{ justifyContent: "space-between" }}
          >
            <Button onClick={() => send({ type: "BACK" })} color="neutral">
              Back
            </Button>
            <Button onClick={() => send({ type: "CONFIRM" })}>Confirm</Button>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};
