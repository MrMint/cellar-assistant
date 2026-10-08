import { Box, Chip } from "@mui/joy";
import type { SxProps } from "@mui/joy/styles/types";
import type { ReactNode } from "react";
import { BsUpcScan } from "react-icons/bs";
import { DRAFT_SOURCE_LABEL, type DraftSource } from "@/lib/forms/ai-draft";

type AIDraftFieldProps = {
  /** Where the value came from (`design-direction.md` §3.8). */
  source: DraftSource;
  /**
   * Whether the field still holds the drafted value — decide it with
   * `draftedPaths` / `isDrafted` (`lib/forms/ai-draft.ts`), never by hand.
   */
  drafted: boolean;
  /** Layout only (e.g. a grid placement the wrapped field used to carry). */
  sx?: SxProps;
  children: ReactNode;
};

const CHIP: Record<
  DraftSource,
  {
    variant: "solid" | "soft" | "outlined";
    color: "primary" | "neutral" | "success";
  }
> = {
  label: { variant: "solid", color: "primary" },
  suggested: { variant: "outlined", color: "neutral" },
  pin: { variant: "soft", color: "success" },
  barcode: { variant: "soft", color: "neutral" },
};

/**
 * The one component for a field a machine filled in (N19). Each source gets
 * its own mark — a solid "From label" chip, a dashed "Suggested" one, today's
 * "From pin" chip, a barcode glyph — pinned to the label row of the field it
 * wraps.
 *
 * Deliberately presentation-light: no logic beyond drawing the mark, so the
 * shadcn migration (D20) and B02's restyle (teal `--ca-ai` rule, confidence
 * words) only replace this markup. The wrapper is rendered whether or not the
 * field is drafted, so the input inside it keeps its identity — and its focus —
 * at the keystroke that takes the mark away.
 */
export const AIDraftField = ({
  source,
  drafted,
  sx,
  children,
}: AIDraftFieldProps) => (
  <Box
    data-ai-draft={drafted ? source : undefined}
    sx={[
      { position: "relative", minWidth: 0 },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
    {children}
    {drafted && (
      <Chip
        size="sm"
        variant={CHIP[source].variant}
        color={CHIP[source].color}
        startDecorator={source === "barcode" ? <BsUpcScan /> : undefined}
        sx={{
          position: "absolute",
          top: 0,
          right: 0,
          pointerEvents: "none",
          ...(source === "suggested" ? { borderStyle: "dashed" } : {}),
        }}
      >
        {DRAFT_SOURCE_LABEL[source]}
      </Chip>
    )}
  </Box>
);
