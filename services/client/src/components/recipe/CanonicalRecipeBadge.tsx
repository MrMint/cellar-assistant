import { Star, Verified } from "@/components/app/icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type CanonicalRecipeBadgeProps = {
  size?: "sm" | "md" | "lg";
  variant?: "chip" | "banner";
  showIcon?: boolean;
  showText?: boolean;
};

const ICON_SIZE = { sm: "size-3", md: "size-4", lg: "size-5" } as const;
/** The badge sizes its own `> svg`, which outranks a class on the icon. */
const BADGE_ICON_SIZE = {
  sm: "[&>svg]:size-3",
  md: "[&>svg]:size-4",
  lg: "[&>svg]:size-5",
} as const;

/**
 * The community's pick. Success is text and a tint, never a solid slab
 * (design §3.1), so the old solid green chip is a success-tinted badge.
 */
export const CanonicalRecipeBadge = ({
  size = "md",
  variant = "chip",
  showIcon = true,
  showText = true,
}: CanonicalRecipeBadgeProps) => {
  if (variant === "banner") {
    return (
      <div className="flex items-center gap-2 rounded-md bg-success/10 px-4 py-2 text-success">
        {showIcon && (
          <Star aria-hidden className={cn(ICON_SIZE[size], "fill-current")} />
        )}
        {showText && (
          <span
            className={cn(
              size === "sm" && "type-footnote text-success",
              size === "md" && "type-callout",
              size === "lg" && "type-callout font-semibold",
            )}
          >
            Community's Preferred Version
          </span>
        )}
      </div>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "border-success/50 bg-success/10 text-success",
        BADGE_ICON_SIZE[size],
        size === "lg" && "px-3 py-1 text-sm",
      )}
    >
      {showIcon && <Verified aria-hidden />}
      {showText ? (size === "sm" ? "Preferred" : "Community Preferred") : ""}
    </Badge>
  );
};
