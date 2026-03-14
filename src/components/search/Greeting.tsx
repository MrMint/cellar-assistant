"use client";

import { Typography } from "@mui/joy";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

interface GreetingProps {
  displayName?: string;
}

export function Greeting({ displayName }: GreetingProps) {
  const greeting = getGreeting();
  const firstName = displayName?.split(" ")[0];

  return (
    <Typography
      level="h2"
      suppressHydrationWarning
      sx={{ fontWeight: 600, textAlign: "center" }}
    >
      {greeting}
      {firstName ? `, ${firstName}` : ""}
    </Typography>
  );
}
