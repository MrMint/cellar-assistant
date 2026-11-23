/**
 * The shell's not-found, error and offline states: the copy decisions
 * (`shell-copy.ts`) and that the markup actually carries them.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { stripStyleBlocks } from "@/test-support/markup";
import { BoundaryError } from "./BoundaryError";
import { NotFoundMessage } from "./NotFoundMessage";
import {
  describeBoundaryError,
  errorReference,
  NOT_FOUND_COPY,
} from "./shell-copy";

const render = (node: React.ReactNode) =>
  stripStyleBlocks(renderToStaticMarkup(node)).replaceAll("&#x27;", "'");

describe("NOT_FOUND_COPY (D24)", () => {
  test("one message that never says which of missing or private it is", () => {
    assert.match(
      NOT_FOUND_COPY.title,
      /doesn't exist or isn't shared with you/,
    );
    const text = `${NOT_FOUND_COPY.title} ${NOT_FOUND_COPY.body}`;
    // Words that would confirm a private row exists.
    assert.doesNotMatch(text, /\bprivate\b|\bpermission\b|\bforbidden\b|404/i);
  });
});

describe("NotFoundMessage", () => {
  test("in the shell: the D24 copy and a way home", () => {
    const html = render(<NotFoundMessage />);
    assert.ok(html.includes(NOT_FOUND_COPY.title), html);
    assert.match(html, /<h1[^>]*>[^<]*doesn't exist/);
    assert.ok(html.includes('href="/"'));
    assert.ok(html.includes("Go home"));
  });

  test("signed out: the same copy, and sign-in rather than a home that bounces", () => {
    const html = render(<NotFoundMessage signedIn={false} />);
    assert.ok(html.includes(NOT_FOUND_COPY.title));
    assert.ok(html.includes('href="/sign-in"'));
    assert.ok(!html.includes('href="/"'));
  });
});

describe("describeBoundaryError", () => {
  test("online, the failure is ours and a retry is offered", () => {
    const copy = describeBoundaryError({ online: true });
    assert.equal(copy.title, "Something went wrong");
    assert.match(copy.body, /our side/);
  });

  test("offline, it says so — the one cause the viewer can fix", () => {
    const copy = describeBoundaryError({ online: false });
    assert.equal(copy.title, "You're offline");
  });
});

describe("errorReference", () => {
  test("shows a server error's digest, so a report matches the log", () => {
    assert.equal(errorReference("12345"), "Reference: 12345");
  });
  test("nothing for a client error, which has no digest", () => {
    assert.equal(errorReference(undefined), null);
    assert.equal(errorReference(""), null);
  });
});

describe("BoundaryError", () => {
  test("first paint assumes online, so server and client agree", () => {
    const error = Object.assign(new Error("secret internals"), {
      digest: "abc123",
    });
    const html = render(<BoundaryError error={error} retry={() => {}} />);
    assert.ok(html.includes("Something went wrong"));
    assert.ok(html.includes("Try again"));
    assert.ok(html.includes("Reference: abc123"));
    // Never the error's own message.
    assert.ok(!html.includes("secret internals"));
  });
});
