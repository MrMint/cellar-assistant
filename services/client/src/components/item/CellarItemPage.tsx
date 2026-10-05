import { Typography } from "@mui/joy";
import { notFound, redirect } from "next/navigation";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import {
  bottleHref,
  cellarItemRedirect,
  checkInFromNode,
  isCellarOwner,
  itemRecipesFromFragment,
  itemViewFromFragment,
  userFromProfile,
} from "./adapter";
import { CellarItemPageView } from "./CellarItemPageView";
import { CellarBottleForQuery, CellarItemPageQuery } from "./fragments";

/**
 * `/cellars/[cellarId]/{type}s/[id]` for all six types — one **bottle**, the
 * old `getCellarItemData` + `Cellar{T}Details` pair.
 *
 * Decision 1: the id is a `cellar_items.id` again (`Cellar.item(id)`, G10).
 * An id that is not a bottle of this type here goes through
 * `cellarItemRedirect`: a bottle of another type to its own segment, a
 * catalog item id with one bottle here (`Cellar.bottleFor`) to that bottle,
 * anything else to the item page — so links minted while the URL meant the
 * item id keep working.
 */
export async function CellarItemPage({
  type,
  cellarId,
  id,
}: {
  type: ApiItemType;
  cellarId: string;
  id: string;
}) {
  const data = await apiServerQuery(CellarItemPageQuery, {
    cellarId,
    bottleId: id,
  });
  const cellarResult = unwrapResult(data.cellar, "Cellar");
  if (!cellarResult.ok) {
    if (isNotFound(cellarResult.error)) notFound();
    return <Typography color="danger">{cellarResult.error.message}</Typography>;
  }
  const cellar = cellarResult.data;
  const bottle = cellar.item ?? null;

  let bottleForId: string | null = null;
  if (bottle === null) {
    const lookup = await apiServerQuery(CellarBottleForQuery, {
      cellarId,
      itemId: id,
      type,
    });
    const found = unwrapResult(lookup.cellar, "Cellar");
    bottleForId = found.ok ? (found.data.bottleFor?.id ?? null) : null;
  }

  const view = bottle === null ? null : itemViewFromFragment(bottle.item);
  const target = cellarItemRedirect({
    cellarId,
    type,
    id,
    bottle:
      bottle === null || view === null
        ? null
        : { id: bottle.id, itemType: view.type },
    bottleForId,
  });
  if (target !== null) redirect(target);
  if (bottle === null || view === null) notFound();

  const viewerId = data.me?.id ?? null;
  const viewer =
    data.me?.profile === null || data.me?.profile === undefined
      ? { id: viewerId ?? "", displayName: "You", avatarUrl: "" }
      : userFromProfile(data.me.profile);
  const friends = unwrapResult(data.myFriends, "FriendConnection");

  return (
    <CellarItemPageView
      item={view}
      recipes={itemRecipesFromFragment(bottle.item)}
      bottle={{
        id: bottle.id,
        openAt: bottle.openAt ?? null,
        emptyAt: bottle.emptyAt ?? null,
        percentageRemaining: bottle.percentageRemaining,
        displayImage:
          bottle.displayImage === null || bottle.displayImage === undefined
            ? null
            : {
                url: bottle.displayImage.file.url,
                placeholder: bottle.displayImage.placeholder ?? null,
              },
      }}
      cellar={{ id: cellar.id, name: cellar.name }}
      checkIns={bottle.checkIns.edges.map((edge) => checkInFromNode(edge.node))}
      viewer={viewer}
      friends={
        friends.ok
          ? friends.data.edges.map((edge) => userFromProfile(edge.node.user))
          : []
      }
      isOwner={isCellarOwner(cellar, viewerId)}
      editHref={
        viewerId !== null && view.createdById === viewerId
          ? `${bottleHref(cellarId, view.type, bottle.id)}/edit`
          : null
      }
    />
  );
}
