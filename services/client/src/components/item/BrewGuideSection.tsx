"use client";

import { useId, useState } from "react";
import { useMutation, useQuery } from "urql";
import {
  BrewGuideQuery,
  SetBrewPrefsMutation,
} from "@/components/make/brew-queries";
import { formatClock } from "@/components/make/timer";
import { useCountdown } from "@/components/make/useCountdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import type { ItemView } from "./adapter";
import {
  BREW_FACT_LABEL,
  type BrewGuide,
  type BrewNumbers,
  brewGuide,
  formatBrewFact,
  typicalBrew,
} from "./brew-table";

/**
 * ux-c L08 — "How to steep" (tea) / "How to brew" (coffee). A slot
 * (`ItemPageView` mounts it for those two types): it fetches its own data
 * and renders nothing until it has some (plan L38).
 *
 * The numbers are the fixed "typical" table (`brew-table.ts`, ruling L3 — no
 * AI numbers), overridden one by one by the viewer's own (`myBrewPrefs`,
 * kept by their UserActor). A style with no row shows no guide until the
 * user enters their own, so the section is then just "Add your own".
 */
export function BrewGuideSection({ item }: { item: ItemView }) {
  const [{ data }] = useQuery({
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
    />
  );
}

const verb = (type: string) => (type === "COFFEE" ? "brew" : "steep");

const FIELDS = [
  ["waterTempC", "Water °C", 1],
  ["steepSeconds", "Time, seconds", 1],
  ["doseGrams", "Dose, g", 0.1],
  ["waterMl", "Water, ml", 1],
] as const;

/** The section itself, from props: `slots.test.tsx` renders it directly. */
export function BrewGuideView({
  itemType,
  itemId,
  guide,
  prefs,
}: {
  itemType: string;
  itemId: string;
  guide: BrewGuide | null;
  prefs: BrewNumbers | null;
}) {
  const [editing, setEditing] = useState(false);
  const title = `How to ${verb(itemType)}`;
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="type-title-2 text-ink-1">{title}</h2>
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11"
            onClick={() => setEditing(true)}
          >
            {guide === null ? "Add your own" : "Edit"}
          </Button>
        )}
      </div>
      {editing ? (
        <BrewPrefsForm
          itemType={itemType}
          itemId={itemId}
          prefs={prefs}
          onDone={() => setEditing(false)}
        />
      ) : guide === null ? (
        <p className="type-callout text-ink-3">
          No typical numbers for this one. Add your own and they&rsquo;ll be
          here next time.
        </p>
      ) : (
        <GuideCard guide={guide} itemType={itemType} />
      )}
    </section>
  );
}

function GuideCard({
  guide,
  itemType,
}: {
  guide: BrewGuide;
  itemType: string;
}) {
  const yours = guide.facts.some((fact) => fact.source === "yours");
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-surface-1 p-4">
      <dl className="grid grid-cols-3 gap-3">
        {guide.facts.map((fact) => (
          // A <dl> group holds only <dt> then <dd>s (axe definition-list):
          // the term leads in the markup, and `order` puts the number on top.
          <div key={fact.key} className="flex flex-col">
            <dt className="type-footnote order-2 text-ink-2">
              {BREW_FACT_LABEL[fact.key]}
            </dt>
            <dd className="order-1 font-display text-[28px] text-ink-1 tabular-nums leading-9">
              {formatBrewFact(fact)}
            </dd>
            <dd
              className={cn(
                "type-footnote order-3",
                fact.source === "yours" ? "text-brass" : "text-ink-3",
              )}
            >
              {fact.source}
            </dd>
          </div>
        ))}
      </dl>
      {guide.typicalFor !== null && (
        <p className="type-footnote text-ink-3">
          Typical for {guide.typicalFor}
          {yours ? "; your own numbers are saved for this one." : "."}
          {guide.resteepLine === null ? null : ` ${guide.resteepLine}`}
        </p>
      )}
      {guide.steepSeconds !== null && (
        <SteepTimer seconds={guide.steepSeconds} itemType={itemType} />
      )}
    </div>
  );
}

function SteepTimer({
  seconds,
  itemType,
}: {
  seconds: number;
  itemType: string;
}) {
  const timer = useCountdown(seconds * 1000);
  const clock = formatClock(timer.remainingMs);
  const start = itemType === "COFFEE" ? "Start brew" : "Start first steep";
  const label =
    timer.status === "idle"
      ? `${start} · ${clock}`
      : timer.status === "running"
        ? `${clock} left · Stop`
        : timer.status === "paused"
          ? `${clock} left · Resume`
          : "Done · Start again";
  return (
    <Button
      size="lg"
      aria-live="polite"
      onClick={timer.toggle}
      className="w-full rounded-full bg-brass text-on-brass tabular-nums"
    >
      {label}
    </Button>
  );
}

function BrewPrefsForm({
  itemType,
  itemId,
  prefs,
  onDone,
}: {
  itemType: string;
  itemId: string;
  prefs: BrewNumbers | null;
  onDone: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      FIELDS.map(([key]) => [key, prefs?.[key]?.toString() ?? ""]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [state, save] = useMutation(SetBrewPrefsMutation);
  const formId = useId();
  const num = (key: string, int: boolean): number | null => {
    const raw = (values[key] ?? "").trim();
    if (raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return int ? Math.round(n) : n;
  };
  const submit = async (clear: boolean) => {
    setError(null);
    const result = unwrapResult(
      (
        await save({
          itemType: itemType as "TEA" | "COFFEE",
          itemId,
          waterTempC: clear ? null : num("waterTempC", true),
          steepSeconds: clear ? null : num("steepSeconds", true),
          doseGrams: clear ? null : num("doseGrams", false),
          waterMl: clear ? null : num("waterMl", false),
        })
      ).data?.setBrewPrefs,
      "SetBrewPrefsPayload",
    );
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onDone();
  };
  return (
    <form
      className="flex flex-col gap-3 rounded-xl bg-surface-1 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
    >
      <p className="type-footnote text-ink-3">
        Leave a box empty to keep the typical number.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(([key, label, step]) => (
          <div key={key} className="flex flex-col gap-1">
            <label
              htmlFor={`${formId}-${key}`}
              className="type-footnote text-ink-2"
            >
              {label}
            </label>
            <Input
              id={`${formId}-${key}`}
              inputMode="decimal"
              type="number"
              min={0}
              step={step}
              value={values[key] ?? ""}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
            />
          </div>
        ))}
      </div>
      {error !== null && (
        <p role="alert" className="type-footnote text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={state.fetching}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {prefs !== null && (
          <Button
            type="button"
            variant="ghost"
            disabled={state.fetching}
            onClick={() => void submit(true)}
          >
            Back to typical
          </Button>
        )}
      </div>
    </form>
  );
}
