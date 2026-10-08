"use client";

import { IconButton } from "@/components/app/IconButton";
import { Edit } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { HeaderBar } from "@/components/common/HeaderBar";
import { Button } from "@/components/ui/button";
import { AddItemButton } from "./AddItemButton";

/**
 * The overview's header, from restored parts: `HeaderBar` with the cellar's
 * breadcrumb ("Home / Cellars / <name>"), `CellarCard`'s "Edit Cellar" icon,
 * and `CellarItemsControls`' "Add item". A client module because
 * `HeaderBar` (still Joy) is rendered from one.
 *
 * The three controls wrap on a narrow screen rather than run past its edge.
 */
export function CellarOverviewHeader({
  cellarId,
  cellarName,
  activeCount,
  canAdd,
}: {
  cellarId: string;
  cellarName: string;
  /** Non-empty bottles (`itemCounts.total`), which is what "All items" lists. */
  activeCount: number;
  canAdd: boolean;
}) {
  return (
    <HeaderBar
      serverBreadcrumbs={{ cellarName }}
      endComponent={
        <div className="flex flex-wrap items-center gap-4">
          {canAdd && (
            <IconButton
              asChild
              size="sm"
              variant="secondary"
              aria-label="Edit Cellar"
            >
              <Link
                href={`/cellars/${cellarId}/edit`}
                underline="none"
                title="Edit Cellar"
              >
                <Edit />
              </Link>
            </IconButton>
          )}
          <Button asChild variant="outline">
            <Link href={`/cellars/${cellarId}/items`} underline="none">
              {`All items (${activeCount})`}
            </Link>
          </Button>
          <AddItemButton cellarId={cellarId} canAdd={canAdd} />
        </div>
      }
    />
  );
}
