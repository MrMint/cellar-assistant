import { Friends } from "@/components/friend/Friends";
import { getServerUserId } from "@/utilities/auth-server";

export default async function FriendsPage() {
  const userId = await getServerUserId();
  return <Friends userId={userId} />;
}
