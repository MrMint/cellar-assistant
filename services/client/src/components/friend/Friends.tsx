import { AppBar } from "@/components/app/AppBar";
import { ErrorState } from "@/components/app/EmptyState";
import { ICON_STROKE, Warning } from "@/components/app/icons";
import { getApiToken } from "@/lib/api/auth-server";
import { FriendsClient } from "./FriendsClient";

/**
 * `/friends`.
 *
 * `getApiToken()` can still return `null` even though `(authenticated)/layout.tsx`
 * has already resolved a session: the layout's `/get-session` call and this
 * token exchange are two round trips, and a session that expires or is revoked
 * between them lands here.
 */
export async function Friends() {
  const token = await getApiToken();

  if (token === null) {
    return (
      <div className="flex flex-col gap-4">
        <AppBar title="Friends" parent="/me" />
        <ErrorState
          illustration={<Warning aria-hidden strokeWidth={ICON_STROKE} />}
          title="Your session ended"
          reason="Sign in again to see your friends."
        />
      </div>
    );
  }

  return <FriendsClient />;
}
