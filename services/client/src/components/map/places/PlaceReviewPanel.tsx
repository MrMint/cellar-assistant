"use client";

/**
 * X27 / D28 on the place page: the creator's view of a place under review.
 *
 * - **Pending** — "Under review", who can see it, and Edit / Delete. While
 *   the page is open it re-reads the place every few seconds (bounded), and
 *   says so when the verdict lands — "Approved — it's on the map for
 *   everyone", or "Not approved — see why below".
 * - **Rejected** — the reviewer's reason, then Edit (sends it for review
 *   again) as the primary action and Delete beside it.
 * - **Suggestions** (any status) — "Also tagged as …": the review's suggested
 *   categories as dashed AI chips the creator taps to confirm, and a
 *   suggested description they can use; one × dismisses what is left. Nothing
 *   here is ever applied without a tap (design §3.8: suggestions are dashed
 *   and never automatic).
 *
 * Only the creator ever receives an unshared place, or any suggestions, so
 * the panel renders nothing for anyone else without needing to know who is
 * looking.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "urql";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { IconButton } from "@/components/app/IconButton";
import {
  Add,
  AI,
  Close,
  Delete,
  Edit,
  ICON_STROKE,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import {
  AcceptPlaceSuggestionMutation,
  DeletePlaceMutation,
  DismissPlaceSuggestionsMutation,
} from "../queries";
import { PlaceReviewBadge } from "./PlaceReviewBadge";
import {
  isUnshared,
  REVIEW_POLL_INTERVAL_MS,
  type ReviewStatus,
  reviewExplanation,
  reviewVerdictNotice,
  shouldPollReview,
  visibleSuggestions,
} from "./place-review";
import { formatCategoryLabel } from "./userPlaceCategories";

export type PlaceReviewPanelProps = {
  placeId: string;
  placeName: string;
  status: ReviewStatus;
  rejectionReason: string | null;
  categories: readonly string[];
  description: string | null;
  suggestedCategories: readonly string[];
  suggestedDescription: string | null;
  /** Re-read the place (network-only). */
  refetch: () => void;
};

