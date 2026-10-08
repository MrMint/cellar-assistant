import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page } from "@/components/app/Page";
import { InviteHero } from "@/components/share/InviteHero";
import { InviteView } from "@/components/share/InviteView";
import { FriendInvitePreviewQuery } from "@/components/share/queries";
import { ShareFrame } from "@/components/share/ShareFrame";
import { AppShell } from "@/components/shell/AppShell";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { anonymousApiQuery } from "@/lib/api/urql-anonymous";
import { apiServerQuery } from "@/lib/api/urql-server";
import { readPasswordMode } from "@/lib/auth/password-mode";
import { invitePath } from "@/lib/share/routes";
import { getOptionalServerUser } from "@/utilities/auth-server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

const loadPreview = async (token: string, signedIn: boolean) => {
  const variables = { token };
  const data = signedIn
    ? await apiServerQuery(FriendInvitePreviewQuery, variables)
    : await anonymousApiQuery(FriendInvitePreviewQuery, variables);
  return unwrapResult(data.friendInvitePreview, "FriendInvitePreview");
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const result = await loadPreview(token, false);
  const base: Metadata = { robots: { index: false, follow: false } };
  if (!result.ok) return { ...base, title: "Invite · Cellar Assistant" };
  const title = `${result.data.inviterDisplayName} invited you to Cellar Assistant`;
  return {
    ...base,
    title,
    description:
      "Become friends to see each other's cellars, rankings and check-ins.",
    openGraph: { title, siteName: "Cellar Assistant", type: "website" },
  };
}

/**
 * `/invite/<token>` (X17) — public, signed in or out.
 *
 * Signed out: who invited you, and one brass button into social sign-up that
 * comes back here (D19, `returnTo`). Signed in: the same, with "Add as a
 * friend" (or why there is nothing to do), inside the app shell. A link that
 * was reset or never existed is the invite's own not-found page.
 */
export default async function InvitePage({ params }: Props) {
  const { token: raw } = await params;
  const token = raw;
  const viewer = await getOptionalServerUser();
  const result = await loadPreview(token, viewer !== null);
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    throw new Error(result.error.message);
  }
  const preview = result.data;

  if (viewer === null || preview.status === "SIGNED_OUT") {
    return (
      <ShareFrame
        canonicalPath={invitePath(token)}
        // Name the providers only where /sign-up offers them: with password
        // sign-up on (`AUTH_PASSWORD_MODE` unset or "enabled") it shows a
        // form, not the social buttons.
        pitch={
          readPasswordMode() === "enabled"
            ? "Free to join."
            : "Free. Sign up with Google, Discord or Facebook."
        }
        cta={`Join to connect with ${preview.inviterDisplayName}`}
      >
        <InviteHero
          name={preview.inviterDisplayName}
          avatarUrl={preview.inviterAvatarUrl}
          state="SIGNED_OUT"
        />
      </ShareFrame>
    );
  }

  return (
    <AppShell>
      <Page>
        <InviteView
          token={token}
          inviterDisplayName={preview.inviterDisplayName}
          inviterAvatarUrl={preview.inviterAvatarUrl}
          status={preview.status}
        />
      </Page>
    </AppShell>
  );
}
