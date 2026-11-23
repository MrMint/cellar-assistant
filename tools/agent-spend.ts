// Where the agents' tokens went: spend by agent type, effort, agent and session, from Claude Code's
// transcripts, with the patterns that have cost the most flagged.
//
//   node tools/agent-spend.ts                      # since local midnight
//   node tools/agent-spend.ts --since 2026-11-01   # a date (local) or an ISO time
//   node tools/agent-spend.ts --session 01e24573   # one session and its subagents (id prefix)
//   node tools/agent-spend.ts --project hopeful    # sessions whose project dir contains this
//   node tools/agent-spend.ts --root <dir> --top 20
//
// --project defaults to "cellar-assistant": transcripts live under ~/.claude/projects/<project>/,
// and every checkout and worktree of this repo has a project dir whose name contains it. Pass
// `--project ""` to count every project.
//
// Transcripts live under ~/.claude/projects/<project>/<session>.jsonl, and each subagent under
// <session>/subagents/agent-<id>.jsonl with a .meta.json beside it (agentType, description). Each
// assistant line carries the request's usage; a request appears on several lines while it streams,
// so requests are counted once by requestId, and its tool calls are gathered from all its lines.
//
// Spend is WEIGHTED at API list price per million tokens (PRICE): input, cache writes at 1.25x
// (5-minute) or 2x (1-hour), cache reads at 0.1x, output at the output price. A subscription's
// quota weights models its own way, so read the dollars as proportions, not a bill.
//
// Flags (FLAG_* below), each a pattern a past audit priced:
//   * unroled agents (general-purpose, fork, claude): in smart-home's Fettle builds they were 36%
//     of 2026-10-25 – 11-08 agent spend, at a median context of 296k–380k against
//     stream-builder's 169k;
//   * an agent whose context passed FLAG_PEAK_CONTEXT, which only an agent with no compaction
//     window reaches;
//   * max effort outside the main session, where it is inherited, not chosen.
//
// SEARCH TURNS. A search turn is a request whose every tool call searches: Grep, Glob, Read, or a
// Bash command whose every segment is grep, rg, find, ls, cat, head, tail, sed -n, wc and the like.
// The classifier is the search-limit hook's own `kindOf` (.claude/hooks/stream-search-limit.mjs),
// with Read counted as search for this measure (the hook calls it neutral so a stream can read
// before it edits). Neutral Bash calls (git status, echo, code-map) neither make nor break a search
// turn. The report gives the share of stream-builder spend that went on search turns.
//
// WHY: in smart-home's Fettle builds this audit was run by hand after R3, after R4 and on
// 2026-11-08, each time from scratch. Search-only turns were 54% of stream spend in R4, 52% in R9
// and 49% in R10; the search-limit hook is a trial against that number, and this is how the trial
// is judged.
//
// Every export is a pure function over strings and numbers; only the main-guard touches disk.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { kindOf } from "../.claude/hooks/stream-search-limit.mjs";

/** API list price per million tokens, as a weight: [input, output]. */
export const PRICE: Record<string, [number, number]> = {
  opus: [5, 25],
  sonnet: [3, 15],
  haiku: [1, 5],
};
export const UNROLED = new Set(["general-purpose", "fork", "claude"]);
export const FLAG_PEAK_CONTEXT = 400_000;
export const OVER_CONTEXT = 300_000;
export const DEFAULT_PROJECT = "cellar-assistant";
export const STREAM = "stream-builder";
const MAX_EFFORT_OK = new Set(["main"]);

export const USAGE = `usage: node tools/agent-spend.ts [--since <date|ISO>] [--session <id prefix>]
       [--project <dir substring, default ${DEFAULT_PROJECT}>] [--root <dir>] [--top <n>]`;

/** One tool call's kind for the search measure: "search", "neutral" or "other". */
export type CallKind = "search" | "neutral" | "other";

export interface Request {
  file: string;
  session: string;
  project: string;
  agentType: string;
  description: string;
  model: string;
  effort: string;
  time: number;
  input: number;
  write5m: number;
  write1h: number;
  read: number;
  output: number;
  thinking: number;
  calls: CallKind[];
}

export interface Meta {
  agentType: string;
  description: string;
}

/** The model family a model id belongs to, for its price. */
export function family(model: string): string {
  for (const f of Object.keys(PRICE)) if (model.includes(f)) return f;
  return "opus";
}