export function PlaceReviewPanel({
  placeId,
  placeName,
  status,
  rejectionReason,
  categories,
  description,
  suggestedCategories,
  suggestedDescription,
  refetch,
}: PlaceReviewPanelProps) {
  useReviewPolling(status, refetch);

  const unshared = isUnshared(status);
  const hasSuggestions =
    suggestedCategories.length > 0 ||
    (suggestedDescription !== null && (description ?? "").trim() === "");
  if (!unshared && !hasSuggestions) return null;

  return (
    <section
      aria-label="Review"
      data-testid="place-review-panel"
      className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4"
    >
      {unshared && (
        <ReviewState
          placeId={placeId}
          placeName={placeName}
          status={status}
          rejectionReason={rejectionReason}
        />
      )}
      {hasSuggestions && (
        <Suggestions
          placeId={placeId}
          categories={categories}
          description={description}
          suggestedCategories={suggestedCategories}
          suggestedDescription={suggestedDescription}
          refetch={refetch}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Waiting for the verdict                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Re-read a pending place on an interval until it is decided or the poll
 * limit passes, and announce the verdict when it lands while the page is
 * open. Pauses while the tab is hidden.
 */
function useReviewPolling(status: ReviewStatus, refetch: () => void) {
  const startedAt = useRef<number | null>(null);
  const previous = useRef<ReviewStatus | null>(null);

  useEffect(() => {
    const notice = reviewVerdictNotice(previous.current, status);
    previous.current = status;
    if (notice !== null) notify(notice.message, { tone: notice.tone });
  }, [status]);

  useEffect(() => {
    if (status !== "PENDING") {
      startedAt.current = null;
      return;
    }
    startedAt.current ??= Date.now();
    const started = startedAt.current;
    const timer = window.setInterval(() => {
      if (!shouldPollReview(status, started, Date.now())) {
        window.clearInterval(timer);
        return;
      }
      if (document.visibilityState === "visible") refetch();
    }, REVIEW_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [status, refetch]);
}

/* -------------------------------------------------------------------------- */
/* Pending / rejected                                                          */
/* -------------------------------------------------------------------------- */

function ReviewState({
  placeId,
  placeName,
  status,
  rejectionReason,
}: {
  placeId: string;
  placeName: string;
  status: "PENDING" | "REJECTED";
  rejectionReason: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleteState, deletePlace] = useMutation(DeletePlaceMutation);

  const onDelete = async () => {
    const response = await deletePlace({ placeId });
    const result = response.error
      ? { ok: false as const, error: failureFromTransport(response.error) }
      : unwrapResult(response.data?.deletePlace, "DeletedPlace");
    if (!result.ok) {
      notify("Couldn't delete this place", {
        tone: "error",
        description: result.error.message,
      });
      return;
    }
    setConfirming(false);
    notify(`Deleted ${placeName}`, { tone: "success" });
    router.replace("/map");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-start gap-2">
        <PlaceReviewBadge status={status} />
        <p
          className={cn(
            "type-callout",
            status === "REJECTED" ? "text-ink-1" : "text-ink-2",
          )}
          data-testid="place-review-explanation"
        >
          {reviewExplanation(status, rejectionReason)}
        </p>
      </div>
      <div className="flex flex-row gap-2">
        <Button
          asChild
          variant={status === "REJECTED" ? "default" : "secondary"}
          className="flex-1"
        >
          <Link href={`/places/${placeId}/edit`}>
            <Edit aria-hidden strokeWidth={ICON_STROKE} />
            {status === "REJECTED" ? "Edit & resubmit" : "Edit"}
          </Link>
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={() => setConfirming(true)}
        >
          <Delete aria-hidden strokeWidth={ICON_STROKE} />
          Delete
        </Button>
      </div>
      <ConfirmSheet
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${placeName}?`}
        description="Nobody else can see it yet, so nothing is lost but your own copy. This can't be undone."
        confirmLabel="Delete"
        onConfirm={() => void onDelete()}
        pending={deleteState.fetching}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Also tagged as …                                                            */
/* -------------------------------------------------------------------------- */

function Suggestions({
  placeId,
  categories,
  description,
  suggestedCategories,
  suggestedDescription,
  refetch,
}: {
  placeId: string;
  categories: readonly string[];
  description: string | null;
  suggestedCategories: readonly string[];
  suggestedDescription: string | null;
  refetch: () => void;
}) {
  // Optimistic: a tapped chip leaves the row at once, and comes back only if
  // the server refused it.
  const [taken, setTaken] = useState<ReadonlySet<string>>(new Set());
  const [descriptionTaken, setDescriptionTaken] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [, accept] = useMutation(AcceptPlaceSuggestionMutation);
  const [dismissState, dismiss] = useMutation(DismissPlaceSuggestionsMutation);

  const chips = visibleSuggestions(suggestedCategories, categories, taken);
  const offerDescription =
    !descriptionTaken &&
    suggestedDescription !== null &&
    (description ?? "").trim() === "";
  if (dismissed || (chips.length === 0 && !offerDescription)) return null;

  const onAccept = async (
    input: { category: string } | { description: true },
    label: string,
  ) => {
    if ("category" in input) {
      setTaken((current) => {
        const next = new Set(current);
        next.add(input.category);
        return next;
      });
    } else {
      setDescriptionTaken(true);
    }
    const response = await accept({ placeId, input });
    const result = response.error
      ? { ok: false as const, error: failureFromTransport(response.error) }
      : unwrapResult(response.data?.acceptPlaceSuggestion, "Place");
    if (!result.ok) {
      if ("category" in input) {
        setTaken((current) => {
          const next = new Set(current);
          next.delete(input.category);
          return next;
        });
      } else {
        setDescriptionTaken(false);
      }
      notify("Couldn't save that", {
        tone: "error",
        description: result.error.message,
      });
      return;
    }
    notify(label, { tone: "success" });
    refetch();
  };

  const onDismiss = async () => {
    setDismissed(true);
    const response = await dismiss({ placeId });
    const result = response.error
      ? { ok: false as const, error: failureFromTransport(response.error) }
      : unwrapResult(response.data?.dismissPlaceSuggestions, "Place");
    if (!result.ok) {
      setDismissed(false);
      notify("Couldn't dismiss the suggestions", { tone: "error" });
      return;
    }
    refetch();
  };

  return (
    <div className="flex flex-col gap-3" data-testid="place-suggestions">
      <div className="flex flex-row items-center justify-between gap-2">
        <h2 className="type-callout flex flex-row items-center gap-1.5 font-semibold text-ink-1">
          <AI
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="size-4 text-ai"
          />
          Also tagged as…
        </h2>
        <IconButton
          aria-label="Dismiss suggestions"
          variant="ghost"
          size="sm"
          disabled={dismissState.fetching}
          onClick={() => void onDismiss()}
        >
          <Close />
        </IconButton>
      </div>
      {chips.length > 0 && (
        <ul className="flex flex-row flex-wrap gap-2">
          {chips.map((category) => {
            const label = formatCategoryLabel(category);
            return (
              <li key={category}>
                <button
                  type="button"
                  aria-label={`Add category ${label}`}
                  onClick={() =>
                    void onAccept({ category }, `Tagged as ${label}`)
                  }
                  className="relative inline-flex h-9 items-center gap-1.5 rounded-full border border-ai/60 border-dashed px-3.5 font-medium text-ai text-sm outline-none transition-[background-color,transform] duration-(--ca-dur-micro) ease-standard after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] hover:bg-ai/10 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-97 motion-reduce:active:scale-100"
                >
                  <Add
                    aria-hidden
                    strokeWidth={ICON_STROKE}
                    className="size-4"
                  />
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {offerDescription && (
        <div className="flex flex-col gap-2 border-ai/60 border-l-2 pl-3">
          <p className="type-footnote text-ai">Suggested description</p>
          <p className="type-callout text-ink-1">{suggestedDescription}</p>
          <Button
            variant="secondary"
            className="self-start"
            onClick={() =>
              void onAccept({ description: true }, "Description added")
            }
          >
            Use this description
          </Button>
        </div>
      )}
    </div>
  );
}
