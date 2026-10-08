import type { Metadata } from "next";
import {
  filterFromParam,
  wantToTryPage,
  wantToTryVariables,
} from "@/components/want-to-try/adapter";
import { WantToTryListQuery } from "@/components/want-to-try/queries";
import { WantToTryList } from "@/components/want-to-try/WantToTryList";
import { apiServerQuery } from "@/lib/api/urql-server";

export const metadata: Metadata = { title: "Want to try · Cellar Assistant" };

/**
 * `/want-to-try` — Me › Lists › "Want to try" (X08, D1, D27): drinks, places
 * and recipes the viewer saved. The first page is read here for the URL's
 * `?kind=` filter; the client pages on and re-reads when the filter changes.
 *
 * `me` is null for a session that ended between the `(authenticated)`
 * layout's check and this read: a message, not a throw (as `/favorites`).
 */
export const dynamic = "force-dynamic";

export default async function WantToTryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filter = filterFromParam((await searchParams).kind);
  const data = await apiServerQuery(
    WantToTryListQuery,
    wantToTryVariables(filter, null),
  );

  if (data.me === null || data.me === undefined) {
    return (
      <p className="type-body text-ink-2">
        Your session has expired for this part of the app. Sign in again to see
        your Want to try list.
      </p>
    );
  }

  return (
    <WantToTryList
      initialPage={wantToTryPage(data.me.wantToTry)}
      initialFilter={filter}
    />
  );
}
