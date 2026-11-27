import { describe, expect, test } from "vitest";
import {
  pendingRequestFor,
  REQUEST_LOOKUP_SIZE,
  type RequestEdge,
} from "./person-requests";

const edge = (id: string, userId: string, status = "PENDING"): RequestEdge => ({
  node: { id, status, user: { id: userId } },
});

describe("pendingRequestFor: the one request a row may answer", () => {
  test("the pending request with this person, and no other", () => {
    const edges = [
      edge("req-a", "user-a"),
      edge("req-b", "user-b"),
      edge("req-c", "user-c"),
    ];
    expect(pendingRequestFor(edges, "user-b")).toBe("req-b");
  });

  test("never another person's request, even when it is the only one", () => {
    // The wrong write this guards: cancelling or accepting somebody else's
    // request because the list had one and the row's was not on it.
    expect(pendingRequestFor([edge("req-a", "user-a")], "user-b")).toBeNull();
    expect(pendingRequestFor([], "user-b")).toBeNull();
  });

  test("an accepted request is not pending: nothing to cancel or accept", () => {
    expect(
      pendingRequestFor([edge("req-a", "user-a", "ACCEPTED")], "user-a"),
    ).toBeNull();
  });

  test("the lookup is bounded", () => {
    expect(REQUEST_LOOKUP_SIZE).toBeGreaterThan(0);
    expect(REQUEST_LOOKUP_SIZE).toBeLessThanOrEqual(50);
  });
});