/** One request's weighted spend in dollars. */
export function weight(r: Request): number {
  const [i, o] = PRICE[family(r.model)];
  return (
    (r.input * i +
      r.write5m * 1.25 * i +
      r.write1h * 2 * i +
      r.read * 0.1 * i +
      r.output * o) /
    1e6
  );
}

/** The context a request carried: everything it sent, cached or not. */
export const context = (r: Request): number =>
  r.input + r.write5m + r.write1h + r.read;

/** A tool call's kind for the search measure: the hook's kindOf, with Read as search. */
export function callKind(tool: string, input: unknown): CallKind {
  if (tool === "Read") return "search";
  return kindOf(tool, input) as CallKind;
}

/** A request that made at least one search call and nothing but search or neutral calls. */
export function isSearchTurn(r: Pick<Request, "calls">): boolean {
  return r.calls.includes("search") && !r.calls.includes("other");
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v !== null && typeof v === "object" ? (v as Json) : {};
const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** A transcript's requests, once each, and its compaction count. */
export function parseTranscript(
  text: string,
  at: { file: string; project: string; meta: Meta },
): { requests: Request[]; compactions: number } {
  const requests: Request[] = [];
  const byKey = new Map<string, Request>();
  let compactions = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let d: Json;
    try {
      d = obj(JSON.parse(line));
    } catch {
      continue;
    }
    if (d.type === "system" && d.subtype === "compact_boundary") compactions++;
    if (d.type !== "assistant") continue;
    const message = obj(d.message);
    const key = str(d.requestId) || str(message.id) || line;
    let request = byKey.get(key);
    if (!request) {
      const usage = obj(message.usage);
      if (Object.keys(usage).length === 0 || typeof d.timestamp !== "string")
        continue;
      const cache = obj(usage.cache_creation);
      const hasSplit =
        "ephemeral_5m_input_tokens" in cache ||
        "ephemeral_1h_input_tokens" in cache;
      request = {
        file: at.file,
        session: str(d.sessionId),
        project: at.project,
        agentType: at.meta.agentType,
        description: at.meta.description,
        model: str(message.model),
        effort: str(d.effort) || "none",
        time: Date.parse(d.timestamp),
        input: num(usage.input_tokens),
        write5m: hasSplit
          ? num(cache.ephemeral_5m_input_tokens)
          : num(usage.cache_creation_input_tokens),
        write1h: num(cache.ephemeral_1h_input_tokens),
        read: num(usage.cache_read_input_tokens),
        output: num(usage.output_tokens),
        thinking: num(obj(usage.output_tokens_details).thinking_tokens),
        calls: [],
      };
      byKey.set(key, request);
      requests.push(request);
    }
    const content = Array.isArray(message.content) ? message.content : [];
    for (const block of content) {
      const b = obj(block);
      if (b.type === "tool_use")
        request.calls.push(callKind(str(b.name), b.input));
    }
  }
  return { requests, compactions };
}

/** A subagent's type and description from its .meta.json text; the main session's otherwise. */
export function parseMeta(text: string | null): Meta {
  if (text === null) return { agentType: "main", description: "" };
  try {
    const m = obj(JSON.parse(text));
    return {
      agentType: str(m.agentType) || "unknown",
      description: str(m.description),
    };
  } catch {
    return { agentType: "unknown", description: "" };
  }
}

/** The median of a non-empty list: every group has at least one request. */
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface Group {
  key: string;
  spend: number;
  requests: number;
  agents: number;
  medianContext: number;
  peakContext: number;
  overShare: number;
  compactions: number;
  outputShare: number;
  thinkingShare: number;
}

/** Requests grouped by `keyOf`, most spend first. `compactions` is per transcript file. */
export function group(
  requests: Request[],
  keyOf: (r: Request) => string,
  compactions: Map<string, number>,
): Group[] {
  const by = new Map<string, Request[]>();
  for (const r of requests) {
    const k = keyOf(r);
    const list = by.get(k);
    if (list) list.push(r);
    else by.set(k, [r]);
  }
  const groups: Group[] = [];
  for (const [key, rs] of by) {
    const files = new Set(rs.map((r) => r.file));
    const ctx = rs.map(context);
    const spend = rs.reduce((n, r) => n + weight(r), 0);
    const out = rs.reduce((n, r) => n + r.output, 0);
    groups.push({
      key,
      spend,
      requests: rs.length,
      agents: files.size,
      medianContext: median(ctx),
      peakContext: Math.max(...ctx),
      overShare: ctx.filter((c) => c > OVER_CONTEXT).length / rs.length,
      compactions: [...files].reduce(
        (n, f) => n + (compactions.get(f) ?? 0),
        0,
      ),
      outputShare:
        spend > 0
          ? rs.reduce(
              (n, r) => n + (r.output * PRICE[family(r.model)][1]) / 1e6,
              0,
            ) / spend
          : 0,
      thinkingShare: out > 0 ? rs.reduce((n, r) => n + r.thinking, 0) / out : 0,
    });
  }
  return groups.sort((a, b) => b.spend - a.spend);
}

