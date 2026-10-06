import { Button, Grid, Stack, Typography } from "@mui/joy";
import { ItemCard } from "@/components/item/ItemCard";
import type { ExistingItem } from "./adapter";

type ExistingItemsProps = {
  items: ExistingItem[];
  onClickItem: (itemId: string) => void;
  onSkip: () => void;
};

/**
 * `82450ad1:…/OnboardingWizard/ExistingItems.tsx`, verbatim but for the item
 * shape: `{ item, type }` from `adapter.ts`, so the restored `ItemCard` gets
 * the props it takes now.
 */
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
        <Grid key={x.item.id} xs={12} sm={6} md={4} lg={2}>
          <ItemCard
            key={x.item.id}
            item={x.item}
            type={x.type}
            onClick={() => onClickItem(x.item.id)}
          />
        </Grid>
      ))}
    </Grid>
  );
};
