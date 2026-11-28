"use client";

import { useRouter } from "next/navigation";
import { AppBar } from "@/components/app/AppBar";
import { ErrorState } from "@/components/app/EmptyState";
import { Page } from "@/components/app/Page";
import { Button } from "@/components/ui/button";

/**
 * A recipe or group read that failed for a reason other than not-found
 * (F-112): the bar with Back, what happened, and Try again, which re-runs
 * the server page. Bare, the state left a phone with no way out but the tab
 * bar.
 */
export function RecipeReadError({
  reason,
  parent = "/recipes",
}: {
  reason: string;
  parent?: string;
}) {
  const router = useRouter();
  return (
    <Page>
      <AppBar title="Recipe" parent={parent} />
      <ErrorState
        title="Couldn't open this recipe"
        reason={reason}
        action={
          <Button variant="outline" onClick={() => router.refresh()}>
            Try again
          </Button>
        }
      />
    </Page>
  );
}
