"use client";

import { type ComponentProps, type ReactNode, useId } from "react";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { AI, ChevronDown, ErrorIcon, ICON_STROKE } from "../icons";

/**
 * KIT § 3 "Form" pieces. A field is a label above (t-head), the control
 * (44, r8, card, edge-2: `ui/input`), and below it, in words, either what
 * read it ("From the label") or what is wrong (danger, with its glyph). An
 * error keeps the value. Label above, unit inside right, error below.
 */
export function FormField({
  label,
  htmlFor,
  check,
  fromLabel = false,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  /** The control's id, for the label. */
  htmlFor?: string;
  /**
   * The "Check this" tag on the label row (CROSS-LOT: an unconfirmed
   * field), shown until the person edits it.
   */
  check?: boolean;
  /** The value was read from the label: the sparkle line under the label. */
  fromLabel?: boolean;
  /** What is wrong, in words ("Needs a name"). */
  error?: string | undefined;
  /** A quiet line under the field when there is no error. */
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="form-field"
      data-invalid={error !== undefined ? "" : undefined}
      className={cn("flex flex-col gap-2", className)}
    >
      <div className="flex min-h-5 items-center gap-2">
        <label htmlFor={htmlFor} className="t-head text-ink">
          {label}
        </label>
        {check === true && <CheckTag />}
      </div>
      {fromLabel && <FromTheLabel />}
      {children}
      {error !== undefined ? (
        <FieldError>{error}</FieldError>
      ) : (
        hint !== undefined && <p className="t-cap m-0 text-ink-2">{hint}</p>
      )}
    </div>
  );
}

/** "Check this": the tag on a field the label read but nobody confirmed. */
export function CheckTag({ className }: { className?: string }) {
  return (
    <span
      data-slot="check-tag"
      className={cn(
        "t-micro ml-auto rounded-sm bg-sel px-[7px] py-0.5 text-ink",
        className,
      )}
    >
      Check this
    </span>
  );
}

/** The sparkle and "From the label" (KIT § 3; → AIDraftField). */
export function FromTheLabel({ className }: { className?: string }) {
  return (
    <p
      data-slot="from-the-label"
      className={cn(
        "t-micro m-0 flex items-center gap-1.5 text-ink-2",
        className,
      )}
    >
      <AI aria-hidden className="size-3.5" strokeWidth={ICON_STROKE} />
      From the label
    </p>
  );
}

/** One reason line under a field in error (CROSS-LOT: outline plus reason). */
export function FieldError({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      role="alert"
      data-slot="field-error"
      className={cn(
        "t-cap m-0 flex items-center gap-1.5 text-danger",
        className,
      )}
    >
      <ErrorIcon aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
      {children}
    </p>
  );
}

/** A decimal written with a comma or a point ("8,2" or "8.2"). */
export const DECIMAL_PATTERN = /^\d{1,4}([.,]\d{1,2})?$/;

/** Reads a decimal the way a person writes it; `null` when it isn't one. */
export function parseDecimal(text: string): number | null {
  const trimmed = text.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) return null;
  return Number(trimmed.replace(",", "."));
}

/**
 * A number with its unit inside the field, at the right ("% ABV"). Takes a
 * comma (KIT § 3), so it is a text input with a decimal keyboard, not
 * `type="number"`; read it with `parseDecimal`.
 */
export function NumberField({
  unit,
  invalid = false,
  className,
  id,
  ...props
}: Omit<ComponentProps<"input">, "type"> & {
  unit: string;
  invalid?: boolean;
}) {
  const fallback = useId();
  const inputId = id ?? fallback;
  return (
    <div
      data-slot="number-field"
      className={cn(
        "flex h-11 items-center rounded-md border bg-card transition-[border-color] focus-within:border-act-ink",
        invalid ? "border-danger" : "border-edge-2",
        className,
      )}
    >
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        className="t-body tabular h-11 min-w-0 flex-1 bg-transparent px-3 text-ink outline-none placeholder:text-ink-3"
        {...props}
      />
      <span aria-hidden className="t-body shrink-0 pr-3 text-ink-3">
        {unit}
      </span>
    </div>
  );
}

/**
 * A picker: a 44 field-shaped button showing the value, with a chevron, that
 * opens a sheet of choices (KIT § 3 "picker opening a sheet"). The sheet is
 * the caller's.
 */
export function PickerButton({
  value,
  placeholder = "Choose",
  invalid = false,
  className,
  onClick,
  ...props
}: Omit<ComponentProps<"button">, "value" | "children"> & {
  value: string | null | undefined;
  placeholder?: string;
  invalid?: boolean;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      data-slot="picker-button"
      onClick={(event) => {
        feedback("press");
        onClick?.(event);
      }}
      className={cn(
        "flex h-11 w-full items-center gap-2 rounded-md border bg-card pr-2.5 pl-3 text-left outline-none focus-visible:border-act-ink disabled:opacity-40",
        invalid ? "border-danger" : "border-edge-2",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "t-body min-w-0 flex-1 truncate",
          empty ? "text-ink-3" : "text-ink",
        )}
      >
        {empty ? placeholder : value}
      </span>
      <ChevronDown
        aria-hidden
        className="size-5 shrink-0 text-ink-3"
        strokeWidth={ICON_STROKE}
      />
    </button>
  );
}
