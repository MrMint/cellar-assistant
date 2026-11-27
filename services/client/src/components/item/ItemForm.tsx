"use client";

import { useRouter } from "next/navigation";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import {
  type FieldPath,
  type SubmitHandler,
  useForm,
  useWatch,
} from "react-hook-form";
import { useMutation } from "urql";
import { AIDraftField } from "@/components/app/AIDraftField";
import { CheckTag } from "@/components/app/parts/Field";
import { useNavigate } from "@/components/app/useNavigate";
import { BrandPicker } from "@/components/brand/BrandPicker";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  ATTRIBUTE_INPUT_KEY,
  attributesToSave,
  ITEM_FORM_RULES,
  isNonVintageText,
  missingRequiredAttributes,
  NON_VINTAGE,
  staticOptionValues,
} from "@/components/item-api/itemFormRules";
import { Button } from "@/components/ui/button";
import { UpdateItemMutation } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { isDrafted } from "@/lib/forms/ai-draft";
import {
  type CorrectionProposal,
  correctionProposals,
} from "@/lib/items/correction";
import type { ExtractionValues } from "@/lib/items/extraction-merge";
import { smartTitleCase } from "@/utilities/smart-title-case";
import { type ShownBrand, useBrandChange } from "./brand-change";
import { brandChangeMessage } from "./ChangeBrand";
import { requiredSummary } from "./form-errors";
import {
  type CorrectionAnswer,
  type CorrectionTools,
  correctionSummary,
  ItemCorrectionPanel,
} from "./ItemCorrectionPanel";
import { ItemFormField } from "./ItemFormField";
import {
  checkPaths,
  dateFromYear,
  entryPath,
  formLayout,
  toCheckLabel,
  yearFromDate,
} from "./itemFormLayout";
import { LoadingButton } from "./LoadingButton";

export type ItemFormValues = {
  name: string;
  description: string;
  country: string;
  /** By `ITEM_FORM_RULES` key, as strings; booleans are "true"/"false"/"". */
  attributes: Record<string, string>;
};

type ItemFormProps = {
  id: string;
  type: ApiItemType;
  defaultValues: ItemFormValues;
  /** Where a successful save goes (the page the edit was opened from). */
  onSavedHref: string;
  /**
   * X19: the brand the item shows (primary, or first link) — the BrandPicker
   * starts from it, and a change is saved with `replaceItemBrand`. Omitted:
   * no brand field (a caller that does not know the item's brands).
   */
  brand?: ShownBrand | null;
  /** X19: the AI helpers this item supports for its creator. */
  correction?: CorrectionTools | null;
  /**
   * C3: `Item.unconfirmedFields`, the label read's guesses nobody confirmed.
   * Each shown field among them wears "Check this" until it is edited or
   * confirmed ("Looks right"); "n to check" sits beside Save.
   */
  unconfirmed?: readonly string[];
};

/** A value a tap put in a field, and which helper proposed it. */
type Draft = { value: string; source: CorrectionProposal["source"] };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** What `values` holds at a proposal's path. */
const heldIn = (values: ExtractionValues, path: string): string =>
  path.startsWith("attributes.")
    ? (values.attributes[path.slice("attributes.".length)] ?? "")
    : (values[path as Exclude<keyof ExtractionValues, "attributes">] ?? "");

/** The attribute keys a text suggestion can fill (`SUGGESTIBLE_ITEM_FIELDS`). */
const suggestibleKeys = (type: ApiItemType): string[] =>
  ITEM_FORM_RULES[type].attributes
    .filter(
      (field) =>
        field.kind === "reference" ||
        field.kind === "static" ||
        (field.key === "region" && field.kind === "text"),
    )
    .map((field) => field.key);

/**
 * The six `82450ad1:src/components/{wine,…}/{T}Form.tsx` in edit mode, as one
 * form over `formLayout(type)` — capped at the `sm` breakpoint (600 px) as
 * the old `Box` was, labelled fields (`ItemFormField`, on `ui/field`),
 * `EnumSelect` for reference and enum columns, checkboxes for tea's two
 * flags, the same order
 * and labels, and the same "Something went wrong please try again..." root
 * error. A vintage is a year, as it was (see `dateFromYear`) — or, for a wine,
 * "NV" (X19).
 *
 * What it sends is the rewrite's `updateItem` patch, unchanged: name blank is
 * ignored by the API (NOT NULL), description and country blank clear, an
 * attribute left blank is omitted (`attributesToSave`), and a column the
 * database requires is checked here first so the message names it.
 *
 * **X19, the correction loop.** The edit form now carries the item's brand
 * (the onboarding form's `BrandPicker`, saved with `replaceItemBrand` after
 * the item itself), and — for the creator, where the AI can do it — two
 * helpers above the fields: **Re-read label** and **Suggest details**. Their
 * answers arrive as chips under the fields they concern (`AIDraftField`'s
 * `proposal`): "From label: 2016 · Use", dashed "Suggested: Zinfandel · Use".
 * **Nothing is applied without a tap**; a used value carries the field's AI
 * mark until it is edited, and Save is the only write.
 *
 * Button: "Save", where the old edit form still said "Add" (it was never
 * reachable — the old Edit button was hard-disabled).
 */
