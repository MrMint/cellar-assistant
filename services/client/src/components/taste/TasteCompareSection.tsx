"use client";

import { useQuery } from "urql";
import { InsetSection, ListRow } from "@/components/app/Page";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { CloneTierListButton } from "./CloneTierListButton";
import { TasteAgreementFieldsFragment, TasteAgreementQuery } from "./queries";
import { agreementLine, agreementShown } from "./taste-lines";

export type CompareList = { readonly id: string; readonly name: string };

/**
 * FriendProfile's "Compare" (L03, L30): where you and this person agree, as
 * a count, and their lists you may copy into a private one of your own.
 *
 * A slot (L38): it fetches its own agreement and renders nothing until it
 * has one, and nothing at all if the server refuses — a profile you may not
 * see answers like a missing one, and this section has nothing to add to
 * the page's own answer. The lists are the ones the profile already shows
 * (the API decided which of them you may see); want-to-try is never one of
 * them (L42).
 */
export function TasteCompareSection({
  userId,
  lists,
}: {
  userId: string;
  lists: readonly CompareList[];
}) {
  const [{ data }] = useQuery({
    query: TasteAgreementQuery,
    variables: { userId },
  });
  if (data === undefined) return null;
  const result = unwrapResult(data.tasteAgreement, "TasteAgreement");
  if (!result.ok) return null;
  const agreement = readFragment(TasteAgreementFieldsFragment, result.data);
  const shown = agreementShown(agreement);

  return (
    <InsetSection label="Compare" id="compare" data-slot="taste-compare">
      <ListRow
        title={
          <span
            className={cn("type-callout", shown ? "text-ink-1" : "text-ink-2")}
          >
            {agreementLine(agreement)}
          </span>
        }
        description="Only items they share with you count. Never a percentage."
      />
      {lists.map((list) => (
        <ListRow
          key={list.id}
          title={list.name}
          trailing={
            <CloneTierListButton tierListId={list.id} name={list.name} />
          }
        />
      ))}
    </InsetSection>
  );
}
