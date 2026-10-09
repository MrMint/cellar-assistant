"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { CheckInButton } from "@/components/cellar-api/CheckInButton";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";

/**
 * "Pour" on the cellar dashboard's shelves (X04): log a glass from this
 * bottle without leaving the cellar, and the dashboard re-reads (the trend,
 * the open count) when it lands.
 *
 * TODO(X03): X03's Pour sheet — openItem + checkIn + setPercentage in one
 * thumb-zone action, "Finish" on the last pour — replaces the drink-log sheet
 * this opens today. When X03 merges, swap the body for its sheet and keep this
 * component's props (cellarId, cellarItemId, item type, id and name), which
 * are what that sheet needs. Until then a sealed bottle poured here is logged
 * but not marked open.
 */
export function PourButton({
  cellarId,
  cellarItemId,
  itemType,
  itemId,
  itemName,
}: {
  cellarId: string;
  cellarItemId: string;
  itemType: ApiItemType;
  itemId: string;
  itemName: string;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  return (
    <CheckInButton
      cellarId={cellarId}
      cellarItemId={cellarItemId}
      itemType={itemType}
      itemId={itemId}
      itemName={itemName}
      onCheckedIn={refresh}
      label="Pour"
    />
  );
}
