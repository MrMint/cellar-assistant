import { Link } from "@/components/app/Link";
import { UserAvatar } from "@/components/app/UserAvatar";
import { HeldBackNote } from "./HeldBackNote";
import { ItemSection } from "./ItemSection";

export type ItemCellarUser = {
  id: string;
  displayName: string;
  avatarUrl: string;
};

export type ItemCellar = {
  id: string;
  name: string;
  createdBy: ItemCellarUser;
  co_owners: ItemCellarUser[];
};

type ItemCellarsProps = {
  cellars: ItemCellar[];
  /** `cellars.totalCount`, when the API held rows back. */
  total?: number | null;
};

/**
 * `82450ad1:src/components/item/ItemCellars.tsx`: "Located in:", one row per
 * cellar (the whole row links to its items) with its owners' avatars, or the
 * old empty line. Fed by `Item.cellars` (G9) — non-empty bottles in cellars
 * the viewer may see.
 *
 * The avatar stack is decoration inside the link (the cellar's name is the
 * link's name); each avatar still names its owner on hover, as Joy's
 * `Tooltip` did.
 */
export const ItemCellars = ({ cellars, total }: ItemCellarsProps) => {
  return (
    <ItemSection title="Located in">
      {cellars.length > 0 && (
        <ul className="-mx-4 flex flex-col divide-y divide-line border-line border-t">
          {cellars.map((cellar) => (
            <li key={cellar.id}>
              <Link
                href={`/cellars/${cellar.id}/items`}
                underline="none"
                className="flex min-h-12 items-center gap-3 px-4 py-2 active:bg-surface-3"
              >
                <span className="type-headline min-w-0 flex-1 truncate text-ink-1">
                  {cellar.name}
                </span>
                <span aria-hidden="true" className="flex -space-x-2">
                  {cellar.co_owners.concat([cellar.createdBy]).map((x) => (
                    <UserAvatar
                      key={x.id}
                      avatarUrl={x.avatarUrl}
                      displayName={x.displayName}
                      title={x.displayName}
                      size="sm"
                      className="ring-2 ring-surface-1"
                    />
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {cellars.length === 0 && (
        <p className="type-callout text-ink-2">
          Not in any cellar you can see.
        </p>
      )}
      <HeldBackNote shown={cellars.length} total={total} noun="cellars" />
    </ItemSection>
  );
};
