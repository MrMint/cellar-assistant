/**
 * The `totalCount` to hand `VirtualGrid` for a Relay list.
 *
 * `VirtualGrid` (verbatim from `82450ad1`) loads more while
 * `items.length < totalCount`, the old offset model. A connection says whether
 * there is more with `hasNextPage`, and its `totalCount` may be null or stale
 * against a filter. So: the rows held when there is nothing more (a stale
 * count must not leave skeletons and a load-more that never ends), otherwise
 * the connection's count when it is ahead of the rows, else one more than the
 * rows — enough to keep the load-more armed.
 */
export const virtualTotal = (list: {
  rows: readonly unknown[];
  hasNextPage: boolean;
  totalCount: number | null;
}): number => {
  const held = list.rows.length;
  if (!list.hasNextPage) return held;
  return list.totalCount !== null && list.totalCount > held
    ? list.totalCount
    : held + 1;
};
