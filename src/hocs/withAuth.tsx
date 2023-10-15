"use client";

import { Box, CircularProgress } from "@mui/joy";
import { useAuthenticationStatus } from "@nhost/nextjs";
import { useRouter } from "next/navigation";

export enum RedirectOn {
  NotAuthenticated,
  Authenticated,
}

export default function withAuth<P extends {}>(
  Component: React.FunctionComponent<P>,
  redirectUrl = "/sign-in",
  redirectOn = RedirectOn.NotAuthenticated,
) {
  return function AuthProtected(props: P) {
    const router = useRouter();
    const { isLoading, isAuthenticated } = useAuthenticationStatus();

    if (isLoading) {
      return (
        <Box
          sx={{
            display: "flex",
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <CircularProgress />
        </Box>
      );
    }

    switch (true) {
      case redirectOn === RedirectOn.NotAuthenticated &&
        isAuthenticated === false:
      case redirectOn === RedirectOn.Authenticated &&
        isAuthenticated === true: {
        router.push(redirectUrl);
        return null;
      }
      default:
        return <Component {...props} />;
    }
  };
}
