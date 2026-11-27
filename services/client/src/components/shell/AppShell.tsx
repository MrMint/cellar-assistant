import { AppShell as AppChrome } from "@/components/app/AppShell";
import { ShellViewerProvider } from "@/components/app/overlays/ShellViewer";
import { InstallPwaDialog } from "@/components/common/InstallPwaDialog";
import { AiJobWatcher } from "@/components/home/AiJobWatcher";
import { ApiUrqlProvider } from "@/components/providers/ApiUrqlProvider";
import { ModalPointerGuard } from "./ModalPointerGuard";

/**
 * The signed-in shell: the GraphQL client, the install prompt and the app
 * chrome (`app/AppShell` — `TabBar` on phones, `SideRail` from `md`, and the
 * inner scroller between them).
 *
 * Its own component, rather than markup inside `(authenticated)/layout.tsx`,
 * because a second place needs it: the root `not-found.tsx`, which handles
 * URLs that match no route at all and so renders outside that layout. With
 * the shell there too, a signed-in viewer on a dead link keeps the tab bar
 * (D24) instead of landing on a bare page with no way back.
 *
 * The viewer is passed in for the tab bar's Me avatar (KIT § 2) and its
 * friend-request badge; Edit profile and Sign out live on the `/me` hub (D1).
 */
export function AppShell({
  children,
  viewer,
}: {
  children: React.ReactNode;
  /** The signed-in person, for the Me avatar; omitted on the root not-found. */
  viewer?: { displayName?: string | null; avatarUrl?: string | null };
}) {
  return (
    <ApiUrqlProvider>
      <ShellViewerProvider
        displayName={viewer?.displayName}
        avatarUrl={viewer?.avatarUrl}
      >
        <AppChrome>{children}</AppChrome>
      </ShellViewerProvider>
      <InstallPwaDialog />
      <ModalPointerGuard />
      {/* X10: polls the viewer's AI work while it runs and toasts what
          finishes, wherever the person has gone. */}
      <AiJobWatcher />
    </ApiUrqlProvider>
  );
}
