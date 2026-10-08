"use client";

import { Stack, Typography } from "@mui/joy";
import type { ReactNode } from "react";
import type { ShellCopy } from "./shell-copy";

/**
 * The one layout behind the shell's not-found, error and offline states: an
 * icon, a heading, a sentence and the actions, centred in whatever space the
 * shell leaves. Deliberately plain Joy — the shadcn migration (D20) replaces
 * this file, and the copy and behaviour around it stay.
 */
export function ShellMessage({
  copy,
  icon,
  actions,
  footnote,
}: {
  copy: ShellCopy;
  icon: ReactNode;
  actions: ReactNode;
  footnote?: string | null;
}) {
  return (
    <Stack
      spacing={2}
      sx={{
        flexGrow: 1,
        minHeight: "100%",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        px: 2,
        py: 4,
      }}
    >
      <Typography
        aria-hidden
        sx={{ fontSize: "3rem", color: "text.tertiary", lineHeight: 1 }}
      >
        {icon}
      </Typography>
      <Typography level="h3" component="h1" sx={{ maxWidth: 420 }}>
        {copy.title}
      </Typography>
      <Typography level="body-md" sx={{ maxWidth: 420 }}>
        {copy.body}
      </Typography>
      <Stack direction="row" spacing={1.5} sx={{ pt: 1 }}>
        {actions}
      </Stack>
      {footnote ? (
        <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
          {footnote}
        </Typography>
      ) : null}
    </Stack>
  );
}
