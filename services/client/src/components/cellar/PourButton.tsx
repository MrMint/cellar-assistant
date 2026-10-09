"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Pour } from "@/components/app/icons";
import { CheckInButton } from "@/components/cellar-api/CheckInButton";
import {
  type PourBottle,
  PourSheet,
  type PourSubject,
} from "@/components/pour/PourSheet";
import { Button } from "@/components/ui/button";
import type { CellarGridItem } from "./adapter";

type PourTarget = { bottle: PourBottle; subject: PourSubject };

const PourScopeContext = createContext<((target: PourTarget) => void) | null>(
  null,
);

/**
 * One Pour sheet (X03) for every shelf on the cellar dashboard (X04).
 *
 * Held above the shelves rather than in a card or a shelf: a pour re-renders
 * the server page, and that can move the bottle off the shelf it was poured
 * from — the first pour from "Recently added" opens it (so it moves to "Open
 * now"), and the last pour finishes it (so it leaves "Open now"). The sheet,
 * its rating step and its Undo toasts must not go with the card.
 */
export function PourScope({ children }: { children: ReactNode }) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const [target, setTarget] = useState<PourTarget | null>(null);
  const [pouring, setPouring] = useState(false);
  const start = useCallback((next: PourTarget) => {
    setTarget(next);
    setPouring(true);
  }, []);
  return (
    <PourScopeContext.Provider value={start}>
      {children}
      {target !== null && (
        <PourSheet
          // One bottle's finish state and toasts are that bottle's.
          key={target.bottle.cellarItemId}
          open={pouring}
          onOpenChange={setPouring}
          bottle={target.bottle}
          subject={target.subject}
          onChanged={refresh}
        />
      )}
    </PourScopeContext.Provider>
  );
}

/**
 * A bottle's one action on the cellar dashboard's shelves (X04):
 *
 * - **Pour** (X03) for the cellar's owners and co-owners while the bottle is
 *   not finished — open, log and level in one sheet, the first pour opening a
 *   sealed bottle (needs a `PourScope` above it);
 * - **Check in** (X02's drink-log sheet) for anyone else who may see the
 *   cellar, or a finished bottle — as the bottle page's ActionBar does.
 *
 * For a ×N card the lead bottle is the one poured.
 */
export function PourButton({
  cellarId,
  cell,
  canPour,
}: {
  cellarId: string;
  cell: CellarGridItem;
  /** The viewer owns (or co-owns) the cellar, so may change its bottles. */
  canPour: boolean;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const start = useContext(PourScopeContext);
  const target = useMemo<PourTarget>(
    () => ({
      bottle: {
        cellarId,
        cellarItemId: cell.item.id,
        openAt: cell.bottle.openAt,
        percentageRemaining: cell.bottle.percentageRemaining ?? 100,
      },
      subject: {
        itemType: cell.type,
        itemId: cell.item.itemId,
        itemName: cell.item.name,
      },
    }),
    [cellarId, cell],
  );

  if (canPour && cell.bottle.emptyAt === null && start !== null) {
    return (
      <Button
        variant="secondary"
        className="w-full"
        aria-haspopup="dialog"
        aria-label={`Pour ${cell.item.name}`}
        onClick={() => start(target)}
      >
        <Pour aria-hidden />
        Pour
      </Button>
    );
  }
  return (
    <CheckInButton
      cellarId={cellarId}
      cellarItemId={cell.item.id}
      itemType={cell.type}
      itemId={cell.item.itemId}
      itemName={cell.item.name}
      onCheckedIn={refresh}
    />
  );
}
