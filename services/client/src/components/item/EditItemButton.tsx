"use client";

import { Button } from "@mui/joy";
import { MdEdit } from "react-icons/md";
import { Link } from "../common/Link";

/**
 * The old `CellarItemHeader`'s "Edit item" button, lifted out so a server
 * header can render it (`component={Link}` is a function prop, which may not
 * cross the client boundary from a server module).
 *
 * The old button was hard-`disabled` and its page passed a cellar-item id to
 * `wines_by_pk` (§7). Now it links to the working edit page for the item's
 * creator — the only viewer `updateItem` accepts — and stays disabled, as it
 * always looked, for everyone else.
 */
export const EditItemButton = ({
  href,
  enabled,
}: {
  href: string;
  enabled: boolean;
}) =>
  enabled ? (
    <Button component={Link} href={href} startDecorator={<MdEdit />}>
      Edit item
    </Button>
  ) : (
    <Button startDecorator={<MdEdit />} disabled>
      Edit item
    </Button>
  );
