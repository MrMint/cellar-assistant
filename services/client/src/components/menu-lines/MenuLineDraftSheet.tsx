"use client";

import { useEffect, useRef, useState } from "react";
import {
  type FieldPath,
  type SubmitHandler,
  useForm,
  useWatch,
} from "react-hook-form";
import { useClient, useMutation } from "urql";
import { AIDraftField } from "@/components/app/AIDraftField";
import { FilterChip } from "@/components/app/FilterChip";
import { AI } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import {
  ITEM_TYPES_IN_ORDER,
  itemTypeTokens,
  TypeGlyph,
} from "@/components/app/TypeChip";
import { useNavigate } from "@/components/app/useNavigate";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { AiStatus } from "@/components/common/AiStatus";
import { createOnboardedItem } from "@/components/common/OnboardingWizard/actors/createItem";
import { saveBlocker } from "@/components/common/OnboardingWizard/adapter";
import { saveOnboardingDraft } from "@/components/common/OnboardingWizard/draft-save";
import { SaveDraftMutation } from "@/components/common/OnboardingWizard/queries";
import {
  correctionOutcome,
  correctionSummary,
} from "@/components/item/ItemCorrectionPanel";
import type { ItemFormValues } from "@/components/item/ItemForm";
import { ItemFormField } from "@/components/item/ItemFormField";
import {
  entryPath,
  type FormEntry,
  formLayout,
  toCheckLabel,
} from "@/components/item/itemFormLayout";
import {
  ATTRIBUTE_INPUT_KEY,
  ITEM_FORM_RULES,
  isNonVintageText,
  NON_VINTAGE,
  staticOptionValues,
} from "@/components/item-api/itemFormRules";
import { type MenuItemView, matchedItemHref } from "@/components/map/adapter";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isOffered, useAiCapabilities } from "@/lib/ai/capabilities";
import type { AiOutcome } from "@/lib/ai/outcome";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { isDrafted } from "@/lib/forms/ai-draft";
import {
  type CorrectionProposal,
  correctionProposals,
  defaultsObject,
} from "@/lib/items/correction";
import { menuLineText } from "@/utilities/menu-line-text";
import { draftToCheck } from "./menu-line-draft-check";
import { lineItemType } from "./menu-lines";
import {
  OpenItemDraftMutation,
  SuggestNewItemDetailsMutation,
  VerifyMenuLineMatchMutation,
} from "./queries";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A value a tap on a "Suggested" chip put in a field. */
type Draft = { value: string };

type SuggestStatus =
  | { state: "idle" }
  | { state: "working" }
  | { state: "done"; message: string }
  | { state: "failed"; outcome: AiOutcome };

/** What the draft starts from: the line's own words, cased for reading. */
const startingValues = (line: MenuItemView): ItemFormValues => ({
  name: menuLineText(line.menu_item_name),
  description: line.menu_item_description ?? "",
  country: "",
  attributes: {},
});

/**
 * Which entries the draft shows: the name, what the type cannot be saved
 * without (a wine's style and vintage, a spirit's type), and any field that
 * holds a value or has a suggestion waiting. "All details" shows the rest.
 */
export const draftEntries = (
  layout: readonly FormEntry[],
  show: (path: string) => boolean,
  all: boolean,
): FormEntry[] =>
  layout.filter(
    (entry) =>
      all ||
      entry.kind === "name" ||
      (entry.kind === "attribute" && entry.required) ||
      show(entryPath(entry)),
  );

export type MenuLineDraftSheetProps = {
  line: MenuItemView | null;
  placeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After the item exists (and, for the scan owner, the line points at it). */
  onChanged?: () => void;
};

/**
 * X07 "Add to catalog" for a menu line nobody has filed: a **draft card**,
 * never an automatic write (decision D25). It starts from what the menu
 * says — the line's words, cased, and the type the read detected — and the
 * person fills or confirms the rest. **Suggest details** is the text-only
 * pass (`suggestNewItemDetails`): it may decline, and what it offers comes
 * back as dashed "Suggested" chips under the fields, each applied only by a
 * tap. **Add to catalog** is the only write: an onboarding with nothing to
 * read (`openItemDraft`), confirmed with the card's values — then, for the
 * person who scanned the menu, the line is matched to the new item.
 */
