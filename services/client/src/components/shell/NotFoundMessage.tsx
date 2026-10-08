"use client";

import { Button } from "@mui/joy";
import NextLink from "next/link";
import { MdSearchOff } from "react-icons/md";
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
      icon={<MdSearchOff />}
      actions={
        <Button component={NextLink} href={signedIn ? "/" : "/sign-in"}>
          {signedIn ? "Go home" : "Sign in"}
        </Button>
      }
    />
  );
}
