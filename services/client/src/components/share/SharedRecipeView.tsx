import { Cocktail, ICON_STROKE, Recipe } from "@/components/app/icons";

export type SharedRecipeViewProps = {
  name: string;
  description: string | null;
  type: string;
  difficultyLevel: number | null;
  prepTimeMinutes: number | null;
  servingSize: number | null;
  imageUrl: string | null;
  ingredients: readonly {
    name: string | null;
    quantity: number | null;
    unit: string | null;
    isOptional: boolean;
  }[];
  instructions: readonly { stepNumber: number; text: string }[];
};

const FRACTIONS: Readonly<Record<string, string>> = {
  "0.25": "¼",
  "0.5": "½",
  "0.75": "¾",
  "0.33": "⅓",
  "0.67": "⅔",
};

/** "1½ oz", "30 ml", "2" — a quantity with its unit, fractions as glyphs. */
export const formatAmount = (
  quantity: number | null,
  unit: string | null,
): string => {
  const unitText = unit?.trim() ?? "";
  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0) {
    return unitText;
  }
  const whole = Math.floor(quantity);
  const fraction = FRACTIONS[(quantity - whole).toFixed(2).replace(/0$/, "")];
  const number =
    fraction === undefined
      ? String(Math.round(quantity * 100) / 100)
      : `${whole > 0 ? whole : ""}${fraction}`;
  return unitText === "" ? number : `${number} ${unitText}`;
};

/** Only a web URL is shown: `imageUrl` is free text on a recipe. */
export const safeImageUrl = (url: string | null): string | null => {
  if (url === null) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

/** "Cocktail · 5 min · Serves 2". */
export const recipeFacts = ({
  type,
  prepTimeMinutes,
  servingSize,
}: Pick<
  SharedRecipeViewProps,
  "type" | "prepTimeMinutes" | "servingSize"
>): string =>
  [
    type.charAt(0).toUpperCase() + type.slice(1),
    prepTimeMinutes !== null && prepTimeMinutes > 0
      ? `${prepTimeMinutes} min`
      : null,
    servingSize !== null && servingSize > 0 ? `Serves ${servingSize}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

/**
 * A recipe's public page (X17): what to pour and how, without the author,
 * the votes or the reviews.
 */
export function SharedRecipeView(props: SharedRecipeViewProps) {
  const { name, description, ingredients, instructions } = props;
  const image = safeImageUrl(props.imageUrl);
  const Glyph = props.type === "food" ? Recipe : Cocktail;
  return (
    <>
      <div className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-lg bg-surface-1">
        {image !== null ? (
          // biome-ignore lint/performance/noImgElement: a free-form URL; next/image would need its host allowlisted.
          <img
            src={image}
            alt={name}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <Glyph
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="size-16 text-ink-3"
          />
        )}
      </div>

      <header className="flex flex-col gap-1">
        <p className="type-overline text-ink-3">{recipeFacts(props)}</p>
        <h1 className="type-large-title break-words font-display text-ink-1">
          {name}
        </h1>
        {description !== null && description.trim() !== "" && (
          <p className="type-body pt-1 text-ink-2">{description}</p>
        )}
      </header>

      {ingredients.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="ingredients">
          <h2 id="ingredients" className="type-overline px-4 text-ink-3">
            Ingredients
          </h2>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface-1">
            {ingredients.map((row, index) => (
              <li
                // Ingredients carry no id on the public shape; order is stable.
                // biome-ignore lint/suspicious/noArrayIndexKey: see above.
                key={index}
                className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5"
              >
                <span className="type-body text-ink-1">
                  {row.name ?? "An ingredient"}
                  {row.isOptional && (
                    <span className="type-footnote"> · optional</span>
                  )}
                </span>
                <span className="type-callout tabular shrink-0 text-ink-2">
                  {formatAmount(row.quantity, row.unit)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {instructions.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="method">
          <h2 id="method" className="type-overline px-4 text-ink-3">
            Method
          </h2>
          <ol className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
            {instructions.map((step) => (
              <li key={step.stepNumber} className="flex gap-3">
                <span className="type-headline tabular w-6 shrink-0 font-display text-ink-3">
                  {step.stepNumber}
                </span>
                <p className="type-body text-ink-1">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
