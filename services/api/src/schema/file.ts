/**
 * `File` — A7c (2), the GraphQL surface `FileActor` never had.
 *
 * A8 built the whole upload protocol and **nothing exposed it**, so D3 could
 * neither upload an image nor display one: `ItemImage` carries a `fileId` and
 * no field anywhere turned one into a URL.
 *
 * The client's sequence is three calls and one PUT:
 *
 * ```
 * 1. createUploadTarget(input: { kind: "item-image", contentType: "image/jpeg" })
 *      → { fileId, uploadUrl, expiresAt }
 * 2. PUT the bytes to `uploadUrl` directly — never through this API, and never
 *    through the Dapr sidecar (target-stack §4: "image bytes never pass through
 *    the sidecar").
 * 3. attachItemImage(fileId: …) — which calls `FileActor.verify` itself, so a
 *    separate `verifyUpload` is only needed for a flow that attaches later, or
 *    to check that a PUT landed before showing the user a success state.
 * 4. read it back through `ItemImage.url`, or `file(id:) { url }`.
 * ```
 *
 * ## `uploadUrl` and `url` are not reachable from a browser yet — that is E3's
 *
 * Both are presigned against the object store's *in-network* endpoint, so today
 * they come back as `http://minio:9000/…`, which resolves only inside the
 * compose network. The signature covers the host, so this cannot be fixed by
 * rewriting the string on the way out: **E3 owns publishing MinIO on an
 * externally routable name** and setting `FILES_S3_ENDPOINT` / `FILES_S3_PORT`
 * (and the binding's `endpoint`) to it, at which point every URL this module
 * returns is usable unchanged. Nothing here needs to change when that lands.
 */

import { randomUUID } from "node:crypto";
import type {
  DeletedFile,
  FileDto,
  UploadTarget as UploadTargetType,
} from "@cellar-assistant/contracts";
import { FileActorDescriptor } from "@cellar-assistant/contracts";
import { builder } from "./builder.ts";

export const FileType = builder.objectRef<FileDto>("File").implement({
  description:
    "One `files` row — the table that replaced Nhost's `storage.files`. " +
    "Readable by its uploader, and by anyone when something public " +
    "references it (a public `item_image`, a place photo).",
  fields: (t) => ({
    id: t.exposeID("id"),
    bucket: t.exposeString("bucket"),
    key: t.exposeString("key", {
      description: "The object key inside `bucket`, e.g. `item-image/<uuid>`.",
    }),
    size: t.exposeInt("size", {
      nullable: true,
      description: "Bytes, read from the object store. Null until verified.",
    }),
    mimeType: t.exposeString("mimeType", { nullable: true }),
    etag: t.exposeString("etag", { nullable: true }),
    uploadedBy: t.exposeID("uploadedBy", { nullable: true }),
    verifiedAt: t.expose("verifiedAt", {
      type: "DateTime",
      nullable: true,
      description:
        "When the object store confirmed the object exists. Null means the " +
        "PUT has not completed — the row is provisional and `MaintenanceActor` " +
        "reaps it after 24h. An unverified file cannot be attached to an item.",
    }),
    metadata: t.field({
      type: "JSON",
      resolve: (file) => file.metadata,
    }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),

    url: t.field({
      type: "String",
      description:
        "A presigned GET URL, valid for 30 minutes. One actor call per " +
        "file — select it only where you are actually going to render the " +
        "image. Throws `ConflictError` if the file is not verified.",
      resolve: async (file, _args, context) =>
        (await context.actor(FileActorDescriptor, file.id).presignRead()).url,
    }),
    urlExpiresAt: t.field({
      type: "DateTime",
      description:
        "When the URL from `url` stops working. Selecting both costs two " +
        "presigns; they are cheap (pure signing, no network call) but not free.",
      resolve: async (file, _args, context) =>
        (await context.actor(FileActorDescriptor, file.id).presignRead())
          .expiresAt,
    }),
  }),
});

