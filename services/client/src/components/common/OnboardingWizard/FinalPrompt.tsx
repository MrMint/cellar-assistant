import { Button } from "@/components/ui/button";
import { StepCard } from "./StepCard";

export type FinalPromptProps = {
  onYes: () => void;
  onNo: () => void;
};
export const FinalPrompt = ({ onYes, onNo }: FinalPromptProps) => (
  <StepCard>
    <h2 className="type-headline">Would you like to add another item?</h2>
    <div className="flex justify-end gap-2">
      <Button
        onClick={onNo}
        variant="outline"
        className="min-w-0 flex-[0_1_120px]"
      >
        No
      </Button>
      <Button onClick={onYes} className="min-w-0 flex-[0_1_120px]">
        Yes
      </Button>
    </div>
  </StepCard>
);
