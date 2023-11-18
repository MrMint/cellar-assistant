import { Button, Card, Slider, Stack, Typography } from "@mui/joy";
import { updateCellarItemMutation } from "@shared/queries";
import { useDebounce } from "@uidotdev/usehooks";
import { formatDistance, formatISO } from "date-fns";
import { isNil, isNotNil } from "ramda";
import { useEffect, useState } from "react";
import { useMutation } from "urql";
import { useInterval } from "@/utilities/hooks";

export type ItemRemainingSliderProps = {
  itemId: string;
  opened?: Date;
  emptied?: Date;
  percentageRemaining: number;
};

export const ItemRemainingSlider = ({
  itemId,
  percentageRemaining,
  opened,
  emptied,
}: ItemRemainingSliderProps) => {
  const [percent, setPercent] = useState(percentageRemaining);
  const [now, setNow] = useState(new Date());
  const debouncedPercent = useDebounce(percent, 400);
  const [res, updateItem] = useMutation(updateCellarItemMutation);
  const clear = useInterval(() => {
    setNow(new Date());
  }, 10000);

  useEffect(() => {
    if (debouncedPercent !== percentageRemaining) {
      updateItem({
        id: itemId,
        item: {
          percentage_remaining: debouncedPercent,
          empty_at: debouncedPercent === 0 ? formatISO(new Date()) : undefined,
        },
      });
    }
  }, [debouncedPercent, percentageRemaining, itemId, updateItem]);

  const handleOpen = async () => {
    await updateItem({
      id: itemId,
      item: { open_at: formatISO(new Date()), percentage_remaining: 100 },
    });
  };

  return (
    <Card>
      {isNil(opened) && (
        <Button loading={res.fetching} onClick={handleOpen}>
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
