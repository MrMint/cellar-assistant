"use client";

import { useState } from "react";
import { useMutation } from "urql";
import { AI } from "@/components/app/icons";
import { AiStatus } from "@/components/common/AiStatus";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isOffered, useAiCapabilities } from "@/lib/ai/capabilities";
import { type AiOutcome, aiOutcome } from "@/lib/ai/outcome";
import {
  RereadItemLabelMutation,
  SuggestItemDetailsMutation,
} from "@/lib/api/item-correction";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import { defaultsObject } from "@/lib/items/correction";
import type { ApiItemType } from "../cellar-api/itemTypes";

/** Which helper ran — the panel's words and the proposals' source follow it. */
export type CorrectionKind = "label" | "suggested";

/** What the item's edit page may offer (`Item.correction`). */
export type CorrectionTools = {
  canRereadLabel: boolean;
  canSuggestDetails: boolean;
};

/** One answer, handed to the form to turn into chips. */
export type CorrectionAnswer = {
  kind: CorrectionKind;
  defaults: Record<string, unknown>;
  /** A label reading's brand, kept apart from `defaults` by the API. */
  brandName?: string | null;
};

export type SuggestInput = {
  name: string;
  brandName: string | null;
  country: string | null;
  attributes: Record<string, unknown>;
};

type Status =
  | { state: "idle" }
  | { state: "working"; kind: CorrectionKind }
  | { state: "done"; message: string }
  | { state: "failed"; outcome: AiOutcome; kind: CorrectionKind };

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** The line the panel says once the chips are in place (pure, tested). */
export const correctionSummary = ({
  kind,
  offered,
  unusable,
  abstained,
}: {
  kind: CorrectionKind;
  offered: number;
  unusable: number;
  abstained?: boolean;
}): string => {
  if (kind === "suggested" && abstained === true) {
    return "Not sure what this is, so nothing is suggested — a guess would be worse than a blank.";
  }
  const extra =
    unusable === 0
      ? ""
      : ` ${plural(unusable, "value", "values")} couldn't be used here.`;
  if (offered === 0) {
    return kind === "label"
      ? `The label agrees with what's here.${extra}`
      : `Nothing to suggest for the empty details.${extra}`;
  }
  return kind === "label"
    ? `The label says something different for ${plural(offered, "field", "fields")} — tap one below to use it.${extra}`
    : `${plural(offered, "suggestion", "suggestions")} below — check each before you use it.${extra}`;
};

/**
 * A helper's failure, in words that fit the edit page. `aiOutcome`'s
 * "nothing read" and "rejected" lines are about a photo just taken or a
 * search just typed ("Try a closer, sharper shot", "Try different words") —
 * neither is something the person can do here. The suggestion pass refuses a
 * name too short to go on (`NOTHING_READ`); the re-read refuses stored
 * photographs that hold no legible label. Everything else (limits, budget, no
 * provider, a dropped connection) keeps `aiOutcome`'s wording.
 */
export const correctionOutcome = (
  kind: CorrectionKind,
  error: ApiFailure,
): AiOutcome => {
  const outcome = aiOutcome(error, {
    fallback:
      kind === "label"
        ? "correct the details by hand"
        : "fill in the details yourself",
  });
  if (outcome.kind !== "nothing-read" && outcome.kind !== "rejected") {
    return outcome;
  }
  return {
    ...outcome,
    title: kind === "label" ? "Nothing to read" : "Nothing to go on",
    message:
      kind === "label"
        ? "The label photos this was added from couldn't be read again. You can correct the details by hand."
        : "Give it the product's full name first, then ask again.",
  };
};

/**
 * X19 — the edit form's two AI helpers: **Re-read label** (the vision read of
 * the photographs the item was added from) and **Suggest details** (a text
 * pass for the empty details, which may decline). Both only *propose*: the
 * answer comes back to the form as chips under the fields, through
 * `AIDraftField`, and nothing is applied until the creator taps one and saves.
 *
 * Each button shows only where it can work: the item kept a label photograph
 * (`canRereadLabel`) / came through an onboarding (`canSuggestDetails`), and
 * the deployment's AI can do it (`viewer.aiCapabilities`).
 */
