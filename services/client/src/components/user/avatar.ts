/**
 * Setting a profile picture (MC-avatar, L17): upload the file as kind
 * `avatar`, verified (nothing downstream verifies it, unlike an item image),
 * then `setAvatar(fileId)`. The deps come in as arguments so the order and
 * the refusal path are tested without a network (`avatar.test.ts`).
 */
import type { Client, OperationResult } from "urql";
import { type UploadKind, uploadFile } from "@/lib/api/files";
import type { ResultOf } from "@/lib/api/graphql";
import type { SetAvatarMutation } from "./fragments";

/**
 * The server accepts any kind matching its pattern and checks an avatar's
 * file against this one; `UploadKind` in `lib/api/files.ts` does not list it
 * yet (hand-off), so it is named here once.
 */
const AVATAR_KIND: UploadKind = "avatar";

export type AvatarDeps = {
  upload: (
    file: Blob,
    kind: UploadKind,
    options: { verify: boolean },
  ) => Promise<string>;
  setAvatar: (
    fileId: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
};

/** Upload and set; throws with the API's reason when either step refuses. */
export async function saveAvatar(
  file: Blob,
  deps: AvatarDeps,
): Promise<string> {
  const fileId = await deps.upload(file, AVATAR_KIND, { verify: true });
  const result = await deps.setAvatar(fileId);
  if (!result.ok) throw new Error(result.message);
  return fileId;
}

/** `useMutation(SetAvatarMutation)`'s executor. */
export type RunSetAvatar = (variables: {
  fileId: string;
}) => Promise<OperationResult<ResultOf<typeof SetAvatarMutation>>>;

/**
 * The real deps: the upload over the app's urql client, and `setAvatar`
 * through the caller's `useMutation` (no bare `.toPromise()` in components).
 */
export const avatarDeps = (
  client: Client,
  runSetAvatar: RunSetAvatar,
): AvatarDeps => ({
  upload: (file, kind, options) => uploadFile(client, file, kind, options),
  setAvatar: async (fileId) => {
    const response = await runSetAvatar({ fileId });
    const payload = response.data?.setAvatar;
    if (payload?.__typename === "UserProfile") return { ok: true };
    const message =
      payload !== undefined && payload !== null && "message" in payload
        ? String(payload.message)
        : (response.error?.message ?? "Couldn't save the photo");
    return { ok: false, message };
  },
});
