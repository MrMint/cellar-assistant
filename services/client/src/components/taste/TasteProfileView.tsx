"use client";

import { AGREEMENT_MIN_SHARED } from "@cellar-assistant/contracts/taste";
import { useQuery } from "urql";
import { AppBar } from "@/components/app/AppBar";
import { AI, ICON_STROKE, People } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow, Page } from "@/components/app/Page";
import { itemTypeTokens } from "@/components/app/TypeChip";
import { UserAvatar } from "@/components/app/UserAvatar";
import { ApiError } from "@/components/cellar-api/ApiError";
import { buttonVariants } from "@/components/ui/button-variants";
import { Skeleton } from "@/components/ui/skeleton";
import { readFragment } from "@/lib/api/graphql";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { TasteAgreementFieldsFragment, TasteProfileQuery } from "./queries";
import {
  agreementLine,
  agreementShown,
  styleLabel,
  typeBarWidths,
} from "./taste-lines";

/**
 * `/taste-profile` (L03), linked from Me. The board (`TasteProfile.dc.html`,
 * L43) top to bottom: your archetype, what it is built from, and where you
 * and each friend agree.
 *
 * Every number here is the server's. The archetype is deterministic; the
 * line under it is the server's plain sentence unless a model phrased it,
 * and only then does the page say "Phrased by AI" (L4). Agreement is a count
 * and is hidden below the server's gate.
 */
export function TasteProfileView() {
  const [{ data, error, fetching }] = useQuery({ query: TasteProfileQuery });

  if (data === undefined) {
    return (
      <Page>
        <AppBar title="Taste profile" parent="/me" />
        {fetching || error === undefined ? (
          <TasteProfileBlocks />
        ) : (
          <ApiError error={failureFromTransport(error)} />
        )}
      </Page>
    );
  }

  const profile = unwrapResult(data.tasteProfile, "TasteProfile");
  const friends = unwrapResult(
    data.friendTasteAgreements,
    "QueryFriendTasteAgreementsSuccess",
  );

  return (
    <Page>
      <AppBar title="Taste profile" parent="/me" />
      {profile.ok ? (
        <>
          <ArchetypeCard profile={profile.data} />
          {profile.data.types.length > 0 && (
            <InsetSection label="What it's built from">
              {typeBarWidths(profile.data.types).map((row) => {
                const tokens = itemTypeTokens[row.itemType];
                return (
                  <div
                    key={row.itemType}
                    className="flex h-11 items-center gap-3 px-4"
                  >
                    <span className="type-body w-16 text-ink-2">
                      {tokens.label}
                    </span>
                    <div
                      aria-hidden
                      className="relative h-1.5 flex-1 rounded-full bg-surface-3"
                    >
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0 rounded-full",
                          tokens.deepClass,
                        )}
                        style={{ width: `${row.percent}%` }}
                      />
                    </div>
                    <span className="type-footnote tabular w-16 text-right text-ink-3">
                      {row.count} rated
                    </span>
                  </div>
                );
              })}
            </InsetSection>
          )}
        </>
      ) : (
        <ApiError error={profile.error} />
      )}

      {friends.ok && (
        <div className="flex flex-col gap-2">
          <InsetSection label="With friends">
            {friends.data.data.length === 0 ? (
              <ListRow
                leading={<People aria-hidden strokeWidth={ICON_STROKE} />}
                title={
                  <Link href="/friends" overlay underline="none">
                    Taste is better compared.
                  </Link>
                }
                description="Add a friend to see where you agree."
              />
            ) : (
              friends.data.data.map((masked) => {
                const row = readFragment(TasteAgreementFieldsFragment, masked);
                const shown = agreementShown(row);
                return (
                  <ListRow
                    key={row.userId}
                    className="min-h-16"
                    leading={
                      <UserAvatar
                        aria-hidden
                        avatarUrl={row.avatarUrl}
                        displayName={row.name}
                      />
                    }
                    title={<span className="type-headline">{row.name}</span>}
                    description={
                      <span className={shown ? "text-ink-2" : "text-ink-3"}>
                        {agreementLine(row)}
                      </span>
                    }
                    trailing={
                      shown ? (
                        <Link
                          href={`/users/${row.userId}#compare`}
                          underline="none"
                          aria-label={`Compare with ${row.name}`}
                          className={cn(
                            buttonVariants({ variant: "secondary" }),
                            "rounded-full text-ink-1",
                          )}
                        >
                          Compare
                        </Link>
                      ) : undefined
                    }
                  />
                );
              })
            )}
          </InsetSection>
          <p className="type-footnote px-4 text-ink-3">
            Agreement shows only once you share at least {AGREEMENT_MIN_SHARED}{" "}
            rated items, and only items your friend shares with you. Never a
            percentage.
          </p>
        </div>
      )}
    </Page>
  );
}

type Profile = {
  ratingCount: number;
  line: string;
  linePhrasedByAi: boolean;
  archetype: {
    title: string;
    loves: readonly { itemType: string; label: string }[];
  } | null;
};

function ArchetypeCard({ profile }: { profile: Profile }) {
  return (
    <section
      data-slot="taste-archetype"
      className="flex flex-col gap-2.5 rounded-[20px] bg-type-wine/15 p-[18px]"
    >
      <span className="type-overline text-type-wine-text">Your archetype</span>
      <h1 className="type-title-1 font-display text-ink-1">
        {profile.archetype?.title ?? "Not enough to go on yet"}
      </h1>
      {profile.archetype !== null && profile.archetype.loves.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Styles you love">
          {profile.archetype.loves.map((style) => (
            <li
              key={`${style.itemType}:${style.label}`}
              className="type-footnote h-7 rounded-full bg-surface-2 px-2.5 leading-7 text-ink-1"
            >
              {styleLabel(style.label)}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-start gap-2 pt-1">
        {profile.linePhrasedByAi && (
          <AI
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="mt-0.5 size-4 shrink-0 text-ai"
          />
        )}
        <p className="type-body text-ink-2">
          {profile.line}
          {profile.linePhrasedByAi && (
            <span className="text-ai">
              {" "}
              Phrased by AI from your {profile.ratingCount} ratings.
            </span>
          )}
        </p>
      </div>
    </section>
  );
}

/** The page's shape while it loads: the card, the bars, the friend rows. */
export function TasteProfileBlocks() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <Skeleton className="h-44 w-full rounded-[20px]" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}
