import { Button, Grid, Stack, Typography } from "@mui/joy";
import Link from "next/link";
import { MdAdd } from "react-icons/md";
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
      <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
        <Typography level="body-lg" sx={{ textAlign: "center" }}>
          No items found for &ldquo;{query}&rdquo;
        </Typography>
        <Link href="/add" style={{ textDecoration: "none" }}>
          <Button variant="outlined" startDecorator={<MdAdd />}>
            Add an item
          </Button>
        </Link>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
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
      <Stack alignItems="center">
        <Link href="/add" style={{ textDecoration: "none" }}>
          <Button variant="plain" startDecorator={<MdAdd />}>
            Can&apos;t find what you&apos;re looking for? Add an item
          </Button>
        </Link>
      </Stack>
    </Stack>
  );
}
