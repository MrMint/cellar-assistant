"use client";

import { Box, Chip, Typography } from "@mui/joy";
import { MdStar, MdVerified } from "react-icons/md";

export type CanonicalRecipeBadgeProps = {
  size?: "sm" | "md" | "lg";
  variant?: "chip" | "banner";
  showIcon?: boolean;
  showText?: boolean;
};

export const CanonicalRecipeBadge = ({
  size = "md",
  variant = "chip",
  showIcon = true,
  showText = true,
}: CanonicalRecipeBadgeProps) => {
  const iconSize = size === "sm" ? 12 : size === "lg" ? 20 : 16;
  const chipSize = size === "sm" ? "sm" : size === "lg" ? "lg" : "md";

  if (variant === "banner") {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          bgcolor: "success.100",
          color: "success.700",
          px: 2,
          py: 1,
          borderRadius: "md",
          border: "1px solid",
          borderColor: "success.300",
        }}
      >
        {showIcon && <MdStar size={iconSize} />}
        {showText && (
          <Typography
            level={
              size === "sm" ? "body-xs" : size === "lg" ? "title-sm" : "body-sm"
            }
          >
            Community's Preferred Version
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Chip
      size={chipSize}
      variant="solid"
      color="success"
      startDecorator={showIcon ? <MdVerified size={iconSize} /> : undefined}
    >
      {showText ? (size === "sm" ? "Preferred" : "Community Preferred") : ""}
    </Chip>
  );
};
