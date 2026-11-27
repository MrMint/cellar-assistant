import Image from "next/image";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** KIT: 32 tab and rows, 40 rows, 44 a person's row on the People pilot, 64 a profile. */
export const AVATAR_SIZES = {
  sm: 32,
  md: 40,
  row: 44,
  lg: 48,
  xl: 64,
} as const;

/**
 * The initials an avatar shows (CROSS-LOT: two letters): the first letters
 * of the first and last words ("Test Two" → "TT"); a one-word name gives
 * one letter ("Test" → "T").
 */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.charAt(0) ?? "";
  const last = words.length > 1 ? (words.at(-1)?.charAt(0) ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

export type UserAvatarProps = {
  avatarUrl?: string | null;
  displayName?: string | null;
  size?: keyof typeof AVATAR_SIZES;
  className?: string;
} & Omit<ComponentProps<"span">, "children">;

/**
 * A person's avatar (KIT § 3 "Person row and avatar"): their picture when
 * they set one, else their initials on raised inside an edge-2 ring. For a
 * stack, wrap several in `flex -space-x-2` and give each
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
  const initials = initialsOf(displayName) || undefined;
  return (
    <span
      data-slot="user-avatar"
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-edge-2 bg-raised text-ink",
        size === "sm" && "t-micro size-8",
        size === "md" && "t-head size-10",
        size === "row" && "t-head size-11",
        size === "lg" && "t-head size-12",
        size === "xl" && "t-title size-16",
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
        <span aria-hidden={displayName ? undefined : true}>{initials}</span>
      )}
    </span>
  );
}
