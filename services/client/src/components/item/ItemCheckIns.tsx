import { UserAvatar } from "@/components/app/UserAvatar";
import { Timestamp } from "../common/Timestamp";
import { groupCheckInsByDay } from "./adapter";
import { HeldBackNote } from "./HeldBackNote";
import { ItemSection } from "./ItemSection";

type User = {
  id: string;
  displayName: string;
  avatarUrl: string;
};

type CheckIn = {
  id: string;
  createdAt: string;
  user: User;
};

export type ItemCheckInsProps = {
  checkIns: CheckIn[];
  /**
   * `checkIns.totalCount`: the API returns the newest 100 (newest first), so
   * past that the oldest are held back and the card says so.
   */
  total?: number | null;
};

/**
 * The bottle's check-ins (X02's logs that were poured from it).
 *
 * The list is `CellarItem.checkIns` (G14) with `CheckIn.user` (G4), grouped
 * by UTC day and dated through `common/Timestamp` (the hydration rule), as
 * `82450ad1:src/components/item/ItemCheckIns.tsx` drew it. Logging from the
 * bottle — Pour and Log a drink — is the page's ActionBar now
 * (`pour/BottleActions`, X03), which also works before the bottle is open.
 * Nothing is drawn while there is nothing to list.
 */
export const ItemCheckIns = ({ checkIns, total }: ItemCheckInsProps) => {
  if (checkIns.length === 0) return null;
  return (
    <ItemSection>
      <ul
        aria-label="Check-ins"
        className="flex flex-col divide-y divide-line border-line border-y"
      >
        {groupCheckInsByDay(checkIns).map(([dateKey, x]) => (
          <li
            key={dateKey}
            className="flex min-h-12 items-center justify-between gap-3 py-2"
          >
            <span className="flex -space-x-2">
              {x.map((y) => (
                <UserAvatar
                  key={y.id}
                  avatarUrl={y.user.avatarUrl}
                  displayName={y.user.displayName}
                  title={y.user.displayName}
                  className="ring-2 ring-surface-1"
                />
              ))}
            </span>
            <span className="type-body tabular text-ink-2">
              <Timestamp iso={x[0]?.createdAt ?? dateKey} precision="date" />
            </span>
          </li>
        ))}
      </ul>
      <HeldBackNote
        shown={checkIns.length}
        total={total}
        noun="check-ins"
        order="newest"
      />
    </ItemSection>
  );
};
