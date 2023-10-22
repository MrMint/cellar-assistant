"use client";

import SideNavigationBar from "@/components/common/SideNavigationBar";
import withAuth from "@/hocs/withAuth";
import { Box, styled } from "@mui/joy";
import Image from "next/image";
import bot1 from "@/images/bot2.png";
import { InstallPwaDialog } from "@/components/common/InstallPwaDialog";

const Container = styled(Box)(({ theme }) => ({
  display: "flex",
  flexGrow: 1,
  overflow: "hidden",
}));

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container>
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
    </Container>
  );
}
export default withAuth(AuthenticatedLayout);
