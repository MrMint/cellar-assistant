"use client";

import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { type EditableProfile, ProfileEditor } from "./ProfileEditor";

/**
 * Edit profile as a sheet (Shell-Me: from the hub's header and Settings'
 * first row), returning to where you were; a dialog from `md` up. The page
 * at `/users/edit` holds the same editor for a cold link.
 */
export function EditProfileSheet({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: EditableProfile;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit profile"
    >
      <div className="pb-2">
        {/* Remounted on each open, so a cancelled edit starts clean. */}
        {open && (
          <ProfileEditor
            profile={profile}
            onCancel={() => onOpenChange(false)}
            onDone={() => onOpenChange(false)}
          />
        )}
      </div>
    </ResponsiveDialog>
  );
}
