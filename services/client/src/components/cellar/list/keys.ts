/**
 * The desktop cellar's keys (KIT § 3 Desktop; desktop-cellar-05 to -07):
 * arrows (and J/K) move the selection, Enter opens it in the pane, Backspace
 * clears the selection, O opens its page, T switches tiles and rows. Esc is
 * the shell's: it closes what is on top, the pane included.
 *
 * Pure: which tile a key lands on, given the order on screen and the
 * columns of the grid.
 */

export type ListKeyMove = "next" | "previous" | "down" | "up";

/** A key → a move, or null when the key is not a move. */
export const moveOf = (key: string): ListKeyMove | null => {
  switch (key) {
    case "ArrowRight":
    case "j":
      return "next";
    case "ArrowLeft":
    case "k":
      return "previous";
    case "ArrowDown":
      return "down";
    case "ArrowUp":
      return "up";
    default:
      return null;
  }
};

/**
 * Where a move lands. With nothing selected, any move selects the first
 * tile. Up and down step a row (`columns` tiles), clamped to the ends;
 * the rows view is one column.
 */
export const moveSelection = (
  order: readonly string[],
  current: string | null,
  move: ListKeyMove,
  columns: number,
): string | null => {
  if (order.length === 0) return null;
  const index = current === null ? -1 : order.indexOf(current);
  if (index === -1) return order[0] ?? null;
  const step =
    move === "next"
      ? 1
      : move === "previous"
        ? -1
        : move === "down"
          ? Math.max(1, columns)
          : -Math.max(1, columns);
  const next = Math.min(order.length - 1, Math.max(0, index + step));
  return order[next] ?? null;
};

/** The keys the cellar list registers on the app element. */
export const LIST_KEYS = [
  "ArrowRight",
  "ArrowLeft",
  "ArrowDown",
  "ArrowUp",
  "j",
  "k",
  "Enter",
  "Backspace",
  "o",
  "t",
  "f",
  "1",
  "2",
  "3",
  "4",
  "5",
] as const;

/** How many columns a grid element draws (1 for anything else). */
export const columnsOf = (element: Element | null): number => {
  if (element === null || typeof window === "undefined") return 1;
  const template = window.getComputedStyle(element).gridTemplateColumns;
  if (template === "" || template === "none") return 1;
  return template.split(" ").filter((part) => part.trim() !== "").length;
};
