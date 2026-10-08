import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { inviteShareData, shareInvite } from "./invite";

const data = inviteShareData("https://cellar.example");

describe("inviteShareData", () => {
  test("a sign-up link on this origin, naming nobody", () => {
    assert.equal(data.url, "https://cellar.example/sign-up");
    assert.doesNotMatch(data.url, /[?#]/);
  });
});

describe("shareInvite", () => {
  test("the share sheet where there is one", async () => {
    const shared: unknown[] = [];
    const outcome = await shareInvite(data, {
      share: async (d) => {
        shared.push(d);
      },
      clipboard: {
        writeText: async () => assert.fail("copied as well as shared"),
      },
    });
    assert.equal(outcome, "shared");
    assert.deepEqual(shared, [data]);
  });

  test("a dismissed sheet is the viewer's answer: nothing copied", async () => {
    const abort = Object.assign(new Error("dismissed"), { name: "AbortError" });
    const outcome = await shareInvite(data, {
      share: async () => {
        throw abort;
      },
      clipboard: {
        writeText: async () => assert.fail("copied after a dismissal"),
      },
    });
    assert.equal(outcome, "cancelled");
  });

  test("no sheet, or a sheet that failed: the link is copied", async () => {
    const copied: string[] = [];
    const clipboard = {
      writeText: async (text: string) => {
        copied.push(text);
      },
    };
    assert.equal(await shareInvite(data, { clipboard }), "copied");
    assert.equal(
      await shareInvite(data, {
        share: async () => {
          throw new TypeError("not allowed");
        },
        clipboard,
      }),
      "copied",
    );
    assert.deepEqual(copied, [data.url, data.url]);
  });

  test("neither works: failed, not thrown", async () => {
    assert.equal(await shareInvite(data, {}), "failed");
    assert.equal(
      await shareInvite(data, {
        clipboard: {
          writeText: async () => {
            throw new Error("denied");
          },
        },
      }),
      "failed",
    );
  });
});
