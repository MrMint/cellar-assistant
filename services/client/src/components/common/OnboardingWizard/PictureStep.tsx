import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CameraCapture } from "../CameraCapture";
import { StepCard, StepGrid, TipsCard } from "./StepCard";

export type PictureStepProps = {
  onCapture: (result: string) => void;
  picture: string | undefined;
  onSkip: () => void;
  onBack: () => void;
  header: ReactNode;
};

export const PictureStep = ({
  picture: _picture,
  onCapture,
  onSkip,
  onBack,
  header,
}: PictureStepProps) => (
  <StepGrid>
    <StepCard>
      <h2 className="type-title-2 text-center">{header}</h2>
      <CameraCapture onCapture={onCapture} />
      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button variant="secondary" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </StepCard>
    <TipsCard>
      <li>This picture will be used to generate the product information</li>
      <li>Focus on trying to get all of the text on the label visible</li>
    </TipsCard>
  </StepGrid>
);
