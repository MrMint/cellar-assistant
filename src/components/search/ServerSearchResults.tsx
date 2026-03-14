import { Button, Stack, Typography } from "@mui/joy";
import Link from "next/link";
import { MdAdd } from "react-icons/md";
import { searchByText } from "@/app/(authenticated)/search/actions";
import { SearchResultGrid } from "@/components/search/SearchResultGrid";

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
      <SearchResultGrid items={results} />
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
