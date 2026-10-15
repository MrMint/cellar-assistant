import type { Metadata } from "next";
import { ICON_STROKE, People } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { MainContent } from "@/components/app/main-content";
import { AppShell } from "@/components/shell/AppShell";
import { ShellMessage } from "@/components/shell/ShellMessage";
import { Button } from "@/components/ui/button";
import { getOptionalServerUser } from "@/utilities/auth-server";

export const metadata: Metadata = { title: "Invite" };

const COPY = {
  title: "This invite link doesn't work any more",
  body: "Whoever sent it may have made a new one. Ask them for the latest link.",
};

/** A reset or mistyped invite link — the same words for both. */
export default async function InviteNotFound() {
  const viewer = await getOptionalServerUser();
  const message = (
    <ShellMessage
      copy={COPY}
      icon={<People strokeWidth={ICON_STROKE} />}
      actions={
        <Button asChild>
          <Link
            href={viewer === null ? "/sign-in" : "/friends"}
            underline="none"
          >
            {viewer === null ? "Sign in" : "Find friends"}
          </Link>
        </Button>
      }
    />
  );
  return viewer === null ? (
    <MainContent className="flex min-w-0 flex-1 flex-col">
      {message}
    </MainContent>
  ) : (
    <AppShell>{message}</AppShell>
  );
}
