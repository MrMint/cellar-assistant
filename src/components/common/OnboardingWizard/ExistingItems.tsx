import { Button, Grid, Stack, Typography } from "@mui/joy";
import { ItemCard } from "@/components/item/ItemCard";
import { BarcodeSearchResult } from "./actors/types";

type ExistingItemsProps = {
  items: BarcodeSearchResult[];
  onClickItem: (itemId: string) => void;
  onSkip: () => void;
};

export const ExistingItems = ({
  items,
  onClickItem,
  onSkip,
}: ExistingItemsProps) => {
  return (
    <Grid container spacing={2}>
      <Grid xs={12}>
        <Stack spacing={2} direction="row" alignItems="center">
          <Typography>Don&apos;t see what you are looking for?</Typography>
          <Button onClick={onSkip}>Create New</Button>
        </Stack>
      </Grid>
      {items.map((x) => (
        <Grid key={x.id} xs={12} sm={6} md={4} lg={2}>
          <ItemCard
            key={x.id}
            item={x}
            type={x.type}
            onClick={() => onClickItem(x.id)}
          />
        </Grid>
      ))}
    </Grid>
  );
};
