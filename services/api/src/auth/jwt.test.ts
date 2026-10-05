import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  claimsFromPayload,
  createJwtVerifier,
  ctxFromClaims,
  InvalidTokenError,
} from "./jwt.ts";

/**
 * A stand-in for A6's `/api/auth/jwks`: the same algorithm (EdDSA / Ed25519)
 * and the same claim shape, so this exercises the real `jose` code path
 * without needing the actors app running. The live path is proven separately
 * against the compose stack.
 */
const ISSUER = "http://localhost:3002";

let server: Server;
let verifier: ReturnType<typeof createJwtVerifier>;
let signingKey: CryptoKey;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
    crv: "Ed25519",
    extractable: true,
  });
  signingKey = privateKey;
  const jwk = await exportJWK(publicKey);
  const body = JSON.stringify({
    keys: [{ ...jwk, alg: "EdDSA", kid: "test" }],
  });

  server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  verifier = createJwtVerifier({
    jwksUrl: `http://127.0.0.1:${port}/api/auth/jwks`,
    issuer: ISSUER,
    audience: ISSUER,
  });
});

afterAll(() => {
  server.close();
});

const token = async (
  claims: Record<string, unknown>,
  options: { expiresIn?: string; issuer?: string; audience?: string } = {},
): Promise<string> =>
  await new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: "test" })
    .setIssuedAt()
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? ISSUER)
    .setExpirationTime(options.expiresIn ?? "15m")
    .sign(signingKey);

describe("ctx from a verified token (§8.2)", () => {
  it("builds a user ctx from sub", async () => {
    const bearer = `Bearer ${await token({ sub: "user-1", email: "a@b.c" })}`;
    const { ctx, viewer } = await verifier(bearer, "req-1");
    expect(ctx).toEqual({
      viewerId: "user-1",
      kind: "user",
      requestId: "req-1",
    });
    expect(viewer).toEqual({
      id: "user-1",
      email: "a@b.c",
      emailVerified: false,
      role: "user",
    });
  });

  it("builds an admin ctx from the role claim", async () => {
    const bearer = `Bearer ${await token({ sub: "user-2", role: "admin" })}`;
    const { ctx } = await verifier(bearer, "req-2");
    expect(ctx.kind).toBe("admin");
  });

  it("is anonymous with no Authorization header", async () => {
    const { ctx, viewer } = await verifier(null, "req-3");
    expect(ctx).toEqual({ viewerId: null, kind: "user", requestId: "req-3" });
    expect(viewer).toBeNull();
  });
});

describe("a request can never produce kind: 'system' (§1.6)", () => {
  it('maps a role claim of "system" to a plain user', async () => {
    const bearer = `Bearer ${await token({ sub: "user-3", role: "system" })}`;
    const { ctx } = await verifier(bearer, "req-4");
    expect(ctx.kind).toBe("user");
  });

  it("maps every other shape of role claim to a plain user", () => {
    for (const role of [
      "system",
      "SYSTEM",
      "Admin",
      "root",
      ["admin"],
      { role: "admin" },
      null,
      undefined,
      1,
      true,
    ]) {
      const claims = claimsFromPayload({ sub: "u", role });
      expect(ctxFromClaims(claims, "r").kind).not.toBe("system");
      expect(ctxFromClaims(claims, "r").kind).toBe(
        role === "admin" ? "admin" : "user",
      );
    }
  });

  it("has no code path to systemCtx: ctxFromClaims is total over two kinds", () => {
    const kinds = new Set(
      (["admin", "user"] as const).map(
        (role) =>
          ctxFromClaims(
            { id: "u", email: null, emailVerified: false, role },
            "r",
          ).kind,
      ),
    );
    expect([...kinds].sort()).toEqual(["admin", "user"]);
  });
});

describe("rejected tokens", () => {
  it("rejects an expired token (beyond the 5s tolerance) rather than downgrading to anonymous", async () => {
    const bearer = `Bearer ${await token({ sub: "u" }, { expiresIn: "-60s" })}`;
    await expect(verifier(bearer, "r")).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it("rejects a token from another issuer", async () => {
    const bearer = `Bearer ${await token({ sub: "u" }, { issuer: "http://evil.example" })}`;
    await expect(verifier(bearer, "r")).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it("rejects an unsigned or malformed token", async () => {
    await expect(verifier("Bearer not.a.token", "r")).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it("rejects a token with no subject", async () => {
    const bearer = `Bearer ${await token({ email: "a@b.c" })}`;
    await expect(verifier(bearer, "r")).rejects.toThrow(/no subject/);
  });

  /**
   * Every other fixture here signs `aud === iss`, which is also what
   * production configures (`config.ts` refuses anything else). So a verifier
   * that stopped checking `aud` at all passed every test: this is the one
   * token that is right in every respect except its audience — a token
   * better-auth minted for some other consumer of the same issuer.
   */
  it("rejects a token minted for another audience", async () => {
    const bearer = `Bearer ${await token({ sub: "u" }, { audience: "http://other-consumer.example" })}`;
    const rejection = verifier(bearer, "r");
    await expect(rejection).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(rejection).rejects.toMatchObject({
      reason: "claim_invalid",
      claim: "aud",
    });
  });

  /**
   * jose only checks that `sub` is a string, so `""` passes its checks; an
   * empty subject would become a viewer with the id `""`.
   */
  it("rejects a token whose subject is the empty string", async () => {
    const bearer = `Bearer ${await token({ sub: "" })}`;
    await expect(verifier(bearer, "r")).rejects.toMatchObject({
      reason: "no_subject",
    });
  });
});
