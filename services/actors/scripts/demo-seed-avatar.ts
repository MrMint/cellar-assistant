/**
 * redesign-2026-11 SV-D (L36): a profile picture on one sample person, so the
 * avatar states a later wave screenshots (a person row with a picture beside
 * ones with initials) have data behind them.
 *
 * The picture is **generated** here — a soft two-colour gradient disc — never
 * a photograph of anyone. It goes through the real path a person's upload
 * takes: `createUploadTarget(kind: "avatar")`, a PUT to the presigned URL,
 * `verifyUpload`, then `setAvatar`, each as the person themselves, so `files`
 * and `user.avatar_file_id` are exactly what the app would have written.
 *
 * `demo-seed.ts` (SV-B's) calls {@link seed} with its `DemoSeedContext`.
 * Idempotent: a person who already has a verified picture is left alone.
 */
import { crc32, deflateSync } from "node:zlib";
import type { createDb } from "@cellar-assistant/db";
import { sql } from "@cellar-assistant/db/orm";
import type { DemoSeedContext, DemoUserKey } from "./demo-seed-data.ts";

type Db = ReturnType<typeof createDb>;

/** The one sample person who gets a picture. */
export const DEMO_AVATAR_USER: DemoUserKey = "maya";

const CREATE_UPLOAD_TARGET = `
  mutation DemoAvatarUploadTarget($fileId: ID, $input: CreateUploadTargetInput!) {
    createUploadTarget(fileId: $fileId, input: $input) {
      __typename
      ... on UploadTarget { fileId uploadUrl }
      ... on Error { message }
    }
  }
`;
const VERIFY_UPLOAD = `
  mutation DemoAvatarVerify($fileId: ID!) {
    verifyUpload(fileId: $fileId) {
      __typename
      ... on Error { message }
    }
  }
`;
const SET_AVATAR = `
  mutation DemoSetAvatar($fileId: ID!) {
    setAvatar(fileId: $fileId) {
      __typename
      ... on Error { message }
    }
  }
`;

/** L36's entry point. */
export async function seed(ctx: DemoSeedContext): Promise<void> {
  const db = ctx.db as Db;
  const userId = ctx.userId(DEMO_AVATAR_USER);
  const { rows } = await db.execute<{ ok: boolean }>(sql`
    select true as ok
      from "user" u join files f on f.id = u.avatar_file_id
     where u.id = ${userId}::uuid and f.verified_at is not null
  `);
  if (rows.length > 0) {
    ctx.count("profile pictures", false);
    return;
  }

  const fileId = ctx.demoId(`file:avatar:${DEMO_AVATAR_USER}`);
  const verified = await db.execute<{ ok: boolean }>(sql`
    select true as ok from files
     where id = ${fileId}::uuid and verified_at is not null
  `);
  if (verified.rows.length === 0) {
    const target = expect(
      await ctx.graphql(DEMO_AVATAR_USER, CREATE_UPLOAD_TARGET, {
        fileId,
        input: { kind: "avatar", contentType: "image/png" },
      }),
      "createUploadTarget",
      "UploadTarget",
    );
    const put = await fetch(String(target.uploadUrl), {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: new Uint8Array(avatarPng()),
    });
    if (!put.ok) {
      throw new Error(`avatar PUT: ${put.status} ${await put.text()}`);
    }
    expect(
      await ctx.graphql(DEMO_AVATAR_USER, VERIFY_UPLOAD, { fileId }),
      "verifyUpload",
      "File",
    );
  }
  expect(
    await ctx.graphql(DEMO_AVATAR_USER, SET_AVATAR, { fileId }),
    "setAvatar",
    "UserProfile",
  );
  ctx.count("profile pictures", true);
}

const expect = (
  data: Record<string, unknown>,
  field: string,
  typename: string,
): Record<string, unknown> => {
  const value = data[field] as Record<string, unknown> | null | undefined;
  if (value?.__typename !== typename) {
    throw new Error(
      `[demo-seed-avatar] ${field}: expected ${typename}, got ` +
        JSON.stringify(value),
    );
  }
  return value;
};

/**
 * A 256×256 RGB PNG: a disc shading from teal to amber over a pale ground.
 * Generated, so no real person's likeness is ever seeded.
 */
export const avatarPng = (): Buffer => {
  const size = 256;
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  const from = [44, 122, 123];
  const to = [214, 158, 46];
  const ground = [240, 236, 228];
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const inside = Math.hypot(x - centre, y - centre) <= size * 0.46;
      const t = (x + y) / (2 * (size - 1));
      const px = y * stride + 1 + x * 3;
      for (let c = 0; c < 3; c++) {
        const shade = (from[c] ?? 0) + ((to[c] ?? 0) - (from[c] ?? 0)) * t;
        raw[px + c] = Math.round(inside ? shade : (ground[c] ?? 0));
      }
    }
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};
