import { describe, expect, it } from "vitest";
import {
  formatInviteToken,
  INVITE_TOKEN_LENGTH,
  isInviteSecret,
  parseInviteToken,
} from "./share.ts";

const INVITER = "3f2b9c1e-8a4d-4f6b-9c2e-1a2b3c4d5e6f";
const SECRET = "AbCdEfGhIjKlMnOpQrSt_-";

describe("invite tokens", () => {
  it("round-trips an inviter and a secret through one URL-safe segment", () => {
    const token = formatInviteToken(INVITER, SECRET);
    expect(token).toHaveLength(INVITE_TOKEN_LENGTH);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parseInviteToken(token)).toEqual({
      inviterId: INVITER,
      secret: SECRET,
    });
  });

  it("returns the id in Postgres's lowercase spelling", () => {
    const token = formatInviteToken(INVITER.toUpperCase(), SECRET);
    expect(parseInviteToken(token)?.inviterId).toBe(INVITER);
  });

  it("refuses anything that is not exactly a token", () => {
    const token = formatInviteToken(INVITER, SECRET);
    for (const bad of [
      undefined,
      null,
      42,
      "",
      token.slice(1),
      `${token}A`,
      `${token.slice(0, -1)}=`,
      `${token.slice(0, 10)}/${token.slice(11)}`,
      INVITER,
    ]) {
      expect(parseInviteToken(bad)).toBeNull();
    }
  });

  it("only the canonical spelling of the id half is a token", () => {
    const token = formatInviteToken(INVITER, SECRET);
    // The 22nd character of 16 bytes holds two spare bits; flipping them
    // decodes to the same bytes, and must not be a second link.
    const last = token[21] ?? "";
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const sibling = alphabet[alphabet.indexOf(last) + 1] ?? "A";
    const forged = `${token.slice(0, 21)}${sibling}${token.slice(22)}`;
    expect(parseInviteToken(forged)).toBeNull();
  });

  it("refuses to format a non-uuid or a malformed secret", () => {
    expect(() => formatInviteToken("not-a-uuid", SECRET)).toThrow();
    expect(() => formatInviteToken(INVITER, "short")).toThrow();
    expect(isInviteSecret(SECRET)).toBe(true);
    expect(isInviteSecret(`${SECRET.slice(1)}=`)).toBe(false);
  });
});
