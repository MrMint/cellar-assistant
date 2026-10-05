/**
 * `openai-compatible` is free only when it points at a server we host.
 *
 *   bun run --filter @cellar-assistant/actors test lib/ai/billing
 */
import { ValidationError } from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import { freeModelProviders, isPrivateEndpoint } from "./billing.ts";

describe("isPrivateEndpoint", () => {
  it.each([
    "http://localhost:8000",
    "http://api.localhost:8000",
    "http://127.0.0.1:8000/v1",
    "http://[::1]:8000",
    "http://10.1.2.3",
    "http://172.16.0.1",
    "http://172.31.255.255",
    "http://192.168.1.20:1234",
    "http://169.254.169.254",
    "http://100.100.1.1",
    "http://[fd12:3456::1]",
    "http://[fe80::1]",
    "http://host.docker.internal:8000",
    "http://vllm.c.my-project.internal",
    "http://mac-studio.local:8000",
    "http://vllm:8000",
  ])("treats %s as ours", (endpoint) => {
    expect(isPrivateEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "https://api.openai.com",
    "https://api.openai.com/v1",
    "https://generativelanguage.googleapis.com",
    "https://vllm.example.com",
    "http://8.8.8.8",
    "http://172.32.0.1",
    "http://100.128.0.1",
    "http://[2001:db8::1]",
    // 0x00fc, not fc00::/7.
    "http://[fc::1]",
    "not a url",
    "",
  ])("treats %s as someone else's", (endpoint) => {
    expect(isPrivateEndpoint(endpoint)).toBe(false);
  });
});

describe("freeModelProviders", () => {
  it("frees ollama always, and openai-compatible at its default localhost endpoint", () => {
    const free = freeModelProviders({});
    expect([...free.chat].sort()).toEqual(["ollama", "openai-compatible"]);
    expect([...free.embedding].sort()).toEqual(["ollama", "openai-compatible"]);
  });

  it("charges openai-compatible pointed at a hosted API", () => {
    const free = freeModelProviders({
      OPENAI_COMPAT_ENDPOINT: "https://api.openai.com",
    });
    expect(free.chat.has("openai-compatible")).toBe(false);
    // The embedding endpoint defaults to the chat one, and so does its price.
    expect(free.embedding.has("openai-compatible")).toBe(false);
    expect(free.chat.has("ollama")).toBe(true);
  });

  it("decides each endpoint on its own", () => {
    const free = freeModelProviders({
      OPENAI_COMPAT_ENDPOINT: "http://localhost:8000",
      OPENAI_COMPAT_EMBEDDING_ENDPOINT: "https://api.openai.com",
    });
    expect(free.chat.has("openai-compatible")).toBe(true);
    expect(free.embedding.has("openai-compatible")).toBe(false);
  });

  it("lets OPENAI_COMPAT_FREE overrule the inference, either way, and refuses a typo", () => {
    expect(
      freeModelProviders({
        OPENAI_COMPAT_ENDPOINT: "https://vllm.example.com",
        OPENAI_COMPAT_FREE: "true",
      }).chat.has("openai-compatible"),
    ).toBe(true);
    expect(
      freeModelProviders({
        OPENAI_COMPAT_ENDPOINT: "http://10.0.0.5:8000",
        OPENAI_COMPAT_FREE: "0",
      }).chat.has("openai-compatible"),
    ).toBe(false);
    expect(() => freeModelProviders({ OPENAI_COMPAT_FREE: "yes" })).toThrow(
      ValidationError,
    );
  });
});
