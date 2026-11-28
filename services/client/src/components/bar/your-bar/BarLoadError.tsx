"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ErrorState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";

/**
 * Your bar or the pantry could not be read: what happened and the one way
 * out (KIT § 4), a Try again that reads the page again.
 */
export function BarLoadError({ title }: { title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <ErrorState
      title={title}
      reason="Check your connection"
      action={
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => start(() => router.refresh())}
        >
          Try again
        </Button>
      }
    />
  );
}
