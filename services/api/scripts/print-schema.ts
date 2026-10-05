import { writeFileSync } from "node:fs";
import { printApiSchema, SCHEMA_FILE } from "../src/schema/print.ts";

writeFileSync(SCHEMA_FILE, printApiSchema(), "utf8");
console.log(`[api] wrote ${SCHEMA_FILE.pathname}`);
