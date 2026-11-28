"use client";

import { useEffect, useId, useState } from "react";
import { Link } from "@/components/app/Link";
import {
  FormField,
  NumberField,
  parseDecimal,
} from "@/components/app/parts/Field";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { TypeGlyph } from "@/components/app/TypeChip";
import {
  humanizeReferenceValue,
  ITEM_FORM_RULES,
} from "@/components/item-api/itemFormRules";
import { useReferenceOptions } from "@/components/item-api/useReferenceOptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { DraftThumb } from "./DraftThumb";
import { type DraftRow, type Edits, kindSpec, type Need } from "./needs";

const SELECT =
  "t-body h-11 w-full appearance-none rounded-md border border-edge-2 bg-card px-3 text-ink outline-none focus-visible:border-act-ink";

/** The coffee roast levels (`CoffeeRoastLevel`, a Postgres enum). */
const ROASTS = [
  "LIGHT",
  "LIGHT_MEDIUM",
  "MEDIUM",
  "MEDIUM_DARK",
  "DARK",
  "EXTRA_DARK",
] as const;

/** Where the full form resumes this draft (K1's add flow, `?draft=`). */
export const resumeHref = (row: DraftRow): string => {
  const query = new URLSearchParams({
    draft: row.draft.id,
    type: row.draft.itemType,
  });
  return `/add?${query.toString()}`;
};

/**
 * Capture-Place 27 and 28, the finish-one sheet: the bottle (photo, name,
 * what is known) with "n left", one field per thing it still needs, and
 * "Not now" beside Save. Save keeps the draft's own cellar; the list decides
 * what happens next (the next bottle, Undo).
 */
