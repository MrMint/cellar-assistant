import { RankingsClient } from "@/components/ranking/RankingsClient";
import { getServerUserId } from "@/utilities/auth-server";

export default async function Rankings() {
  const userId = await getServerUserId();
  return <RankingsClient userId={userId} />;
}
