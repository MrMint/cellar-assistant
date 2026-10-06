/**
 * The `File` surface — A7c (2).
 *
 * `FileActor` was built by A8 and had **no GraphQL surface at all**, so images
 * could neither be uploaded nor displayed. These tests pin the two halves that
 * matter: the upload handshake reaches the actor with the id the client chose,
 * and `ItemImage.file { url }` is a path from an item to a renderable URL.
 *
 * `services/actors/src/actors/file-actor.test.ts` proves the actor itself against
 * real Postgres; this file proves only the boundary.
 */
import { ConflictError } from "@cellar-assistant/contracts";
import { execute, parse } from "graphql";
import { describe, expect, it } from "vitest";
import { stubSidecar, testContext } from "../testing.ts";
import { schema } from "./index.ts";

const run = (
  document: string,
  context: ReturnType<typeof testContext>,
  variableValues?: Record<string, unknown>,
) =>
  execute({
    schema,
    document: parse(document),
    contextValue: context,
    variableValues,
  });

const viewer = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "test@test.com",
  emailVerified: true,
  role: "user" as const,
};

const FILE_ID = "22222222-2222-4222-8222-222222222222";

const fileRow = (verified: boolean) => ({
  id: FILE_ID,
  bucket: "cellar-files",
  key: `item-image/${FILE_ID}`,
  size: verified ? 4096 : null,
  mimeType: "image/jpeg",
  etag: verified ? "abc" : null,
  uploadedBy: viewer.id,
  verifiedAt: verified ? "2026-09-09T00:00:00.000Z" : null,
  metadata: { kind: "item-image" },
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
});

describe("createUploadTarget (A7c)", () => {
  it("addresses FileActor with the id the client minted", async () => {
    const { invoke, calls } = stubSidecar({
      "FileActor.createUploadTarget": (actorId, _ctx, input) => ({
        fileId: actorId,
        bucket: "cellar-files",
        key: `item-image/${actorId}`,
        uploadUrl: `http://minio:9000/cellar-files/item-image/${actorId}?X-Amz-Signature=x`,
        expiresAt: "2026-09-09T00:15:00.000Z",
        echoed: input,
      }),
    });
    const result = await run(
      `mutation ($id: ID!) {
         createUploadTarget(fileId: $id, input: { kind: "item-image", contentType: "image/jpeg" }) {
           __typename
           ... on UploadTarget { fileId key uploadUrl expiresAt }
           ... on ActorError { code message }
         }
       }`,
      testContext(invoke, viewer),
      { id: FILE_ID },
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.createUploadTarget).toMatchObject({
      __typename: "UploadTarget",
      fileId: FILE_ID,
      key: `item-image/${FILE_ID}`,
    });
    expect(calls[0]).toMatchObject({
      actorType: "FileActor",
      actorId: FILE_ID,
      method: "createUploadTarget",
    });
    expect(calls[0]?.args[1]).toEqual({
      kind: "item-image",
      contentType: "image/jpeg",
    });
  });

  it("mints an id when the client does not supply one", async () => {
    const { invoke, calls } = stubSidecar({
      "FileActor.createUploadTarget": (actorId) => ({
        fileId: actorId,
        bucket: "cellar-files",
        key: `menu-scan/${actorId}`,
        uploadUrl: "http://minio:9000/x",
        expiresAt: "2026-09-09T00:15:00.000Z",
      }),
    });
    const result = await run(
      `mutation { createUploadTarget(input: { kind: "menu-scan" }) {
         ... on UploadTarget { fileId }
       } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]?.actorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("verifyUpload (A7c)", () => {
  it("returns the typed ConflictError when the PUT has not landed", async () => {
    const { invoke } = stubSidecar({
      "FileActor.verify": () => {
        throw new ConflictError(
          "file … : no object yet — the PUT has not completed",
        );
      },
    });
    const result = await run(
      `mutation ($id: ID!) { verifyUpload(fileId: $id) {
         __typename ... on ActorError { code }
       } }`,
      testContext(invoke, viewer),
      { id: FILE_ID },
    );
    // A typed error, in `data` — not a top-level failure.
    expect(result.errors).toBeUndefined();
    expect(result.data?.verifyUpload).toEqual({
      __typename: "ConflictError",
      code: "CONFLICT",
    });
  });
});

describe("reading a file back (A7c)", () => {
  it("query file { url } presigns through the actor", async () => {
    const { invoke, calls } = stubSidecar({
      "FileActor.get": () => fileRow(true),
      "FileActor.presignRead": () => ({
        url: "http://minio:9000/cellar-files/item-image/x?X-Amz-Signature=y",
        expiresAt: "2026-09-09T00:30:00.000Z",
      }),
    });
    const result = await run(
      `query ($id: ID!) { file(id: $id) {
         ... on File { id mimeType verifiedAt url urlExpiresAt }
       } }`,
      testContext(invoke, viewer),
      { id: FILE_ID },
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.file).toMatchObject({
      id: FILE_ID,
      mimeType: "image/jpeg",
      url: "http://minio:9000/cellar-files/item-image/x?X-Amz-Signature=y",
      urlExpiresAt: "2026-09-09T00:30:00.000Z",
    });
    expect(calls.map((call) => call.method)).toEqual([
      "get",
      "presignRead",
      "presignRead",
    ]);
  });

  /**
   * The gap this closes: an item image was a dead end. `fileId` was the only
   * field on `ItemImage`, and no field anywhere turned one into a URL.
   */
  it("ItemImage.file { url } is a path from an item to a renderable URL", async () => {
    const item = {
      id: "33333333-3333-4333-8333-333333333333",
      type: "WINE" as const,
      name: "Wine",
      description: null,
      country: null,
      barcodeCode: null,
      createdById: viewer.id,
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
      vintage: "2019-01-01",
      variety: null,
      region: null,
      style: "RED",
      specialDesignation: null,
      vineyardDesignation: null,
      alcoholContentPercentage: null,
    };
    const { invoke } = stubSidecar({
      "ItemActor.get": () => item,
      "ItemActor.images": () => ({
        entries: [
          {
            cursor: "offset:0",
            node: {
              id: "44444444-4444-4444-8444-444444444444",
              itemId: item.id,
              itemType: "WINE",
              fileId: FILE_ID,
              userId: viewer.id,
              isPublic: true,
              placeholder: null,
              createdAt: "2026-09-09T00:00:00.000Z",
              updatedAt: "2026-09-09T00:00:00.000Z",
            },
          },
        ],
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 1,
      }),
      "FileActor.get": () => fileRow(true),
      "FileActor.presignRead": () => ({
        url: "http://minio:9000/signed",
        expiresAt: "2026-09-09T00:30:00.000Z",
      }),
    });
    const result = await run(
      `query ($id: ID!) { item(type: WINE, id: $id) {
         ... on QueryItemSuccess {
           data { images(first: 1) { edges { node { fileId isPublic file { url mimeType } } } } }
         }
       } }`,
      testContext(invoke, viewer),
      { id: item.id },
    );
    expect(result.errors).toBeUndefined();
    const data = result.data?.item as {
      data: { images: { edges: { node: Record<string, unknown> }[] } };
    };
    expect(data.data.images.edges[0]?.node).toEqual({
      fileId: FILE_ID,
      isPublic: true,
      file: { url: "http://minio:9000/signed", mimeType: "image/jpeg" },
    });
  });
});
