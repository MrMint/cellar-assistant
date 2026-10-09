import { CellarItemsEmpty } from "./CellarItemsEmpty";

/**
 * A cellar with no bottles in it (N15, design §3.6): one line and one action
 * — snap the first bottle in. A viewer who may not add to it (a friend) gets
 * the line alone. The items grid's own empty state with no search, filter or
 * status in play, so the overview and the items page never disagree about
 * what an empty cellar says.
 */
export function EmptyCellar({
  cellarId,
  canAdd,
}: {
  cellarId: string;
  canAdd: boolean;
}) {
  return (
    <CellarItemsEmpty
      cellarId={cellarId}
      canAdd={canAdd}
      search=""
      types={[]}
    />
  );
}
