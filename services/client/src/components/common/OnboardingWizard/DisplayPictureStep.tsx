"use client";

import { Button } from "@/components/ui/button";
import { CameraCapture } from "../CameraCapture";
import { StepCard, StepGrid, TipsCard } from "./StepCard";

export type DisplayPictureStepProps = {
  onBack: () => void;
  onSkip: () => void;
  onCapture: (result: string) => void;
};

export const DisplayPictureStep = ({
  onCapture,
  onBack,
  onSkip,
}: DisplayPictureStepProps) => (
  <StepGrid>
    <StepCard>
      <h2 className="type-title-2 text-center">
        Lets take a photo that will be used for display
      </h2>
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
      <li>This photo will be used for display when viewing the item</li>
    </TipsCard>
  </StepGrid>
);
