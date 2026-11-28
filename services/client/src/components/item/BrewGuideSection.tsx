"use client";

import { useId, useState } from "react";
import { useMutation, useQuery } from "urql";
import { notify } from "@/components/app/notify";
import { FormField, NumberField } from "@/components/app/parts/Field";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import {
  BrewGuideQuery,
  SetBrewPrefsMutation,
} from "@/components/make/brew-queries";
import { formatClock } from "@/components/make/timer";
import { useCountdown } from "@/components/make/useCountdown";
import { Button } from "@/components/ui/button";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import type { ItemView } from "./adapter";
import {
  BREW_FIELD_UNIT,
  type BrewFactKey,
  type BrewGuide,
  type BrewNumbers,
  brewFactLabel,
  brewGuide,
  brewPrefsVariables,
  formatBrewFact,
  parseBrewField,
  typicalBrew,
} from "./brew-table";

/**
 * "How to brew" (coffee) / "How to steep" (tea) on the item page
 * (Recipes-Make board; ux-c L08). A slot (C2's `ItemPageView` mounts it for
 * those two types): it fetches its own data and renders nothing until it has
 * some (plan L38).
 *
 * The numbers are the fixed "typical" table (`brew-table.ts`, ruling L3 — no
 * AI numbers), overridden one by one by the viewer's own (`myBrewPrefs`,
 * kept by their UserActor). A style with no row shows no guide until the
 * user enters their own.
 */
export function BrewGuideSection({ item }: { item: ItemView }) {
  const [{ data }, reexecute] = useQuery({
    query: BrewGuideQuery,
    variables: { id: item.itemId, type: item.type },
  });
  const result = unwrapResult(data?.item, "QueryItemSuccess");
  if (!result.ok) return null;
  const node = result.data.data;
  const style = {
    category: "category" in node ? node.category : null,
    form: "form" in node ? node.form : null,
    roastLevel: "roastLevel" in node ? node.roastLevel : null,
  };
  const prefs = node.myBrewPrefs ?? null;
  return (
    <BrewGuideView
      itemType={item.type}
      itemId={item.itemId}
      guide={brewGuide(typicalBrew(item.type, style), prefs)}
      prefs={prefs}
      onSaved={() => reexecute({ requestPolicy: "network-only" })}
    />
  );
}

const verb = (type: string) => (type === "COFFEE" ? "brew" : "steep");
const noun = (type: string) => (type === "COFFEE" ? "coffee" : "tea");

const FIELD_ORDER: readonly BrewFactKey[] = [
  "waterTempC",
  "steepSeconds",
  "doseGrams",
  "waterMl",
];

const NO_PREFS: BrewNumbers = {
  waterTempC: null,
  steepSeconds: null,
  doseGrams: null,
  waterMl: null,
};

/** A field's starting text: the number as it was saved, time as m:ss. */
const fieldText = (key: BrewFactKey, value: number | null | undefined) =>
  value == null
    ? ""
    : key === "steepSeconds"
      ? formatBrewFact({ key, value })
      : String(value);

