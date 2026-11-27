"use client";

import { useState } from "react";
import { ICON_STROKE, PersonAdd } from "@/components/app/icons";
import { InviteSheet } from "@/components/share/InviteFriendsCard";
import { Button } from "@/components/ui/button";

/**
 * "Invite" (Social-Friends 01, empty, 11): opens the invite sheet — your
 * link's QR code, Copy link, More ways, Reset link. Solid where it is the
 * screen's one job (no friends yet, and Home's empty friends card); outlined
 * in the Friends header, where the list is the content.
 */
export function InviteFriendButton({
  variant = "default",
  label = "Invite",
  className,
}: {
  variant?: "default" | "outline";
  label?: string;
  className?: string;
} = {}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        <PersonAdd aria-hidden strokeWidth={ICON_STROKE} />
        {label}
      </Button>
      <InviteSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
