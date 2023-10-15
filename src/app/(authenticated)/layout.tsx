"use client";

import SideNavigationBar from "@/components/SideNavigationBar";
import withAuth from "@/hocs/withAuth";
import { AspectRatio, Box, styled } from "@mui/joy";
import Image from "next/image";
import bot1 from "@/app/public/bot2.png";

const Container = styled(Box)(({ theme }) => ({
  display: "flex",
  flexGrow: 1,
  overflow: "hidden",
}));

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container>
      <SideNavigationBar />
      <Box sx={{ flexGrow: 1, padding: "1rem", overflowY: "auto" }}>
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
