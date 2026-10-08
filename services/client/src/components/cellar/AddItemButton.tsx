import { Add } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { Button } from "@/components/ui/button";

/**
 * "Add item" for a cellar, as the restored pages drew it: a brass button
 * linking to `/cellars/<id>/items/add`, shown but disabled for a viewer who
 * cannot add (Joy rendered a disabled link there; a disabled `button` is what
 * that meant). Shared by the overview header and the items controls.
 */
export function AddItemButton({
  cellarId,
  canAdd,
}: {
  cellarId: string;
  canAdd: boolean;
}) {
  if (!canAdd) {
    return (
      <Button disabled>
        <Add />
        Add item
      </Button>
    );
  }
  return (
    <Button asChild>
      <Link href={`/cellars/${cellarId}/items/add`} underline="none">
        <Add />
        Add item
      </Link>
    </Button>
  );
}
