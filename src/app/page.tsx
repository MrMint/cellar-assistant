"use client";

import { Box, Button, Stack, Typography } from "@mui/joy";
import Link from "next/link";

export default function Home() {
  return (
    <Box component={"main"} sx={{ display: "flex", justifyContent: "center" }}>
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
