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
import { useSignInEmailPassword } from "@nhost/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { FcGoogle } from "react-icons/fc";

interface IFormInput {
  email: string;
  password: string;
}

const SignIn = () => {
  const router = useRouter();
  const {
    signInEmailPassword,
    isLoading,
    isSuccess,
    needsEmailVerification,
    isError,
    error,
  } = useSignInEmailPassword();

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
    if (isSuccess) router.push("/items");
  }, [isSuccess, router]);

  const disableForm = isLoading || needsEmailVerification || isSuccess;

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        height: "100vh",
        alignItems: "center",
      }}
    >
      <Box sx={{ width: "400px", display: "flex", flexDirection: "column" }}>
        <Stack gap={4} sx={{ mb: 2 }}>
          <Stack gap={1}>
            <Typography level="h3">Sign in</Typography>
            <Typography level="body-sm">
              New to Cellar Assistant?{" "}
              <Link href="#replace-with-a-link">Sign up!</Link>
            </Typography>
          </Stack>

          <Button
            variant="soft"
            color="neutral"
            fullWidth
            startDecorator={<FcGoogle />}
          >
            Continue with Google
          </Button>
        </Stack>
        <Divider>or</Divider>
        {needsEmailVerification ? (
          <p>
            Please check your mailbox and follow the verification link to verify
            your email.
          </p>
        ) : (
          <Stack gap={4} sx={{ mt: 2 }}>
            <form onSubmit={handleSubmit(onSubmit)}>
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
              <Stack gap={4} sx={{ mt: 2 }}>
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
            </form>
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default SignIn;
