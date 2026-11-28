"use client";

import { useQuery } from "urql";
import { ChevronRight, ICON_STROKE } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { PRESS_CLASS, pressFeedback } from "@/components/app/overlays/press";
import { Skeleton } from "@/components/ui/skeleton";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { agreementCard } from "./compare/compare-lines";
import { TasteAgreementFieldsFragment, TasteAgreementQuery } from "./queries";
import { agreementCounts } from "./taste-lines";

/** The card's bar: one segment per shared drink (20 at most), agreed filled. */
function AgreementBar({
  segments,
  filled,
}: {
  segments: number;
  filled: number;
}) {
  if (segments === 0) return null;
  return (
    <span aria-hidden className="flex gap-1" data-slot="agreement-bar">
      {Array.from({ length: segments }, (_, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed positions
          key={index}
          className={cn(
            "h-2 flex-1 rounded-full",
            index < filled ? "bg-ink-2" : "bg-raised",
          )}
        />
      ))}
    </span>
  );
}

/**
 * The profile's agreement card (Social-Friends 03): "You agree on 12 of 13"
 * over a bar, "shared drinks, within half a star". It opens the compare
 * screen; from `md` up that screen is also the profile's right column.
 *
 * The section — and its `#compare` anchor, which /taste-profile's "Compare"
 * links to — is on the page from first paint, so the browser can scroll to
 * it; only the card's words wait for the agreement query (a placeholder until
 * then). If the server refuses the agreement, the section goes: a profile
 * you may not see answers like a missing one.
 */
export function TasteCompareSection({ userId }: { userId: string }) {
  const [{ data }] = useQuery({
    query: TasteAgreementQuery,
    variables: { userId },
  });

  const result =
    data === undefined
      ? undefined
      : unwrapResult(data.tasteAgreement, "TasteAgreement");
  if (result !== undefined && !result.ok) return null;
  const card =
    result === undefined
      ? undefined
      : agreementCard(
          agreementCounts(
            readFragment(TasteAgreementFieldsFragment, result.data),
          ),
        );

  return (
    <section
      id="compare"
      aria-label="Compare taste"
      data-slot="taste-compare"
      className="scroll-mt-4"
      aria-busy={card === undefined || undefined}
    >
      <Link
        href={`/users/${userId}/compare`}
        underline="none"
        {...pressFeedback()}
        className={cn(
          "relative flex min-h-24 items-center gap-3 rounded-lg border border-edge bg-surface-1 p-4 text-ink hover:bg-raised",
          PRESS_CLASS,
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          {card === undefined ? (
            <>
              <Skeleton
                data-slot="taste-compare-pending"
                className="h-6 w-[60%]"
              />
              <Skeleton className="h-2 w-full" />
            </>
          ) : (
            <>
              <span className="t-head">{card.title}</span>
              <AgreementBar segments={card.segments} filled={card.filled} />
              <span className="t-cap text-ink-2">{card.line}</span>
            </>
          )}
        </span>
        <ChevronRight
          aria-hidden
          strokeWidth={ICON_STROKE}
          className="size-5 shrink-0 text-ink-3"
        />
      </Link>
    </section>
  );
}
