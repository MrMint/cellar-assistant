import type { ReactNode } from "react";
import { Check, Missing, Swap } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import {
  type MakeabilityLike,
  makeabilityDetail,
  makeabilityHeadline,
} from "@/components/bar/copy";
import { cn } from "@/lib/utils";

/**
 * The recipe page's hero photo (Recipes-Page 01, Recipes-Browse 13): the
 * photo, or the kit's recipe face, 300 high on raised and fading into the
 * page, as the kit's `PageHero` draws it. From `md` up it is a framed r8
 * square that sticks in its column (Recipes-Page desktop 01).
 */
export function RecipeHeroPhoto({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="recipe-hero"
      className="relative -mx-4 -mt-4 h-[300px] overflow-hidden bg-raised md:mx-0 md:mt-0 md:aspect-square md:h-auto md:rounded-lg [&_img]:object-cover"
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[88px] bg-linear-to-b from-transparent to-background md:hidden"
      />
    </div>
  );
}

/**
 * Under the hero: an optional line above the name (a group's "Negroni · 3
 * versions"), the name in t-title with Want to try and Love beside it, and
 * one t-cap line of meta.
 */
export function RecipeTitle({
  eyebrow,
  title,
  titleLevel: Title = "h1",
  actions,
  meta,
}: {
  eyebrow?: ReactNode;
  title: string;
  titleLevel?: "h1" | "h2";
  actions?: ReactNode;
  meta?: string;
}) {
  return (
    <div data-slot="recipe-title" className="flex flex-col gap-1.5">
      {eyebrow !== undefined && (
        <div className="t-cap text-ink-2">{eyebrow}</div>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Title className="t-title m-0 min-w-0 flex-1 break-words text-ink">
          {title}
        </Title>
        {actions !== undefined && (
          <div className="-mr-2 flex shrink-0 items-center gap-1">
            {actions}
          </div>
        )}
      </div>
      {meta !== undefined && meta !== "" && (
        <p className="t-cap m-0 text-ink-2">{meta}</p>
      )}
    </div>
  );
}

/**
 * A card row with a glyph disc, two lines and one quiet action at the right
 * (the makeability card, the group's pick card: Recipes-Page 01, -Browse 13).
 */
export function RecipeInfoCard({
  glyph,
  title,
  detail,
  action,
  className,
  ...data
}: {
  glyph: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  /** A quiet text link or button, act-ink, at least 44 × 44. */
  action?: ReactNode;
  className?: string;
} & { [key: `data-${string}`]: string | undefined }) {
  return (
    <div
      {...data}
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-lg border border-edge bg-card px-4 py-3",
        className,
      )}
    >
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-raised text-ink [&_svg]:size-4"
      >
        {glyph}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="t-head m-0 text-ink">{title}</p>
        {detail !== undefined && detail !== null && (
          <p className="t-cap m-0 truncate text-ink-2">{detail}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** The quiet act-ink text action inside a card: 44 × 44 at least. */
export const QUIET_ACTION =
  "relative -mr-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-2 t-head text-act-ink";

/**
 * The recipe's verdict above its ingredients (X14): "You can make this",
 * "One bottle away", "Missing 3" with what is missing, and Your bar.
 */
export function MakeabilityCard({
  makeability,
}: {
  makeability: MakeabilityLike;
}) {
  const status = makeability.status;
  const Glyph =
    status === "MAKE_NOW" ? Check : status === "ONE_AWAY" ? Swap : Missing;
  return (
    <RecipeInfoCard
      data-makeability={status.toLowerCase()}
      glyph={<Glyph strokeWidth={2} />}
      title={makeabilityHeadline(makeability)}
      detail={makeabilityDetail(makeability)}
      action={
        <Link href="/recipes/bar" underline="none" className={QUIET_ACTION}>
          Your bar
        </Link>
      }
    />
  );
}

/** "· 3 missing" on Make it, when the bar is short (lead's ruling 1). */
export const missingCount = (
  makeability: MakeabilityLike | null | undefined,
): number =>
  makeability === null ||
  makeability === undefined ||
  makeability.status === "MAKE_NOW"
    ? 0
    : makeability.missing.length;
