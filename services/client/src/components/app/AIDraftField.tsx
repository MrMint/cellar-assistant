import type { ReactNode } from "react";
import { DRAFT_SOURCE_LABEL, type DraftSource } from "@/lib/forms/ai-draft";
import { cn } from "@/lib/utils";
import { AI, Barcode, Close } from "./icons";

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

const MARK: Record<DraftSource, string> = {
  label: "bg-ai text-background",
  suggested: "border border-ai border-dashed text-ai",
  pin: "bg-ai/15 text-ai",
  barcode: "bg-ai/15 text-ai",
};

/**
 * A field a machine filled in (N19), restyled for B02: a 2 pt teal rule down
 * its left edge and the source's mark on its label row — a solid "From
 * label", a dashed "Suggested", "From pin", a barcode glyph. **Teal enters the
 * UI only through this component** (and AI progress states): it means "the AI
 * did this", never "tap here".
 *
 * The wrapper renders whether or not the field is drafted, so the input inside
 * keeps its identity — and its focus — at the keystroke that removes the mark.
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
      className={cn(
        "relative min-w-0 border-l-2 pl-3 transition-colors duration-(--ca-dur-short)",
        drafted ? "border-ai" : "border-transparent",
        className,
      )}
    >
      {children}
      {drafted && (
        <span
          data-slot="ai-draft-mark"
          className={cn(
            "pointer-events-none absolute top-0 right-0 inline-flex h-5 items-center gap-1 rounded-full px-2 font-medium text-[11px]",
            MARK[source],
          )}
        >
          {source === "barcode" && <Barcode aria-hidden className="size-3" />}
          {DRAFT_SOURCE_LABEL[source]}
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
            onClick={proposal.onUse}
            aria-label={`Use ${DRAFT_SOURCE_LABEL[source].toLowerCase()} ${proposal.label}: ${proposal.display}`}
            className={cn(
              "relative inline-flex h-9 min-w-0 items-center gap-1.5 rounded-full px-3 text-sm outline-none transition-transform duration-(--ca-dur-micro) after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-97 motion-reduce:active:scale-100",
              PROPOSAL[source],
            )}
          >
            <AI aria-hidden className="size-4 shrink-0" />
            <span className="shrink-0 font-medium">
              {DRAFT_SOURCE_LABEL[source]}:
            </span>
            <span className="min-w-0 truncate text-ink-1">
              {proposal.display}
            </span>
            <span className="shrink-0 font-semibold">Use</span>
          </button>
          <button
            type="button"
            onClick={proposal.onDismiss}
            aria-label={`Dismiss the ${proposal.label} suggestion`}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3 outline-none hover:bg-surface-2 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Close aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/** The chip for a value not yet in the field: the source's mark, outlined. */
const PROPOSAL: Record<DraftSource, string> = {
  label: "border border-ai text-ai",
  suggested: "border border-ai border-dashed text-ai",
  pin: "border border-ai/60 text-ai",
  barcode: "border border-ai/60 text-ai",
};
