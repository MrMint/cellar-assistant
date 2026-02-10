import type { ItemTypeValue } from "@cellar-assistant/shared";
import { serverQuery } from "@/lib/urql/server";
import { CellarItemsGrid } from "./CellarItemsGrid";
import {
  buildItemsWhereClause,
  generateSearchVector,
  sortCellarItems,
  transformCellarItems,
} from "./cellarItemsServer";
import { GetCellarItemsQuery } from "./queries";

interface CellarItemsGridServerProps {
  cellarId: string;
  userId: string;
  search: string;
  types: ItemTypeValue[];
}

/**
 * Async server component that fetches and renders cellar items.
 * Designed to be wrapped in Suspense for streaming.
 */
export async function CellarItemsGridServer({
  cellarId,
  userId,
  search,
  types,
}: CellarItemsGridServerProps) {
  // Generate search vector if search text exists (server-side)
  const searchVector = search ? await generateSearchVector(search) : undefined;

  // Build where clause for type filtering
  const itemsWhereClause = buildItemsWhereClause(
    types.length > 0 ? types : undefined,
  );

  // Fetch items
  const data = await serverQuery(GetCellarItemsQuery, {
    cellarId,
    userId,
    itemsWhereClause,
    search: searchVector,
  });

  if (!data.cellars_by_pk) {
    return null;
  }

  // Transform and sort items server-side
  const transformedItems = transformCellarItems(data.cellars_by_pk.items);
  const sortedItems = sortCellarItems(transformedItems);

  return <CellarItemsGrid items={sortedItems} />;
}
