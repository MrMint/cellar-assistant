"use client";

import {
  Box,
  Button,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Stack,
  Typography,
} from "@mui/joy";
import Link from "next/link";
import { useState, useTransition } from "react";
import { BsDiscord, BsFacebook } from "react-icons/bs";
import { FcGoogle } from "react-icons/fc";
import { useAuth } from "@/components/providers/NhostClientProvider";
import { getProviderSignInUrl, signIn } from "@/lib/auth/actions";

interface IFormInput {
  email: string;
  password: string;
}

export function SignInClient() {
  const [isRedirectingToSso, setIsRedirectingToSso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { nhost } = useAuth();

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
      const providerUrl = await getProviderSignInUrl(provider, window.location.origin);
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
      }}
    >
      <Box
        sx={{
          maxWidth: { xs: "400px" },
          width: { xs: null, sm: "400px" },
          flexGrow: { xs: 1, sm: 0 },
          display: "flex",
          flexDirection: "column",
          padding: "1rem",
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
      </Box>
    </Box>
  );
}
