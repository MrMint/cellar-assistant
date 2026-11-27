import Image from "next/image";
import { EmptyState } from "@/components/app/EmptyState";
import { Add, Barcode, CloudOff, ICON_STROKE } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { formatKitScore, Stars } from "@/components/app/parts/Stars";
import { TypeGlyph } from "@/components/app/TypeChip";
import { itemHref } from "@/components/item-api/itemTypes";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { cn } from "@/lib/utils";
import { type SearchResultItem, searchResultsFromNodes } from "./adapter";
import { BARCODE_SEARCH_LIMIT, SearchBarcodeQuery } from "./queries";
import { RetrySearchButton } from "./RetrySearchButton";
import { SearchResultGrid } from "./SearchResultGrid";
import { fetchedTotalLabel } from "./universal-search";

/** Where an unknown code goes: Add, to photograph the bottle. */
const ADD_HREF = "/add?mode=bottle";

/** One drink for the code (Recipes-Search 33): its card, Open page, and a way out. */
function BarcodeMatch({ item }: { item: SearchResultItem }) {
  const href = itemHref(item.type, item.id);
  const title = item.vintage ? `${item.name} ${item.vintage}` : item.name;
  return (
    <div className="flex flex-col gap-3" data-search-barcode="found">
      <h2 className="t-head m-0 text-ink">Barcode match</h2>
      <article className="overflow-hidden rounded-md border border-edge bg-card md:max-w-[480px]">
        <div className="relative flex aspect-[16/9] items-center justify-center bg-raised">
          {item.displayImageUrl !== undefined ? (
            <Image
              src={item.displayImageUrl}
              alt=""
              fill
              sizes="(min-width: 768px) 480px, 100vw"
              className="object-cover"
            />
          ) : (
            <TypeGlyph type={item.type} className="size-10 text-glyph" />
          )}
        </div>
        <div className="flex flex-col gap-1 px-3 py-2.5">
          <h3 className="t-title m-0 text-ink">{title}</h3>
          {item.subtitle && (
            <p className="t-cap m-0 text-ink-2">{item.subtitle}</p>
          )}
        </div>
        {item.score != null && (
          <div className="flex min-h-11 items-center gap-2 border-rule border-t bg-raised px-3">
            <Stars value={item.score} size="sm" />
            <span className="t-head tabular text-ink">
              {formatKitScore(item.score)}
            </span>
          </div>
        )}
      </article>
      <Button asChild className="md:max-w-[480px]">
        <Link href={href} underline="none">
          Open page
        </Link>
      </Button>
      <Link
        href={ADD_HREF}
        underline="none"
        className={cn(
          buttonVariants({ variant: "quiet-muted" }),
          "self-start px-0",
        )}
      >
        Not this one?
      </Link>
    </div>
  );
}

/**
 * `?barcode=` (Recipes-Search 33–35): the server looks the code up with
 * `barcode(code:)`. One drink is a match card with Open page; several are
 * rows; an unknown code (a `NotFoundError`) is "No drink matches" with Add
 * it; any other refusal is the failure face with Try again.
 */
export async function ServerBarcodeResults({ code }: { code: string }) {
  // Destructured: the code is never rendered here, and
  // `lib/items/barcode.test.ts` reads every `.barcode` in a component as a
  // display site that must go through `displayBarcode`.
  // F-101: a read that throws (transport, GraphQL) is this face's failure,
  // not error.tsx's — the search box above stays.
  const read = await apiServerQuery(SearchBarcodeQuery, {
    code,
    first: BARCODE_SEARCH_LIMIT,
  }).catch((error: unknown) => {
    console.error("[search] the barcode read failed:", error);
    return null;
  });
  const result = read === null ? null : unwrapResult(read.barcode, "Barcode");

  let results: SearchResultItem[] = [];
  if (result?.ok) {
    results = searchResultsFromNodes(
      result.data.items.edges.map((edge) => edge.node),
    );
  } else if (result === null || !isNotFound(result.error)) {
    return (
      <EmptyState
        className="py-10"
        illustration={<CloudOff aria-hidden strokeWidth={1.5} />}
        title="Couldn't search this barcode"
        action={<RetrySearchButton />}
      />
    );
  }
  const page = result?.ok ? result.data.items : null;

  const [only] = results;
  if (results.length === 1 && only !== undefined) {
    return <BarcodeMatch item={only} />;
  }
  if (results.length > 1) {
    return (
      <div className="flex flex-col gap-3" data-search-barcode="found">
        <h2 className="t-head m-0 flex items-baseline gap-2 text-ink">
          Matches
          <span className="t-cap tabular text-ink-2">
            {fetchedTotalLabel({
              shown: results.length,
              limit: BARCODE_SEARCH_LIMIT,
              totalCount: page?.totalCount,
              hasNextPage: page?.pageInfo.hasNextPage,
            })}
          </span>
        </h2>
        <SearchResultGrid items={results} />
      </div>
    );
  }
  return (
    <EmptyState
      className="py-10"
      illustration={<Barcode aria-hidden strokeWidth={1.5} />}
      title="No drink matches this barcode"
      action={
        <Link
          href={ADD_HREF}
          underline="none"
          className={cn(buttonVariants({ variant: "outline" }), "text-ink")}
        >
          <Add aria-hidden strokeWidth={ICON_STROKE} />
          Add it
        </Link>
      }
    />
  );
}
