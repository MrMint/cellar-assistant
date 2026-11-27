import { entryPath, type FormEntry } from "@/components/item/itemFormLayout";

/**
 * The floor fields of an "Add to catalog" draft that are still open, as form
 * paths in the form's order — what "n to check" beside the verb counts
 * (CROSS-LOT, Places-Menus ruling 2). The floor is the kind's own starred
 * fields from Add-bottle's layout (ruling 3): the name, the attributes the
 * create form stars, and the description where a kind needs one. Anything
 * outside the floor never counts and never blocks.
 */
export const draftToCheck = (
  layout: readonly FormEntry[],
  valueAt: (path: string) => string,
): string[] =>
  layout
    .filter(
      (entry) =>
        entry.kind === "name" ||
        ((entry.kind === "attribute" || entry.kind === "description") &&
          entry.required === true),
    )
    .map(entryPath)
    .filter((path) => valueAt(path).trim() === "");
