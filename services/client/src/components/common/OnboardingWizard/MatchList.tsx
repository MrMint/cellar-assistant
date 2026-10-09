import Image from "next/image";
import { InsetSection, ListRow } from "@/components/app/Page";
import { TypeGlyph } from "@/components/app/TypeChip";
import { Button } from "@/components/ui/button";
import type { ExistingItem } from "./adapter";

/**
 * Catalogue items the capture already points at — a barcode's (X05, before
 * the shutter) or the front photo's (G32/D12, beside the read) — as rows with
 * one action each. Tapping files another bottle of *that* item (or opens it
 * outside a cellar); nothing here creates an item (D25).
 */
export function MatchList({
  label,
  matches,
  inCellar,
  onChoose,
}: {
  label?: string;
  matches: readonly ExistingItem[];
  inCellar: boolean;
  onChoose: (match: ExistingItem) => void;
}) {
  return (
    <InsetSection label={label}>
      {matches.map((match) => (
        <ListRow
          key={match.item.id}
          leading={
            match.item.displayImageUrl === undefined ? (
              <span className="flex size-10 items-center justify-center rounded-md bg-surface-2">
                <TypeGlyph type={match.type} className="size-5" />
              </span>
            ) : (
              <Image
                src={match.item.displayImageUrl}
                alt=""
                width={80}
                height={80}
                className="size-10 rounded-md object-cover"
              />
            )
          }
          title={match.item.name}
          description={
            [match.item.vintage, match.item.subtitle]
              .filter((part) => part !== undefined && part !== "")
              .join(" · ") || undefined
          }
          trailing={
            <Button
              size="sm"
              variant="secondary"
              aria-label={`${inCellar ? "+1 bottle of" : "Use"} ${match.item.name}`}
              onClick={() => onChoose(match)}
            >
              {inCellar ? "+1 bottle" : "Use this"}
            </Button>
          }
        />
      ))}
    </InsetSection>
  );
}
