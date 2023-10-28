"use client";

import SideNavigationBar from "@/components/common/SideNavigationBar";
import withAuth from "@/hocs/withAuth";
import { Box, styled } from "@mui/joy";
import Image from "next/image";
import bot1 from "@/images/bot2.png";
import { InstallPwaDialog } from "@/components/common/InstallPwaDialog";

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
      <Box
        sx={{
          position: "absolute",
          right: "0",
          bottom: "0",
          zIndex: -10,
          opacity: 0.1,
          userSelect: "none",
        }}
      >
        <Image
          src={bot1}
          height={300}
          width={300}
          alt="A cute robot assistant"
          placeholder="blur"
        />
      </Box>
    </Box>
  );
}
export default withAuth(AuthenticatedLayout);
