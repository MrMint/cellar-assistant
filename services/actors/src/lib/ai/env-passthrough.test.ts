/**
 * Every environment variable the AI config reader consults has to reach the
 * actor host in both dev lanes — `infra/docker-compose.yml` (the actors
 * service's `environment:`) and `scripts/stack/stack.sh`'s `PASSTHROUGH_ENV`
 * (the host-run lane's `dapr run` environment). Neither forwards a name it
 * does not list, so a variable missing from one is a setting that silently
 * does nothing there.
 *
 * That is not hypothetical: the per-provider model overrides
 * (`VERTEX_AI_MODEL_*`, `GOOGLE_AI_EMBEDDING_MODEL`, …) were read by the code
 * and listed by neither file.
 *
 * The names are not copied out of `config.ts` by hand — that would be one
 * more list to go stale. `readAIProviderConfig` is run once per provider
 * against an environment that records every name it is asked for.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Env, readAIProviderConfig } from "./config.ts";

const REPO = new URL("../../../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, REPO), "utf8");

/** Just enough for each provider to get past its required variables. */
const PROVIDERS: Record<string, Record<string, string>> = {
  ollama: {},
  "openai-compatible": {},
  "google-ai": { GOOGLE_AI_API_KEY: "k" },
  "vertex-ai": {
    GOOGLE_GCP_PROJECT_ID: "p",
    GOOGLE_APPLICATION_CREDENTIALS_JSON: JSON.stringify({
      project_id: "p",
      client_email: "e@p.iam.gserviceaccount.com",
      private_key: "k",
    }),
  },
};

const namesTheReaderConsults = (): Set<string> => {
  const names = new Set<string>();
  for (const [provider, required] of Object.entries(PROVIDERS)) {
    const values: Record<string, string> = {
      AI_PROVIDER: provider,
      ...required,
    };
    const env = new Proxy(values, {
      get: (target, name) => {
        if (typeof name === "string") names.add(name);
        return target[name as string];
      },
    }) as Env;
    readAIProviderConfig(env);
  }
  return names;
};

/** The actors service's `environment:` keys. */
const composeActorsEnvironment = (): Set<string> => {
  const compose = read("infra/docker-compose.yml");
  const block = /\n {2}actors:\n([\s\S]*?)\n {2}[a-z][\w-]*:\n/.exec(
    compose,
  )?.[1];
  expect(block, "no actors service in infra/docker-compose.yml").toBeDefined();
  return new Set(
    [...(block ?? "").matchAll(/^ {6}([A-Z][A-Z0-9_]*):/gm)].map(
      (m) => m[1] ?? "",
    ),
  );
};

/** `PASSTHROUGH_ENV`, plus what `resolve` exports on its own. */
const hostRunPassthrough = (): Set<string> => {
  const script = read("scripts/stack/stack.sh");
  const list = /\nPASSTHROUGH_ENV='([^']*)'/.exec(script)?.[1];
  expect(list, "no PASSTHROUGH_ENV in scripts/stack/stack.sh").toBeDefined();
  // `resolve` computes and exports OLLAMA_ENDPOINT itself (localhost, not
  // host.docker.internal), so it is deliberately not on the list.
  return new Set([
    ...(list ?? "").split(/\s+/).filter(Boolean),
    "OLLAMA_ENDPOINT",
  ]);
};

describe("AI configuration reaches the actor host in both dev lanes", () => {
  const names = namesTheReaderConsults();

  it("the probe sees the reader's variables (scan is not vacuous)", () => {
    for (const expected of [
      "AI_PROVIDER",
      "VERTEX_AI_MODEL_HIGH",
      "GOOGLE_AI_EMBEDDING_MODEL",
      "VERTEX_AI_EMBEDDING_LOCATION",
      "OPENAI_COMPAT_ENDPOINT",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("infra/docker-compose.yml passes every one to the actors container", () => {
    const listed = composeActorsEnvironment();
    expect(listed.size).toBeGreaterThan(20);
    expect([...names].filter((name) => !listed.has(name))).toEqual([]);
  });

  it("scripts/stack/stack.sh passes every one to the host-run apps", () => {
    const listed = hostRunPassthrough();
    expect(listed.size).toBeGreaterThan(20);
    expect([...names].filter((name) => !listed.has(name))).toEqual([]);
  });
});

/**
 * `infra/.env.prod.example` is what an operator copies to `.env.prod`, so it
 * has to describe the deployed provider — Vertex AI (deploy-loki.md §2.7) —
 * and not the dev lane's ollama, which is what it said until 2026-09-28.
 * Filled in the way the operator is told to (a project and a key, nothing
 * else), its AI settings have to boot.
 */
describe("infra/.env.prod.example configures the deployed provider", () => {
  const example = Object.fromEntries(
    read("infra/.env.prod.example")
      .split("\n")
      .map((line) => /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1] ?? "", m[2] ?? ""]),
  );

  it("is vertex-ai, with the embedding location left empty", () => {
    expect(example.AI_PROVIDER).toBe("vertex-ai");
    expect(example.VERTEX_AI_EMBEDDING_LOCATION).toBe("");
    expect(example.GOOGLE_GCP_PROJECT_ID).toBe("");
    expect(example.GOOGLE_APPLICATION_CREDENTIALS_JSON).toBe("");
  });

  it("boots once the project and key are filled in", () => {
    const config = readAIProviderConfig({
      ...example,
      ...PROVIDERS["vertex-ai"],
    });
    expect(config).toMatchObject({
      provider: "vertex-ai",
      location: "global",
      embeddingLocation: null,
      embeddingDimensions: 768,
    });
  });
});
