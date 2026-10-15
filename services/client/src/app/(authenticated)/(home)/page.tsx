import type { Metadata } from "next";
import { Suspense } from "react";
import { ShellBlocks } from "@/components/app/LoadingShell";
import { Page } from "@/components/app/Page";
import {
  CollectionLine,
  ContinueSectionServer,
  FriendsRankedSection,
  FriendsSection,
  InboxSection,
  NearbySectionServer,
} from "@/components/home/sections";
import { TodayHeader } from "@/components/home/TodayHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerUser } from "@/utilities/auth-server";

export const metadata: Metadata = { title: "Home" };

export const dynamic = "force-dynamic";

/**
 * `/` — Home, "Today" (roadmap X10, decision D1). Every landing comes here:
 * sign-in, sign-up and the installed app's `start_url`.
 *
 * Top to bottom, in the order a thumb wants them:
 *
 * 1. **The greeting and the search field.** Search is a full-screen sheet
 *    (`/search`), opened from here or by tapping Home again at the top.
 * 2. **The AI job tray** — what is reading right now, and what failed — and
 *    **Waiting on you**: menu matches to confirm, capture drafts to check,
 *    friend requests, finished insights and reads. This is where
 *    `/discoveries` and the `/map/scans` list went.
 * 3. **Continue**: your open bottles across every cellar, each with Pour;
 *    then **Drink soon** — deterministic, from the style table (D29).
 * 4. **Friends ranked** (D1) and the **Friends** feed: sentences, bursts
 *    folded, paged.
 * 5. **Nearby**, after D14's one-line reason when the browser has not been
 *    asked yet.
 *
 * Each section streams in, and fails, on its own (`components/home/sections`).
 */
export default async function Today() {
  const user = await getServerUser();
  return (
    <Page className="pb-6">
      <TodayHeader
        displayName={user.displayName}
        collectionLine={
          <Suspense fallback={null}>
            <CollectionLine />
          </Suspense>
        }
      />
      <Suspense fallback={null}>
        <InboxSection />
      </Suspense>
      <Suspense fallback={<ContinueFallback />}>
        <ContinueSectionServer />
      </Suspense>
      <Suspense fallback={null}>
        <FriendsRankedSection />
      </Suspense>
      <Suspense fallback={<RowsFallback />}>
        <FriendsSection viewerId={user.id} />
      </Suspense>
      <Suspense fallback={null}>
        <NearbySectionServer />
      </Suspense>
    </Page>
  );
}

function ContinueFallback() {
  return (
    <ShellBlocks className="flex flex-col gap-2">
      <Skeleton className="mx-4 h-4 w-20" />
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-72 w-36 shrink-0 rounded-md" />
        ))}
      </div>
    </ShellBlocks>
  );
}

function RowsFallback() {
  return (
    <ShellBlocks className="flex flex-col gap-2">
      <Skeleton className="mx-4 h-4 w-16" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </ShellBlocks>
  );
}
