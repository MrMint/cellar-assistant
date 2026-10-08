import type { ComponentProps, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The scan pages' status chip, on the tokens. Joy's `warning` meant "still
 * working" here, which is an AI-progress state: teal (`ai`), the one place
 * besides `AIDraftField` the colour enters. Success is a tint, never a solid
 * slab; danger is text and outline (design §3.1).
 */
export type ScanTone = "success" | "working" | "danger" | "neutral";

const TONE_CLASS: Record<ScanTone, string> = {
  success: "bg-success/15 text-success",
  working: "bg-ai/15 text-ai",
  danger: "border-destructive/60 bg-transparent text-destructive",
  neutral: "bg-surface-3 text-ink-2",
};

export function ScanStatusBadge({
  tone,
  icon,
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof Badge>, "variant"> & {
  tone: ScanTone;
  icon?: ReactNode;
}) {
  return (
    <Badge
      {...props}
      variant="secondary"
      data-tone={tone}
      className={cn(
        "h-6 px-2.5 text-xs [&>svg]:size-3.5",
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon}
      {children}
    </Badge>
  );
}
