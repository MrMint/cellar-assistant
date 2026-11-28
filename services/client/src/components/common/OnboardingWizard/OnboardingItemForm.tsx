"use client";

import {
  Fragment,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  type FieldPath,
  type SubmitHandler,
  useForm,
  useWatch,
} from "react-hook-form";
import { useClient, useMutation } from "urql";
import {
  AIDraftField,
  type DraftConfidence,
} from "@/components/app/AIDraftField";
import { Info } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { BrandPicker } from "@/components/brand/BrandPicker";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { requiredSummary } from "@/components/item/form-errors";
import type { ItemFormValues } from "@/components/item/ItemForm";
import { ItemFormField } from "@/components/item/ItemFormField";
import {
  entryPath,
  formLayout,
  toCheckLabel,
} from "@/components/item/itemFormLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { feedback } from "@/lib/feedback";
import {
  draftedPaths,
  flattenFormValues,
  isDrafted,
} from "@/lib/forms/ai-draft";
import { cn } from "@/lib/utils";
import { createOnboardedItem } from "./actors/createItem";
import {
  type ExistingItem,
  type OnboardingDefaults,
  saveBlocker,
  skippedNotes,
} from "./adapter";
import {
  asksVintage,
  confirmedFieldsFrom,
  differsFrom,
  isDuplicateOfDeclined,
  openFloorPaths,
  saveOnboardingDraft,
} from "./draft-save";
import { SaveDraftMutation } from "./queries";
import { TypeAheadRow } from "./TypeAheadRow";

const NO_IDS: readonly string[] = [];

type OnboardingItemFormProps = {
  type: ApiItemType;
  itemOnboardingId: string;
  defaultValues: OnboardingDefaults;
  /**
   * X05: a later read (the optional back label) to fill in. Applied once per
   * `id`, and only to fields the person has not made their own: an empty
   * field, or one still holding the earlier read's value. What they typed is
   * never overwritten (E2c).
   */
  refill?: { id: string; defaults: OnboardingDefaults };
  /** The code the session was opened with — the scanner's, if it saw one. */
  sessionBarcode?: string;
  onCreated: (createdId: string, name: string) => void;
  /** Where the bottle is aimed: `saveDraft`'s cellar (null: just the catalog). */
  cellarId?: string | null;
  /** "Finish later" saved the draft (MC-drafts). */
  onSavedForLater?: (status: string) => void;
  /**
   * DECISIONS 34 (2): the match the person declined ("Not this"). Typing its
   * name and maker again warns; "Add that one instead" files it.
   */
  declinedMatch?: { name: string; brandName?: string; summary?: string };
  onUseDeclined?: () => void;
  /**
   * F-60 (board add-bottle-17): the catalog item the typed name points at,
   * offered under Name with "Add". Without it, no row.
   */
  onUseTypedMatch?: (match: ExistingItem) => void;
  /** The bottle goes into a cellar (the row says "Add", else "Use"). */
  inCellar?: boolean;
  /** Items the person declined: the row never offers them again. */
  declinedItemIds?: readonly string[];
};

/**
 * Which of `next`'s values a refill writes: those whose field is empty or
 * still holds the earlier draft. Pure, so the rule is tested on its own.
 */
