"use client";

/**
 * The New list and List details form (Social-Lists 25-27, 08): Kind as chips
 * (create only; a new list is how you start a kind you don't have yet, so
 * every kind is offered), Name ("Needs a name"), Description, Who can see it
 * (Only me / Friends / Everyone), and on create "From my ratings" (X16: on
 * by default, the server fills the list in the bands your ratings give). The
 * footer is the settled form-sheet footer: quiet Cancel left, the primary
 * right. Picking a kind names an unnamed list ("My beers") until you type a
 * name of your own.
 */

import { isNil, isNotNil } from "ramda";
import { useId, useMemo, useState } from "react";
import {
  Controller,
  type SubmitHandler,
  useForm,
  useWatch,
} from "react-hook-form";
import { useQuery } from "urql";
import { FilterChip } from "@/components/app/FilterChip";
import { FieldError, FormField } from "@/components/app/parts/Field";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  type Permission_Type_Enum,
  type TierListResult,
  useTierListActions,
} from "./actions";
import { fromRatingsLine, LIST_KINDS, PRIVACY_OPTIONS } from "./lists/model";
import { TierListTemplatesQuery } from "./queries";

interface IFormInput {
  name: string;
  description: string;
  privacy: Permission_Type_Enum;
  list_type: string;
}

export type TierListFormProps = {
  onSubmitted: (id: string) => void;
  /** The footer's quiet Cancel (a sheet closes, a page goes back). */
  onCancel?: () => void;
  id?: string;
  defaults?: {
    name?: string;
    description?: string;
    privacy?: Permission_Type_Enum;
    list_type?: string;
  };
};

/**
 * "My wines" — the name a list started from a type gets until you type one.
 * Exported for the test.
 */
export const defaultListName = (listType: string): string => {
  const label = listTypeOptions.find((option) => option.value === listType);
  return label === undefined ? "" : `My ${label.label.toLowerCase()}`;
};

/**
 * The most a list started from your ratings holds: the server's
 * `MAX_BATCH_ADD` (`@cellar-assistant/contracts`), which the client bundle
 * does not import. Past it, the best ones go on, and the form says so.
 */
export const TEMPLATE_CAP = 100;

/**
 * "12 wines you've rated", "1 place you've rated" — and past the cap, "Your
 * best 100 of the 140 wines you've rated", since only those go on.
 */
export const ratedSummary = (listType: string, count: number): string => {
  const label =
    listTypeOptions.find((option) => option.value === listType)?.label ??
    "entries";
  const noun =
    count === 1
      ? (SINGULAR[listType] ?? label.toLowerCase())
      : label.toLowerCase();
  return count > TEMPLATE_CAP
    ? `Your best ${TEMPLATE_CAP} of the ${count} ${noun} you've rated`
    : `${count} ${noun} you've rated`;
};

const SINGULAR: Record<string, string> = {
  place: "place",
  wine: "wine",
  beer: "beer",
  spirit: "spirit",
  coffee: "coffee",
  sake: "sake",
  tea: "tea",
};

const listTypeOptions = [
  { value: "place", label: "Places" },
  { value: "wine", label: "Wines" },
  { value: "beer", label: "Beers" },
  { value: "spirit", label: "Spirits" },
  { value: "coffee", label: "Coffees" },
  { value: "sake", label: "Sake" },
  { value: "tea", label: "Teas" },
];