export const ItemForm = ({
  id,
  type,
  defaultValues,
  onSavedHref,
  brand,
  correction,
  unconfirmed,
}: ItemFormProps) => {
  const router = useRouter();
  const navigate = useNavigate();
  const [, updateItem] = useMutation(UpdateItemMutation);
  const brands = useBrandChange(type, id);
  const layout = formLayout(type);
  const withBrand = brand !== undefined;
  const shownBrand = brand ?? null;
  const [brandName, setBrandName] = useState(shownBrand?.name ?? "");
  // BrandPicker keeps its own text; a used proposal remounts it with the new one.
  const [brandKey, setBrandKey] = useState(0);
  const [proposals, setProposals] = useState<readonly CorrectionProposal[]>([]);
  const [drafts, setDrafts] = useState<Readonly<Record<string, Draft>>>({});

  const yearDefaults: Record<string, string> = {};
  for (const entry of layout) {
    if (entry.kind === "attribute" && entry.field.kind === "date") {
      yearDefaults[entry.field.key] = yearFromDate(
        defaultValues.attributes[entry.field.key] ?? "",
      );
    }
  }

  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<ItemFormValues>({
    defaultValues: {
      ...defaultValues,
      attributes: { ...defaultValues.attributes, ...yearDefaults },
    },
  });
  const watched = useWatch({ control });

  /** What a path holds now — the brand lives outside react-hook-form. */
  const valueAt = (path: string): string => {
    if (path === "brandName") return brandName;
    if (path.startsWith("attributes.")) {
      return watched.attributes?.[path.slice("attributes.".length)] ?? "";
    }
    const top = watched[path as "name" | "description" | "country"];
    return typeof top === "string" ? top : "";
  };

  /* ------------------------------------------------------------------ */
  /* C3 — "Check this"                                                   */
  /* ------------------------------------------------------------------ */

  const checks = checkPaths(unconfirmed ?? [], layout, withBrand);
  /** What a path held when the form opened. */
  const initialAt = (path: string): string => {
    if (path === "brandName") return shownBrand?.name ?? "";
    if (path.startsWith("attributes.")) {
      const key = path.slice("attributes.".length);
      return yearDefaults[key] ?? defaultValues.attributes[key] ?? "";
    }
    return defaultValues[path as "name" | "description" | "country"] ?? "";
  };
  // Confirmed with "Looks right", or edited: either clears the mark for good
  // (editing it back does not bring the mark back).
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
  const edited = checks.filter(
    (path) => !settled.has(path) && valueAt(path) !== initialAt(path),
  );
  const editedKey = edited.join("|");
  useEffect(() => {
    if (editedKey === "") return;
    setSettled((all) => new Set([...Array.from(all), ...editedKey.split("|")]));
  }, [editedKey]);
  const toCheck = checks.filter(
    (path) => !settled.has(path) && !edited.includes(path),
  );
  const confirmField = (path: string) => {
    feedback("tick");
    setSettled((all) => new Set([...Array.from(all), path]));
  };
  /** "n to check": to the first open field, as the floor's refusal does. */
  const goToCheck = () => {
    const first = toCheck[0];
    if (first === undefined) return;
    const field = document.querySelector<HTMLElement>(
      `[data-check-path="${first}"]`,
    );
    field?.scrollIntoView({ block: "center", behavior: "smooth" });
    field
      ?.querySelector<HTMLElement>("input, textarea, button, [tabindex]")
      ?.focus({ preventScroll: true });
  };
  const checkMark = (path: string, label: string, field: ReactNode) => (
    <CheckField
      path={path}
      label={label}
      open={toCheck.includes(path)}
      onConfirm={() => confirmField(path)}
    >
      {field}
    </CheckField>
  );

  /** The form's attributes in the API's terms (years back to dates, NV → null). */
  const wireAttributes = (
    attributes: Record<string, string>,
  ): Record<string, string | number | boolean | null> => {
    const out: Record<string, string> = { ...attributes };
    for (const key of Object.keys(yearDefaults)) {
      out[key] = dateFromYear(
        out[key] ?? "",
        defaultValues.attributes[key] ?? "",
      );
    }
    return attributesToSave(type, out);
  };

  /* ------------------------------------------------------------------ */
  /* X19 — proposals                                                     */
  /* ------------------------------------------------------------------ */

  const fields = ITEM_FORM_RULES[type].attributes.map((field) =>
    field.kind === "date" ? { ...field, kind: "year" as const } : field,
  );
  const order = new Map(
    [
      ...layout.map((entry) => entryPath(entry)),
      ...(withBrand ? ["brandName"] : []),
    ].map((path, index) => [path, index]),
  );

  const onAnswer = (
    answer: CorrectionAnswer & { abstained?: boolean },
  ): string => {
    if (answer.abstained === true) {
      setProposals([]);
      return correctionSummary({
        kind: answer.kind,
        offered: 0,
        unusable: 0,
        abstained: true,
      });
    }
    const values = getValues();
    const current: ExtractionValues = {
      name: values.name,
      description: values.description,
      country: values.country,
      brandName: withBrand ? brandName : "",
      attributes: values.attributes,
    };
    const defaults =
      answer.brandName === undefined || answer.brandName === null
        ? answer.defaults
        : { ...answer.defaults, brandName: answer.brandName };
    const { proposals: found, unusable } = correctionProposals({
      defaults,
      bagKey: ATTRIBUTE_INPUT_KEY[type],
      fields,
      current,
      source: answer.kind,
      allowedValues: (field) =>
        field.kind === "static" ? staticOptionValues(field.options) : null,
      coerce: (field, value) =>
        field.nonVintage === true && isNonVintageText(value)
          ? NON_VINTAGE
          : field.kind === "year" && ISO_DAY.test(value.trim())
            ? yearFromDate(value.trim())
            : value,
    });
    // N17: a label read shouts; offer the name and brand as the add flow
    // files them, and drop what then matches the field after all.
    const offered = found
      .map((proposal) =>
        proposal.path === "name" || proposal.path === "brandName"
          ? {
              ...proposal,
              value: smartTitleCase(proposal.value),
              display: smartTitleCase(proposal.display),
            }
          : proposal,
      )
      .filter(
        (proposal) =>
          order.has(proposal.path) &&
          proposal.value.trim().toLowerCase() !==
            heldIn(current, proposal.path).trim().toLowerCase(),
      )
      .sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0));
    setProposals(offered);
    return correctionSummary({
      kind: answer.kind,
      offered: offered.length,
      unusable: unusable.length,
    });
  };

  const proposalFor = (path: string) =>
    proposals.find((proposal) => proposal.path === path);

  const applyProposal = (proposal: CorrectionProposal) => {
    if (proposal.path === "brandName") {
      setBrandName(proposal.value);
      setBrandKey((key) => key + 1);
    } else {
      setValue(proposal.path as FieldPath<ItemFormValues>, proposal.value, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    setDrafts((all) => ({
      ...all,
      [proposal.path]: { value: proposal.value, source: proposal.source },
    }));
    setProposals((all) => all.filter((other) => other !== proposal));
  };

  const dismissProposal = (proposal: CorrectionProposal) =>
    setProposals((all) => all.filter((other) => other !== proposal));

  /** The `AIDraftField` props for one path: its mark and its chip. */
  const draftProps = (path: string, label: string) => {
    const draft = drafts[path];
    const proposal = proposalFor(path);
    return {
      source: proposal?.source ?? draft?.source ?? "suggested",
      drafted: draft !== undefined && isDrafted(draft.value, valueAt(path)),
      proposal:
        proposal === undefined
          ? undefined
          : {
              display: proposal.display,
              label,
              onUse: () => applyProposal(proposal),
              onDismiss: () => dismissProposal(proposal),
            },
    } as const;
  };

  const emptySuggestible =
    (valueAt("country").trim() === "" ? 1 : 0) +
    suggestibleKeys(type).filter(
      (key) => valueAt(`attributes.${key}`).trim() === "",
    ).length;

  /* ------------------------------------------------------------------ */
  /* Save                                                                */
  /* ------------------------------------------------------------------ */

  const onSubmit: SubmitHandler<ItemFormValues> = async (values) => {
    const attributes: Record<string, string> = { ...values.attributes };
    for (const key of Object.keys(yearDefaults)) {
      attributes[key] = dateFromYear(
        attributes[key] ?? "",
        defaultValues.attributes[key] ?? "",
      );
    }

    const missing = missingRequiredAttributes(type, attributes);
    if (missing.length > 0) {
      setError("root", {
        type: "custom",
        message: `${missing.map((field) => field.label).join(", ")} cannot be empty.`,
      });
      return;
    }

    const response = await updateItem({
      itemId: id,
      type,
      input: {
        name: values.name.trim() === "" ? null : values.name.trim(),
        description:
          values.description.trim() === "" ? null : values.description.trim(),
        country: values.country === "" ? null : values.country,
        [ATTRIBUTE_INPUT_KEY[type]]: attributesToSave(type, attributes),
      },
    });
    const saved = unwrapResult(
      response.data?.updateItem,
      "MutationUpdateItemSuccess",
    );
    if (!saved.ok) {
      setError("root", {
        type: "custom",
        message:
          saved.error.code === "VALIDATION" || saved.error.code === "FORBIDDEN"
            ? saved.error.message
            : "Something went wrong please try again...",
      });
      return;
    }
    if (withBrand) {
      const changed = await brands.change(shownBrand, brandName);
      if (!changed.ok) {
        setError("root", {
          type: "custom",
          message: `The details were saved. ${brandChangeMessage(changed.error)}`,
        });
        return;
      }
    }
    navigate.push(onSavedHref);
    router.refresh();
  };

  // N03: validation stopped the submit — name the fields beside the button.
  const onInvalid = () => {
    setError("root", {
      type: "custom",
      message:
        requiredSummary(layout, getValues()) ?? "Check the highlighted fields.",
    });
  };

  return (
    <div className="flex w-full max-w-[600px] flex-col gap-6">
      {correction !== undefined && correction !== null && (
        <ItemCorrectionPanel
          type={type}
          itemId={id}
          tools={correction}
          emptySuggestible={emptySuggestible}
          suggestInput={() => {
            const values = getValues();
            return {
              name: values.name,
              brandName: brandName.trim() === "" ? null : brandName.trim(),
              country: values.country === "" ? null : values.country,
              attributes: wireAttributes(values.attributes),
            };
          }}
          onAnswer={onAnswer}
        />
      )}
      {/* noValidate: required fields carry a native `required`, and the
          browser's own check would cancel the submit before react-hook-form
          runs — so none of N03's messages would ever show. */}
      <form noValidate onSubmit={handleSubmit(onSubmit, onInvalid)}>
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            {layout.map((entry) => (
              <Fragment
                key={entry.kind === "attribute" ? entry.field.key : entry.kind}
              >
                {checkMark(
                  entryPath(entry),
                  entry.label,
                  <AIDraftField {...draftProps(entryPath(entry), entry.label)}>
                    <ItemFormField
                      entry={entry}
                      control={control}
                      disabled={isSubmitting}
                    />
                  </AIDraftField>,
                )}
                {withBrand &&
                  entry.kind === "description" &&
                  checkMark(
                    "brandName",
                    "Brand",
                    <AIDraftField {...draftProps("brandName", "Brand")}>
                      <BrandPicker
                        key={brandKey}
                        value={brandName}
                        onChange={setBrandName}
                        disabled={isSubmitting}
                      />
                    </AIDraftField>,
                  )}
              </Fragment>
            ))}
          </div>
          {errors.root !== undefined && (
            <p role="alert" className="t-body text-danger">
              {errors.root.message}
            </p>
          )}
          {/* CROSS-LOT: the primary says its verb; "n to check" beside it. */}
          <div className="flex gap-3" data-slot="item-form-footer">
            {toCheck.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                data-slot="to-check"
                onClick={goToCheck}
              >
                {toCheckLabel(toCheck.length)}
              </Button>
            )}
            <LoadingButton
              loading={isSubmitting}
              type="submit"
              className="min-w-0 flex-1"
            >
              Save
            </LoadingButton>
          </div>
        </div>
      </form>
    </div>
  );
};

/**
 * A field the label read guessed (CROSS-LOT "Check this"): the tag at the
 * label row's end, and under the field one reason line with "Looks right".
 * Closed, it is just the field.
 */
function CheckField({
  path,
  label,
  open,
  onConfirm,
  children,
}: {
  path: string;
  label: string;
  open: boolean;
  onConfirm: () => void;
  children: ReactNode;
}) {
  if (!open) return children;
  return (
    <div
      data-slot="check-field"
      data-check-path={path}
      className="relative flex flex-col gap-1"
    >
      <CheckTag className="pointer-events-none absolute top-0 right-0" />
      {children}
      <div className="flex min-h-11 items-center gap-2">
        <span className="t-cap min-w-0 flex-1 text-ink-2">
          The label read this. Is it right?
        </span>
        <Button
          type="button"
          variant="quiet"
          className="shrink-0"
          aria-label={`${label} looks right`}
          onClick={onConfirm}
        >
          Looks right
        </Button>
      </div>
    </div>
  );
}
