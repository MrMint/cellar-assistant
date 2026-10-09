import { Link } from "@/components/app/Link";
import { InsetSection, ListRow } from "@/components/app/Page";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { cellarBottleHref, cellarGroupCell } from "./adapter";
import { BottleThumb } from "./BottleThumb";
import { CellarSearchElsewhereQuery } from "./fragments";

/** How many hits the fan-out shows. */
export const ELSEWHERE_SHOWN = 6;

/**
 * "Lagavulin 16 is in Bar Cart" (X04's cross-cellar fan-out): while you
 * search one cellar, the same phrase asked of your other cellars, by name.
 * Streams in under its own Suspense after the results, and is silent when
 * there is nothing elsewhere — or when asking failed, since it is a hint and
 * not the answer.
 */
export async function CellarSearchElsewhere({
  cellarId,
  search,
}: {
  cellarId: string;
  search: string;
}) {
  const phrase = search.trim();
  if (phrase === "") return null;
  const data = await apiServerQuery(CellarSearchElsewhereQuery, {
    search: phrase,
    excludeCellarId: cellarId,
    first: ELSEWHERE_SHOWN,
  });
  const result = unwrapResult(
    data.cellarSearchElsewhere,
    "CellarSearchElsewhereConnection",
  );
  if (!result.ok || result.data.edges.length === 0) return null;

  return (
    <InsetSection
      label="In your other cellars"
      data-slot="cellar-search-elsewhere"
    >
      {result.data.edges.map((edge) => {
        const { cellar } = edge.node;
        const cell = cellarGroupCell(edge.node.group);
        const count = cell.group?.count ?? 1;
        return (
          <ListRow
            key={`${cellar.id}/${cell.item.id}`}
            leading={<BottleThumb cell={cell} className="w-8" />}
            title={
              <Link
                overlay
                underline="none"
                href={cellarBottleHref(cellar.id, cell)}
              >
                {cell.item.name}
              </Link>
            }
            description={`is in ${cellar.name}${count > 1 ? ` · ×${count}` : ""}`}
          />
        );
      })}
    </InsetSection>
  );
}
