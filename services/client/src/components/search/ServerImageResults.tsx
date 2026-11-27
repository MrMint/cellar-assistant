import type { ReactNode } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { CloudOff, Photo, Search } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { AiFailureStatus } from "@/components/common/AiStatus";
import { buttonVariants } from "@/components/ui/button-variants";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import {
  IMAGE_SEARCH_LIMIT,
  isImageSearchUnavailable,
} from "@/lib/items/image-search";
import { cn } from "@/lib/utils";
import { searchResultsFromNodes } from "./adapter";
import { SearchImageQuery } from "./queries";
import { ReadLabelInstead } from "./ReadLabelInstead";
import { RetrySearchButton } from "./RetrySearchButton";
import { SearchResultGrid } from "./SearchResultGrid";
import { fetchedTotalLabel } from "./universal-search";

/** The old page's empty state for an image search, verbatim. */
/** A photo search's empty or refused face: glyph, title, one action. */
const NoImageMatches = ({
  title,
  action,
  glyph = <Search aria-hidden strokeWidth={1.5} />,
}: {
  title: string;
  action: ReactNode;
  glyph?: ReactNode;
}) => (
  <EmptyState
    className="py-10"
    illustration={glyph}
    title={title}
    action={action}
  />
);

/**
 * An `?image=` whose photo is gone, or the old `?image_results=` link: the
 * search cannot be re-run, so it says so with a new search as its way out.
 */
export const ExpiredImageSearch = () => (
  <NoImageMatches
    glyph={<Photo aria-hidden strokeWidth={1.5} />}
    title="This photo search has expired"
    action={
      <Link
        href="/search"
        underline="none"
        className={cn(buttonVariants({ variant: "outline" }), "text-ink")}
      >
        New search
      </Link>
    }
  />
);

export async function ServerImageResults({
  imageFileId,
}: {
  imageFileId: string;
}) {
  // F-101: a read that throws (transport, GraphQL) is this face's failure,
  // not error.tsx's — the search box above stays.
  const data = await apiServerQuery(SearchImageQuery, {
    imageFileId,
    first: IMAGE_SEARCH_LIMIT,
  }).catch((error: unknown) => {
    console.error("[search] the photo read failed:", error);
    return null;
  });
  if (data === null) {
    return (
      <>
        <NoImageMatches
          glyph={<CloudOff aria-hidden strokeWidth={1.5} />}
          title="Couldn't search this photo"
          action={<RetrySearchButton />}
        />
        <ReadLabelInstead imageFileId={imageFileId} />
      </>
    );
  }
  const result = unwrapResult(data.itemSearch, "ItemSearchConnection");

  if (!result.ok) {
    if (isImageSearchUnavailable(result.error)) {
      return (
        <NoImageMatches
          title="Photo search isn't available here"
          action={<ReadLabelInstead imageFileId={imageFileId} prominent />}
        />
      );
    }
    if (result.error.code === "NOT_FOUND") return <ExpiredImageSearch />;
    // N07: a limit or any other refusal, in words chosen from the reason —
    // never the server's message; `retryAt` in the viewer's own zone.
    return (
      <>
        <AiFailureStatus
          failure={{
            code: result.error.code,
            reason: result.error.reason,
            retryAt: result.error.retryAt,
          }}
          fallback="search by name or scan a barcode"
        />
        <ReadLabelInstead imageFileId={imageFileId} className="mt-4" />
      </>
    );
  }

  const results = searchResultsFromNodes(
    result.data.edges.map((edge) => edge.node.item),
  );
  return results.length === 0 ? (
    <NoImageMatches
      title="No drink matches this photo"
      action={<ReadLabelInstead imageFileId={imageFileId} prominent />}
    />
  ) : (
    <div className="flex flex-col gap-3" data-search-image="found">
      <h2 className="t-head m-0 flex items-baseline gap-2 text-ink">
        Matches
        <span className="t-cap tabular text-ink-2">
          {fetchedTotalLabel({
            shown: results.length,
            limit: IMAGE_SEARCH_LIMIT,
            totalCount: result.data.totalCount,
            totalIsLowerBound: result.data.totalIsLowerBound,
            hasNextPage: result.data.pageInfo.hasNextPage,
          })}
        </span>
      </h2>
      <SearchResultGrid items={results} />
      <ReadLabelInstead imageFileId={imageFileId} />
    </div>
  );
}
