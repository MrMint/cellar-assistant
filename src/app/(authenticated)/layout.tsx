"use client";

import SideNavigationBar from "@/components/SideNavigationBar";
import withAuth from "@/hocs/withAuth";
import { Box, styled } from "@mui/joy";

const Container = styled(Box)(({ theme }) => ({
  display: "flex",
  width: "100vh",
  height: "100vh",
}));

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container>
      <SideNavigationBar />
      <Box sx={{ padding: "1rem" }}>{children}</Box>
    </Container>
  );
}

export default withAuth(AuthenticatedLayout);
