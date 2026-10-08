/**
 * One graphql-js under vitest, whichever entry a file imports. Two copies
 * throw "Cannot use GraphQLSchema from another module or realm" — or, worse,
 * make an `instanceof` silently false. `../vitest.config.ts` says why Vite and
 * the runtime would otherwise pick different files; this fails the moment the
 * alias there stops covering an entry.
 */
import * as root from "graphql";
import * as error from "graphql/error";
import * as language from "graphql/language";
import * as type from "graphql/type";
import * as utilities from "graphql/utilities";
import { describe, expect, it } from "vitest";

describe("one graphql instance under vitest", () => {
  it("subpath imports are the same module as the bare one", () => {
    expect(type.GraphQLObjectType).toBe(root.GraphQLObjectType);
    expect(error.GraphQLError).toBe(root.GraphQLError);
    expect(language.Kind).toBe(root.Kind);
    expect(utilities.buildSchema).toBe(root.buildSchema);
  });
});
