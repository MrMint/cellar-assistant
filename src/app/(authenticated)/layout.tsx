import { Box } from "@mui/joy";
import { ConditionalPaddingWrapper } from "@/components/common/ConditionalPaddingWrapper";
import { InstallPwaDialog } from "@/components/common/InstallPwaDialog";
import SideNavigationBar from "@/components/common/SideNavigationBar";
import { getServerUser } from "@/utilities/auth-server";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side authentication check - redirects to /sign-in if not authenticated
  const user = await getServerUser();

  return (
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
  );
}
