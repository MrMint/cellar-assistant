import { AddItemClient } from "@/components/cellar/AddItemClient";
import { getServerUserId } from "@/utilities/auth-server";

export default async function AddPage() {
  const userId = await getServerUserId();
  return <AddItemClient userId={userId} />;
}
