import { defineConfig } from "vitest/config";

export default defineConfig({
  // graphql-js identifies its own types with a brand check and throws
  // "Cannot use GraphQLSchema from another module or realm" the moment two
  // copies meet. It ships both CJS and ESM entrypoints, and Vite will happily
  // give the ESM one to the test file and the CJS one to Pothos. Pinning the
  // specifier to a single file settles it.
  resolve: {
    alias: { graphql: "graphql/index.js" },
    dedupe: ["graphql"],
  },
  test: {
    // A Pothos plugin loaded from a different copy of `@pothos/core` than the
    // builder registers its methods on the wrong prototype
    // (`builder.globalConnectionFields is not a function`), so inline them all.
    server: { deps: { inline: [/^@pothos\//] } },
  },
});
