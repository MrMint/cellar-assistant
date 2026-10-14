"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useMutation } from "urql";
import { ActionBar } from "@/components/app/ActionBar";
import { AIDraftField } from "@/components/app/AIDraftField";
import { AppBar } from "@/components/app/AppBar";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { IconButton } from "@/components/app/IconButton";
import { Add, AI, Check, Close, Delete } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { Page } from "@/components/app/Page";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { ApiError } from "@/components/cellar-api/ApiError";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  type ApiFailure,
  failureFromTransport,
  unwrapResult,
} from "@/lib/api/result";
import { cn } from "@/lib/utils";
import {
  CreateRecipeMutation,
  DeleteRecipeMutation,
  SetRecipeIngredientsMutation,
  SetRecipeInstructionsMutation,
  UpdateRecipeMutation,
} from "./documents";
import {
  confirmAllMatches,
  confirmMatch,
  createFields,
  type DraftIngredient,
  emptyIngredient,
  emptyStep,
  formProblems,
  ingredientInputs,
  PRIVACY_COPY,
  pendingMatches,
  RECIPE_PRIVACIES,
  type RecipeForm,
  type RecipePrivacy,
  recipeFields,
  rejectMatch,
  stepInputs,
  widenAfterCreate,
} from "./recipe-draft";

export type RecipeEditorProps =
  | { readonly mode: "new"; readonly initial: RecipeForm }
  | {
      readonly mode: "edit";
      readonly recipeId: string;
      readonly isDraft: boolean;
      readonly initial: RecipeForm;
    };

type SaveFailure = { readonly step: string; readonly failure: ApiFailure };

const TYPE_OPTIONS = [
  { value: "cocktail", label: "Drink" },
  { value: "food", label: "Food" },
] as const;

/**
 * The recipe editor (X15): New (Type), a draft the AI read off a photo or out
 * of pasted text, and editing your own recipe — one form.
 *
 * - **A draft's ingredient matches are proposals.** Each line the search
 *   matched to a catalog item carries the AI mark and two buttons, Keep and
 *   Not this; Save waits until none is left (`pendingMatches`). "Keep all" is
 *   one explicit tap for the lot. Nothing the model chose is published by
 *   the model (D6, D22).
 * - **Private first.** A new recipe starts Private; the control says who
 *   sees it in a sentence, and only Public has a share link.
 * - Saving is three writes in order — the recipe, its ingredients, its
 *   method — and a draft is published by the *last* one, so a save that
 *   fails half-way leaves a draft, never a half-written public recipe.
 */
