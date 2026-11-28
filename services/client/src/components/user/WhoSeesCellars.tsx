"use client";

import { useState } from "react";
import { useMutation, useQuery } from "urql";
import { Check, ChevronRight, ICON_STROKE } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { UpdateCellarMutation } from "@/lib/api/cellars";
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";

export type CellarWho = "PRIVATE" | "FRIENDS" | "PUBLIC";

/** The three answers, in the order the board draws them. */
export const WHO_OPTIONS = [
  { value: "PRIVATE", label: "Only me" },
  { value: "FRIENDS", label: "Friends" },
  { value: "PUBLIC", label: "Everyone" },
] as const satisfies readonly { value: CellarWho; label: string }[];

export const WhoSeesCellarsQuery = graphql(
  `
  query WhoSeesCellars {
    me {
      id
    }
    myCellars(first: 100, section: MINE) {
      __typename
      ... on CellarConnection {
        edges {
          node {
            id
            privacy
            createdById
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * The word the row shows: the one answer every cellar of yours shares, or
 * "Varies" when they differ. Pure (settings.test.tsx).
 */
export const whoWord = (privacies: readonly string[]): string => {
  const first = privacies[0];
  if (first === undefined) return "Friends";
  if (privacies.some((p) => p !== first)) return "Varies";
  return WHO_OPTIONS.find((o) => o.value === first)?.label ?? "Friends";
};

/**
 * Settings' "Who sees your cellars" (Shell-Me): one answer for every cellar
 * you made, applied cellar by cellar through `updateCellar` (there is no
 * account-wide default to write). A cellar someone else made, or co-owns with
 * you, is theirs to change and is left alone.
 */
export function WhoSeesCellars() {
  const [{ data }] = useQuery({ query: WhoSeesCellarsQuery });
  const [, updateCellar] = useMutation(UpdateCellarMutation);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const meId = data?.me?.id;
  const list =
    data === undefined
      ? null
      : unwrapResult(data.myCellars, "CellarConnection");
  const mine =
    list?.ok === true && meId !== undefined
      ? list.data.edges
          .map((edge) => edge.node)
          .filter((node) => node.createdById === meId)
      : [];
  const current = whoWord(mine.map((cellar) => cellar.privacy));

  const choose = async (next: CellarWho) => {
    if (saving) return;
    feedback("tick");
    setSaving(true);
    const changing = mine.filter((cellar) => cellar.privacy !== next);
    const results = await Promise.all(
      changing.map((cellar) =>
        updateCellar({ cellarId: cellar.id, input: { privacy: next } }),
      ),
    );
    setSaving(false);
    const failed = results.some(
      (result) =>
        result.error !== undefined ||
        result.data?.updateCellar.__typename !== "Cellar",
    );
    if (failed) {
      feedback("refuse");
      notify("Couldn't change who sees your cellars. Try again.");
      return;
    }
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        disabled={mine.length === 0}
        onPointerDown={() => feedback("press", { phase: "down" })}
        onPointerUp={() => feedback("press", { phase: "up" })}
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-act-ink active:bg-raised disabled:opacity-60"
      >
        <span className="t-body min-w-0 flex-1 truncate text-ink">
          Who sees your cellars
        </span>
        <span className="t-body shrink-0 text-ink-2">{current}</span>
        <ChevronRight
          aria-hidden
          className="size-5 shrink-0 text-glyph"
          strokeWidth={ICON_STROKE}
        />
      </button>
      <ResponsiveDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && saving) return;
          setOpen(next);
        }}
        dismissible={!saving}
        title="Who sees your cellars"
      >
        <div
          role="radiogroup"
          aria-label="Who sees your cellars"
          className="pb-2"
        >
          {WHO_OPTIONS.map((option) => {
            const on = current === option.label;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={on}
                disabled={saving}
                onClick={() => void choose(option.value)}
                className={cn(
                  "t-body flex min-h-14 w-full items-center justify-between px-3.5 text-left text-ink outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-act-ink active:bg-raised disabled:opacity-60",
                )}
              >
                {option.label}
                {on && (
                  <Check
                    aria-hidden
                    className="size-5 text-act-ink"
                    strokeWidth={ICON_STROKE}
                  />
                )}
              </button>
            );
          })}
        </div>
      </ResponsiveDialog>
    </>
  );
}
