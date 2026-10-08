"use client";

import { Button, Card, Slider, Stack, Typography } from "@mui/joy";
import { useRouter } from "next/navigation";
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
 * - `openCellarItemAction` → `openCellarItem`;
 *   `updateCellarItemPercentageAction` → `setCellarItemPercentage`, still
 *   debounced 400 ms (a local hook instead of `@uidotdev/usehooks`). The old
 *   action stamped `empty_at` the moment the slider reached 0. Now 0% asks
 *   "Finished it?" first and offers Undo after (N13a, `useFinishBottle`):
 *   "Not yet" puts the slider back on the last saved level.
 * - "Opened … ago" no longer seeds `now` with `new Date()` during render (the
 *   hydration rule): `now` is set in an effect, so the server and the first
 *   client render both show no distance, and the 10 s tick takes over.
 *   `formatDistance` is a local copy of date-fns' wording.
 * - A refused write is shown instead of being swallowed.
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
    <Card>
      {isCellarOwner && !isOpened && (
        <Button loading={isPending} onClick={handleOpen}>
          Open it!
        </Button>
      )}
      {isOpened && !isEmptied && (
        <Stack spacing={2}>
          <Typography>Remaining: {percent}%</Typography>
          <Slider
            value={percent}
            max={100}
            min={0}
            step={1}
            disabled={!isCellarOwner}
            onChange={(_, value) => {
              const next = Array.isArray(value) ? (value[0] ?? 0) : value;
              setPercent(next);
              save(next);
            }}
            slotProps={{ input: { "aria-label": "Remaining" } }}
            sx={{
              "--Slider-trackSize": "3rem",
              "--Slider-trackRadius": ".5rem",
            }}
          />
          <Typography textAlign="center">
            Opened {now === null ? "" : formatDistance(opened, now)} ago
          </Typography>
        </Stack>
      )}
      {isEmptied && (
        <Typography textAlign="center">
          Empty {now === null ? "" : formatDistance(emptied, now)} ago
        </Typography>
      )}
      {shownError !== null && (
        <Typography level="body-sm" color="danger">
          {shownError}
        </Typography>
      )}
      <FinishBottleDialogs finish={finish} itemName={itemName} />
    </Card>
  );
};
