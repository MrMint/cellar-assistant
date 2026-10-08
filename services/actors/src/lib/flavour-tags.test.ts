/**
 * The flavour seam's grounding rules (X02), with no model and no database.
 *
 * `groundFlavourTags` is what stands between a small local model and a chip on
 * the drinker's screen, so each rule it states is pinned here with the
 * invention it exists to stop.
 */
import { userCtx } from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import { providerFlavourTags } from "./ai/seams.ts";
import type { AIProvider, ProviderFor } from "./ai/types.ts";
import { groundFlavourTags, noteIsWorthAsking } from "./flavour-tags.ts";

const NOTE = "Dark cherries up front, a little smoke, oaky and a dry finish.";

describe("groundFlavourTags", () => {
  it("keeps tags whose evidence is in the note and whose words come from it", () => {
    const answer = groundFlavourTags(
      NOTE,
      [
        { tag: "Cherry", evidence: "Dark cherries" },
        { tag: "smoky", evidence: "a little smoke" },
        { tag: "oak", evidence: "oaky" },
        { tag: "dry finish", evidence: "dry finish" },
      ],
      [],
    );
    expect(answer.abstained).toBe(false);
    expect(answer.tags.map((t) => t.tag)).toEqual([
      "cherry",
      "smoky",
      "oak",
      "dry finish",
    ]);
  });

  it("drops evidence that is not in the note: the model invented it", () => {
    const answer = groundFlavourTags(
      NOTE,
      [{ tag: "vanilla", evidence: "hint of vanilla" }],
      [],
    );
    expect(answer).toEqual({ abstained: true, tags: [] });
  });

  it("drops a tag that is not drawn from its own evidence: no 'citrus' for 'cherries'", () => {
    const answer = groundFlavourTags(
      NOTE,
      [
        { tag: "citrus", evidence: "Dark cherries" },
        { tag: "tannic", evidence: "dry finish" },
      ],
      [],
    );
    expect(answer.tags).toEqual([]);
    expect(answer.abstained).toBe(true);
  });

  it("evidence must be whole words of the note: 'pear' is not in 'appearance'", () => {
    const answer = groundFlavourTags(
      "Hazy appearance, soft and round.",
      [{ tag: "pear", evidence: "pear" }],
      [],
    );
    expect(answer).toEqual({ abstained: true, tags: [] });
  });

  it("every word of a tag comes from its evidence: no 'burnt sugar' from 'burnt toast'", () => {
    const note = "Burnt toast and a bit of smoke.";
    const answer = groundFlavourTags(
      note,
      [
        { tag: "burnt sugar", evidence: "Burnt toast" },
        { tag: "burnt toast", evidence: "Burnt toast" },
      ],
      [],
    );
    expect(answer.tags.map((t) => t.tag)).toEqual(["burnt toast"]);
  });

  it("a one-letter or a short word grounds nothing longer: no 'apple' from 'a', no 'bitter' from 'bit'", () => {
    const note = "Burnt toast and a bit of smoke.";
    const answer = groundFlavourTags(
      note,
      [
        { tag: "apple", evidence: "a" },
        { tag: "bitter", evidence: "a bit" },
        { tag: "smoky", evidence: "smoke" },
      ],
      [],
    );
    expect(answer.tags.map((t) => t.tag)).toEqual(["smoky"]);
  });

  it("does not suggest a tag the log already has, and collapses duplicates", () => {
    const answer = groundFlavourTags(
      NOTE,
      [
        { tag: "cherry", evidence: "cherries" },
        { tag: "CHERRY", evidence: "Dark cherries" },
        { tag: "smoke", evidence: "smoke" },
      ],
      ["Smoke"],
    );
    expect(answer.tags.map((t) => t.tag)).toEqual(["cherry"]);
  });

  it("drops sentences and blanks, and caps the list at six", () => {
    const long = Array.from({ length: 10 }, () => ({
      tag: "smoky",
      evidence: "smoke",
    }));
    expect(
      groundFlavourTags(
        NOTE,
        [
          { tag: null, evidence: "smoke" },
          { tag: "smoke", evidence: null },
          { tag: "a little bit of smoke here", evidence: "a little smoke" },
          ...long,
        ],
        [],
      ).tags,
    ).toHaveLength(1);

    const many = "apple, pear, plum, fig, date, lime, kiwi, peach";
    const fruits = many.split(", ").map((fruit) => ({
      tag: fruit,
      evidence: fruit,
    }));
    expect(groundFlavourTags(many, fruits, []).tags).toHaveLength(6);
  });
});

describe("noteIsWorthAsking", () => {
  it("refuses notes with fewer than three letters before any model call", () => {
    expect(noteIsWorthAsking("")).toBe(false);
    expect(noteIsWorthAsking(" !! ")).toBe(false);
    expect(noteIsWorthAsking("ok")).toBe(false);
    expect(noteIsWorthAsking("oak")).toBe(true);
  });
});

/** Answers `content` and counts the calls; nothing here meters. */
const fakeProvider = (
  content: string,
): { provider: ProviderFor; calls: () => number } => {
  let calls = 0;
  const raw = {
    name: "ollama",
    getAvailableQualities: () => ["low", "medium", "high"],
    async generateContent() {
      calls += 1;
      return {
        content,
        metadata: { model: "fake", provider: "ollama", processingTime: 1 },
      };
    },
    async generateEmbeddings() {
      throw new Error("not used");
    },
  } as unknown as AIProvider;
  return { provider: () => raw, calls: () => calls };
};

const ctx = userCtx("00000000-0000-4000-8000-000000000001", "r");
const request = (note: string) => ({
  note,
  itemType: "WINE" as const,
  existing: [],
});

describe("providerFlavourTags", () => {
  it("abstains without a call on a note too short to name a flavour", async () => {
    const fake = fakeProvider("{}");
    const answer = await providerFlavourTags(fake.provider)(ctx, request("ok"));
    expect(answer).toEqual({ abstained: true, tags: [] });
    expect(fake.calls()).toBe(0);
  });

  it("refuses an answer with no discriminator rather than reading it as yes", async () => {
    const fake = fakeProvider(
      JSON.stringify({ tags: [{ evidence: "cherry", tag: "cherry" }] }),
    );
    await expect(
      providerFlavourTags(fake.provider)(ctx, request("cherry")),
    ).rejects.toThrow(/noteDescribesTaste/);
  });

  it("drops every tag when the model says the note names no flavour", async () => {
    const fake = fakeProvider(
      JSON.stringify({
        noteDescribesTaste: false,
        tags: [{ evidence: "great night", tag: "tannic" }],
      }),
    );
    const answer = await providerFlavourTags(fake.provider)(
      ctx,
      request("great night with Sam"),
    );
    expect(answer).toEqual({ abstained: true, tags: [] });
  });

  it("grounds a yes: the invented tag goes, the copied one stays", async () => {
    const fake = fakeProvider(
      JSON.stringify({
        noteDescribesTaste: true,
        tags: [
          { evidence: "dark cherries", tag: "cherry" },
          { evidence: "notes of leather", tag: "leather" },
        ],
      }),
    );
    const answer = await providerFlavourTags(fake.provider)(
      ctx,
      request("Dark cherries and smoke"),
    );
    expect(answer.tags).toEqual([{ tag: "cherry", evidence: "dark cherries" }]);
  });
});
