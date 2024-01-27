"use client";

import { Box, Button, Stack, Typography } from "@mui/joy";
import { useAuthenticationStatus } from "@nhost/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { isAuthenticated, isLoading, isError } = useAuthenticationStatus();
  const router = useRouter();
  useEffect(() => {
    if (isLoading === false) {
      if (isAuthenticated && !isError) {
        router.replace("/cellars");
      } else {
        router.replace("/sign-in");
      }
    }
  }, [isAuthenticated, isLoading, isError, router]);
  return (
    <Box
      component={"main"}
      sx={{ display: "flex", justifyContent: "center", flexGrow: 1 }}
    >
      <Stack flexGrow={1} spacing={1} padding="0 2rem" alignItems="center">
        <Stack
          maxWidth="1280px"
          direction="row"
          justifyContent="space-between"
          paddingTop={"1rem"}
          width="100%"
        >
          <Typography level="h2">Cellar Assistant</Typography>
          <Link href={"/sign-in"}>
            <Button>Login</Button>
          </Link>
        </Stack>
        <Stack maxWidth="1280px">
          <Box></Box>
          <Box></Box>
        </Stack>
      </Stack>
    </Box>
  );
}
