"use client";

import {
  Box,
  Button,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Sheet,
  Stack,
  Typography,
} from "@mui/joy";
import Link from "next/link";
import { useState, useTransition } from "react";
import { BsDiscord, BsFacebook } from "react-icons/bs";
import { FcGoogle } from "react-icons/fc";
import { getProviderSignInUrl, signIn } from "@/lib/auth/actions";
import { LiquidBackground } from "./LiquidBackground";

export function SignInClient({ returnTo }: { returnTo?: string }) {
  const [isRedirectingToSso, setIsRedirectingToSso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        await signIn(formData);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Sign in failed");
      }
    });
  };

  const handleSignInSso = async (
    provider: "google" | "discord" | "facebook",
  ) => {
    setIsRedirectingToSso(true);
    try {
      const providerUrl = await getProviderSignInUrl(
        provider,
        window.location.origin,
        returnTo,
      );
      window.location.href = providerUrl;
    } catch (_error) {
      setError("Failed to redirect to provider");
      setIsRedirectingToSso(false);
    }
  };

  const disableForm = isPending || isRedirectingToSso;

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexGrow: 1,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <LiquidBackground />
      <Sheet
        variant="outlined"
        sx={{
          maxWidth: { xs: "400px" },
          width: { xs: "100%", sm: "400px" },
          flexGrow: { xs: 1, sm: 0 },
          display: "flex",
          flexDirection: "column",
          padding: 3,
          margin: 2,
          position: "relative",
          zIndex: 1,
          borderRadius: "lg",
          backgroundColor: "rgba(17, 16, 21, 0.65)",
          backdropFilter: "blur(16px) saturate(1.2)",
          WebkitBackdropFilter: "blur(16px) saturate(1.2)",
          borderColor: "rgba(255, 255, 255, 0.08)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        }}
      >
        <Stack gap={1} sx={{ marginBottom: 2 }}>
          <Stack gap={1} marginBottom={2}>
            <Typography level="h3">Sign in</Typography>
            <Typography level="body-sm">
              New to Cellar Assistant? <Link href="/sign-up">Sign up!</Link>
            </Typography>
          </Stack>

          <Button
            onClick={() => handleSignInSso("google")}
            variant="soft"
            color="neutral"
            fullWidth
            disabled={disableForm}
            startDecorator={<FcGoogle />}
          >
            Continue with Google
          </Button>
          <Button
            onClick={() => handleSignInSso("discord")}
            variant="soft"
            color="neutral"
            fullWidth
            disabled={disableForm}
            startDecorator={<BsDiscord />}
          >
            Continue with Discord
          </Button>
          <Button
            onClick={() => handleSignInSso("facebook")}
            variant="soft"
            color="neutral"
            fullWidth
            disabled={disableForm}
            startDecorator={<BsFacebook />}
          >
            Continue with Facebook
          </Button>
        </Stack>
        <Divider>or</Divider>
        <form action={handleSubmit}>
          {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
          <Stack gap={2} sx={{ mt: 2 }}>
            <FormControl required error={!!error}>
              <FormLabel>Email</FormLabel>
              <Input
                type="email"
                name="email"
                required
                disabled={disableForm}
              />
            </FormControl>
            <FormControl required error={!!error}>
              <FormLabel>Password</FormLabel>
              <Input
                type="password"
                name="password"
                required
                disabled={disableForm}
              />
              {error && <FormHelperText>{error}</FormHelperText>}
            </FormControl>
            <Stack gap={2} sx={{ mt: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                }}
              >
                <Link href="#replace-with-a-link">Forgot your password?</Link>
              </Box>
              <Button loading={isPending} type="submit" disabled={disableForm}>
                Sign in
              </Button>
            </Stack>
          </Stack>
        </form>
      </Sheet>
    </Box>
  );
}
