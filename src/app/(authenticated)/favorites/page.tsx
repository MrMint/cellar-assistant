import { Favorites } from "@/components/favorites/Favorites";
import { GetUserFavoritesQuery } from "@/components/favorites/fragments";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function FavoritesPage() {
  const userId = await getServerUserId();

  // Fetch user favorites server-side for immediate rendering
  const data = await serverQuery(GetUserFavoritesQuery, { userId });

  if (!data.user) {
    return <div>User not found</div>;
  }

  return <Favorites user={data.user} userId={userId} />;
}
