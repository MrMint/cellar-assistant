import { AppBar } from "@/components/app/AppBar";
import { Friends } from "@/components/friend/Friends";

/**
 * `/friends`. Reached from the Me hub (D1), so its bar goes Back there on a
 * cold open.
 */
export default async function FriendsPage() {
  return (
    <div className="flex flex-col gap-4">
      <AppBar title="Friends" parent="/me" />
      <Friends />
    </div>
  );
}
