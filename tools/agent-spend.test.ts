import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  callKind,
  DEFAULT_PROJECT,
  flags,
  isSearchTurn,
  keep,
  parseArgs,
  parseMeta,
  parseTranscript,
  render,
  searchShare,
  weight,
} from "./agent-spend.ts";

type Tool = { name: string; input: Record<string, unknown> };

/** One streamed line of an assistant request, as Claude Code writes it. */
function line(
  requestId: string,
  tools: Tool[],
  usage = {},
  extra = {},
): string {
  return JSON.stringify({
    type: "assistant",
    requestId,
    sessionId: "sess-1",
    timestamp: "2026-11-20T12:00:00Z",
    effort: "medium",
    message: {
      model: "claude-opus-5-5",
      usage: {
        input_tokens: 10,
        cache_read_input_tokens: 100_000,
        cache_creation: { ephemeral_5m_input_tokens: 1000 },
        output_tokens: 200,
        ...usage,
      },
      content: tools.map((t) => ({ type: "tool_use", ...t })),
    },
    ...extra,
  });
}

const grep: Tool = { name: "Grep", input: { pattern: "x" } };
const read: Tool = { name: "Read", input: { file_path: "/a.ts" } };
const bashSearch: Tool = {
  name: "Bash",
  input: { command: "rg foo src | head -5 && sed -n '1,20p' a.ts" },
};
const bashStatus: Tool = { name: "Bash", input: { command: "git status" } };
const edit: Tool = { name: "Edit", input: { file_path: "/a.ts" } };
const bashTest: Tool = {
  name: "Bash",
  input: { command: "bun test a.test.ts" },
};

const stream = { agentType: "stream-builder", description: "build X" };
const at = {
  file: "s/agent-1.jsonl",
  project: "-cellar-assistant",
  meta: stream,
};

describe("callKind", () => {
  it("counts Read as search, unlike the hook", () => {
    assert.equal(callKind("Read", {}), "search");
    assert.equal(callKind("Grep", {}), "search");
    assert.equal(callKind("Bash", bashSearch.input), "search");
    assert.equal(callKind("Bash", bashStatus.input), "neutral");
    assert.equal(callKind("Bash", bashTest.input), "other");
    assert.equal(callKind("Edit", {}), "other");
  });
});

describe("parseTranscript", () => {
  it("counts a streamed request once and gathers its calls from every line", () => {
    const text = [
      line("r1", [grep]),
      line("r1", [read]),
      line("r2", [edit]),
      JSON.stringify({ type: "system", subtype: "compact_boundary" }),
      "not json",
      "",
    ].join("\n");
    const { requests, compactions } = parseTranscript(text, at);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0].calls, ["search", "search"]);
    assert.deepEqual(requests[1].calls, ["other"]);
    assert.equal(compactions, 1);
    assert.equal(requests[0].write5m, 1000);
  });

  it("skips lines with no usage until one carries it", () => {
    const noUsage = JSON.stringify({
      type: "assistant",
      requestId: "r1",
      timestamp: "2026-11-20T12:00:00Z",
      message: { content: [] },
    });
    assert.equal(parseTranscript(noUsage, at).requests.length, 0);
  });
});

describe("isSearchTurn", () => {
  it("needs a search call and nothing that acts", () => {
    assert.equal(isSearchTurn({ calls: ["search", "neutral"] }), true);
    assert.equal(isSearchTurn({ calls: ["neutral"] }), false);
    assert.equal(isSearchTurn({ calls: ["search", "other"] }), false);
    assert.equal(isSearchTurn({ calls: [] }), false);
  });
});

describe("searchShare", () => {
  it("weighs stream-builder search turns against stream spend only", () => {
    const text = [
      line("a", [grep, read]),
      line("b", [bashSearch, bashStatus]),
      line("c", [edit, read]),
      line("d", [bashTest]),
    ].join("\n");
    const streams = parseTranscript(text, at).requests;
    const main = parseTranscript(line("m", [grep]), {
      ...at,
      file: "s.jsonl",
      meta: parseMeta(null),
    }).requests;
    const s = searchShare([...streams, ...main]);
    assert.equal(s.requests, 4);
    assert.equal(s.searchTurns, 2);
    assert.ok(Math.abs(s.searchSpend / s.spend - 0.5) < 1e-9);
    const report = render([...streams, ...main], new Map(), {
      since: "x",
      top: 5,
    });
    assert.match(
      report,
      /Stream search turns: 2 of 4 stream-builder requests \(50\.0%\), 50\.0% of stream spend/,
    );
  });
});

describe("weight", () => {
  it("prices cache reads at a tenth and output at the output price", () => {
    const [r] = parseTranscript(
      line("r", [], {
        input_tokens: 0,
        cache_read_input_tokens: 1_000_000,
        cache_creation: {},
        output_tokens: 1_000_000,
      }),
      at,
    ).requests;
    assert.equal(weight(r), 0.5 + 25);
  });
});

describe("flags", () => {
  it("flags max effort outside the main session", () => {
    const [r] = parseTranscript(
      line("r", [], {}, { effort: "max" }),
      at,
    ).requests;
    const [m] = parseTranscript(line("m", [], {}, { effort: "max" }), {
      ...at,
      meta: parseMeta(null),
    }).requests;
    const out = flags([r, m], weight(r) + weight(m));
    assert.equal(out.length, 1);
    assert.match(
      out[0],
      /max effort outside the main session: 1 requests \(stream-builder\)/,
    );
  });

  it("flags unroled agents and big contexts", () => {
    const [r] = parseTranscript(
      line("r", [], { cache_read_input_tokens: 500_000 }),
      { ...at, meta: { agentType: "fork", description: "d" } },
    ).requests;
    const out = flags([r], weight(r));
    assert.match(out[0], /unroled agents: 1/);
    assert.match(out[1], /agents past 400k context: 1/);
  });
});

describe("parseArgs and keep", () => {
  const now = new Date(2026, 10, 22, 15);
  it("defaults the project to this repo and the window to local midnight", () => {
    const a = parseArgs([], now);
    assert.equal(a.project, DEFAULT_PROJECT);
    assert.equal(a.since, new Date(2026, 10, 22).getTime());
    assert.equal(a.help, false);
  });
  it("reads the flags", () => {
    const a = parseArgs(
      ["--since", "2026-11-01", "--project", "", "--top", "3", "--help"],
      now,
    );
    assert.equal(a.since, new Date(2026, 10, 1).getTime());
    assert.equal(a.project, "");
    assert.equal(a.top, 3);
    assert.equal(a.help, true);
  });
  it("refuses a bad date or top", () => {
    assert.throws(() => parseArgs(["--since", "soon"], now), /not a date/);
    assert.throws(() => parseArgs(["--top", "0"], now), /positive/);
  });
  it("filters by time, session and project", () => {
    const [r] = parseTranscript(line("r", []), at).requests;
    const a = parseArgs(["--since", "2026-11-01"], now);
    assert.equal(keep(r, a), true);
    assert.equal(keep(r, { ...a, session: "other" }), false);
    assert.equal(keep(r, { ...a, project: "node-red" }), false);
  });
});
