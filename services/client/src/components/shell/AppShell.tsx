import { AppShell as AppChrome } from "@/components/app/AppShell";
import { InstallPwaDialog } from "@/components/common/InstallPwaDialog";
import { ApiUrqlProvider } from "@/components/providers/ApiUrqlProvider";
import { ModalPointerGuard } from "./ModalPointerGuard";

/**
 * The signed-in shell: the GraphQL client, the install prompt and the app
 * chrome (`app/AppShell` — `TabBar` on phones, `SideRail` from `sm`, and the
 * inner scroller between them).
 *
 * Its own component, rather than markup inside `(authenticated)/layout.tsx`,
 * because a second place needs it: the root `not-found.tsx`, which handles
 * URLs that match no route at all and so renders outside that layout. With
 * the shell there too, a signed-in viewer on a dead link keeps the tab bar
 * (D24) instead of landing on a bare page with no way back.
 *
 * The viewer is no longer passed in: the old side bar drew the avatar menu
 * (Edit profile, Sign out), and those live on the `/me` hub now (D1), which
 * reads the viewer itself.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ApiUrqlProvider>
      <AppChrome>{children}</AppChrome>
      <InstallPwaDialog />
      <ModalPointerGuard />
    </ApiUrqlProvider>
  );
}
