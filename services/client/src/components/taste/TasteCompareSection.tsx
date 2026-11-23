"use client";

import { useQuery } from "urql";
import { InsetSection, ListRow } from "@/components/app/Page";
import { ApiError } from "@/components/cellar-api/ApiError";
import {
  listPageResult,
  type ProfileListRow,
} from "@/components/profile/adapter";
import {
  FriendTierListsPageQuery,
  PROFILE_SECTION_SIZE,
} from "@/components/profile/queries";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import type { Page } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { cn } from "@/lib/utils";
import { CloneTierListButton } from "./CloneTierListButton";
import { TasteAgreementFieldsFragment, TasteAgreementQuery } from "./queries";
import { agreementCounts, agreementLine, agreementShown } from "./taste-lines";

/**
 * FriendProfile's "Compare" (L03, L30): where you and this person agree, as
 * a count, and their lists you may copy into a private one of your own.
 *
 * The section — and its `#compare` anchor, which /taste-profile's "Compare"
 * links to — is on the page from first paint, so the browser can scroll to
 * it; only the agreement line waits for its own query (a placeholder until
 * then). If the server refuses the agreement, the section goes: a profile
 * you may not see answers like a missing one, and this section has nothing
 * to add to the page's own answer.
 *
 * The lists are the ones the profile already shows (the API decided which
 * of them you may see), and they page on like the profile's own Tier lists
 * section, so a friend's 21st list can be copied too; want-to-try is never
 * one of them (L42).
 */
export function TasteCompareSection({
  userId,
  lists,
}: {
  userId: string;
  lists: Page<ProfileListRow>;
}) {
  const [{ data }] = useQuery({
    query: TasteAgreementQuery,
    variables: { userId },
  });
  const paged = usePagedConnection({
    query: FriendTierListsPageQuery,
    variables: (_args: string, after) => ({
      userId,
      first: PROFILE_SECTION_SIZE,
      after,
    }),
    select: (answer) => listPageResult(answer?.friendProfile),
    initial: lists,
    initialArgs: userId,
  });

  const result =
    data === undefined
      ? undefined
      : unwrapResult(data.tasteAgreement, "TasteAgreement");
  if (result !== undefined && !result.ok) return null;
  const agreement =
    result === undefined
      ? undefined
      : agreementCounts(
          readFragment(TasteAgreementFieldsFragment, result.data),
        );
  const loading = paged.status === "loadingMore";

  return (
    <InsetSection
      label="Compare"
      id="compare"
      data-slot="taste-compare"
      className="scroll-mt-4"
      aria-busy={agreement === undefined || loading || undefined}
    >
      <ListRow
        title={
          agreement === undefined ? (
            <Skeleton
              data-slot="taste-compare-pending"
              className="h-5 w-[60%]"
            />
          ) : (
            <span
              className={cn(
                "type-callout",
                agreementShown(agreement) ? "text-ink-1" : "text-ink-2",
              )}
            >
              {agreementLine(agreement)}
            </span>
          )
        }
        description="Only items they share with you count. Never a percentage."
      />
      {paged.rows.map((list) => (
        <ListRow
          key={list.id}
          title={list.name}
          trailing={
            <CloneTierListButton tierListId={list.id} name={list.name} />
          }
        />
      ))}
      {paged.failure !== null && (
        <div className="p-4">
          <ApiError error={paged.failure} />
        </div>
      )}
      {paged.canLoadMore && (
        <div className="p-3">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => void paged.loadMore()}
            disabled={loading}
            aria-busy={loading || undefined}
          >
            {loading ? "Loading…" : "Show more lists"}
          </Button>
        </div>
      )}
    </InsetSection>
  );
}