export function MenuLineDraftSheet({
  line,
  placeId,
  open,
  onOpenChange,
  onChanged,
}: MenuLineDraftSheetProps) {
  const navigate = useNavigate();
  const client = useClient();
  const capabilities = useAiCapabilities();
  const [, suggestDetails] = useMutation(SuggestNewItemDetailsMutation);
  const [, openDraft] = useMutation(OpenItemDraftMutation);
  const [, verify] = useMutation(VerifyMenuLineMatchMutation);
  const [, saveDraft] = useMutation(SaveDraftMutation);
  const [savingLater, setSavingLater] = useState(false);

  const last = useRef<MenuItemView | null>(line);
  if (line !== null) last.current = line;
  const current = line ?? last.current;

  const [type, setType] = useState<ApiItemType | null>(
    current ? lineItemType(current) : null,
  );
  const [proposals, setProposals] = useState<readonly CorrectionProposal[]>([]);
  const [drafts, setDrafts] = useState<Readonly<Record<string, Draft>>>({});
  const [allDetails, setAllDetails] = useState(false);
  const [status, setStatus] = useState<SuggestStatus>({ state: "idle" });
  // One onboarding id per type: `openItemDraft` refuses an id opened as
  // another type, so switching type after a failed save starts a new one.
  const draftIds = useRef(new Map<ApiItemType, string>());
  const draftIdFor = (forType: ApiItemType): string => {
    const known = draftIds.current.get(forType);
    if (known !== undefined) return known;
    const minted = crypto.randomUUID();
    draftIds.current.set(forType, minted);
    return minted;
  };

  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    setError,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<ItemFormValues>({
    defaultValues: current ? startingValues(current) : undefined,
  });
  const watched = useWatch({ control });

  // Bumped whenever the card starts over (another line, another type): a
  // "Suggest details" answer that lands after that belongs to a card the
  // person is no longer looking at, and is dropped rather than shown here.
  const generation = useRef(0);

  // A fresh card each time it opens for a line.
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open || current === null) {
      if (!open) openedFor.current = null;
      return;
    }
    if (openedFor.current === current.id) return;
    openedFor.current = current.id;
    generation.current += 1;
    reset(startingValues(current));
    setType(lineItemType(current));
    setProposals([]);
    setDrafts({});
    setAllDetails(false);
    setStatus({ state: "idle" });
    draftIds.current = new Map();
  }, [open, current, reset]);

  if (current === null) return null;

  const valueAt = (path: string): string => {
    if (path.startsWith("attributes.")) {
      return watched.attributes?.[path.slice("attributes.".length)] ?? "";
    }
    const top = watched[path as "name" | "description" | "country"];
    return typeof top === "string" ? top : "";
  };

  const chooseType = (next: ApiItemType) => {
    if (next === type) return;
    generation.current += 1;
    // Another type's details do not carry over; the name and notes do.
    setValue("attributes", {});
    setProposals([]);
    setDrafts({});
    setStatus({ state: "idle" });
    setType(next);
  };

  const fields =
    type === null
      ? []
      : ITEM_FORM_RULES[type].attributes.map((field) =>
          field.kind === "date" ? { ...field, kind: "year" as const } : field,
        );
  const layout = type === null ? [] : formLayout(type, "create");
  const order = new Map(
    layout.map((entry, index) => [entryPath(entry), index]),
  );

  const suggest = async () => {
    if (type === null) return;
    const asked = generation.current;
    setStatus({ state: "working" });
    const values = getValues();
    const response = await suggestDetails({
      draftId: draftIdFor(type),
      type,
      input: {
        name: values.name,
        country: values.country === "" ? null : values.country,
        attributes: values.attributes,
      },
    });
    if (asked !== generation.current) return;
    const result = unwrapResult(
      response.data?.suggestNewItemDetails,
      "ItemDetailSuggestions",
    );
    if (!result.ok) {
      setStatus({
        state: "failed",
        outcome: correctionOutcome("suggested", result.error),
      });
      return;
    }
    if (result.data.abstained) {
      setProposals([]);
      setStatus({
        state: "done",
        message: correctionSummary({
          kind: "suggested",
          offered: 0,
          unusable: 0,
          abstained: true,
        }),
      });
      return;
    }
    const { proposals: found, unusable } = correctionProposals({
      defaults: defaultsObject(result.data.defaults),
      bagKey: ATTRIBUTE_INPUT_KEY[type],
      fields,
      current: {
        name: values.name,
        description: values.description,
        country: values.country,
        brandName: "",
        attributes: values.attributes,
      },
      source: "suggested",
      allowedValues: (field) =>
        field.kind === "static" ? staticOptionValues(field.options) : null,
      coerce: (field, value) =>
        field.nonVintage === true && isNonVintageText(value)
          ? NON_VINTAGE
          : field.kind === "year" && ISO_DAY.test(value.trim())
            ? value.trim().slice(0, 4)
            : value,
    });
    // The name is the menu's (and the person's); a suggestion never renames.
    const offered = found
      .filter(
        (proposal) => proposal.path !== "name" && order.has(proposal.path),
      )
      .sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0));
    setProposals(offered);
    setStatus({
      state: "done",
      message: correctionSummary({
        kind: "suggested",
        offered: offered.length,
        unusable: unusable.length,
      }),
    });
  };

  const applyProposal = (proposal: CorrectionProposal) => {
    setValue(proposal.path as FieldPath<ItemFormValues>, proposal.value, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setDrafts((all) => ({
      ...all,
      [proposal.path]: { value: proposal.value },
    }));
    setProposals((all) => all.filter((other) => other !== proposal));
  };

  const onSubmit: SubmitHandler<ItemFormValues> = async (values) => {
    if (type === null) {
      setError("root", {
        type: "custom",
        message: "Pick what kind of drink this is.",
      });
      return;
    }
    const blocker = saveBlocker(type, values);
    if (blocker !== null) {
      setError("root", { type: "custom", message: blocker });
      return;
    }
    const draftId = draftIdFor(type);
    const opened = unwrapResult(
      (await openDraft({ draftId, type })).data?.openItemDraft,
      "ItemOnboarding",
    );
    if (!opened.ok) {
      setError("root", { type: "custom", message: opened.error.message });
      return;
    }
    let itemId: string;
    try {
      itemId = await createOnboardedItem({
        urqlClient: client,
        type,
        onboardingId: draftId,
        values,
        brandName: "",
        barcode: "",
      });
    } catch (cause) {
      setError("root", {
        type: "custom",
        message:
          cause instanceof Error
            ? cause.message
            : "Something went wrong please try again...",
      });
      return;
    }
    const name = values.name.trim();
    const href = matchedItemHref({ id: itemId, type: type.toLowerCase() });
    let linked = false;
    if (current.can_correct_match) {
      const matched = unwrapResult(
        (
          await verify({
            placeId,
            menuItemId: current.id,
            match: {
              id: itemId,
              type: type.toLowerCase() as
                | "wine"
                | "beer"
                | "spirit"
                | "coffee"
                | "sake"
                | "tea",
            },
          })
        ).data?.verifyMenuItemMatch,
        "PlaceMenuItem",
      );
      linked = matched.ok;
    }
    onOpenChange(false);
    onChanged?.();
    notify(`Added ${name} to the catalog`, {
      tone: "success",
      description: linked
        ? "This menu line now points at it."
        : "Open it to log, save or rank it.",
      ...(href === null
        ? {}
        : { actionLabel: "Open", undo: () => navigate.push(href) }),
    });
  };

  /**
   * H-41 "Finish later" (MC-drafts, DECISIONS 34): the card is set aside as a
   * draft on the account — `openItemDraft`, then `saveDraft` with the card's
   * values, aimed at no cellar — whatever the floor says. It creates no item
   * and never matches the line; Needs details lists it until it's finished.
   */
  const finishLater = async () => {
    if (type === null) {
      setError("root", {
        type: "custom",
        message: "Pick what kind of drink this is.",
      });
      return;
    }
    setSavingLater(true);
    try {
      const draftId = draftIdFor(type);
      const opened = unwrapResult(
        (await openDraft({ draftId, type })).data?.openItemDraft,
        "ItemOnboarding",
      );
      if (!opened.ok) throw new Error(opened.error.message);
      // A chip the person tapped is a guess they chose: confirmed.
      const chosen = Object.keys(drafts);
      await saveOnboardingDraft({
        save: saveDraft,
        type,
        onboardingId: draftId,
        cellarId: null,
        values: getValues(),
        brandName: "",
        guessed: chosen,
        touched: new Set(chosen),
      });
    } catch (cause) {
      feedback("refuse");
      setError("root", {
        type: "custom",
        message:
          cause instanceof Error
            ? cause.message
            : "Something went wrong please try again...",
      });
      return;
    } finally {
      setSavingLater(false);
    }
    onOpenChange(false);
    notify("Saved · Needs details", {
      description: "Finish it from Needs details.",
      actionLabel: "Open",
      undo: () => navigate.push("/needs-details"),
    });
  };

  const busy = isSubmitting || savingLater;

  const toCheck = draftToCheck(layout, valueAt);
  /** "n to check": to the first open field, with the refuse haptic. */
  const goToCheck = () => {
    feedback("refuse");
    const first = toCheck[0];
    if (first === undefined) return;
    const field = document
      .getElementById(`menu-line-draft-${current.id}`)
      ?.querySelector<HTMLElement>(`[name="${CSS.escape(first)}"]`);
    field?.scrollIntoView({ block: "center" });
    field?.focus({ preventScroll: true });
  };

  const onInvalid = () => {
    feedback("refuse");
    setError("root", {
      type: "custom",
      message: "Fill in the starred fields first.",
    });
  };

  const shown =
    type === null
      ? []
      : draftEntries(
          layout,
          (path) =>
            proposals.some((proposal) => proposal.path === path) ||
            drafts[path] !== undefined ||
            valueAt(path).trim() !== "",
          allDetails,
        );
  const canSuggest =
    type !== null &&
    isOffered(capabilities, "detailSuggestions") &&
    valueAt("name").trim() !== "";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      dismissible={!busy}
      title="Add to catalog"
      description="From the menu line. Nothing is added until you tap Add."
      footer={
        <div className="flex w-full flex-col gap-2">
          {errors.root !== undefined && (
            <p role="alert" className="t-body text-danger">
              {errors.root.message}
            </p>
          )}
          {/* CROSS-LOT form-sheet footer: quiet "Finish later" left, the
              primary with its verb, "n to check" beside it. */}
          <div className="flex items-center gap-3" data-slot="draft-footer">
            <Button
              type="button"
              variant="quiet-muted"
              className="shrink-0"
              disabled={busy || type === null}
              aria-busy={savingLater || undefined}
              onClick={() => void finishLater()}
            >
              {savingLater && <Spinner aria-hidden />}
              Finish later
            </Button>
            {type !== null && toCheck.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                data-slot="to-check"
                silent
                onClick={goToCheck}
              >
                {toCheckLabel(toCheck.length)}
              </Button>
            )}
            <Button
              type="submit"
              form={`menu-line-draft-${current.id}`}
              className="min-w-0 flex-1"
              disabled={busy || type === null}
              aria-busy={isSubmitting || undefined}
            >
              {isSubmitting && <Spinner aria-hidden />}
              Add to catalog
            </Button>
          </div>
        </div>
      }
    >
      <form
        id={`menu-line-draft-${current.id}`}
        noValidate
        onSubmit={handleSubmit(onSubmit, onInvalid)}
        className="flex flex-col gap-5 pb-2"
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="t-micro mb-2 text-ink-2">What is it?</legend>
          <div className="flex flex-wrap gap-2">
            {ITEM_TYPES_IN_ORDER.map((option) => (
              <FilterChip
                key={option}
                selected={type === option}
                onClick={() => chooseType(option)}
              >
                <TypeGlyph type={option} />
                {itemTypeTokens[option].label}
              </FilterChip>
            ))}
          </div>
        </fieldset>

        {type !== null && (
          <>
            <div className="flex flex-col gap-4">
              {shown.map((entry) => {
                const path = entryPath(entry);
                const proposal = proposals.find((p) => p.path === path);
                const draft = drafts[path];
                return (
                  <AIDraftField
                    key={path}
                    source="suggested"
                    drafted={
                      draft !== undefined &&
                      isDrafted(draft.value, valueAt(path))
                    }
                    proposal={
                      proposal === undefined
                        ? undefined
                        : {
                            display: proposal.display,
                            label: entry.label,
                            onUse: () => applyProposal(proposal),
                            onDismiss: () =>
                              setProposals((all) =>
                                all.filter((other) => other !== proposal),
                              ),
                          }
                    }
                  >
                    <ItemFormField
                      entry={entry}
                      control={control}
                      disabled={isSubmitting}
                    />
                  </AIDraftField>
                );
              })}
            </div>
            {!allDetails && shown.length < layout.length && (
              <Button
                type="button"
                variant="quiet"
                className="self-start"
                onClick={() => setAllDetails(true)}
              >
                All details
              </Button>
            )}
            {canSuggest && (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={status.state === "working" || isSubmitting}
                  onClick={() => void suggest()}
                >
                  <AI aria-hidden />
                  Suggest details
                </Button>
                <div aria-live="polite" className="empty:hidden">
                  {status.state === "working" && (
                    <p className="t-body flex items-center gap-2 text-ink-2">
                      <Spinner aria-hidden />
                      Looking this up…
                    </p>
                  )}
                  {status.state === "done" && (
                    <p className="t-body text-ink-2">{status.message}</p>
                  )}
                  {status.state === "failed" && (
                    <AiStatus
                      outcome={status.outcome}
                      onRetry={() => void suggest()}
                    />
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </form>
    </ResponsiveDialog>
  );
}
