"use client";

import {
  Input,
  FormControl,
  FormLabel,
  FormHelperText,
  Button,
  Box,
  Stack,
  Typography,
  Divider,
  Checkbox,
} from "@mui/joy";
import { useNhostClient, useSignInEmailPassword } from "@nhost/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { BsDiscord, BsFacebook } from "react-icons/bs";
import { FcGoogle } from "react-icons/fc";
import withAuth, { RedirectOn } from "@/hocs/withAuth";

interface IFormInput {
  email: string;
  password: string;
}

const SignIn = () => {
  const [isRedirectingToSso, setIsRedirectingToSso] = useState(false);
  const router = useRouter();
  const {
    signInEmailPassword,
    isLoading,
    isSuccess,
    needsEmailVerification,
    isError,
    error,
  } = useSignInEmailPassword();

  const client = useNhostClient();
  const { control, handleSubmit } = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit: SubmitHandler<IFormInput> = async ({ email, password }) => {
    await signInEmailPassword(email, password);
  };

  useEffect(() => {
    if (isSuccess) router.push("/cellars");
  }, [isSuccess, router]);

  const handleSignInSso = (provider: "google" | "discord" | "facebook") => {
    setIsRedirectingToSso(true);
    client.auth.signIn({
      provider,
      options: {
        redirectTo: "/cellars",
      },
    });
  };

  const disableForm =
    isLoading || needsEmailVerification || isSuccess || isRedirectingToSso;

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
        {needsEmailVerification ? (
          <p>
            Please check your mailbox and follow the verification link to verify
            your email.
          </p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <Stack gap={2} sx={{ mt: 2 }}>
              <FormControl required error={isError}>
                <FormLabel>Email</FormLabel>
                <Controller
                  name="email"
                  control={control}
                  rules={{ required: true }}
                  disabled={disableForm}
                  render={({ field }) => <Input type="email" {...field} />}
                />
              </FormControl>
              <FormControl required error={isError}>
                <FormLabel>Password</FormLabel>
                <Controller
                  name="password"
                  control={control}
                  rules={{ required: true }}
                  disabled={disableForm}
                  render={({ field }) => <Input type="password" {...field} />}
                />
                {isError && <FormHelperText>{error?.message}</FormHelperText>}
              </FormControl>
              <Stack gap={2} sx={{ mt: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Checkbox size="sm" label="Remember me" name="persistent" />
                  <Link href="#replace-with-a-link">Forgot your password?</Link>
                </Box>
                <Button
                  loading={isLoading}
                  type="submit"
                  disabled={disableForm}
                >
                  Sign in
                </Button>
              </Stack>
            </Stack>
          </form>
        )}
      </Box>
    </Box>
  );
};

export default withAuth(SignIn, "/cellars", RedirectOn.Authenticated);
