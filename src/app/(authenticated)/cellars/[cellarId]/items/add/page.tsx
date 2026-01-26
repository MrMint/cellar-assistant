import { AddItemClient } from "@/components/cellar/AddItemClient";
import { getServerUserId } from "@/utilities/auth-server";

export default async function Add({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;
  const userId = await getServerUserId();
  return <AddItemClient cellarId={cellarId} userId={userId} />;
}
