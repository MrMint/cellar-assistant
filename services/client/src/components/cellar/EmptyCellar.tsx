import { EmptyState } from "@/components/app/EmptyState";
import { Camera, Cellar } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { Button } from "@/components/ui/button";

/**
 * A cellar with no bottles in it (N15, design §3.6): one line and one action
 * — snap the first bottle in. A viewer who may not add to it (a friend) gets
 * the line alone. Shared by the cellar's items page and its overview, so the
 * two never disagree about what an empty cellar says.
 */
export function EmptyCellar({
  cellarId,
  canAdd,
}: {
  cellarId: string;
  canAdd: boolean;
}) {
  return canAdd ? (
    <EmptyState
      illustration={<Cellar aria-hidden strokeWidth={1.5} />}
      title="Your cellar is waiting."
      description="Snap a label and the bottle is in."
      action={
        <Button asChild>
          <Link href={`/cellars/${cellarId}/items/add`} underline="none">
            <Camera aria-hidden />
            Snap a bottle
          </Link>
        </Button>
      }
    />
  ) : (
    <EmptyState
      illustration={<Cellar aria-hidden strokeWidth={1.5} />}
      title="Nothing in this cellar yet."
    />
  );
}
