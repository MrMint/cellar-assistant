import { Box, Stack, Typography } from "@mui/joy";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { extractItemCounts } from "@/components/cellar/cellarItemsServer";
import { CellarItemsControls } from "@/components/cellar/CellarItemsControls";
import { CellarItemsGridServer } from "@/components/cellar/CellarItemsGridServer";
import { CellarItemsGridSkeleton } from "@/components/cellar/CellarItemsGridSkeleton";
import { GetCellarInfoQuery } from "@/components/cellar/fragments";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";
import { itemsSearchParamsCache, parseItemTypes } from "./searchParams";

interface CellarItemsPageProps {
  params: Promise<{ cellarId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CellarItemsPage({
  params,
  searchParams,
}: CellarItemsPageProps) {
  const { cellarId } = await params;
  const userId = await getServerUserId();

  if (!userId) {
    redirect("/sign-in");
  }

  // Parse search params using nuqs cache with validation
  const resolvedSearchParams = await searchParams;
  const { search, types } = itemsSearchParamsCache.parse(resolvedSearchParams);
  const validTypes = parseItemTypes(types);

  // Fetch cellar metadata immediately (for header)
  const data = await serverQuery(GetCellarInfoQuery, { cellarId });

  if (!data.cellars_by_pk) {
    return <Typography>Cellar not found</Typography>;
  }

  const cellar = data.cellars_by_pk;
  const isOwner = cellar.created_by_id === userId;
  const coOwnerIds = cellar.co_owners?.map((co) => co.user_id) || [];
  const canAdd = isOwner || coOwnerIds.includes(userId);
  const counts = extractItemCounts(cellar.item_counts);

  return (
    <Box>
      <Stack spacing={2}>
        {/* Header renders immediately */}
        <CellarItemsControls
          cellarName={cellar.name}
          counts={counts}
          canAdd={canAdd}
          initialSearch={search}
          initialTypes={validTypes}
        />

        {/* Items grid streams in with Suspense */}
        <Suspense
          key={`${search}-${JSON.stringify(types)}`}
          fallback={<CellarItemsGridSkeleton />}
        >
          <CellarItemsGridServer
            cellarId={cellarId}
            userId={userId}
            search={search}
            types={validTypes}
          />
        </Suspense>
      </Stack>
    </Box>
  );
}