export function RecipeEditor(props: RecipeEditorProps) {
  const router = useRouter();
  const [form, setForm] = useState<RecipeForm>(props.initial);
  const [recipeId, setRecipeId] = useState<string | null>(
    props.mode === "edit" ? props.recipeId : null,
  );
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<ApiFailure | null>(null);

  const [, createRecipe] = useMutation(CreateRecipeMutation);
  const [, updateRecipe] = useMutation(UpdateRecipeMutation);
  const [, setIngredients] = useMutation(SetRecipeIngredientsMutation);
  const [, setInstructions] = useMutation(SetRecipeInstructionsMutation);
  const [, deleteRecipe] = useMutation(DeleteRecipeMutation);

  const nameId = useId();
  const notesId = useId();
  const isDraft = props.mode === "edit" && props.isDraft;
  const problems = formProblems(form);
  const pending = pendingMatches(form);
  const shownProblems = attempted ? problems : [];

  const updateLine = (
    key: string,
    next: (line: DraftIngredient) => DraftIngredient,
  ) =>
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((line) =>
        line.key === key ? next(line) : line,
      ),
    }));

  const title =
    props.mode === "new"
      ? "New recipe"
      : isDraft
        ? "Review draft"
        : "Edit recipe";

  // A second submit (a double tap, Return in a field) while one is in
  // flight would create a second recipe: `createRecipe` mints its own id.
  const inFlight = useRef(false);
  const save = async () => {
    setAttempted(true);
    if (problems.length > 0 || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setFailure(null);
    try {
      let id = recipeId;
      const fields = recipeFields(form);
      // A new recipe is written Private and shared last (`createFields`), so
      // a later write that fails never leaves a half-written shared recipe —
      // on a retry too, since the row this editor created is still Private
      // until the final write lands.
      const shareLast = props.mode === "new" && widenAfterCreate(form);
      if (id === null) {
        const created = unwrapResult(
          (await createRecipe({ input: createFields(form) })).data
            ?.createRecipe,
          "Recipe",
        );
        if (!created.ok) {
          setFailure({ step: "save the recipe", failure: created.error });
          return;
        }
        id = created.data.id;
        // A retry after a later step fails edits this recipe, never a second.
        setRecipeId(id);
      } else if (!isDraft) {
        const updated = unwrapResult(
          (
            await updateRecipe({
              recipeId: id,
              input: props.mode === "new" ? createFields(form) : fields,
            })
          ).data?.updateRecipe,
          "Recipe",
        );
        if (!updated.ok) {
          setFailure({ step: "save the recipe", failure: updated.error });
          return;
        }
      }

      const lines = unwrapResult(
        (
          await setIngredients({
            recipeId: id,
            ingredients: ingredientInputs(form),
          })
        ).data?.setRecipeIngredients,
        "RecipeIngredientsPayload",
      );
      if (!lines.ok) {
        setFailure({ step: "save the ingredients", failure: lines.error });
        return;
      }
      const steps = unwrapResult(
        (
          await setInstructions({
            recipeId: id,
            instructions: stepInputs(form),
          })
        ).data?.setRecipeInstructions,
        "RecipeInstructionsPayload",
      );
      if (!steps.ok) {
        setFailure({ step: "save the method", failure: steps.error });
        return;
      }

      if (isDraft || shareLast) {
        // Last: publishing a draft, or sharing a new recipe, is what makes it
        // more than its author's.
        const published = unwrapResult(
          (
            await updateRecipe({
              recipeId: id,
              input: isDraft
                ? { ...fields, isDraft: false }
                : { privacy: form.privacy },
            })
          ).data?.updateRecipe,
          "Recipe",
        );
        if (!published.ok) {
          setFailure({ step: "save the recipe", failure: published.error });
          return;
        }
      }

      notify(
        form.privacy === "PRIVATE" ? "Saved. Only you can see it." : "Saved.",
        { tone: "success" },
      );
      router.replace(`/recipes/${id}`);
      router.refresh();
    } catch (thrown) {
      setFailure({
        step: "save",
        failure: failureFromTransport({
          message: thrown instanceof Error ? thrown.message : String(thrown),
        }),
      });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const remove = async () => {
    if (recipeId === null) return;
    setDeleting(true);
    setDeleteFailure(null);
    const result = unwrapResult(
      (await deleteRecipe({ recipeId })).data?.deleteRecipe,
      "DeletedRecipe",
    );
    setDeleting(false);
    if (!result.ok) {
      setDeleteFailure(result.error);
      return;
    }
    setConfirmingDelete(false);
    notify(isDraft ? "Draft discarded." : "Recipe deleted.");
    router.replace("/recipes");
    router.refresh();
  };

  return (
    <Page withActionBar>
      <AppBar
        title={title}
        parent={recipeId === null ? "/recipes" : `/recipes/${recipeId}`}
        overflow={
          props.mode === "edit"
            ? [
                {
                  label: isDraft ? "Discard draft" : "Delete recipe",
                  onSelect: () => setConfirmingDelete(true),
                  destructive: true,
                },
              ]
            : undefined
        }
      />

      {isDraft && (
        <AIDraftField source="suggested" drafted>
          <p className="pr-24 type-callout text-ink-2">
            The AI read this. Check it over, then save. Nothing is shared until
            you do.
          </p>
        </AIDraftField>
      )}

      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field
          data-invalid={
            shownProblems.some((p) => p.field === "name") || undefined
          }
        >
          <FieldLabel htmlFor={nameId}>Name</FieldLabel>
          <Input
            id={nameId}
            value={form.name}
            autoComplete="off"
            enterKeyHint="next"
            placeholder="Negroni"
            aria-invalid={
              shownProblems.some((p) => p.field === "name") || undefined
            }
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
          />
        </Field>

        <SegmentedControl
          aria-label="What it makes"
          value={form.type}
          onValueChange={(type) => setForm((current) => ({ ...current, type }))}
          options={TYPE_OPTIONS}
        />

        <section
          className="flex flex-col gap-3"
          aria-labelledby={`${nameId}-ingredients`}
        >
          <div className="flex items-end justify-between gap-2 px-1">
            <h2 id={`${nameId}-ingredients`} className="type-headline">
              Ingredients
            </h2>
            {pending > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setForm(confirmAllMatches)}
              >
                <Check aria-hidden />
                Keep all {pending}
              </Button>
            )}
          </div>
          <ul className="flex flex-col gap-3">
            {form.ingredients.map((line, index) => (
              <IngredientRow
                key={line.key}
                line={line}
                position={index + 1}
                onChange={(next) => updateLine(line.key, () => next)}
                onRemove={() =>
                  setForm((current) => ({
                    ...current,
                    ingredients:
                      current.ingredients.length === 1
                        ? [emptyIngredient()]
                        : current.ingredients.filter(
                            (row) => row.key !== line.key,
                          ),
                  }))
                }
              />
            ))}
          </ul>
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() =>
              setForm((current) => ({
                ...current,
                ingredients: [...current.ingredients, emptyIngredient()],
              }))
            }
          >
            <Add aria-hidden />
            Add ingredient
          </Button>
        </section>

        <section
          className="flex flex-col gap-3"
          aria-labelledby={`${nameId}-method`}
        >
          <h2 id={`${nameId}-method`} className="px-1 type-headline">
            Method
          </h2>
          <ol className="flex flex-col gap-3">
            {form.steps.map((step, index) => (
              <li key={step.key} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="tabular mt-2.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-3 font-semibold text-ink-1 text-xs"
                >
                  {index + 1}
                </span>
                <Textarea
                  aria-label={`Step ${index + 1}`}
                  value={step.text}
                  rows={2}
                  className="min-h-11 flex-1"
                  placeholder={index === 0 ? "Stir with ice, then strain." : ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      steps: current.steps.map((row) =>
                        row.key === step.key
                          ? { ...row, text: event.target.value }
                          : row,
                      ),
                    }))
                  }
                />
                <IconButton
                  type="button"
                  variant="ghost"
                  aria-label={`Remove step ${index + 1}`}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      steps:
                        current.steps.length === 1
                          ? [emptyStep()]
                          : current.steps.filter((row) => row.key !== step.key),
                    }))
                  }
                >
                  <Delete aria-hidden />
                </IconButton>
              </li>
            ))}
          </ol>
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() =>
              setForm((current) => ({
                ...current,
                steps: [...current.steps, emptyStep()],
              }))
            }
          >
            <Add aria-hidden />
            Add step
          </Button>
        </section>

        <Field>
          <FieldLabel htmlFor={notesId}>Notes</FieldLabel>
          <Textarea
            id={notesId}
            value={form.description}
            rows={2}
            placeholder="Where it's from, how you like it"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </Field>

        <Field>
          <FieldLabel id={`${nameId}-privacy`}>Who can see it</FieldLabel>
          <SegmentedControl<RecipePrivacy>
            aria-label="Who can see it"
            value={form.privacy}
            onValueChange={(privacy) =>
              setForm((current) => ({ ...current, privacy }))
            }
            options={RECIPE_PRIVACIES.map((value) => ({
              value,
              label: PRIVACY_COPY[value].label,
            }))}
          />
          <FieldDescription>{PRIVACY_COPY[form.privacy].line}</FieldDescription>
        </Field>

        {shownProblems.length > 0 && (
          <ul
            aria-live="polite"
            className="flex flex-col gap-1 type-callout text-destructive"
          >
            {shownProblems.map((problem) => (
              <li key={problem.message}>{problem.message}</li>
            ))}
          </ul>
        )}
        {failure !== null && (
          <ApiError
            title={`Couldn't ${failure.step}`}
            error={failure.failure}
          />
        )}

        <ActionBar>
          <Button
            type="submit"
            disabled={saving}
            aria-busy={saving || undefined}
          >
            {saving && <Spinner aria-hidden />}
            {isDraft
              ? "Save recipe"
              : props.mode === "new"
                ? "Save recipe"
                : "Save changes"}
          </Button>
        </ActionBar>
      </form>

      <ConfirmSheet
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={isDraft ? "Discard this draft?" : "Delete this recipe?"}
        description={
          isDraft
            ? "What the AI read is thrown away."
            : "Its reviews, votes and Loves go with it."
        }
        confirmLabel={isDraft ? "Discard" : "Delete"}
        pending={deleting}
        onConfirm={() => void remove()}
      >
        {deleteFailure !== null && (
          <ApiError title="Couldn't delete" error={deleteFailure} />
        )}
      </ConfirmSheet>
    </Page>
  );
}

