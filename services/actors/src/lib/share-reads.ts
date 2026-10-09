/**
 * The cross-aggregate reads the X17 share pages need, in one place.
 *
 * Each is §1.1's FK-lookup read — the same kind `tier-list-entries.ts` and
 * `visibility.ts` already perform: a fresh, indexed `select` of rows another
 * actor writes, inside the calling actor's own turn, with no actor hop and no
 * write. They exist so a `getShared` method can describe what it points at
 * (a ranked item's photo, an ingredient's name) without widening the
 * signed-in read paths those rows normally come through.
 *
 * Every function here is viewer-independent on purpose (`canShareAnonymously`
 * in `@cellar-assistant/policy`): no `Ctx` is taken, and an image is only ever
 * a **public** one.
 */
import type { ItemRef, ItemType } from "@cellar-assistant/contracts";
import { ITEM_TYPES } from "@cellar-assistant/contracts";
import { genericItems, itemImage, user } from "@cellar-assistant/db";
import { and, desc, eq, inArray } from "@cellar-assistant/db/orm";
import { isEmailShaped } from "../auth/display-name.ts";
import type { DbOrTx } from "./db.ts";
import { ARCS } from "./item-arcs.ts";
import { resolveTierListEntries } from "./tier-list-entries.ts";

const IMAGES = ARCS.itemImage;

/** `${type}:${id}` — the key every map below is returned under. */
export const shareKey = (ref: { readonly type: string; readonly id: string }) =>
  `${ref.type}:${ref.id}`;

export type SharedImage = {
  readonly fileId: string;
  readonly placeholder: string | null;
};

const groupByType = <T extends string>(
  refs: readonly { readonly type: T; readonly id: string }[],
): Map<T, string[]> => {
  const byType = new Map<T, string[]>();
  for (const ref of refs) {
    const ids = byType.get(ref.type) ?? [];
    if (!ids.includes(ref.id)) ids.push(ref.id);
    byType.set(ref.type, ids);
  }
  return byType;
};

/**
 * The newest **public** `item_image` of each item in `refs`. An item with no
 * public image is absent from the map — a private upload is never a stand-in.
 */
export const publicItemImages = async (
  db: DbOrTx,
  refs: readonly ItemRef[],
): Promise<ReadonlyMap<string, SharedImage>> => {
  const found = new Map<string, SharedImage>();
  const byType = groupByType(refs);
  await Promise.all(
    ITEM_TYPES.filter((type) => byType.has(type)).map(async (type) => {
      const ids = byType.get(type) ?? [];
      const column = IMAGES.columns[type];
      const rows = await db
        .select({
          itemId: column,
          fileId: itemImage.fileId,
          placeholder: itemImage.placeholder,
        })
        .from(itemImage)
        .where(and(eq(itemImage.isPublic, true), inArray(column, ids)))
        .orderBy(desc(itemImage.createdAt), desc(itemImage.id));
      for (const row of rows) {
        if (typeof row.itemId !== "string") continue;
        const key = shareKey({ type, id: row.itemId });
        // Newest first: the first row per item wins.
        if (!found.has(key)) {
          found.set(key, { fileId: row.fileId, placeholder: row.placeholder });
        }
      }
    }),
  );
  return found;
};

/**
 * The display names of a recipe's ingredients: an item's own name, or a
 * `generic_items` row's. A name that could not be read is absent.
 */
export const ingredientNames = async (
  db: DbOrTx,
  refs: readonly { readonly type: ItemType | "GENERIC"; readonly id: string }[],
): Promise<ReadonlyMap<string, string>> => {
  const names = new Map<string, string>();
  const itemRefs = refs.filter(
    (ref): ref is { type: ItemType; id: string } => ref.type !== "GENERIC",
  );
  const genericIds = [
    ...new Set(
      refs.filter((ref) => ref.type === "GENERIC").map((ref) => ref.id),
    ),
  ];

  const [items, generics] = await Promise.all([
    itemRefs.length === 0 ? new Map() : resolveTierListEntries(db, itemRefs),
    genericIds.length === 0
      ? []
      : db
          .select({ id: genericItems.id, name: genericItems.name })
          .from(genericItems)
          .where(inArray(genericItems.id, genericIds)),
  ]);

  for (const descriptor of items.values()) {
    if (descriptor.name !== null)
      names.set(shareKey(descriptor.ref), descriptor.name);
  }
  for (const row of generics) {
    names.set(shareKey({ type: "GENERIC", id: row.id }), row.name);
  }
  return names;
};

/**
 * The display name a share page credits a list to — the same `user.name`
 * every signed-in viewer already sees beside it. `null` for a user who is
 * gone, and for a name shaped like an email address: sign-up and profile edits
 * refuse those now (`../auth/display-name.ts`), but a row from before that
 * rule may still hold one, and a page anyone can open must not print it.
 */
export const publicDisplayName = async (
  db: DbOrTx,
  userId: string | null,
): Promise<string | null> => {
  if (userId === null) return null;
  const [row] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId));
  const name = row?.name.trim() ?? "";
  if (name === "" || isEmailShaped(name)) return null;
  return name;
};
