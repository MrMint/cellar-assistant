import { Badge } from "@/components/ui/badge";
import type { Characteristic } from "./adapter";
import { ItemSection } from "./ItemSection";

/**
 * The cards `82450ad1:src/components/{sake,tea}/{T}Details.tsx` rendered
 * inline under `ItemDetails`: "<Type> Characteristics" chips, and for tea the
 * "Flavor Profile" and "Ingredients" cards. Same cards, copy and order.
 */
export function ItemCharacteristics({
  title,
  characteristics,
  flavorProfile,
  ingredients,
}: {
  title: string | null;
  characteristics: Characteristic[];
  flavorProfile: string | null;
  ingredients: string | null;
}) {
  return (
    <>
      {title !== null && characteristics.length > 0 && (
        <ItemSection title={title}>
          <ul className="flex flex-wrap gap-2">
            {characteristics.map((char) => (
              <li key={char.label}>
                <Badge variant="outline" className="type-callout px-2.5 py-1">
                  {char.label}: {char.value}
                </Badge>
              </li>
            ))}
          </ul>
        </ItemSection>
      )}
      {flavorProfile !== null && (
        <ItemSection title="Flavor Profile">
          <p className="type-body text-ink-2">{flavorProfile}</p>
        </ItemSection>
      )}
      {ingredients !== null && (
        <ItemSection title="Ingredients">
          <p className="type-body text-ink-2">{ingredients}</p>
        </ItemSection>
      )}
    </>
  );
}
