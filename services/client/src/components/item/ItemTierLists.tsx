import { Card, CardContent, Chip, Stack, Typography } from "@mui/joy";
import { MdFormatListNumbered } from "react-icons/md";
import { BAND_JOY_COLORS, BAND_LABELS } from "@/components/tier-list/constants";
import { Link } from "../common/Link";
import { HeldBackNote } from "./HeldBackNote";

export type ItemTierListEntry = {
  id: string;
  band: number;
  tier_list: { id: string; name: string } | null;
};

/**
 * `82450ad1:src/components/item/ItemTierLists.tsx`, restored.
 *
 * The old component ran its own server query over `tier_list_items` with an
 * `_or` of seven nil-uuid filters and showed every list it found — private
 * ones included (§7). It now takes `Item.tierListEntries` (G8) as a prop, which
 * the API has already reduced to lists the viewer may see; a list that stopped
 * being visible between the two reads arrives with a null `tierList`, which
 * renders as the old "Unknown list".
 */
export function ItemTierLists({
  entries,
  total,
}: {
  entries: ItemTierListEntry[];
  /** `tierListEntries.totalCount`, when the API held rows back. */
  total?: number | null;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <MdFormatListNumbered size={20} />
          <Typography level="title-lg">On Lists</Typography>
        </Stack>
        <Stack spacing={1}>
          {entries.map((item) => (
            <Stack
              key={item.id}
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent="space-between"
            >
              {item.tier_list ? (
                <Link
                  href={`/tier-lists/${item.tier_list.id}`}
                  sx={{ textDecoration: "none" }}
                >
                  <Typography level="title-sm">
                    {item.tier_list.name}
                  </Typography>
                </Link>
              ) : (
                <Typography level="title-sm">Unknown list</Typography>
              )}
              <Chip
                size="sm"
                variant="soft"
                color={BAND_JOY_COLORS[item.band] ?? "neutral"}
              >
                {BAND_LABELS[item.band] ?? `Band ${item.band}`}
              </Chip>
            </Stack>
          ))}
        </Stack>
        <HeldBackNote shown={entries.length} total={total} noun="lists" />
      </CardContent>
    </Card>
  );
}
