"use client";

import { CircularProgress } from "@mui/joy";
import { useAuthenticationStatus } from "@nhost/nextjs";
import { useRouter } from "next/navigation";
import { FC } from "react";

export default function withAuth<P extends {}>(
  Component: React.FunctionComponent<P>,
) {
  return function AuthProtected(props: P) {
    const router = useRouter();
    const { isLoading, isAuthenticated } = useAuthenticationStatus();

    if (isLoading) {
      return (
        <div>
          <CircularProgress />
        </div>
      );
    }

    if (!isAuthenticated) {
      router.push("/sign-in");
      return null;
    }

    return <Component {...props} />;
  };
}
