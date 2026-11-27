"use client";

import { useMemo, useState, useTransition } from "react";
import { useMutation, useQuery } from "urql";
import { BottomSheet } from "@/components/app/BottomSheet";
import { InsetSection, ListRow } from "@/components/app/Page";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  thisContainerLabel,
  typeWords,
} from "@/components/drink-log/type-words";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BottleFreshnessFragment,
  BottleFreshnessQuery,
  UpdateCellarItemMutation,
} from "@/lib/api/cellars";
import { type ResultOf, readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import {
  draftOf,
  type FreshnessBottle,
  type FreshnessDraft,
  type FreshnessItem,
  type FreshnessModel,
  type FreshnessStatus,
  freshnessModel,
  freshnessPatch,
  localDay,
} from "./freshness";

type Data = ResultOf<typeof BottleFreshnessQuery>;
type BottleItem = NonNullable<
  Extract<NonNullable<Data["cellar"]>, { __typename: "Cellar" }>["item"]
>["item"];

const FOOTNOTE =
  "Everything here is optional. Dates and price are yours and stay private.";

/** The item's keys into the shelf-life table (D29), per type. */
export const freshnessItemOf = (item: BottleItem): FreshnessItem | null => {
  if (item === null || item === undefined) return null;
  const type = item.type as ApiItemType;
  switch (item.__typename) {
    case "Wine":
      return {
        type,
        style: item.wineStyle ?? null,
        form: null,
        vintageYear:
          item.vintage === null || item.vintage === undefined
            ? null
            : Number(String(item.vintage).slice(0, 4)),
      };
    case "Beer":
      return {
        type,
        style: item.beerStyle ?? null,
        form: null,
        vintageYear: null,
      };
    case "Spirit":
      return {
        type,
        style: item.spiritType ?? null,
        form: null,
        vintageYear: null,
      };
    case "Sake":
      return {
        type,
        style: item.category ?? null,
        form: null,
        vintageYear: item.vintageYear ?? null,
      };
    case "Tea":
      return {
        type,
        style: item.teaCategory ?? null,
        form: item.form ?? null,
        vintageYear: null,
      };
    default:
      return { type, style: null, form: null, vintageYear: null };
  }
};

const TONE: Record<FreshnessStatus["tone"], string> = {
  good: "bg-success/15 text-success",
  soon: "bg-brass/15 text-brass",
  wait: "bg-surface-3 text-ink-2",
  past: "bg-danger/10 text-danger",
};

/** The board's "Drinking window" card. Renders nothing without a window. */
export function DrinkingWindowCard({ model }: { model: FreshnessModel }) {
  if (model.heading === null) return null;
  const { bar, status } = model;
  return (
    <InsetSection label="Drinking window" data-slot="drinking-window">
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="t-title tabular text-ink-1">{model.heading}</span>
          {status !== null && (
            <span
              data-tone={status.tone}
              className={cn(
                "t-cap text-ink-3 shrink-0 rounded-full px-2.5 py-0.5 font-medium",
                TONE[status.tone],
              )}
            >
              {status.label}
            </span>
          )}
        </div>
        {bar !== null && (
          <div aria-hidden className="flex flex-col gap-1">
            <div className="relative h-2 rounded-full bg-surface-3">
              <div
                className="absolute inset-y-0 rounded-full bg-success/60"
                style={{ left: `${bar.start}%`, width: `${bar.width}%` }}
              />
              <div
                data-slot="today-marker"
                className="absolute -top-1 h-4 w-0.5 rounded-full bg-ink-1"
                style={{ left: `${bar.today}%` }}
              />
            </div>
            <div className="t-cap tabular flex justify-between text-ink-3">
              <span>{bar.axisFrom}</span>
              <span>Today</span>
              <span>{bar.axisTo}</span>
            </div>
          </div>
        )}
        {model.sourceLine !== null && (
          <p className="t-cap text-ink-2">{model.sourceLine}</p>
        )}
      </div>
    </InsetSection>
  );
}

/** The sheet's date fields, in the type's words (W-20). */
const fieldsFor = (
  type: string,
): readonly {
  key: keyof FreshnessDraft;
  label: string;
  type: "date" | "text";
}[] => {
  const words = typeWords(type);
  return [
    { key: "acquiredOn", label: "Bought", type: "date" },
    { key: "packagedOn", label: words.packaged, type: "date" },
    { key: "drinkFrom", label: words.windowFrom, type: "date" },
    { key: "drinkUntil", label: words.windowUntil, type: "date" },
  ];
};

function EditSheet({
  open,
  onOpenChange,
  bottle,
  itemType,
  cellarId,
  cellarItemId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bottle: FreshnessBottle;
  itemType: string;
  cellarId: string;
  cellarItemId: string;
}) {
  const [draft, setDraft] = useState<FreshnessDraft>(() => draftOf(bottle));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [, update] = useMutation(UpdateCellarItemMutation);
  const set = (key: keyof FreshnessDraft) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = () => {
    const result = freshnessPatch(bottle, draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (Object.keys(result.patch).length === 0) {
      onOpenChange(false);
      return;
    }
    startTransition(async () => {
      setError(null);
      const response = (
        await update({ cellarId, cellarItemId, input: result.patch })
      ).data?.updateCellarItem;
      const unwrapped = unwrapResult(response, "CellarItem");
      if (!unwrapped.ok) {
        setError(unwrapped.error.message);
        return;
      }
      onOpenChange(false);
    });
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={thisContainerLabel(itemType)}
      footer={
        // CROSS-LOT form-sheet footer: the quiet way out left, primary right.
        <div className="flex w-full items-center gap-3">
          <Button
            variant="quiet"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="min-w-0 flex-1"
            onClick={save}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            Save
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4 px-4 pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          {fieldsFor(itemType).map((field) => (
            <div key={field.key} className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={`fresh-${field.key}`}>{field.label}</Label>
              <Input
                id={`fresh-${field.key}`}
                type={field.type}
                value={draft[field.key]}
                onChange={(e) => set(field.key)(e.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="fresh-price">Price</Label>
            <Input
              id="fresh-price"
              inputMode="decimal"
              value={draft.price}
              onChange={(e) => set("price")(e.target.value)}
            />
          </div>
          <div className="flex w-28 flex-col gap-1.5">
            <Label htmlFor="fresh-currency">Currency</Label>
            <Input
              id="fresh-currency"
              maxLength={3}
              placeholder="EUR"
              autoCapitalize="characters"
              value={draft.currency}
              onChange={(e) => set("currency")(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fresh-location">Where it lives</Label>
          <Input
            id="fresh-location"
            maxLength={80}
            placeholder="Rack B, row 3"
            value={draft.location}
            onChange={(e) => set("location")(e.target.value)}
          />
        </div>
        {error !== null && (
          <p role="alert" className="t-cap text-danger">
            {error}
          </p>
        )}
        <p className="t-cap text-ink-3">Only you see these.</p>
      </form>
    </BottomSheet>
  );
}

/** The board's "This bottle" list: each row's value, or "Add". */
export function ThisBottleRows({
  model,
  onEdit,
  itemType = "WINE",
}: {
  model: FreshnessModel;
  onEdit: () => void;
  /** W-20: "This tin", "This bag". */
  itemType?: string;
}) {
  return (
    <InsetSection
      label={thisContainerLabel(itemType)}
      data-slot="this-bottle"
      action={
        <Button size="sm" variant="ghost" className="min-h-11" onClick={onEdit}>
          Edit
        </Button>
      }
    >
      {model.rows.map((row) => (
        <ListRow
          key={row.field}
          title={row.label}
          trailing={
            row.value === null ? (
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11 text-brass"
                onClick={onEdit}
                aria-label={`Add ${row.label.toLowerCase()}`}
              >
                Add
              </Button>
            ) : (
              <span
                className={cn(
                  "t-body tabular",
                  row.source === "typical" ? "text-ink-3" : "text-ink-1",
                )}
              >
                {row.value}
              </span>
            )
          }
        />
      ))}
      <p className="t-cap px-4 py-2.5 text-ink-3">{FOOTNOTE}</p>
    </InsetSection>
  );
}

/**
 * L02 — the bottle page's freshness: the drinking window (the owner's dates,
 * else "typical for <style>", else nothing) and the bottle's own dates, price
 * and place, editable in one sheet. Fetches its own data, like SeenAtSection.
 */
export function BottleFreshnessFields({
  cellarId,
  cellarItemId,
}: {
  cellarId: string;
  cellarItemId: string;
}) {
  const [{ data }] = useQuery({
    query: BottleFreshnessQuery,
    variables: { cellarId, cellarItemId },
  });
  const [editing, setEditing] = useState(false);
  // A fresh draft each time it opens; the sheet stays mounted to animate out.
  const [opened, setOpened] = useState(0);
  const edit = () => {
    setOpened((n) => n + 1);
    setEditing(true);
  };
  const cellar = data?.cellar?.__typename === "Cellar" ? data.cellar : null;
  const node = cellar?.item ?? null;
  const bottle: FreshnessBottle | null =
    node === null
      ? null
      : (() => {
          const f = readFragment(BottleFreshnessFragment, node);
          return {
            openAt: (f.openAt as string | null) ?? null,
            emptyAt: (f.emptyAt as string | null) ?? null,
            packagedOn: (f.packagedOn as string | null) ?? null,
            acquiredOn: (f.acquiredOn as string | null) ?? null,
            drinkFrom: (f.drinkFrom as string | null) ?? null,
            drinkUntil: (f.drinkUntil as string | null) ?? null,
            priceAmount: f.priceAmount ?? null,
            priceCurrency: f.priceCurrency ?? null,
            location: f.location ?? null,
          };
        })();
  const item = node === null ? null : freshnessItemOf(node.item);
  // The person's own day, not UTC's (CR-12).
  const today = useMemo(() => localDay(new Date()), []);
  if (bottle === null || item === null) return null;
  const model = freshnessModel(bottle, item, today);

  return (
    <div data-slot="bottle-freshness" className="flex flex-col gap-6 pt-4">
      <DrinkingWindowCard model={model} />
      <ThisBottleRows model={model} onEdit={edit} itemType={item.type} />
      <EditSheet
        key={opened}
        open={editing}
        onOpenChange={setEditing}
        bottle={bottle}
        itemType={item.type}
        cellarId={cellarId}
        cellarItemId={cellarItemId}
      />
    </div>
  );
}
