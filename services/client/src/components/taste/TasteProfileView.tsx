"use client";

import { useQuery } from "urql";
import { AppBar } from "@/components/app/AppBar";
import { ErrorState } from "@/components/app/EmptyState";
import { Page } from "@/components/app/Page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import {
  AgreeWithFriends,
  type FriendAgreement,
} from "./profile/AgreeWithFriends";
import { ArchetypeCard } from "./profile/ArchetypeCard";
import {
  BuiltFrom,
  InsightsDoor,
  RatedHighest,
} from "./profile/ProfileSections";
import { TasteAgreementFieldsFragment, TasteProfileQuery } from "./queries";
import { agreementCounts, nodes } from "./taste-lines";

/**
 * `/taste-profile` (L03), from Me and the recap's end card, to the
 * Social-Recap boards (19, 20, taste-locked, taste-no-friends; desktop 09):
 * your archetype, the styles you rate highest, what it is built from, the
 * insights door, and where you and each friend agree. Two columns from `md`.
 *
 * Every number here is the server's. Agreement is a count, hidden below the
 * server's gate, and the compare itself is on the friend's profile (S1).
 */
export function TasteProfileView() {
  const [{ data, error, fetching }, reexecute] = useQuery({
    query: TasteProfileQuery,
  });
  const retry = () => {
    feedback("tick");
    reexecute({ requestPolicy: "network-only" });
  };

  if (data === undefined) {
    return (
      <Page wide>
        <AppBar title="Taste profile" parent="/me" />
        {fetching || error === undefined ? (
          <TasteProfileBlocks />
        ) : (
          <ProfileError onRetry={retry} />
        )}
      </Page>
    );
  }

  const profile = unwrapResult(data.tasteProfile, "TasteProfile");
  if (!profile.ok) {
    return (
      <Page wide>
        <AppBar title="Taste profile" parent="/me" />
        <ProfileError onRetry={retry} />
      </Page>
    );
  }
  const p = profile.data;
  const types = nodes(p.types);
  const loves = p.archetype === null ? [] : nodes(p.archetype.loves);
  const friendsRead = unwrapResult(p.friends, "TasteAgreementConnection");
  const friends: FriendAgreement[] | null = friendsRead.ok
    ? nodes(friendsRead.data).map((masked) => {
        const row = readFragment(TasteAgreementFieldsFragment, masked);
        return {
          userId: row.userId,
          name: row.name,
          avatarUrl: row.avatarUrl ?? null,
          counts: agreementCounts(row),
        };
      })
    : null;
  const owner = p.archetype !== null;

  return (
    <Page wide>
      <AppBar title="Taste profile" parent="/me" />
      <div className="grid gap-6 md:grid-cols-2 md:items-start md:gap-8">
        <div className="flex flex-col gap-6">
          <ArchetypeCard
            profile={{
              ratingCount: p.ratingCount,
              kinds: types.length,
              line: p.line,
              linePhrasedByAi: p.linePhrasedByAi,
              title: p.archetype?.title ?? null,
            }}
          />
          {loves.length > 0 && <RatedHighest styles={loves} />}
        </div>
        <div className="flex flex-col gap-6">
          {owner && types.length > 0 && <BuiltFrom types={types} />}
          {owner && <InsightsDoor />}
          <AgreeWithFriends friends={friends} onRetry={retry} primary={owner} />
        </div>
      </div>
    </Page>
  );
}

function ProfileError({ onRetry }: { onRetry: () => void }) {
  return (
    <ErrorState
      title="Couldn’t load your taste profile"
      action={
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

/** The page's shape while it loads: the card, the bars, the friend rows. */
export function TasteProfileBlocks() {
  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-8" aria-hidden>
      <div className="flex flex-col gap-6">
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-56 w-full rounded-md" />
      </div>
      <div className="flex flex-col gap-6">
        <Skeleton className="h-56 w-full rounded-md" />
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    </div>
  );
}