export interface SearchShare {
  requests: number;
  searchTurns: number;
  spend: number;
  searchSpend: number;
}

/** Stream-builder requests and spend, and how much of each went on search turns. */
export function searchShare(requests: Request[]): SearchShare {
  const streams = requests.filter((r) => r.agentType === STREAM);
  const search = streams.filter(isSearchTurn);
  return {
    requests: streams.length,
    searchTurns: search.length,
    spend: streams.reduce((n, r) => n + weight(r), 0),
    searchSpend: search.reduce((n, r) => n + weight(r), 0),
  };
}

/** The flags worth a lead's attention, one line each. */
export function flags(requests: Request[], total: number): string[] {
  const out: string[] = [];
  const unroled = requests.filter((r) => UNROLED.has(r.agentType));
  if (unroled.length) {
    const spend = unroled.reduce((n, r) => n + weight(r), 0);
    const agents = new Set(unroled.map((r) => r.file)).size;
    out.push(
      `unroled agents: ${agents} (general-purpose, fork, claude), ${pct(spend / total)} of spend. Spawn by role.`,
    );
  }
  const peaks = new Map<
    string,
    { peak: number; type: string; description: string }
  >();
  for (const r of requests) {
    if (r.agentType === "main") continue;
    const p = peaks.get(r.file);
    if (!p || context(r) > p.peak)
      peaks.set(r.file, {
        peak: context(r),
        type: r.agentType,
        description: r.description,
      });
  }
  const big = [...peaks.values()]
    .filter((p) => p.peak > FLAG_PEAK_CONTEXT)
    .sort((a, b) => b.peak - a.peak);
  if (big.length) {
    const shown = big
      .slice(0, 3)
      .map((p) => `${p.type} "${p.description}" ${k(p.peak)}`)
      .join("; ");
    out.push(
      `agents past ${k(FLAG_PEAK_CONTEXT)} context: ${big.length} (${shown}). No compaction window reached them.`,
    );
  }
  const max = requests.filter(
    (r) => r.effort === "max" && !MAX_EFFORT_OK.has(r.agentType),
  );
  if (max.length) {
    const types = [...new Set(max.map((r) => r.agentType))].sort().join(", ");
    out.push(
      `max effort outside the main session: ${max.length} requests (${types}), ${pct(max.reduce((n, r) => n + weight(r), 0) / total)} of spend. Set effort in the definition.`,
    );
  }
  return out;
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const k = (n: number): string => `${Math.round(n / 1000)}k`;
const usd = (n: number): string => `$${n.toFixed(0)}`;
const pad = (s: string, n: number): string =>
  s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
const lpad = (s: string, n: number): string =>
  s.length >= n ? s : " ".repeat(n - s.length) + s;

/** The report. */
export function render(
  requests: Request[],
  compactions: Map<string, number>,
  opts: { since: string; top: number },
): string {
  if (requests.length === 0) return `No requests since ${opts.since}.`;
  const total = requests.reduce((n, r) => n + weight(r), 0);
  const lines = [
    `${requests.length} requests since ${opts.since}, ${usd(total)} weighted at API list price (read as proportions).`,
    "",
  ];

  const s = searchShare(requests);
  if (s.requests > 0) {
    lines.push(
      `Stream search turns: ${s.searchTurns} of ${s.requests} ${STREAM} requests (${pct(s.searchTurns / s.requests)}), ${pct(s.spend > 0 ? s.searchSpend / s.spend : 0)} of stream spend (${usd(s.searchSpend)} of ${usd(s.spend)}).`,
      "",
    );
  } else {
    lines.push(`Stream search turns: no ${STREAM} requests.`, "");
  }

  lines.push("By agent type");
  lines.push(
    `  ${pad("type", 16)}${lpad("share", 7)}${lpad("spend", 8)}${lpad("agents", 7)}${lpad("reqs", 7)}${lpad("med ctx", 8)}${lpad(">300k", 7)}${lpad("peak", 7)}${lpad("compact", 8)}`,
  );
  for (const g of group(requests, (r) => r.agentType, compactions)) {
    lines.push(
      `  ${pad(g.key, 16)}${lpad(pct(g.spend / total), 7)}${lpad(usd(g.spend), 8)}${lpad(String(g.agents), 7)}${lpad(String(g.requests), 7)}${lpad(k(g.medianContext), 8)}${lpad(pct(g.overShare), 7)}${lpad(k(g.peakContext), 7)}${lpad(String(g.compactions), 8)}`,
    );
  }

  lines.push("", "By effort");
  for (const g of group(requests, (r) => r.effort, compactions)) {
    lines.push(
      `  ${pad(g.key, 8)}${lpad(pct(g.spend / total), 7)}  reqs ${g.requests}, med ctx ${k(g.medianContext)}, output ${pct(g.outputShare)} of its spend, thinking ${pct(g.thinkingShare)} of output`,
    );
  }

  lines.push("", `Top ${opts.top} agents`);
  for (const g of group(
    requests.filter((r) => r.agentType !== "main"),
    (r) => r.file,
    compactions,
  ).slice(0, opts.top)) {
    const r = requests.find((x) => x.file === g.key) as Request;
    lines.push(
      `  ${lpad(usd(g.spend), 6)} ${lpad(pct(g.spend / total), 6)}  ${pad(r.agentType, 15)} ${pad(r.description, 40)} turns ${g.requests}, peak ${k(g.peakContext)}, ${r.effort}`,
    );
  }

  lines.push("", "Top sessions (with their subagents)");
  for (const g of group(requests, (r) => r.session, compactions).slice(
    0,
    opts.top,
  )) {
    const project = (requests.find((x) => x.session === g.key) as Request)
      .project;
    lines.push(
      `  ${lpad(usd(g.spend), 6)} ${lpad(pct(g.spend / total), 6)}  ${g.key.slice(0, 8)}  ${g.agents} transcripts  ${project}`,
    );
  }

  const f = flags(requests, total);
  if (f.length) lines.push("", "Flags", ...f.map((x) => `  - ${x}`));
  return lines.join("\n");
}

export interface Args {
  since: number;
  sinceLabel: string;
  session: string | null;
  project: string;
  root: string | null;
  top: number;
  help: boolean;
}

/** Parse the command line. `now` is the current time, for the default of local midnight. */
export function parseArgs(argv: string[], now: Date): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  const s = get("--since");
  let since: number;
  if (s === null)
    since = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    since = new Date(y, m - 1, d).getTime();
  } else since = Date.parse(s);
  if (Number.isNaN(since)) throw new Error(`--since ${s}: not a date`);
  const top = Number(get("--top") ?? 15);
  if (!Number.isInteger(top) || top < 1)
    throw new Error(`--top ${get("--top")}: not a positive whole number`);
  return {
    since,
    sinceLabel: s ?? "local midnight",
    session: get("--session"),
    project: get("--project") ?? DEFAULT_PROJECT,
    root: get("--root"),
    top,
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

/** Whether a request passes the filters. */
export function keep(r: Request, a: Args): boolean {
  return (
    r.time >= a.since &&
    (a.session === null || r.session.startsWith(a.session)) &&
    r.project.includes(a.project)
  );
}

function transcripts(dir: string, since: number, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) transcripts(path, since, out);
    else if (name.endsWith(".jsonl") && st.mtimeMs >= since) out.push(path);
  }
  return out;
}

function main(): void {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2), new Date());
  } catch (e) {
    console.error(`${(e as Error).message}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    console.log(USAGE);
    return;
  }
  const root = args.root ?? join(process.env.HOME ?? "", ".claude", "projects");
  const requests: Request[] = [];
  const compactions = new Map<string, number>();
  for (const project of readdirSync(root)) {
    const dir = join(root, project);
    if (!project.includes(args.project) || !statSync(dir).isDirectory())
      continue;
    for (const file of transcripts(dir, args.since)) {
      const sub = file.includes("/subagents/");
      const metaPath = file.replace(/\.jsonl$/, ".meta.json");
      const meta = parseMeta(
        sub && existsSync(metaPath)
          ? readFileSync(metaPath, "utf8")
          : sub
            ? "{}"
            : null,
      );
      const parsed = parseTranscript(readFileSync(file, "utf8"), {
        file,
        project,
        meta,
      });
      compactions.set(file, parsed.compactions);
      for (const r of parsed.requests) if (keep(r, args)) requests.push(r);
    }
  }
  console.log(
    render(requests, compactions, { since: args.sinceLabel, top: args.top }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
