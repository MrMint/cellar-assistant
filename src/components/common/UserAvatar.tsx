"use client";

import { Avatar, type AvatarProps } from "@mui/joy";
import Image from "next/image";
import { forwardRef } from "react";

const AVATAR_SIZES = {
	sm: 32,
	md: 40,
	lg: 48,
} as const;

type UserAvatarProps = {
	avatarUrl?: string | null;
	displayName?: string | null;
	size?: "sm" | "md" | "lg";
	sx?: AvatarProps["sx"];
};

export const UserAvatar = forwardRef<HTMLDivElement, UserAvatarProps>(
	({ avatarUrl, displayName, size = "md", sx }, ref) => {
		const pixels = AVATAR_SIZES[size];
		const initial = displayName?.charAt(0)?.toUpperCase() ?? undefined;

		if (avatarUrl) {
			return (
				<Avatar ref={ref} size={size} sx={sx}>
					<Image
						src={avatarUrl}
						alt={displayName ?? "User avatar"}
						width={pixels}
						height={pixels}
						style={{ objectFit: "cover" }}
					/>
				</Avatar>
			);
		}

		return (
			<Avatar ref={ref} size={size} sx={sx}>
				{initial}
			</Avatar>
		);
	},
);
UserAvatar.displayName = "UserAvatar";