export function FinishOneSheet({
  row,
  left,
  saving,
  error,
  onSave,
  onOpenChange,
}: {
  row: (DraftRow & { imageUrl?: string | null }) | null;
  /** How many bottles the current filter still shows, this one included. */
  left: number;
  saving: boolean;
  error: string | null;
  onSave: (row: DraftRow, edits: Edits) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [edits, setEdits] = useState<Edits>({});
  const [strengthText, setStrengthText] = useState("");
  const [yearText, setYearText] = useState("");
  const draftId = row?.draft.id ?? null;
  // A fresh form for each bottle.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset per draft
  useEffect(() => {
    setEdits({});
    setStrengthText("");
    setYearText("");
  }, [draftId]);

  const open = row !== null;
  const ids = useId();
  const { optionsFor, countries } = useReferenceOptions();

  if (row === null) {
    return (
      <ResponsiveDialog
        open={false}
        onOpenChange={onOpenChange}
        title="Needs details"
      />
    );
  }

  const type = row.draft.itemType;
  const spec = kindSpec(type);
  const styleField = ITEM_FORM_RULES[type].attributes.find(
    (field) => field.key === spec.style.key,
  );
  const styleOptions =
    type === "COFFEE"
      ? ROASTS.map((value) => ({ value, comment: null }))
      : styleField === undefined
        ? []
        : optionsFor(styleField);

  const idOf = (need: Need) => `${ids}-${need}`;
  const set = (patch: Edits) =>
    setEdits((current) => ({ ...current, ...patch }));

  const field = (need: Need) => {
    switch (need) {
      case "name":
        return (
          <FormField key={need} label="Name" htmlFor={idOf(need)}>
            <Input
              id={idOf(need)}
              value={edits.name ?? ""}
              onChange={(event) => set({ name: event.target.value })}
              autoComplete="off"
              maxLength={200}
            />
          </FormField>
        );
      case "maker":
        return (
          <FormField key={need} label={spec.maker} htmlFor={idOf(need)}>
            <Input
              id={idOf(need)}
              value={edits.maker ?? ""}
              onChange={(event) => set({ maker: event.target.value })}
              placeholder={`Type the ${spec.maker.toLowerCase()}`}
              autoComplete="off"
              maxLength={200}
            />
          </FormField>
        );
      case "style":
        return (
          <FormField key={need} label={spec.style.label} htmlFor={idOf(need)}>
            <select
              id={idOf(need)}
              className={cn(SELECT, edits.style ? "" : "text-ink-3")}
              value={edits.style ?? ""}
              onChange={(event) => {
                feedback("tick");
                set({ style: event.target.value });
              }}
            >
              <option value="">Choose</option>
              {styleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {spec.style.words(option.value)}
                </option>
              ))}
            </select>
          </FormField>
        );
      case "strength":
        return (
          <FormField key={need} label="Strength" htmlFor={idOf(need)}>
            <NumberField
              id={idOf(need)}
              unit="%"
              value={strengthText}
              onChange={(event) => {
                setStrengthText(event.target.value);
                set({ strength: parseDecimal(event.target.value) });
              }}
            />
          </FormField>
        );
      case "origin":
        return (
          <FormField key={need} label="Origin" htmlFor={idOf(need)}>
            <select
              id={idOf(need)}
              className={cn(SELECT, edits.origin ? "" : "text-ink-3")}
              value={edits.origin ?? ""}
              onChange={(event) => {
                feedback("tick");
                set({ origin: event.target.value });
              }}
            >
              <option value="">Choose</option>
              {countries.map((option) => (
                <option key={option.value} value={option.value}>
                  {humanizeReferenceValue(option.value)}
                </option>
              ))}
            </select>
          </FormField>
        );
      case "vintage": {
        const nv = edits.vintage === "NV";
        return (
          <FormField key={need} label="Vintage" htmlFor={idOf(need)}>
            <div className="flex gap-2">
              <Input
                id={idOf(need)}
                inputMode="numeric"
                placeholder="Year"
                value={nv ? "" : yearText}
                disabled={nv}
                onChange={(event) => {
                  setYearText(event.target.value);
                  const year = Number.parseInt(event.target.value, 10);
                  set({
                    vintage:
                      Number.isFinite(year) && year > 1800 && year < 2200
                        ? year
                        : null,
                  });
                }}
                className="tabular flex-1"
              />
              <button
                type="button"
                aria-pressed={nv}
                onClick={() => {
                  feedback("toggle");
                  set({ vintage: nv ? null : "NV" });
                }}
                className={cn(
                  "t-head h-11 shrink-0 rounded-md border px-3.5 transition-transform active:scale-97 motion-reduce:active:scale-100",
                  nv
                    ? "border-edge-2 bg-sel text-ink"
                    : "border-edge bg-transparent text-ink",
                )}
              >
                No vintage
              </button>
            </div>
          </FormField>
        );
      }
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={saving ? () => {} : onOpenChange}
      title={row.title}
      hideTitle
      footer={
        <div className="flex w-full items-center gap-3">
          <Button
            variant="quiet-muted"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Not now
          </Button>
          <Button
            className="flex-1"
            onClick={() => onSave(row, edits)}
            disabled={saving}
          >
            {saving ? <Spinner aria-hidden className="size-4" /> : null}
            Save
          </Button>
        </div>
      }
    >
      <div data-slot="finish-one" className="flex flex-col gap-5 pb-2">
        <div className="flex items-start gap-3">
          <DraftThumb
            imageId={row.draft.imageId}
            imageUrl={row.imageUrl}
            glyph={<TypeGlyph type={type} className="size-8 text-glyph" />}
            className="size-[72px] rounded-md"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="t-title m-0 line-clamp-2 text-ink">{row.title}</p>
            {row.detail !== "" && (
              <p className="t-cap m-0 truncate text-ink-2">{row.detail}</p>
            )}
          </div>
          <span className="t-cap tabular shrink-0 text-ink-2">{left} left</span>
        </div>
        {row.needs.map(field)}
        {error !== null && (
          <p role="alert" className="t-cap m-0 text-danger">
            {error}
          </p>
        )}
        <Link
          href={resumeHref(row)}
          underline="none"
          className="t-cap self-start py-3 text-act-ink"
          onClick={() => feedback("press")}
        >
          All fields
        </Link>
      </div>
    </ResponsiveDialog>
  );
}
