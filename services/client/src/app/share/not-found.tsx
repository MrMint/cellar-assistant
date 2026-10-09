import type { Metadata } from "next";
import { SharedNotFound } from "@/components/share/SharedNotFound";

export const metadata: Metadata = { title: "Not found · Cellar Assistant" };

/**
 * A shared link whose thing is missing **or** not public: one message for
 * both (D24), because a page that said "this list is private" would confirm
 * it exists. Signing in is the way on — if it was shared with you as a
 * friend, it is there once you are.
 */
export default function ShareNotFound() {
  return <SharedNotFound />;
}
