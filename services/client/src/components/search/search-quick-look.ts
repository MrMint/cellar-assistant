import type {
  SearchLook,
  SearchRow,
  SearchSection,
  SectionModel,
} from "./universal-search";

/** Rows a preview shows from `md` up: two lines of the three-column grid. */
export const DESKTOP_PREVIEW_SIZE = 6;

/** What the desktop pane and keys need of a row (serialisable). */
export type LookRow = {
  readonly key: string;
  readonly title: string;
  readonly href: string;
  readonly thumb: SearchRow["thumb"];
  readonly look?: SearchLook;
};

/**
 * The rows J and K (and ↑ ↓) move through on desktop, in the order the page
 * shows them: each section's preview (six), or every row of the one opened.
 * A row with nowhere to go (a person you are not connected to) is skipped.
 */
export const lookOrder = (
  sections: readonly SectionModel[],
  focus: SearchSection | null,
): LookRow[] =>
  sections
    .filter((model) => focus === null || model.section === focus)
    .flatMap((model) =>
      focus === null ? model.rows.slice(0, DESKTOP_PREVIEW_SIZE) : model.rows,
    )
    .flatMap((row): LookRow[] =>
      row.href === undefined
        ? []
        : [
            {
              key: row.key,
              title: row.title,
              href: row.href,
              thumb: row.thumb,
              ...(row.look !== undefined ? { look: row.look } : {}),
            },
          ],
    );

/**
 * The next (1) or previous (-1) key, holding at either end. With nothing
 * selected, or a key no longer listed, J takes the first and K the last.
 */
export const stepKey = (
  keys: readonly string[],
  current: string | null,
  by: 1 | -1,
): string | null => {
  if (keys.length === 0) return null;
  const at = current === null ? -1 : keys.indexOf(current);
  if (at === -1) return by === 1 ? (keys[0] ?? null) : (keys.at(-1) ?? null);
  return keys[Math.min(keys.length - 1, Math.max(0, at + by))] ?? null;
};
