import type { ReactNode } from "react";
import { DRAFT_SOURCE_LABEL, type DraftSource } from "@/lib/forms/ai-draft";
import { cn } from "@/lib/utils";
import { Barcode } from "./icons";

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
 * Same props as `common/AIDraftField` minus `sx` (use `className`). The
 * wrapper renders whether or not the field is drafted, so the input inside
 * keeps its identity — and its focus — at the keystroke that removes the mark.
 */
export function AIDraftField({
  source,
  drafted,
  confidence,
  className,
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
    </div>
  );
}
