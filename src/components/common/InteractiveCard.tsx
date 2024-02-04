"use client";

import { Card, styled } from "@mui/joy";

export const InteractiveCard = styled(Card)(({ theme }) => ({
  "&:hover": {
    cursor: "pointer",
    boxShadow: theme.shadow.md,
    borderColor: theme.palette.neutral.outlinedHoverBorder,
  },
}));
