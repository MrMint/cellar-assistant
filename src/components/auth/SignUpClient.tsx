"use client";

import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Stack,
  Typography,
} from "@mui/joy";
import { useState, useTransition } from "react";
import { signUp } from "@/lib/auth/actions";

export function SignUpClient() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        await signUp(formData);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Sign up failed");
      }
    });
  };

  const disableForm = isPending;

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
        <form action={handleSubmit}>
          <Stack gap={4} sx={{ mt: 1 }}>
            <Typography level="h3">Sign up for Cellar Assistant</Typography>
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
            <Button loading={isPending} type="submit" disabled={disableForm}>
              Sign up
            </Button>
          </Stack>
        </form>
      </Box>
    </Box>
  );
}