/** The section itself, from props: `BrewGuideSection.test.tsx` renders it. */
export function BrewGuideView({
  itemType,
  itemId,
  guide,
  prefs,
  onSaved,
}: {
  itemType: string;
  itemId: string;
  guide: BrewGuide | null;
  prefs: BrewNumbers | null;
  /** After a save or its Undo: read the numbers again. */
  onSaved?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [, save] = useMutation(SetBrewPrefsMutation);
  const title = `How to ${verb(itemType)}`;
  const hasPrefs =
    prefs !== null && FIELD_ORDER.some((key) => prefs[key] != null);

  /** The one write; `false` when it was refused. */
  const write = async (numbers: BrewNumbers): Promise<boolean> => {
    const variables = brewPrefsVariables(itemType, itemId, numbers);
    if (variables === null) return false;
    const result = unwrapResult(
      (await save(variables)).data?.setBrewPrefs,
      "SetBrewPrefsPayload",
    );
    if (!result.ok) return false;
    onSaved?.();
    return true;
  };

  /** Save with Undo back to what was there before. */
  const commit = async (
    numbers: BrewNumbers,
    message: string,
  ): Promise<boolean> => {
    const before = prefs ?? NO_PREFS;
    const ok = await write(numbers);
    if (!ok) return false;
    notify(message, {
      undo: () =>
        void write(before).then((undone) => {
          if (!undone) notify("Couldn't undo that", { tone: "error" });
        }),
    });
    return true;
  };

  return (
    <section
      aria-label={title}
      data-slot="brew-guide"
      className="flex flex-col gap-4 rounded-md border border-edge bg-card p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="t-head m-0 text-ink">{title}</h2>
        <Button
          variant="quiet"
          className="-mr-2.5 min-h-11"
          onClick={() => setEditing(true)}
        >
          {hasPrefs ? "Edit" : "Add yours"}
        </Button>
      </div>
      {guide === null ? (
        <p className="t-body m-0 text-ink-2">
          No typical numbers for this {noun(itemType)}
        </p>
      ) : (
        <GuideBody guide={guide} itemType={itemType} />
      )}
      <ResponsiveDialog
        open={editing}
        onOpenChange={setEditing}
        title="Your numbers"
      >
        <BrewPrefsForm
          itemType={itemType}
          prefs={prefs}
          hasPrefs={hasPrefs}
          onCancel={() => setEditing(false)}
          onSave={async (numbers) => {
            const ok = await commit(numbers, "Saved your numbers");
            if (ok) setEditing(false);
            return ok;
          }}
          onTypical={async () => {
            const ok = await commit(NO_PREFS, "Back to typical");
            if (ok) setEditing(false);
            return ok;
          }}
        />
      </ResponsiveDialog>
    </section>
  );
}

function GuideBody({
  guide,
  itemType,
}: {
  guide: BrewGuide;
  itemType: string;
}) {
  return (
    <>
      <dl className="m-0 grid grid-cols-2 gap-2">
        {guide.facts.map((fact) => (
          // A <dl> group holds only <dt> then <dd>s (axe definition-list).
          <div
            key={fact.key}
            className="relative flex min-h-[68px] flex-col justify-between gap-1 rounded-md bg-raised px-3 py-2.5"
          >
            <dt className="t-cap pr-14 text-ink-2">
              {brewFactLabel(fact.key, itemType)}
            </dt>
            <dd className="t-title m-0 text-ink tabular-nums">
              {formatBrewFact(fact)}
            </dd>
            {fact.source === "yours" && (
              <dd className="t-micro absolute top-2 right-2 m-0 rounded-sm bg-sel px-1.5 py-0.5 text-ink">
                Yours
              </dd>
            )}
          </div>
        ))}
      </dl>
      {guide.typicalFor !== null && (
        <p className="t-cap m-0 text-ink-2">
          Typical for {guide.typicalFor}
          {guide.resteepLine === null ? null : `. ${guide.resteepLine}`}
        </p>
      )}
      {guide.steepSeconds !== null && (
        <BrewTimer seconds={guide.steepSeconds} itemType={itemType} />
      )}
    </>
  );
}

function BrewTimer({
  seconds,
  itemType,
}: {
  seconds: number;
  itemType: string;
}) {
  const timer = useCountdown(seconds * 1000);
  const label =
    timer.status === "idle"
      ? itemType === "COFFEE"
        ? "Start brew"
        : "Start steep"
      : timer.status === "running"
        ? "Pause"
        : timer.status === "paused"
          ? "Resume"
          : "Again";
  return (
    <div className="flex items-center justify-between gap-3 border-rule border-t pt-4">
      <span
        role="timer"
        aria-live={timer.status === "running" ? "off" : "polite"}
        className="t-title text-ink tabular-nums"
      >
        {timer.status === "done" ? "Done" : formatClock(timer.remainingMs)}
      </span>
      <Button
        variant="outline"
        className="min-w-32"
        onClick={() => {
          if (timer.status === "done") timer.reset();
          else timer.toggle();
        }}
      >
        {label}
      </Button>
    </div>
  );
}

function BrewPrefsForm({
  itemType,
  prefs,
  hasPrefs,
  onCancel,
  onSave,
  onTypical,
}: {
  itemType: string;
  prefs: BrewNumbers | null;
  hasPrefs: boolean;
  onCancel: () => void;
  onSave: (numbers: BrewNumbers) => Promise<boolean>;
  onTypical: () => Promise<boolean>;
}) {
  const [values, setValues] = useState<Record<BrewFactKey, string>>(() => ({
    waterTempC: fieldText("waterTempC", prefs?.waterTempC),
    steepSeconds: fieldText("steepSeconds", prefs?.steepSeconds),
    doseGrams: fieldText("doseGrams", prefs?.doseGrams),
    waterMl: fieldText("waterMl", prefs?.waterMl),
  }));
  const [errors, setErrors] = useState<Partial<Record<BrewFactKey, string>>>(
    {},
  );
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const formId = useId();

  const submit = async () => {
    const parsed = FIELD_ORDER.map(
      (key) => [key, parseBrewField(key, values[key])] as const,
    );
    const nextErrors: Partial<Record<BrewFactKey, string>> = {};
    for (const [key, result] of parsed) {
      if (!result.ok) nextErrors[key] = result.reason;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      feedback("refuse");
      return;
    }
    const numbers = Object.fromEntries(
      parsed.map(([key, result]) => [key, result.ok ? result.value : null]),
    ) as unknown as BrewNumbers;
    setBusy(true);
    setFailed(false);
    const ok = await onSave(numbers);
    setBusy(false);
    if (!ok) {
      feedback("refuse");
      setFailed(true);
    }
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        {FIELD_ORDER.map((key) => (
          <FormField
            key={key}
            label={brewFactLabel(key, itemType)}
            htmlFor={`${formId}-${key}`}
            error={errors[key]}
          >
            <NumberField
              id={`${formId}-${key}`}
              unit={BREW_FIELD_UNIT[key]}
              inputMode={key === "steepSeconds" ? "text" : "decimal"}
              invalid={errors[key] !== undefined}
              value={values[key]}
              onChange={(event) => {
                const text = event.target.value;
                setValues((current) => ({ ...current, [key]: text }));
              }}
            />
          </FormField>
        ))}
      </div>
      <p className="t-cap m-0 text-ink-2">Empty keeps the typical number</p>
      {failed && (
        <p role="alert" className="t-cap m-0 text-danger">
          Couldn&rsquo;t save. Try again.
        </p>
      )}
      {hasPrefs && (
        <Button
          type="button"
          variant="quiet-muted"
          className="self-start"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onTypical().then((ok) => {
              setBusy(false);
              if (!ok) setFailed(true);
            });
          }}
        >
          Back to typical
        </Button>
      )}
      <div className="flex items-center gap-3">
        <Button type="button" variant="quiet-muted" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}
