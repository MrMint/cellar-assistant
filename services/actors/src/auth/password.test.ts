import { hash as bcryptHash } from "bcryptjs";
import { hashPassword } from "better-auth/crypto";
import { describe, expect, it, vi } from "vitest";
import { createPassword, isBcryptHash } from "./password.ts";

describe("isBcryptHash", () => {
  it("recognises every modular-crypt bcrypt variant", () => {
    const body = "N9qo8uLOickgx2ZMRZoMye.IjZAgcfl7p92ldGxad68LJZdL17lhW";
    for (const prefix of [
      "$2$10$",
      "$2a$10$",
      "$2b$12$",
      "$2x$10$",
      "$2y$10$",
    ]) {
      expect(isBcryptHash(prefix + body)).toBe(true);
    }
  });

  it("rejects a better-auth scrypt hash", async () => {
    expect(isBcryptHash(await hashPassword("123456789"))).toBe(false);
  });

  it("rejects near-misses", () => {
    expect(isBcryptHash("")).toBe(false);
    expect(isBcryptHash("$2a$10$tooshort")).toBe(false);
    expect(
      isBcryptHash(
        "prefix$2a$10$N9qo8uLOickgx2ZMRZoMye.IjZAgcfl7p92ldGxad68LJZdL17lhW",
      ),
    ).toBe(false);
  });
});

describe("createPassword", () => {
  it("verifies a bcrypt hash and rejects the wrong password", async () => {
    const password = createPassword();
    const hash = await bcryptHash("123456789", 10);
    expect(isBcryptHash(hash)).toBe(true);
    expect(await password.verify({ hash, password: "123456789" })).toBe(true);
    expect(await password.verify({ hash, password: "wrong" })).toBe(false);
  });

  it("still verifies its own scrypt hashes", async () => {
    const password = createPassword();
    const hash = await password.hash("123456789");
    expect(isBcryptHash(hash)).toBe(false);
    expect(await password.verify({ hash, password: "123456789" })).toBe(true);
    expect(await password.verify({ hash, password: "wrong" })).toBe(false);
  });

  it("re-hashes only after a successful bcrypt verify", async () => {
    const seen: { bcryptHash: string; newHash: string }[] = [];
    const password = createPassword({
      rehash: async (args) => {
        seen.push(args);
      },
    });
    const hash = await bcryptHash("123456789", 10);

    await password.verify({ hash, password: "wrong" });
    expect(seen).toHaveLength(0);

    await password.verify({ hash, password: "123456789" });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.bcryptHash).toBe(hash);
    expect(isBcryptHash(seen[0]?.newHash ?? "")).toBe(false);
  });

  it("does not re-hash a hash that is already scrypt", async () => {
    const seen: unknown[] = [];
    const password = createPassword({
      rehash: async (args) => {
        seen.push(args);
      },
    });
    const hash = await password.hash("123456789");
    expect(await password.verify({ hash, password: "123456789" })).toBe(true);
    expect(seen).toHaveLength(0);
  });

  /** The rule that keeps a failed upgrade from locking anyone out. */
  it("still returns true when the re-hash throws", async () => {
    const warn = vi.fn();
    const password = createPassword({
      rehash: async () => {
        throw new Error("database is down");
      },
      logger: { warn },
    });
    const hash = await bcryptHash("123456789", 10);
    expect(await password.verify({ hash, password: "123456789" })).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("never re-hashes when rehash is not configured", async () => {
    const password = createPassword({});
    const hash = await bcryptHash("123456789", 10);
    expect(await password.verify({ hash, password: "123456789" })).toBe(true);
  });
});
