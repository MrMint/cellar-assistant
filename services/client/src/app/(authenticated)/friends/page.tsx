import type { Metadata } from "next";
import { Friends } from "@/components/friend/Friends";

export const metadata: Metadata = { title: "Friends" };

/**
 * `/friends`. Reached from the Me hub (D1), so its bar goes Back there on a
 * cold open. The bar, Invite and the lists are all `FriendsClient`'s.
 */
export default async function FriendsPage() {
  return <Friends />;
}