export function TierListForm({
  id,
  onSubmitted,
  onCancel,
  defaults = {
    name: "",
    description: "",
    privacy: "PRIVATE" as Permission_Type_Enum,
    list_type: "place",
  },
}: TierListFormProps) {
  const {
    control,
    handleSubmit,
    setError,
    setValue,
    getFieldState,
    formState: { isSubmitting, errors },
  } = useForm<IFormInput>({
    defaultValues: {
      ...defaults,
      name: defaults.name || defaultListName(defaults.list_type ?? "place"),
    },
  });

  const isEditing = isNotNil(id);
  const fieldId = useId();
  const { addTierListAction, editTierListAction } = useTierListActions();

  // X16: what each type would start with, from your ratings.
  const [{ data: templateData }] = useQuery({
    query: TierListTemplatesQuery,
    pause: isEditing,
    // A rating made since the last visit changes the count (and whether the
    // switch is offered at all): show the cached answer, then the fresh one.
    requestPolicy: "cache-and-network",
  });
  const ratedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of templateData?.me?.tierListTemplates.edges ?? []) {
      counts.set(edge.node.listType, edge.node.ratedCount);
    }
    return counts;
  }, [templateData]);
  const listType = useWatch({ control, name: "list_type" });
  const ratedCount = ratedCounts.get(listType) ?? 0;
  const [fromRatings, setFromRatings] = useState(true);
  const startsFromRatings = !isEditing && fromRatings && ratedCount > 0;

  const onSubmit: SubmitHandler<IFormInput> = async ({
    name,
    description,
    privacy,
    list_type,
  }) => {
    let result: TierListResult;

    if (isNil(id)) {
      result = await addTierListAction(
        name,
        description || undefined,
        privacy,
        list_type,
        startsFromRatings ? "RATINGS" : "EMPTY",
      );
    } else {
      result = await editTierListAction(
        id,
        name,
        description || undefined,
        privacy,
      );
    }

    if (result.success && isNotNil(result.tierListId)) {
      onSubmitted(result.tierListId);
    } else {
      setError("root", {
        type: "custom",
        message: result.error ?? "Couldn’t save the list. Try again.",
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex w-full max-w-[600px] flex-col gap-5"
    >
      {!isEditing && (
        <div className="flex flex-col gap-2">
          <span id={`${fieldId}-kind`} className="t-head text-ink">
            Kind
          </span>
          <Controller
            name="list_type"
            control={control}
            render={({ field: { onChange, value } }) => (
              <fieldset
                aria-labelledby={`${fieldId}-kind`}
                className="-mx-4 m-0 flex min-w-0 gap-2 overflow-x-auto border-0 px-4 pt-0 pb-1 [scrollbar-width:none]"
              >
                {LIST_KINDS.map((kind) => (
                  <FilterChip
                    key={kind.value}
                    selected={value === kind.value}
                    disabled={isSubmitting}
                    onClick={() => {
                      if (value === kind.value) return;
                      onChange(kind.value);
                      // An unnamed list takes the kind's name until you type
                      // one; a name you typed is never replaced.
                      if (!getFieldState("name").isDirty) {
                        setValue("name", defaultListName(kind.value));
                      }
                    }}
                  >
                    {kind.label}
                  </FilterChip>
                ))}
              </fieldset>
            )}
          />
        </div>
      )}

      <Controller
        name="name"
        control={control}
        rules={{
          validate: (value) => value.trim() !== "" || "Needs a name",
        }}
        render={({ field, fieldState }) => (
          <FormField
            label="Name"
            htmlFor={`${fieldId}-name`}
            error={fieldState.error?.message}
          >
            <Input
              id={`${fieldId}-name`}
              type="text"
              autoComplete="off"
              aria-invalid={fieldState.invalid || undefined}
              disabled={isSubmitting}
              {...field}
            />
          </FormField>
        )}
      />

      <Controller
        name="description"
        control={control}
        render={({ field }) => (
          <FormField label="Description" htmlFor={`${fieldId}-description`}>
            <Input
              id={`${fieldId}-description`}
              type="text"
              autoComplete="off"
              disabled={isSubmitting}
              {...field}
            />
          </FormField>
        )}
      />

      <div className="flex flex-col gap-2">
        <span id={`${fieldId}-privacy`} className="t-head text-ink">
          Who can see it
        </span>
        <Controller
          name="privacy"
          control={control}
          render={({ field: { onChange, value } }) => (
            <SegmentedControl
              aria-label="Who can see it"
              options={PRIVACY_OPTIONS}
              value={value}
              onValueChange={onChange}
            />
          )}
        />
      </div>

      {!isEditing && ratedCount > 0 && (
        <label
          htmlFor={`${fieldId}-from-ratings`}
          className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-edge bg-card px-4 py-2"
        >
          <span className="flex min-w-0 flex-col">
            <span className="t-body text-ink">From my ratings</span>
            <span className="t-cap text-ink-2">
              {fromRatingsLine(listType, ratedCount)}
            </span>
          </span>
          <Switch
            id={`${fieldId}-from-ratings`}
            checked={fromRatings}
            onCheckedChange={setFromRatings}
            disabled={isSubmitting}
          />
        </label>
      )}

      {errors.root !== undefined && (
        <FieldError>{errors.root.message}</FieldError>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        {onCancel !== undefined ? (
          <Button
            type="button"
            variant="quiet-muted"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={isSubmitting} className="h-11 px-6">
          {isSubmitting && <Spinner aria-hidden />}
          {isEditing ? "Save" : "Create list"}
        </Button>
      </div>
    </form>
  );
}
