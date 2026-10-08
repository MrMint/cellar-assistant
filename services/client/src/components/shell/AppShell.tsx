import { Box } from "@mui/joy";
import { ConditionalPaddingWrapper } from "@/components/common/ConditionalPaddingWrapper";
import { InstallPwaDialog } from "@/components/common/InstallPwaDialog";
import SideNavigationBar from "@/components/common/SideNavigationBar";
import { ApiUrqlProvider } from "@/components/providers/ApiUrqlProvider";
import type { ServerUser } from "@/utilities/auth-server";

/**
 * The signed-in shell — the GraphQL client, the navigation and the scrolling
 * content area — for a viewer the caller has already resolved.
 *
 * Its own component, rather than markup inside `(authenticated)/layout.tsx`,
 * because a second place needs it: the root `not-found.tsx`, which handles
 * URLs that match no route at all and so renders outside that layout. With
 * the shell there too, a signed-in viewer on a dead link keeps the tab bar
 * (D24) instead of landing on a bare page with no way back.
 */
export function AppShell({
  user,
  children,
}: {
  user: ServerUser;
  children: React.ReactNode;
}) {
  return (
    <ApiUrqlProvider>
      <Box
        sx={{
          display: "flex",
          flexGrow: 1,
          flexDirection: { xs: "column-reverse", sm: "row" },
          overflow: "hidden",
        }}
      >
        <InstallPwaDialog />
        <SideNavigationBar user={user} />
        <ConditionalPaddingWrapper>{children}</ConditionalPaddingWrapper>
      </Box>
    </ApiUrqlProvider>
  );
}
