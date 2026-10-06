"use client";

import { Button, IconButton, Stack, Tooltip } from "@mui/joy";
import { MdAdd, MdEdit } from "react-icons/md";
import { HeaderBar } from "@/components/common/HeaderBar";
import { Link } from "@/components/common/Link";

/**
 * The overview's header, from restored parts: `HeaderBar` with the cellar's
 * breadcrumb ("Home / Cellars / <name>"), `CellarCard`'s "Edit Cellar" icon,
 * and `CellarItemsControls`' "Add item". A client module because the buttons
 * take `component={Link}`, which a server component may not pass.
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
        <Stack direction="row" spacing={2} alignItems="center">
          {canAdd && (
            <Tooltip title="Edit Cellar">
              <IconButton
                size="sm"
                variant="soft"
                component={Link}
                href={`/cellars/${cellarId}/edit`}
                aria-label="Edit Cellar"
              >
                <MdEdit />
              </IconButton>
            </Tooltip>
          )}
          <Button
            component={Link}
            href={`/cellars/${cellarId}/items`}
            variant="outlined"
            color="neutral"
          >
            {`All items (${activeCount})`}
          </Button>
          <Button
            component={Link}
            href={`/cellars/${cellarId}/items/add`}
            startDecorator={<MdAdd />}
            disabled={!canAdd}
          >
            Add item
          </Button>
        </Stack>
      }
    />
  );
}
