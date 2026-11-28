import { InsetSection } from "@/components/app/Page";
import type { Fact } from "./item-page-model";

/**
 * X09's fact sheet: what the item is, as labelled rows, for all six types
 * (`itemFacts`) — then the description and, for tea, the two free-text
 * notes the old page gave cards of their own. Nothing unrecorded becomes a
 * row; with nothing recorded at all the section is not drawn.
 */
export function ItemFacts({
  facts,
  description,
  flavorProfile,
  ingredients,
}: {
  facts: readonly Fact[];
  description: string | null;
  flavorProfile: string | null;
  ingredients: string | null;
}) {
  const notes = [
    { label: "Flavor Profile", text: flavorProfile },
    { label: "Ingredients", text: ingredients },
  ].filter((note): note is { label: string; text: string } => !!note.text);
  if (facts.length === 0 && !description && notes.length === 0) return null;

  return (
    <InsetSection id="details" label="Details" data-testid="item-facts">
      {facts.length > 0 && (
        <dl className="flex flex-col divide-y divide-line">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="flex min-h-11 items-baseline justify-between gap-4 px-4 py-2.5"
            >
              <dt className="t-cap shrink-0 text-ink-2">{fact.label}</dt>
              <dd className="t-cap min-w-0 text-right text-ink-1 tabular">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {notes.map((note) => (
        <div key={note.label} className="flex flex-col gap-1 px-4 py-3">
          <h3 className="t-cap text-ink-2">{note.label}</h3>
          <p className="t-body text-ink-1">{note.text}</p>
        </div>
      ))}
      {description && (
        <p className="t-body px-4 py-3 text-ink-2">{description}</p>
      )}
    </InsetSection>
  );
}
