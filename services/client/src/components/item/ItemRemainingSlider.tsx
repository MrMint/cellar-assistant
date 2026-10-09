"use client";

import { useRouter } from "next/navigation";
import { Slider as SliderPrimitive } from "radix-ui";
import { useEffect, useState, useTransition } from "react";
import { useMutation } from "urql";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import {
  OpenCellarItemMutation,
  SetCellarItemPercentageMutation,
} from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";
import { formatDistance } from "@/lib/items/distance";
import { useInterval } from "@/utilities/hooks";
import { FinishBottleDialogs } from "./FinishBottleDialogs";
import { ItemSection } from "./ItemSection";
import { LoadingButton } from "./LoadingButton";
import { useFinishBottle } from "./useFinishBottle";

export type ItemRemainingSliderProps = {
  isCellarOwner: boolean;
  /** The bottle (`cellar_items.id`). */
  itemId: string;
  cellarId: string;
  /** ISO instants (were `Date`s parsed on the server). */
  opened?: string | null;
  emptied?: string | null;
  percentageRemaining: number;
  /** For the "Finished it?" question. */
  itemName?: string;
};

/**
 * `82450ad1:src/components/item/ItemRemainingSlider.tsx`, restored.
 *
 * - `openCellarItemAction` → `openCellarItem`, behind "Mark as opened" (it
 *   was "Open it!", the page's main action until X03's Pour, whose first
 *   pour opens the bottle);
 *   `updateCellarItemPercentageAction` → `setCellarItemPercentage`, still
 *   debounced 400 ms (a local hook instead of `@uidotdev/usehooks`). The old
 *   action stamped `empty_at` the moment the slider reached 0. Now 0% asks
 *   "Finished it?" first and offers Undo after (N13a, `useFinishBottle`):
 *   "Not yet" puts the slider back on the last saved level. A finished
 *   bottle keeps a "Restore to cellar" button for its owner, so putting it
 *   back is not limited to the Undo toast's five seconds.
 * - "Opened … ago" no longer seeds `now` with `new Date()` during render (the
 *   hydration rule): `now` is set in an effect, so the server and the first
 *   client render both show no distance, and the 10 s tick takes over.
 *   `formatDistance` is a local copy of date-fns' wording.
 * - A refused write is shown instead of being swallowed.
 *
 * The slider is Radix's primitive composed here rather than `ui/slider`: the
 * old one was a tall "level" bar (a 3 rem track), and `ui/slider` neither
 * draws that nor lets the thumb — the element with `role="slider"` — carry
 * its accessible name ("Remaining").
 */
export const ItemRemainingSlider = ({
  itemId,
  cellarId,
  percentageRemaining,
  opened,
  emptied,
  isCellarOwner,
  itemName,
}: ItemRemainingSliderProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [percent, setPercent] = useState(percentageRemaining);
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, openItem] = useMutation(OpenCellarItemMutation);
  const [, setPercentage] = useMutation(SetCellarItemPercentageMutation);
  const finish = useFinishBottle({ cellarId, cellarItemId: itemId });
  const finishPhase = finish.state.phase;

  useEffect(() => {
    setNow(Date.now());
  }, []);
  useInterval(() => {
    setNow(Date.now());
  }, 10000);

  // Back to the saved level whenever the server's changes, and whenever a
  // finish ends without one ("Not yet", a refused write, Undo).
  useEffect(() => {
    if (finishPhase === "idle") setPercent(percentageRemaining);
  }, [percentageRemaining, finishPhase]);

  const save = useDebouncedCallback((value: number) => {
    // 0% is a question, not a write — even for a bottle already saved at 0.
    if (value === 0) {
      finish.request({ percentageRemaining, openAt: opened ?? null });
      return;
    }
    if (value === percentageRemaining) return;
    startTransition(async () => {
      setError(null);
      const response = (
        await setPercentage({
          cellarId,
          cellarItemId: itemId,
          percentageRemaining: value,
        })
      ).data?.setCellarItemPercentage;
      const result = unwrapResult(response, "CellarItem");
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }, 400);

  const handleOpen = () => {
    startTransition(async () => {
      setError(null);
      const result = unwrapResult(
        (await openItem({ cellarId, cellarItemId: itemId })).data
          ?.openCellarItem,
        "CellarItem",
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  };

  const isOpened = opened !== null && opened !== undefined;
  const isEmptied = emptied !== null && emptied !== undefined;
  const finishError = finish.state.phase === "idle" ? finish.state.error : null;
  const shownError = error ?? finishError;

  return (
    <ItemSection>
      {/* X03: the first Pour opens a bottle (the page's ActionBar); this
          is for opening one without pouring — for cooking, say. */}
      {isCellarOwner && !isOpened && (
        <LoadingButton
          variant="outline"
          loading={isPending}
          onClick={handleOpen}
        >
          Mark as opened
        </LoadingButton>
      )}
      {isOpened && !isEmptied && (
        <div className="flex flex-col gap-4">
          <p className="type-body tabular text-ink-1">Remaining: {percent}%</p>
          <SliderPrimitive.Root
            data-slot="slider"
            value={[percent]}
            max={100}
            min={0}
            step={1}
            disabled={!isCellarOwner}
            onValueChange={(value) => {
              const next = value[0] ?? 0;
              setPercent(next);
              save(next);
            }}
            className="relative flex h-12 w-full touch-none select-none items-center data-[disabled]:opacity-50"
          >
            <SliderPrimitive.Track
              data-slot="slider-track"
              className="relative h-12 grow overflow-hidden rounded-md bg-surface-3"
            >
              <SliderPrimitive.Range
                data-slot="slider-range"
                className="absolute h-full bg-primary"
              />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb
              data-slot="slider-thumb"
              aria-label="Remaining"
              className="block h-10 w-3 rounded-full bg-ink-1 shadow-sm outline-none ring-ring/50 transition-shadow focus-visible:ring-4 disabled:pointer-events-none"
            />
          </SliderPrimitive.Root>
          <p className="type-body text-center text-ink-2">
            Opened {now === null ? "" : formatDistance(opened, now)} ago
          </p>
        </div>
      )}
      {isEmptied && (
        <div className="flex flex-col gap-2">
          <p className="type-body text-center text-ink-2">
            Empty {now === null ? "" : formatDistance(emptied, now)} ago
          </p>
          {/* Undo outlives its toast: put a finished bottle back (N13a). */}
          {isCellarOwner && (
            <LoadingButton
              variant="outline"
              loading={finishPhase === "restoring"}
              onClick={() => finish.restore(percentageRemaining)}
            >
              Restore to cellar
            </LoadingButton>
          )}
        </div>
      )}
      {shownError !== null && (
        <p role="alert" className="type-callout text-destructive">
          {shownError}
        </p>
      )}
      <FinishBottleDialogs finish={finish} itemName={itemName} />
    </ItemSection>
  );
};
