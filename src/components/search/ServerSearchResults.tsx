import { Grid, Typography } from "@mui/joy";
import { searchByText } from "@/app/(authenticated)/search/actions";
import type { BarcodeSearchResult } from "@/components/common/OnboardingWizard/actors/types";
import { ItemCard } from "@/components/item/ItemCard";
import { formatItemType } from "@/utilities";

interface ServerSearchResultsProps {
  query: string;
}

export async function ServerSearchResults({ query }: ServerSearchResultsProps) {
  const results = await searchByText(query);

  if (results.length === 0) {
    return (
      <Typography level="body-lg" sx={{ textAlign: "center", py: 4 }}>
        No items found for "{query}"
      </Typography>
    );
  }

  return (
    <Grid container spacing={2}>
      {results.map((item: BarcodeSearchResult) => (
        <Grid
          key={item.id}
          xs={results.length > 6 ? 6 : 12}
          sm={6}
          md={4}
          lg={2}
        >
          <ItemCard
            item={item}
            type={item.type}
            href={`${formatItemType(item.type).toLowerCase()}s/${item.id}`}
          />
        </Grid>
      ))}
    </Grid>
  );
}
