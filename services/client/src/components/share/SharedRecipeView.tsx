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

const DIFFICULTY = ["", "Very Easy", "Easy", "Medium", "Hard", "Very Hard"];

/** "Cocktail · 5 min · Easy · Serves 2". */
export const recipeFacts = ({
  type,
  prepTimeMinutes,
  difficultyLevel,
  servingSize,
}: Pick<
  SharedRecipeViewProps,
  "type" | "prepTimeMinutes" | "difficultyLevel" | "servingSize"
>): string =>
  [
    type.charAt(0).toUpperCase() + type.slice(1),
    prepTimeMinutes !== null && prepTimeMinutes > 0
      ? `${prepTimeMinutes} min`
      : null,
    difficultyLevel !== null ? DIFFICULTY[difficultyLevel] || null : null,
    servingSize !== null && servingSize > 0 ? `Serves ${servingSize}` : null,
  ]
    .filter((part): part is string => part !== null && part !== "")
    .join(" · ");

/**
 * A recipe's public page (X17; Social-Lists, signed out): what to pour and
 * how, without the author, the votes or the reviews.
 */
export function SharedRecipeView(props: SharedRecipeViewProps) {
  const { name, description, ingredients, instructions } = props;
  const image = safeImageUrl(props.imageUrl);
  const Glyph = props.type === "food" ? Recipe : Cocktail;
  return (
    <>
      <div className="relative -mx-4 -mt-4 flex h-55 items-center justify-center overflow-hidden bg-raised md:mx-0 md:mt-0 md:rounded-lg">
        {image !== null ? (
          // biome-ignore lint/performance/noImgElement: a free-form URL; next/image would need its host allowlisted.
          <img
            src={image}
            alt={name}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span className="flex h-3/4 w-2/5 flex-col items-center justify-center gap-2 rounded-lg border border-edge bg-card p-3 text-center">
            <Glyph
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-8 text-glyph"
            />
            <span className="t-micro line-clamp-3 text-ink-2">{name}</span>
          </span>
        )}
      </div>

      <header className="flex flex-col gap-1 pt-1">
        <p className="t-cap tabular m-0 text-ink-3">{recipeFacts(props)}</p>
        <h1 className="t-title m-0 break-words text-ink">{name}</h1>
        {description !== null && description.trim() !== "" && (
          <p className="t-body m-0 pt-1 text-ink-2">{description}</p>
        )}
      </header>

      {ingredients.length > 0 && (
        <section className="flex flex-col gap-1" aria-labelledby="ingredients">
          <h2 id="ingredients" className="t-head m-0 pt-2 text-ink">
            Ingredients
          </h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {ingredients.map((row, index) => (
              <li
                // Ingredients carry no id on the public shape; order is stable.
                // biome-ignore lint/suspicious/noArrayIndexKey: see above.
                key={index}
                className="flex min-h-11 items-center justify-between gap-3 border-b border-rule py-2"
              >
                <span className="t-body text-ink">
                  {row.name ?? "An ingredient"}
                  {row.isOptional && (
                    <span className="t-cap text-ink-3"> · optional</span>
                  )}
                </span>
                <span className="t-body tabular shrink-0 text-ink-2">
                  {formatAmount(row.quantity, row.unit)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {instructions.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="method">
          <h2 id="method" className="t-head m-0 pt-2 text-ink">
            Method
          </h2>
          <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
            {instructions.map((step) => (
              <li key={step.stepNumber} className="flex items-start gap-3">
                <span className="t-cap tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-ink">
                  {step.stepNumber}
                </span>
                <p className="t-body m-0 pt-0.5 text-ink">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
