/**
 * X19 — what the edit form offers after "Re-read label" or "Suggest details":
 * one proposal per field the answer has a different value for, **none of them
 * applied**. The person taps a chip to use one; Save is the only write.
 *
 * Built on the E2c merge (`extraction-merge.ts`) so a proposal is judged the
 * way the add wizard judges a label read — a picker only takes one of its own
 * options, a year field only a year (or a wine's "NV") — but read the other
 * way round: the wizard *applies* what fills an empty field and reports the
 * rest, while a correction applies nothing and offers both. A proposal equal
 * to what the field already holds is not an offer, and is dropped.
 *
 * Plain module (no React), tested on its own (`correction.test.ts`), and, like
 * the merge, it takes its field list rather than importing the form layer.
 */
import type { DraftSource } from "@/lib/forms/ai-draft";
import {
  type ExtractionField,
  type ExtractionValues,
  mergeExtractedDefaults,
  type SkippedProposal,
} from "./extraction-merge";

/** A value the AI proposes for one field, not yet in it. */
export type CorrectionProposal = {
  /** `name`, `country`, `brandName`, `attributes.vintage`, … */
  readonly path: string;
  readonly label: string;
  /** What the field would hold — the stored code for a picker. */
  readonly value: string;
  /** What the chip says: words, not the stored code. */
  readonly display: string;
  readonly source: Extract<DraftSource, "label" | "suggested">;
};

export type CorrectionResult = {
  readonly proposals: readonly CorrectionProposal[];
  /** Read, but no field here can hold it — said once, not offered. */
  readonly unusable: readonly SkippedProposal[];
};

/** `PINOT_NOIR` → `Pinot noir`, `UNITED_STATES` → `United states`. */
const words = (code: string): string => {
  const spaced = code.replace(/_/g, " ").toLowerCase().trim();
  return spaced === "" ? code : `${spaced[0]?.toUpperCase()}${spaced.slice(1)}`;
};

const displayOf = (
  path: string,
  value: string,
  fields: readonly ExtractionField[],
): string => {
  if (path === "country") return words(value);
  const key = path.startsWith("attributes.")
    ? path.slice("attributes.".length)
    : null;
  const field = fields.find((candidate) => candidate.key === key);
  if (field === undefined) return value;
  if (field.kind === "reference" || field.kind === "static")
    return words(value);
  if (field.kind === "boolean") return value === "true" ? "Yes" : "No";
  return value;
};

/**
 * The proposals in `defaults` (a label reading's or a suggestion pass's JSON)
 * against what the form holds now.
 *
 * `coerce` re-expresses a value in the field's own terms before it is judged
 * (the edit form keeps a vintage as a year, so `2016-01-01` becomes `2016`,
 * and "N.V." becomes "NV") — the same hook the wizard passes the merge.
 */
export const correctionProposals = ({
  defaults,
  bagKey,
  fields,
  current,
  source,
  allowedValues,
  coerce,
}: {
  readonly defaults: unknown;
  readonly bagKey: string;
  readonly fields: readonly ExtractionField[];
  readonly current: ExtractionValues;
  readonly source: CorrectionProposal["source"];
  readonly allowedValues?: (field: ExtractionField) => readonly string[] | null;
  readonly coerce?: (field: ExtractionField, value: string) => string;
}): CorrectionResult => {
  const merged = mergeExtractedDefaults({
    defaults,
    bagKey,
    fields,
    current,
    edited: new Set(),
    allowedValues,
    coerce,
  });
  const held = (path: string): string => {
    if (path.startsWith("attributes.")) {
      return current.attributes[path.slice("attributes.".length)] ?? "";
    }
    const top = current[path as keyof Omit<ExtractionValues, "attributes">];
    return typeof top === "string" ? top : "";
  };
  const offered = [
    ...merged.applied,
    ...merged.skipped.filter((skip) => skip.reason === "kept"),
  ].filter(
    (proposal) =>
      proposal.value.trim().toLowerCase() !==
      held(proposal.path).trim().toLowerCase(),
  );
  return {
    proposals: offered.map((proposal) => ({
      path: proposal.path,
      label: proposal.label,
      value: proposal.value.trim(),
      display: displayOf(proposal.path, proposal.value.trim(), fields),
      source,
    })),
    unusable: merged.skipped.filter((skip) => skip.reason === "unusable"),
  };
};

/**
 * A suggestion answer's JSON, parsed defensively: the API types it `JSON`, so
 * a string (what some transports hand back) is parsed and anything that is
 * not an object is no proposals rather than an exception.
 */
export const defaultsObject = (value: unknown): Record<string, unknown> => {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
};
