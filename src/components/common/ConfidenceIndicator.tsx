"use client";

import { Chip, Stack, Tooltip, Typography } from "@mui/joy";
import { CONFIDENCE_THRESHOLDS } from "@/constants";

type ConfidenceIndicatorProps = {
  confidence: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
};

function getConfidenceLevel(confidence: number): "high" | "medium" | "low" {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) return "high";
  if (confidence >= CONFIDENCE_THRESHOLDS.LOW) return "medium";
  return "low";
}

function getConfidenceColor(
  level: "high" | "medium" | "low",
): "success" | "warning" | "danger" {
  switch (level) {
    case "high":
      return "success";
    case "medium":
      return "warning";
    case "low":
      return "danger";
  }
}

function getConfidenceLabel(level: "high" | "medium" | "low"): string {
  switch (level) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence";
  }
}

function getConfidenceTooltip(level: "high" | "medium" | "low"): string {
  switch (level) {
    case "high":
      return "AI is highly confident in these details. You can trust the pre-filled values.";
    case "medium":
      return "AI is moderately confident. Please review the pre-filled values for accuracy.";
    case "low":
      return "AI has low confidence. Please carefully review and correct the values below.";
  }
}

export const ConfidenceIndicator = ({
  confidence,
  showLabel = true,
  size = "sm",
}: ConfidenceIndicatorProps) => {
  const level = getConfidenceLevel(confidence);
  const color = getConfidenceColor(level);
  const label = getConfidenceLabel(level);
  const tooltip = getConfidenceTooltip(level);
  const percent = Math.round(confidence * 100);

  return (
    <Tooltip title={tooltip} placement="top" arrow>
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip color={color} size={size} variant="soft">
          {percent}%
        </Chip>
        {showLabel && (
          <Typography
            level={size === "sm" ? "body-xs" : "body-sm"}
            color="neutral"
          >
            {label}
          </Typography>
        )}
      </Stack>
    </Tooltip>
  );
};