/**
 * One ingredient: the amount, then what it is. A line the search matched to
 * a catalog item shows the item, and while it is the AI's suggestion it
 * wears the AI mark with Keep / Not this. A kept match can still be unlinked.
 */
function IngredientRow({
  line,
  position,
  onChange,
  onRemove,
}: {
  line: DraftIngredient;
  position: number;
  onChange: (next: DraftIngredient) => void;
  onRemove: () => void;
}) {
  const label = line.name.trim() === "" ? `ingredient ${position}` : line.name;
  const suggested = line.match?.state === "suggested";
  return (
    <li className="flex flex-col gap-2 rounded-lg bg-surface-1 p-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Amount of ${label}`}
          value={line.amount}
          placeholder="1 oz"
          className="w-24 shrink-0"
          onChange={(event) =>
            onChange({ ...line, amount: event.target.value })
          }
        />
        {line.match === null ? (
          <Input
            aria-label={`Ingredient ${position}`}
            value={line.name}
            placeholder="Gin"
            className="min-w-0 flex-1"
            onChange={(event) =>
              onChange({ ...line, name: event.target.value })
            }
          />
        ) : (
          <p className="min-w-0 flex-1 truncate px-1 type-body">
            {line.match.label}
          </p>
        )}
        <IconButton
          type="button"
          variant="ghost"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          <Delete aria-hidden />
        </IconButton>
      </div>
      {line.match !== null && (
        <AIDraftField source="suggested" drafted={suggested}>
          <div
            className={cn(
              "flex flex-wrap items-center gap-2",
              suggested && "pr-24",
            )}
          >
            <p className="min-w-0 flex-1 type-footnote">
              {suggested ? (
                <>
                  <AI aria-hidden className="mr-1 inline size-3.5 text-ai" />
                  Matched to a bottle in the catalog
                </>
              ) : (
                "Linked to this bottle"
              )}
            </p>
          </div>
          <div className="mt-1 flex gap-2">
            {suggested && (
              <Button
                type="button"
                variant="secondary"
                aria-label={`Keep ${line.match.label}`}
                onClick={() => onChange(confirmMatch(line))}
              >
                <Check aria-hidden />
                Keep
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              aria-label={
                suggested
                  ? `Not ${line.match.label}`
                  : `Unlink ${line.match.label}`
              }
              onClick={() => onChange(rejectMatch(line))}
            >
              <Close aria-hidden />
              {suggested ? "Not this" : "Unlink"}
            </Button>
          </div>
        </AIDraftField>
      )}
    </li>
  );
}
