import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { withReturnTo } from "@/utilities/sanitize-return-to";
import { REQUEST_PATH_HEADER, requestPathOf } from "./request-path";

test("the stamped path is the path and query, ready to be a returnTo", () => {
  const path = requestPathOf({
    pathname: "/tier-lists/abc",
    search: "?item=x",
  });
  assert.equal(path, "/tier-lists/abc?item=x");
  assert.equal(
    withReturnTo("/sign-in", path),
    "/sign-in?returnTo=%2Ftier-lists%2Fabc%3Fitem%3Dx",
  );
});

test("a forged header can only ever name a path on this site", () => {
  for (const forged of [
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
  ]) {
    assert.equal(withReturnTo("/sign-in", forged), "/sign-in");
  }
});

test("the proxy sets the header (not appends) and getServerUser reads it", () => {
  // Read from source: `src/proxy.ts` and `utilities/auth-server.ts` pull in
  // Next runtime modules that do not load outside a Next build.
  const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
  assert.match(
    read("../../proxy.ts"),
    /forwarded\.set\(REQUEST_PATH_HEADER, requestPathOf\(request\.nextUrl\)\)/,
  );
  assert.match(
    read("../../utilities/auth-server.ts"),
    /redirect\(withReturnTo\("\/sign-in", asked\)\)/,
  );
  assert.equal(REQUEST_PATH_HEADER, REQUEST_PATH_HEADER.toLowerCase());
});
