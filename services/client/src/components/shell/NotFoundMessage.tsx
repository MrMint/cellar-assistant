import { ICON_STROKE, NoResults } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { Button } from "@/components/ui/button";
import { ShellMessage } from "./ShellMessage";
import { NOT_FOUND_COPY } from "./shell-copy";

/**
 * D24's single message for a page that is missing **or** private — see
 * `NOT_FOUND_COPY`. Rendered inside the app shell, so the tab bar stays and
 * there is always a way on. `signedIn={false}` is the one case outside the
 * shell (an unknown URL with no session behind it), where "home" would only
 * bounce to sign-in, so it says so.
 */
export function NotFoundMessage({ signedIn = true }: { signedIn?: boolean }) {
  return (
    <ShellMessage
      copy={NOT_FOUND_COPY}
      icon={<NoResults strokeWidth={ICON_STROKE} />}
      actions={
        <Button asChild>
          <Link href={signedIn ? "/" : "/sign-in"} underline="none">
            {signedIn ? "Go home" : "Sign in"}
          </Link>
        </Button>
      }
    />
  );
}
