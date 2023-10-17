"use client";

import withAuth, { RedirectOn } from "@/hocs/withAuth";
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
import { useSignUpEmailPassword } from "@nhost/nextjs";
import { Controller, SubmitHandler, useForm } from "react-hook-form";

interface IFormInput {
  email: string;
  password: string;
}

const SignUp = () => {
  const {
    isLoading,
    isSuccess,
    needsEmailVerification,
    isError,
    error,
    signUpEmailPassword,
  } = useSignUpEmailPassword();

  const { control, handleSubmit } = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit: SubmitHandler<IFormInput> = async ({ email, password }) => {
    await signUpEmailPassword(email, password);
  };

  const disableForm = isLoading || needsEmailVerification || isSuccess;

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexGrow: 1,
      }}
    >
      <Box sx={{ width: "400px", display: "flex", flexDirection: "column" }}>
        {needsEmailVerification ? (
          <p>
            Please check your mailbox and follow the verification link to verify
            your email.
          </p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <Stack gap={4} sx={{ mt: 1 }}>
              <Typography level="h3">Sign up for Cellar Assitant</Typography>
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
              <Button loading={isLoading} type="submit" disabled={disableForm}>
                Sign up
              </Button>
            </Stack>
          </form>
        )}
      </Box>
    </Box>
  );
};

export default withAuth(SignUp, "/cellars", RedirectOn.Authenticated);
