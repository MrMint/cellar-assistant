"use client";

import { useState } from "react";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { type EditableProfile, ProfileEditor } from "./ProfileEditor";

/**
 * Edit profile as a sheet (Shell-Me: from the hub's header and Settings'
 * first row), returning to where you were; a dialog from `md` up. The page
 * at `/users/edit` holds the same editor for a cold link.
 *
 * While a save runs it can't be swiped, Esc'd or tapped shut (F-131): the
 * editor reports `saving`, and the sheet stays until the save settles.
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
  const [saving, setSaving] = useState(false);
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && saving) return;
        onOpenChange(next);
      }}
      dismissible={!saving}
      title="Edit profile"
    >
      <div className="pb-2">
        {/* Remounted on each open, so a cancelled edit starts clean. */}
        {open && (
          <ProfileEditor
            profile={profile}
            onCancel={() => onOpenChange(false)}
            onDone={() => onOpenChange(false)}
            onSavingChange={setSaving}
          />
        )}
      </div>
    </ResponsiveDialog>
  );
}
