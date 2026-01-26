import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import { FavoritesClient } from "./FavoritesClient";
import { UserFavoritesFragment } from "./fragments";

interface FavoritesProps {
  user: FragmentOf<typeof UserFavoritesFragment>;
  userId: string;
}

export function Favorites({ user, userId }: FavoritesProps) {
  const _userData = readFragment(UserFavoritesFragment, user);

  // Pass the user data to the client component which handles filtering and interactivity
  return <FavoritesClient userId={userId} />;
}
