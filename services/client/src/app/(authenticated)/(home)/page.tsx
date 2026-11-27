import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/app/Page";
import { HomeColumns, HomeRowsFallback } from "@/components/home/HomeLayout";
import {
  CollectionLine,
  ContinueSectionServer,
  FriendsRankedSection,
  FriendsSection,
  InboxSection,
  NearbySectionServer,
  NewPersonGate,
} from "@/components/home/sections";
import { TodayHeader } from "@/components/home/TodayHeader";
import { getServerUser } from "@/utilities/auth-server";

export const metadata: Metadata = { title: "Home" };

export const dynamic = "force-dynamic";

/**
 * `/` — Home (the Landing and Shell-Home boards; L22: there is no signed-out
 * landing). Every landing comes here: sign-in, sign-up and the installed
 * app's `start_url`.
 *
 * Top to bottom on a phone, and the left column from `md`:
 *
 * 1. **The greeting, the count and the search field** (Scan, Photo).
 * 2. **The AI tray** (no header: failures first) and **Waiting on you**
 *    (matches, Needs details, n to check, friend requests, finished reads).
 * 3. **Open**: the open bottles as tiles, the furthest past its best first,
 *    and "Rate the n"; then **Drink soon**: sealed bottles whose window is
 *    ending, each with Open (Shell-Home ruling 1).
 * 4. **Nearby**, place-aware: "You're at …" within 25 m (DECISIONS 23).
 *
 * The right column from `md`, after the rest on a phone: **Friends ranked**
 * and the **Friends** feed.
 *
 * A new person (no bottles yet) gets the hero empty state instead, and no
 * count that isn't theirs (CROSS-LOT 3). Each section streams in, and fails,
 * on its own (`components/home/sections`).
 */
export default async function Today() {
  const user = await getServerUser();
  return (
    <Page wide className="pb-6">
      <TodayHeader
        displayName={user.displayName}
        collectionLine={
          <Suspense fallback={null}>
            <CollectionLine />
          </Suspense>
        }
      />
      <Suspense fallback={<HomeRowsFallback />}>
        <NewPersonGate
          inbox={<InboxSection />}
          full={
            <HomeColumns
              main={
                <>
                  <Suspense fallback={null}>
                    <InboxSection />
                  </Suspense>
                  <Suspense fallback={<HomeRowsFallback tiles />}>
                    <ContinueSectionServer />
                  </Suspense>
                  <Suspense fallback={null}>
                    <NearbySectionServer />
                  </Suspense>
                </>
              }
              side={
                <>
                  <Suspense fallback={null}>
                    <FriendsRankedSection />
                  </Suspense>
                  <Suspense fallback={<HomeRowsFallback />}>
                    <FriendsSection viewerId={user.id} />
                  </Suspense>
                </>
              }
            />
          }
        />
      </Suspense>
    </Page>
  );
}
