import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { openIncomingRequests } from "./open-requests";

const request = (id: string, userId: string) => ({ id, user: { id: userId } });

describe("openIncomingRequests (W-13)", () => {
  test("an accepted request leaves Incoming as soon as the friendship shows, before its row is deleted", () => {
    const incoming = [request("r1", "riley"), request("r2", "sam")];
    assert.deepEqual(
      openIncomingRequests(incoming, ["riley"]).map((row) => row.id),
      ["r2"],
    );
  });

  test("with no friends every request is open, and the same rows come back", () => {
    const incoming = [request("r1", "riley")];
    assert.equal(openIncomingRequests(incoming, []), incoming);
  });
});
