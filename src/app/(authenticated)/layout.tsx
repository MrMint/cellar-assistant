"use client";

import { Box } from "@mui/joy";
import { InstallPwaDialog } from "@/components/common/InstallPwaDialog";
import SideNavigationBar from "@/components/common/SideNavigationBar";
import withAuth from "@/hocs/withAuth";

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
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
      <SideNavigationBar />
      <Box
        sx={{
          flexGrow: 1,
          padding: "1rem",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
export default withAuth(AuthenticatedLayout);
