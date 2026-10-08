import Image from "next/image";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const AVATAR_SIZES = { sm: 32, md: 40, lg: 48 } as const;

export type UserAvatarProps = {
  avatarUrl?: string | null;
  displayName?: string | null;
  size?: keyof typeof AVATAR_SIZES;
  className?: string;
} & Omit<ComponentProps<"span">, "children">;

/**
 * A person's avatar: their photo, or the first letter of their name on a
 * surface. Same props as `common/UserAvatar` minus `sx` (which stays for
 * unconverted callers until the removal step). For a stack (Joy's
 * `AvatarGroup`), wrap several in `flex -space-x-2` and give each
 * `ring-2 ring-background`.
 */
export function UserAvatar({
  avatarUrl,
  displayName,
  size = "md",
  className,
  ...props
}: UserAvatarProps) {
  const pixels = AVATAR_SIZES[size];
  const initial = displayName?.trim().charAt(0).toUpperCase() || undefined;
  return (
    <span
      data-slot="user-avatar"
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-surface-3 font-semibold text-ink-2",
        size === "sm" && "size-8 text-sm",
        size === "md" && "size-10 text-base",
        size === "lg" && "size-12 text-lg",
        className,
      )}
      {...props}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={displayName ?? "User avatar"}
          width={pixels}
          height={pixels}
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden={displayName ? undefined : true}>{initial}</span>
      )}
    </span>
  );
}
