import { type FriendsData, getFriendsData } from "./actions";
import { FriendsClient } from "./FriendsClient";

export async function Friends() {
  const friendsData = await getFriendsData();

  return <FriendsClient initialData={friendsData} />;
}

export type { FriendsData };