const UploadTargetTypeRef = builder
  .objectRef<UploadTargetType>("UploadTarget")
  .implement({
    description:
      "Where to PUT the bytes. The client uploads to `uploadUrl` directly — " +
      "the API never sees the image, and neither does the Dapr sidecar.",
    fields: (t) => ({
      fileId: t.exposeID("fileId", {
        description:
          "Address `FileActor` with this, and pass it to `attachItemImage`, " +
          "`createMenuScan` or `startItemOnboarding` once the PUT succeeds.",
      }),
      bucket: t.exposeString("bucket"),
      key: t.exposeString("key"),
      uploadUrl: t.exposeString("uploadUrl", {
        description:
          "A presigned PUT. Send the raw bytes as the body with the same " +
          "`Content-Type` you declared; add no other headers, or the " +
          "signature will not match.",
      }),
      expiresAt: t.expose("expiresAt", {
        type: "DateTime",
        description: "15 minutes out. Mint a new target rather than retrying.",
      }),
    }),
  });

const DeletedFileType = builder
  .objectRef<DeletedFile>("DeletedFile")
  .implement({ fields: (t) => ({ id: t.exposeID("id") }) });

const CreateUploadTargetInputType = builder.inputType(
  "CreateUploadTargetInput",
  {
    fields: (t) => ({
      kind: t.string({
        required: true,
        description:
          "The object-key namespace: lowercase letters, digits and hyphens " +
          "(`item-image`, `label-front`, `menu-scan`). It becomes the key's " +
          "prefix and is recorded in `metadata.kind`.",
      }),
      contentType: t.string({
        required: false,
        description:
          "The `Content-Type` you will send on the PUT. Stored as " +
          "`files.mime_type`.",
      }),
    }),
  },
);

builder.queryField("file", (t) =>
  t.field({
    type: FileType,
    description:
      "One file's metadata, and — through `url` — a link to its bytes. " +
      "`NotFoundError` covers both 'no such file' and 'not visible to you'.",
    errors: {},
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(FileActorDescriptor, String(args.id)).get(),
  }),
);

builder.mutationField("createUploadTarget", (t) =>
  t.field({
    type: UploadTargetTypeRef,
    description:
      "Step 1 of an upload. Mints the `files` row and a presigned PUT URL. " +
      "**Not idempotent, on purpose**: a second call on the same `fileId` is " +
      "a `ConflictError` rather than a second, different URL for one row.",
    errors: {},
    args: {
      fileId: t.arg.id({
        required: false,
        description:
          "Mint it client-side to control the id you will reference later; " +
          "omitted, the server mints one and returns it.",
      }),
      input: t.arg({ type: CreateUploadTargetInputType, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          FileActorDescriptor,
          args.fileId === undefined || args.fileId === null
            ? randomUUID()
            : String(args.fileId),
        )
        .createUploadTarget({
          kind: args.input.kind,
          contentType: args.input.contentType ?? null,
        }),
  }),
);

builder.mutationField("verifyUpload", (t) =>
  t.field({
    type: FileType,
    description:
      "Step 3. Asks the object store whether the object is actually there — " +
      "the client's word is never taken for it. Idempotent: a second call on " +
      "a verified file is a read. `ConflictError` means the PUT has not " +
      "landed. `attachItemImage` calls this for you; use it directly when the " +
      "upload and the attach are separated in time.",
    errors: {},
    args: { fileId: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(FileActorDescriptor, String(args.fileId)).verify(),
  }),
);

builder.mutationField("deleteFile", (t) =>
  t.field({
    type: DeletedFileType,
    description:
      "Uploader only. Removes the row, then best-effort removes the object — " +
      "the row is the truth (§1.3), so an orphaned object is inert. Detach " +
      "the image first; the foreign key from `item_image` is `RESTRICT`.",
    errors: {},
    args: { fileId: t.arg.id({ required: true }) },
    resolve: async (_root, args, context) => {
      const fileId = String(args.fileId);
      await context.actor(FileActorDescriptor, fileId).delete();
      return { id: fileId };
    },
  }),
);