export function ItemCorrectionPanel({
  type,
  itemId,
  tools,
  emptySuggestible,
  suggestInput,
  onAnswer,
}: {
  type: ApiItemType;
  itemId: string;
  tools: CorrectionTools;
  /** How many suggestible details are empty — no empty one, no button. */
  emptySuggestible: number;
  /** The form as it stands, in the API's terms, when Suggest is tapped. */
  suggestInput: () => SuggestInput;
  /** Returns the summary line for what it turned into chips. */
  onAnswer: (answer: CorrectionAnswer & { abstained?: boolean }) => string;
}) {
  const [, rereadItemLabel] = useMutation(RereadItemLabelMutation);
  const [, suggestItemDetails] = useMutation(SuggestItemDetailsMutation);
  const capabilities = useAiCapabilities();
  const [status, setStatus] = useState<Status>({ state: "idle" });

  const canReread =
    tools.canRereadLabel && isOffered(capabilities, "labelRead");
  const canSuggest =
    tools.canSuggestDetails &&
    isOffered(capabilities, "detailSuggestions") &&
    emptySuggestible > 0;
  if (!canReread && !canSuggest) return null;

  const working = status.state === "working";

  const reread = async () => {
    setStatus({ state: "working", kind: "label" });
    const result = unwrapResult(
      (await rereadItemLabel({ type, itemId })).data?.rereadItemLabel,
      "ItemLabelReading",
    );
    if (!result.ok) {
      setStatus({
        state: "failed",
        kind: "label",
        outcome: correctionOutcome("label", result.error),
      });
      return;
    }
    setStatus({
      state: "done",
      message: onAnswer({
        kind: "label",
        defaults: defaultsObject(result.data.defaults),
        brandName: result.data.brandName,
      }),
    });
  };

  const suggest = async () => {
    setStatus({ state: "working", kind: "suggested" });
    const result = unwrapResult(
      (await suggestItemDetails({ type, itemId, input: suggestInput() })).data
        ?.suggestItemDetails,
      "ItemDetailSuggestions",
    );
    if (!result.ok) {
      setStatus({
        state: "failed",
        kind: "suggested",
        outcome: correctionOutcome("suggested", result.error),
      });
      return;
    }
    setStatus({
      state: "done",
      message: onAnswer({
        kind: "suggested",
        defaults: defaultsObject(result.data.defaults),
        abstained: result.data.abstained,
      }),
    });
  };

  return (
    <section aria-label="Correct this item" className="flex flex-col gap-2">
      {/* Cellars-Pour 31: the two helpers side by side above the form, at
          the page's full width (~358 px at 390). Nothing changes until a
          suggestion is tapped and saved. */}
      <div
        className={canReread && canSuggest ? "grid grid-cols-2 gap-3" : "grid"}
      >
        {canReread && (
          <Button
            type="button"
            variant="outline"
            className="min-w-0"
            disabled={working}
            onClick={() => void reread()}
          >
            <AI aria-hidden />
            <span className="truncate">Re-read label</span>
          </Button>
        )}
        {canSuggest && (
          <Button
            type="button"
            variant="outline"
            className="min-w-0"
            disabled={working}
            onClick={() => void suggest()}
          >
            <AI aria-hidden />
            <span className="truncate">Suggest details</span>
          </Button>
        )}
      </div>
      <div aria-live="polite" className="empty:hidden">
        {status.state === "working" && (
          <p className="t-cap flex items-center gap-2 text-ai">
            <Spinner aria-hidden />
            {status.kind === "label"
              ? "Reading the label again…"
              : "Looking this up…"}
          </p>
        )}
        {status.state === "done" && (
          <p className="t-cap text-ink-2">{status.message}</p>
        )}
        {status.state === "failed" && (
          <AiStatus
            outcome={status.outcome}
            onRetry={() =>
              void (status.kind === "label" ? reread() : suggest())
            }
          />
        )}
      </div>
    </section>
  );
}