export const refillWrites = (
  baseline: Readonly<Record<string, string>>,
  current: Readonly<Record<string, string>>,
  next: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> => {
  const writes: Record<string, string> = {};
  for (const [path, value] of Object.entries(next)) {
    if (value.trim() === "") continue;
    const now = current[path] ?? "";
    const untouched =
      now.trim() === "" || isDrafted(baseline[path] ?? null, now);
    if (untouched && now.trim() !== value.trim()) writes[path] = value;
  }
  return writes;
};

/**
 * The six `82450ad1:src/components/{type}/{T}Form.tsx` in **create** mode —
 * what the onboarding wizard's `form` step rendered. Same column capped at the
 * `sm` breakpoint (600 px), the same fields in the same order through the shared
 * `ItemFormField` (`item/itemFormLayout.ts`), `BrandPicker` after the
 * description as before, a Barcode field last, "Add", and the same
 * "Something went wrong please try again..." root error.
 *
 * The save is `createOnboardedItem` (confirm → wait for the row → typed
 * barcode), and a column the database requires is checked first so the
 * message names it instead of the outbox swallowing it.
 */
export const OnboardingItemForm = ({
  type,
  itemOnboardingId,
  defaultValues,
  refill,
  sessionBarcode,
  onCreated,
  cellarId = null,
  onSavedForLater,
  declinedMatch,
  onUseDeclined,
  onUseTypedMatch,
  inCellar = false,
  declinedItemIds = NO_IDS,
}: OnboardingItemFormProps) => {
  const client = useClient();
  const [, executeSaveDraft] = useMutation(SaveDraftMutation);
  // DECISIONS 34 (3): a beer is never asked for a vintage.
  const layout = formLayout(type, "create").filter(
    (entry) => entry.kind !== "attribute" || asksVintage(type, entry.field.key),
  );
  const [brandName, setBrandName] = useState(defaultValues.brandName);
  const [barcode, setBarcode] = useState(sessionBarcode ?? "");
  const barcodeId = useId();

  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<ItemFormValues>({ defaultValues: defaultValues.values });

  // What the reads drafted so far — the first read, plus whatever a refill
  // wrote — and how sure each was (X05). The marks diff against this.
  const [baseline, setBaseline] = useState<Record<string, string>>(() => ({
    ...flattenFormValues(defaultValues.values),
    brandName: defaultValues.brandName,
  }));
  const [confidences, setConfidences] = useState<
    Readonly<Record<string, DraftConfidence>>
  >(defaultValues.confidences);
  const [notFilledFrom, setNotFilledFrom] = useState(defaultValues.skipped);

  const appliedRefill = useRef<string | null>(null);
  useEffect(() => {
    if (refill === undefined || appliedRefill.current === refill.id) return;
    appliedRefill.current = refill.id;
    const next = {
      ...flattenFormValues(refill.defaults.values),
      brandName: refill.defaults.brandName,
    };
    const now = {
      ...flattenFormValues(getValues()),
      brandName,
    };
    const writes = refillWrites(baseline, now, next);
    for (const [path, value] of Object.entries(writes)) {
      if (path === "brandName") setBrandName(value);
      else setValue(path as FieldPath<ItemFormValues>, value);
    }
    setBaseline((before) => ({ ...before, ...writes }));
    setConfidences((before) => {
      const merged: Record<string, DraftConfidence> = { ...before };
      for (const path of Object.keys(writes)) {
        const level = refill.defaults.confidences[path];
        if (level === undefined) delete merged[path];
        else merged[path] = level;
      }
      return merged;
    });
    setNotFilledFrom(refill.defaults.skipped);
  }, [refill, baseline, brandName, getValues, setValue]);

  // N19: a field is marked "From label" while it still holds what was read.
  const current = useWatch({ control });
  const drafted = draftedPaths(baseline, flattenFormValues(current));
  const notFilled = skippedNotes(type, notFilledFrom);

  // DECISIONS 34: a guess counts only once the person touches it — types in
  // it, taps one of its chips, or says "Looks right" to them all.
  // A field the read was sure of is shown settled (the board's plain rows);
  // every other filled field is a guess to check.
  const guessed: ReadonlySet<string> = new Set(
    Object.entries(baseline)
      .filter(
        ([path, value]) => value.trim() !== "" && confidences[path] !== "sure",
      )
      .map(([path]) => path),
  );
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const touch = (path: string) =>
    setTouched((before) =>
      before.has(path) ? before : new Set([...Array.from(before), path]),
    );
  const touchOn = (path: string) => ({
    onChangeCapture: () => touch(path),
    onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
      if ((event.target as Element).closest("button") !== null) touch(path);
    },
  });
  const toCheck = Array.from(guessed).filter((path) => !touched.has(path));
  const flat: Readonly<Record<string, string>> = {
    ...flattenFormValues(current),
    brandName,
  };
  const openFloor = openFloorPaths(layout, flat, guessed, touched);
  const formRef = useRef<HTMLFormElement>(null);
  const jumpToOpen = () => {
    feedback("refuse");
    const path = openFloor[0] ?? toCheck[0];
    if (path === undefined) return;
    const target = formRef.current?.querySelector<HTMLElement>(
      `[data-path="${path}"]`,
    );
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    target?.querySelector<HTMLElement>("input, textarea, button")?.focus();
  };

  // DECISIONS 34 (2): the declined match typed again.
  const duplicate = isDuplicateOfDeclined(
    declinedMatch,
    flat.name ?? "",
    brandName,
  );
  const [differing, setDiffering] = useState<Record<string, string> | null>(
    null,
  );
  const differs = differing !== null && differsFrom(differing, flat);

  const [savingLater, setSavingLater] = useState(false);
  const finishLater = async () => {
    setSavingLater(true);
    try {
      const { status } = await saveOnboardingDraft({
        save: (variables) => executeSaveDraft(variables),
        type,
        onboardingId: itemOnboardingId,
        cellarId,
        values: getValues(),
        brandName,
        guessed,
        touched,
      });
      feedback("success");
      onSavedForLater?.(status);
    } catch (cause) {
      feedback("refuse");
      notify(
        cause instanceof Error ? cause.message : "The draft wasn't saved.",
        { tone: "error" },
      );
    } finally {
      setSavingLater(false);
    }
  };

  const onSubmit: SubmitHandler<ItemFormValues> = async (values) => {
    if (openFloor.length > 0) {
      jumpToOpen();
      return;
    }
    const blocker = saveBlocker(type, values);
    if (blocker !== null) {
      setError("root", { type: "custom", message: blocker });
      return;
    }
    try {
      const itemId = await createOnboardedItem({
        urqlClient: client,
        type,
        onboardingId: itemOnboardingId,
        values,
        brandName,
        barcode,
        sessionBarcode,
        confirmedFields: confirmedFieldsFrom(guessed, touched),
      });
      onCreated(itemId, values.name.trim());
    } catch (cause) {
      setError("root", {
        type: "custom",
        message:
          cause instanceof Error
            ? cause.message
            : "Something went wrong please try again...",
      });
    }
  };

  // N03: validation stopped the submit — say which fields, beside the button,
  // as well as under each one. The layout's summary names every starred field
  // still blank, which includes every column `saveBlocker` checks plus the
  // create form's own stars (sake, tea) — so it leads, and `saveBlocker` only
  // speaks when the stars are all filled (a whitespace-only value, which
  // `required` lets through, is caught by it here and again in `onSubmit`).
  const onInvalid = () => {
    const values = getValues();
    setError("root", {
      type: "custom",
      message:
        requiredSummary(layout, values) ??
        saveBlocker(type, values) ??
        "Check the highlighted fields.",
    });
  };

  const guessedLine = layout
    .flatMap((entry) =>
      entry.kind === "description"
        ? [entryPath(entry), "brandName"]
        : [entryPath(entry)],
    )
    .filter((path) => guessed.has(path))
    .map((path) => baseline[path] ?? "")
    .filter((value) => value.trim() !== "")
    .join(" · ");
  const verb = cellarId === null ? "Add to catalog" : "Add bottle";
  // F-60: typed in (nothing read), the primary counts the open floor fields
  // as the board's "3 left to check"; after a read it keeps its verb.
  const typedLeft = drafted.size === 0 ? openFloor.length : 0;
  const busy = isSubmitting || savingLater;
  const field = (path: string, children: ReactNode) => (
    <div data-path={path} className="relative" {...touchOn(path)}>
      <AIDraftField
        source="label"
        drafted={drafted.has(path) && !touched.has(path)}
        confidence={
          guessed.has(path) ? "check" : (confidences[path] ?? undefined)
        }
      >
        {children}
      </AIDraftField>
      {/* F-60 (board add-bottle-17): a floor field still open, with no
          read behind it, is marked plainly; the footer counts them. */}
      {openFloor.includes(path) && !drafted.has(path) && (
        <span
          data-slot="floor-mark"
          className="t-micro pointer-events-none absolute top-0 right-0 inline-flex h-5 items-center rounded-sm bg-raised px-1.5 text-ink"
        >
          Check this
        </span>
      )}
    </div>
  );

  return (
    <div className="max-w-[600px]">
      {/* noValidate: the required fields carry a native `required`, and the
          browser's own check would cancel the submit before react-hook-form
          runs — so none of N03's messages would ever show. */}
      <form
        ref={formRef}
        noValidate
        onSubmit={handleSubmit(onSubmit, onInvalid)}
      >
        <div className="flex flex-col gap-6 pb-4">
          {toCheck.length > 0 && guessedLine !== "" && (
            <div className="flex items-center gap-3 rounded-lg bg-raised p-3">
              <p className="t-body min-w-0 flex-1 text-ink-2">
                Guessed: {guessedLine}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  feedback("tick");
                  setTouched(
                    (before) =>
                      new Set([...Array.from(before), ...Array.from(guessed)]),
                  );
                }}
              >
                Looks right
              </Button>
            </div>
          )}
          {duplicate && declinedMatch !== undefined && (
            <div
              role="note"
              data-slot="duplicate-warning"
              className="flex flex-col gap-0.5 rounded-lg border border-edge-2 bg-card p-3"
            >
              <p className="t-head text-ink">{declinedMatch.name}</p>
              <p className="t-cap text-ink-2">
                {declinedMatch.summary ?? "Already in the catalog"}
              </p>
            </div>
          )}
          {notFilled.length > 0 && (
            <Alert>
              <Info aria-hidden />
              <AlertTitle>Read from the label but not filled in</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5">
                  {notFilled.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-4">
            {layout.map((entry) => (
              <Fragment
                key={entry.kind === "attribute" ? entry.field.key : entry.kind}
              >
                {field(
                  entryPath(entry),
                  <ItemFormField
                    entry={entry}
                    control={control}
                    disabled={busy}
                  />,
                )}
                {entry.kind === "name" && onUseTypedMatch !== undefined && (
                  <TypeAheadRow
                    type={type}
                    name={current.name ?? ""}
                    inCellar={inCellar}
                    excludeItemIds={declinedItemIds}
                    disabled={busy}
                    onAdd={onUseTypedMatch}
                  />
                )}
                {entry.kind === "description" &&
                  field(
                    "brandName",
                    <BrandPicker
                      value={brandName}
                      onChange={(next) => {
                        touch("brandName");
                        setBrandName(next);
                      }}
                      disabled={busy}
                    />,
                  )}
              </Fragment>
            ))}
            <Field
              data-disabled={busy || undefined}
              className="gap-2 border-transparent border-l-2 pl-3 text-ink"
            >
              <FieldLabel htmlFor={barcodeId}>Barcode</FieldLabel>
              <Input
                id={barcodeId}
                disabled={busy}
                type="text"
                inputMode="numeric"
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
              />
            </Field>
          </div>
          {errors.root !== undefined && (
            <p role="alert" className="t-body text-danger">
              {errors.root.message}
            </p>
          )}
        </div>
        {/* CROSS-LOT form-sheet footer: quiet "Finish later" left, the
            primary right with its verb and an "n to check" chip. */}
        <div
          data-slot="draft-footer"
          className="sticky bottom-0 z-10 -mx-4 flex items-center gap-2 border-hair border-t bg-background px-4 py-3"
        >
          {duplicate && differing === null ? (
            <>
              <Button
                type="button"
                variant="quiet-muted"
                disabled={busy}
                onClick={() => setDiffering({ ...flat })}
              >
                It&rsquo;s a different drink
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={busy}
                onClick={() => onUseDeclined?.()}
              >
                Add that one instead
              </Button>
            </>
          ) : duplicate && !differs ? (
            <>
              <Button
                type="button"
                variant="quiet-muted"
                disabled={busy}
                onClick={() => onUseDeclined?.()}
              >
                Use that one
              </Button>
              <Button
                type="button"
                className="flex-1 opacity-40"
                aria-disabled
                silent
                onClick={() => feedback("refuse")}
              >
                Change one detail
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="quiet-muted"
                disabled={busy}
                aria-busy={savingLater || undefined}
                onClick={finishLater}
              >
                {savingLater && <Spinner aria-hidden />}
                Finish later
              </Button>
              <Button
                type={openFloor.length > 0 ? "button" : "submit"}
                className={cn("flex-1", openFloor.length > 0 && "opacity-40")}
                aria-disabled={openFloor.length > 0 || undefined}
                silent={openFloor.length > 0}
                disabled={busy}
                aria-busy={isSubmitting || undefined}
                onClick={openFloor.length > 0 ? jumpToOpen : undefined}
              >
                {isSubmitting && <Spinner aria-hidden />}
                {typedLeft > 0 ? `${typedLeft} left to check` : verb}
                {typedLeft === 0 && toCheck.length > 0 && (
                  <span className="t-cap rounded-sm bg-background/20 px-1.5 py-0.5">
                    {toCheckLabel(toCheck.length)}
                  </span>
                )}
              </Button>
            </>
          )}
        </div>
      </form>
    </div>
  );
};
