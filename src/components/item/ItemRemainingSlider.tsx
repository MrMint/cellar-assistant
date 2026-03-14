"use client";

import { Button, Card, Slider, Stack, Typography } from "@mui/joy";
import { useDebounce } from "@uidotdev/usehooks";
import { formatDistance } from "date-fns";
import { isNil, isNotNil } from "ramda";
import { useEffect, useState, useTransition } from "react";
import {
  openCellarItemAction,
  updateCellarItemPercentageAction,
} from "@/app/actions/cellarItems";
import { useInterval } from "@/utilities/hooks";

export type ItemRemainingSliderProps = {
  isCellarOwner: boolean;
  itemId: string;
  cellarId: string;
  opened?: Date;
  emptied?: Date;
  percentageRemaining: number;
};

export const ItemRemainingSlider = ({
  itemId,
  cellarId,
  percentageRemaining,
  opened,
  emptied,
  isCellarOwner,
}: ItemRemainingSliderProps) => {
  const [isPending, startTransition] = useTransition();
  const [percent, setPercent] = useState(percentageRemaining);
  const [now, setNow] = useState(new Date());
  const debouncedPercent = useDebounce(percent, 400);

  const _clear = useInterval(() => {
    setNow(new Date());
  }, 10000);

  useEffect(() => {
    if (debouncedPercent !== percentageRemaining) {
      startTransition(async () => {
        await updateCellarItemPercentageAction(
          itemId,
          debouncedPercent,
          cellarId,
        );
      });
    }
  }, [debouncedPercent, percentageRemaining, itemId, cellarId]);

  const handleOpen = () => {
    startTransition(async () => {
      await openCellarItemAction(itemId, cellarId);
    });
  };

  return (
    <Card>
      {isCellarOwner && isNil(opened) && (
        <Button loading={isPending} onClick={handleOpen}>
          Open it!
        </Button>
      )}
      {isNotNil(opened) && isNil(emptied) && (
        <Stack spacing={2}>
          <Typography>Remaining: {percent}%</Typography>
          <Slider
            value={percent}
            max={100}
            min={0}
            step={1}
            disabled={!isCellarOwner}
            onChange={(_, value) => setPercent(value as number)}
            sx={{
              "--Slider-trackSize": "3rem",
              "--Slider-trackRadius": ".5rem",
            }}
          />
          <Typography textAlign="center">
            Opened {formatDistance(opened, now)} ago
          </Typography>
        </Stack>
      )}
      {isNotNil(emptied) && (
        <Typography textAlign="center">
          Empty {formatDistance(emptied, now)} ago
        </Typography>
      )}
    </Card>
  );
};
