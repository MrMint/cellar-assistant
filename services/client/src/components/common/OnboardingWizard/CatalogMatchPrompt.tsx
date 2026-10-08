import { Button } from "@/components/ui/button";
import { type CatalogMatch, catalogMatchSummary } from "./catalog-match";
import { StepCard } from "./StepCard";

type CatalogMatchPromptProps = {
  match: CatalogMatch;
  /** In a cellar the tap files a bottle; elsewhere it opens the item. */
  inCellar: boolean;
  onUse: () => void;
  onDismiss: () => void;
};

/**
 * N19: "Is it this one? +1 bottle", above the form when the label names an
 * item the catalogue already holds at the same vintage. One tap files another
 * bottle of it; "No, it's new" goes back to the form, and the item is not
 * offered again in this wizard.
 */
export const CatalogMatchPrompt = ({
  match,
  inCellar,
  onUse,
  onDismiss,
}: CatalogMatchPromptProps) => {
  const summary = catalogMatchSummary(match);
  return (
    <StepCard className="max-w-[600px] gap-3 bg-surface-2">
      <h2 className="type-headline">Is it this one?</h2>
      <div className="flex flex-col gap-0.5">
        <p className="type-body font-semibold">{match.item.name}</p>
        {summary !== "" && <p className="type-callout text-ink-2">{summary}</p>}
      </div>
      <div className="flex flex-row flex-wrap gap-2">
        <Button onClick={onUse}>
          {inCellar ? "+1 bottle" : "Use this item"}
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          No, it&apos;s new
        </Button>
      </div>
    </StepCard>
  );
};
