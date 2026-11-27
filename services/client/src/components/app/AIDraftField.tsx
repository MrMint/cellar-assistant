import type { ReactNode } from "react";
import { feedback } from "@/lib/feedback";
import type { DraftSource } from "@/lib/forms/ai-draft";
import { cn } from "@/lib/utils";
import { AI, Barcode, Close, ICON_STROKE } from "./icons";

export type DraftConfidence = "sure" | "likely" | "check";

/** Confidence in words (design §3.8), never a percentage. */
export const CONFIDENCE_LABEL: Readonly<Record<DraftConfidence, string>> = {
  sure: "Sure",
  likely: "Likely",
  check: "Check this",
};

export type AIDraftFieldProps = {
  /** Where the value came from (`design-direction.md` §3.8). */
  source: DraftSource;
  /**
   * Whether the field still holds the drafted value — decide it with
   * `draftedPaths` / `isDrafted` (`lib/forms/ai-draft.ts`), never by hand.
   */
  drafted: boolean;
  /** X05: how sure the read was. Omitted until the schema carries it. */
  confidence?: DraftConfidence;
  /** Layout only (e.g. a grid placement the wrapped field used to carry). */
  className?: string;
  /**
   * X19: a value the AI proposes that the field does **not** hold — shown as
   * a chip under the field in this source's mark, applied only by a tap
   * (`onUse`), and dismissable. The proposal never writes on its own.
   */
  proposal?: {
    /** What the chip says ("Zinfandel", "2016", "NV"). */
    display: string;
    /** The field's label, for the chip's accessible name. */
    label: string;
    onUse: () => void;
    onDismiss: () => void;
  };
  children: ReactNode;
};

/**
 * The kit's words for where a value came from (KIT § 3 "From the label"):
 * a sentence, not a badge. `DRAFT_SOURCE_LABEL` (`lib/forms/ai-draft`) stays
 * the short form used elsewhere.
 */
export const DRAFT_LINE: Readonly<Record<DraftSource, string>> = {
  label: "From the label",
  suggested: "Suggested",
  pin: "From the pin",
  barcode: "From the barcode",
};

/**
 * A field a machine filled in (N19), in the kit's form (KIT § 3): the
 * sparkle and "From the label" in t-micro ink-2 on the field's label row,
 * with " · Check this" when the read was unsure. No colour of its own: the
 * words carry it. "Suggested" is the same line in a dashed outline. A
 * proposal (X19) is a dashed chip under the field, applied only by a tap.
 *
 * The wrapper renders whether or not the field is drafted, so the input inside
 * keeps its identity — and its focus — at the keystroke that removes the line.
 */
export function AIDraftField({
  source,
  drafted,
  confidence,
  className,
  proposal,
  children,
}: AIDraftFieldProps) {
  return (
    <div
      data-slot="ai-draft-field"
      data-ai-draft={drafted ? source : undefined}
      data-confidence={drafted ? confidence : undefined}
      className={cn("relative min-w-0", className)}
    >
      {children}
      {drafted && (
        <span
          data-slot="ai-draft-mark"
          className={cn(
            "t-micro pointer-events-none absolute top-0 right-0 inline-flex h-5 items-center gap-1.5 text-ink-2",
            source === "suggested" &&
              "rounded-sm border border-edge-2 border-dashed px-1.5",
          )}
        >
          {source === "barcode" ? (
            <Barcode
              aria-hidden
              className="size-3.5"
              strokeWidth={ICON_STROKE}
            />
          ) : (
            <AI aria-hidden className="size-3.5" strokeWidth={ICON_STROKE} />
          )}
          {DRAFT_LINE[source]}
          {confidence !== undefined && ` · ${CONFIDENCE_LABEL[confidence]}`}
        </span>
      )}
      {proposal !== undefined && (
        <div
          data-slot="ai-proposal"
          className="mt-2 flex items-center gap-1 animate-in fade-in-0 duration-(--ca-dur-short)"
        >
          <button
            type="button"
            onClick={() => {
              feedback("press");
              proposal.onUse();
            }}
            aria-label={`Use ${DRAFT_LINE[source].toLowerCase()} ${proposal.label}: ${proposal.display}`}
            className="t-cap relative inline-flex h-11 min-w-0 items-center gap-1.5 rounded-md border border-edge-2 border-dashed bg-card px-3 text-ink-2 outline-none transition-transform duration-(--ca-dur-micro) focus-visible:outline-2 focus-visible:outline-act-ink active:scale-97 motion-reduce:active:scale-100"
          >
            <AI
              aria-hidden
              className="size-4 shrink-0"
              strokeWidth={ICON_STROKE}
            />
            <span className="shrink-0">{DRAFT_LINE[source]}:</span>
            <span className="t-head min-w-0 truncate text-ink">
              {proposal.display}
            </span>
            <span className="t-head shrink-0 text-act-ink">Use</span>
          </button>
          <button
            type="button"
            onClick={proposal.onDismiss}
            aria-label={`Dismiss the ${proposal.label} suggestion`}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-3 outline-none active:bg-raised focus-visible:outline-2 focus-visible:outline-act-ink"
          >
            <Close aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
          </button>
        </div>
      )}
    </div>
  );
}
