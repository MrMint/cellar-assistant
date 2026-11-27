"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useClient, useMutation } from "urql";
import { Camera, Close, ICON_STROKE } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { FormField } from "@/components/app/parts/Field";
import { UserAvatar } from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { feedback } from "@/lib/feedback";
import { avatarDeps, saveAvatar } from "./avatar";
import { RemoveAvatarMutation, UpdateProfileMutation } from "./fragments";

export type EditableProfile = {
  displayName: string;
  avatarUrl: string | null;
};

const NAME_ERROR = "Needs a name";

/**
 * Edit profile (Shell-Me, profile): the picture, then the name, and one
 * Save that lights up only once something changed. A picture is uploaded as
 * the viewer's own `avatar` file and set by id (MC-avatar); the name goes
 * through `updateProfile`. Both write the viewer's own row and nobody
 * else's: neither document names a person (`avatar.test.ts`).
 *
 * `onCancel` draws the sheet's quiet "Not now" at the left of the footer;
 * `onDone` runs after a save (the sheet closes, the page stays).
 */
export function ProfileEditor({
  profile,
  onDone,
  onCancel,
}: {
  profile: EditableProfile;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const nameId = useId();
  const router = useRouter();
  const client = useClient();
  const [, updateProfile] = useMutation(UpdateProfileMutation);
  const [, removeAvatar] = useMutation(RemoveAvatarMutation);
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(profile.displayName);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (photo === null) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const trimmed = name.trim();
  const nameChanged = trimmed !== profile.displayName.trim();
  const dirty = nameChanged || photo !== null || removing;
  const shownPhoto = removing ? null : (preview ?? profile.avatarUrl);
  const nameError = trimmed === "" ? NAME_ERROR : undefined;

  const save = async () => {
    if (nameError !== undefined) {
      feedback("refuse");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (photo !== null) await saveAvatar(photo, avatarDeps(client));
      else if (removing) {
        const result = await removeAvatar({});
        if (result.data?.removeAvatar.__typename !== "UserProfile") {
          throw new Error(result.error?.message ?? "Couldn't remove the photo");
        }
      }
      if (nameChanged) {
        const result = await updateProfile({ input: { displayName: trimmed } });
        const payload = result.data?.updateProfile;
        if (payload?.__typename !== "UserProfile") {
          throw new Error(
            payload !== undefined && "message" in payload
              ? payload.message
              : (result.error?.message ?? "Couldn't save your name"),
          );
        }
      }
      feedback("success");
      notify("Profile saved");
      setPhoto(null);
      setRemoving(false);
      router.refresh();
      onDone?.();
    } catch (cause) {
      feedback("refuse");
      setError(cause instanceof Error ? cause.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-col items-center gap-3">
        {preview !== null ? (
          // A local blob: next/image has nothing to optimise in it.
          // biome-ignore lint/performance/noImgElement: a blob: preview of the chosen file.
          <img
            src={preview}
            alt=""
            className="size-26 rounded-full border border-edge-2 object-cover"
          />
        ) : (
          <UserAvatar
            aria-hidden
            avatarUrl={shownPhoto}
            displayName={trimmed || profile.displayName}
            size="xl"
            className="size-26 text-[2.5rem]"
          />
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            if (file !== null) {
              setPhoto(file);
              setRemoving(false);
            }
            event.target.value = "";
          }}
        />
        <div className="flex gap-1">
          <Button
            type="button"
            variant="quiet"
            disabled={saving}
            onClick={() => fileInput.current?.click()}
          >
            <Camera aria-hidden strokeWidth={ICON_STROKE} />
            {shownPhoto === null ? "Add photo" : "Change photo"}
          </Button>
          {shownPhoto !== null && (
            <Button
              type="button"
              variant="quiet-muted"
              disabled={saving}
              onClick={() => {
                if (photo !== null) setPhoto(null);
                else setRemoving(true);
              }}
            >
              Remove
            </Button>
          )}
        </div>
      </div>

      <FormField
        label="Name"
        htmlFor={nameId}
        error={nameChanged ? nameError : undefined}
        hint="Friends see this name"
      >
        <div className="relative">
          <Input
            id={nameId}
            name="displayName"
            autoComplete="nickname"
            value={name}
            disabled={saving}
            aria-invalid={nameChanged && nameError !== undefined}
            onChange={(event) => setName(event.target.value)}
            className="pr-11"
          />
          {name !== "" && (
            <button
              type="button"
              aria-label="Clear name"
              disabled={saving}
              onClick={() => {
                feedback("tick");
                setName("");
              }}
              className="absolute inset-y-0 right-0 flex size-11 items-center justify-center text-glyph outline-none focus-visible:outline-2 focus-visible:outline-act-ink"
            >
              <Close aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
            </button>
          )}
        </div>
      </FormField>

      {error !== null && (
        <p role="alert" className="t-cap m-0 text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        {onCancel !== undefined && (
          <Button
            type="button"
            variant="quiet-muted"
            disabled={saving}
            onClick={onCancel}
          >
            Not now
          </Button>
        )}
        <Button
          type="submit"
          className="flex-1"
          disabled={!dirty || saving}
          aria-busy={saving || undefined}
        >
          {saving && <Spinner aria-hidden />}
          Save
        </Button>
      </div>
    </form>
  );
}
