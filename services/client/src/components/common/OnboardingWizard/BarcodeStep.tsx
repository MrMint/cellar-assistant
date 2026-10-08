import { Button } from "@/components/ui/button";
import type { Barcode } from "@/constants";
import { BarcodeScanner } from "../BarcodeScanner";
import { StepCard, StepGrid, TipsCard } from "./StepCard";

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
  <StepGrid>
    <StepCard>
      <h2 className="type-headline text-center">
        Lets start by scanning the barcode
      </h2>
      <BarcodeScanner onChange={onBarcodeChange} />
      <div className="flex justify-end">
        <Button onClick={onSkip} disabled={barcode !== undefined}>
          Skip
        </Button>
      </div>
    </StepCard>
    <TipsCard>
      <li>
        Make sure the barcode is horizontal, with the numbers below the bars
      </li>
      <li>Adjust the distance so your camera is able to focus</li>
      <li>
        The reader is using the bars so make sure they are clear and well lit
      </li>
    </TipsCard>
  </StepGrid>
);
