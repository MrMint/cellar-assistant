import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // X3 · builds `cellar_test` before any test file is imported, so no test
    // ever shares a database with the development stack. See
    // src/lib/test-db-setup.ts and packages/db/transform/test-db.sh.
    globalSetup: ["./src/lib/test-db-setup.ts"],
  },
});
