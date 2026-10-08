/**
 * Pairs two sweep runs (or indexes one) — migration plan §5.3's side-by-side
 * review.
 *
 *   node visual/compare.ts --before <run A> --after <run B> --out <dir>
 *   node visual/compare.ts --after <run> --out <dir>      # one run, no diff
 *
 * A run is a `VISUAL_OUT` directory from `playwright.visual.config.ts`. This
 * writes into `--out`:
 *
 *   index.html          per slice, per route: before | after | diff, with the
 *                       first-screen pixel difference, axe serious+critical
 *                       counts and the rules that appeared or went away,
 *                       horizontal overflow and sub-44px targets. Images are
 *                       linked from the runs, not copied.
 *   diff/<stem>.png     first-screen difference (changed pixels in red over a
 *                       faded "after"); only first screens are diffed, since a
 *                       full scroll changes height whenever anything moves
 *   contact-<slice>.png a contact sheet of the slice's first screens, before
 *                       beside after
 *   compare.json        the numbers behind the page
 *
 * Images are compared in Chromium (Playwright's, already installed — never
 * `playwright install`), so the repo takes no image library for this.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "@playwright/test";

type Impact = "critical" | "serious" | "moderate" | "minor";
type RouteRecord = {
  stem: string;
  slice: string;
  slug: string;
  viewport: string;
  note: string;
  path: string;
  finalPath: string;
  status: number | null;
  files: { fold: string; full: string | null };
  layout: { overflowX: boolean; scrollWidth: number; under44: number };
  axe: {
    counts: Record<Impact, number>;
    violations: { id: string; impact: Impact; nodes: number }[];
  };
  states: { name: string; file?: string; error?: string }[];
  errors: string[];
};
type Run = { dir: string; tree: string; records: Map<string, RouteRecord> };

const { values } = parseArgs({
  options: {
    before: { type: "string" },
    after: { type: "string" },
    out: { type: "string" },
  },
});
if (values.after === undefined || values.out === undefined) {
  console.error("usage: compare.ts [--before <run>] --after <run> --out <dir>");
  process.exit(2);
}
const out = resolve(values.out);
mkdirSync(join(out, "diff"), { recursive: true });

function readRun(dir: string): Run {
  const abs = resolve(dir);
  const data = join(abs, "data");
  if (!existsSync(data))
    throw new Error(`${abs} is not a sweep run (no data/)`);
  const records = new Map<string, RouteRecord>();
  for (const f of readdirSync(data).filter((f) => f.endsWith(".json"))) {
    const r = JSON.parse(readFileSync(join(data, f), "utf8")) as RouteRecord;
    records.set(r.stem, r);
  }
  const summary = join(abs, "summary.json");
  const tree = existsSync(summary)
    ? ((JSON.parse(readFileSync(summary, "utf8")) as { tree?: string }).tree ??
      "?")
    : "?";
  return { dir: abs, tree, records };
}

const before = values.before === undefined ? null : readRun(values.before);
const after = readRun(values.after);

const serious = (r?: RouteRecord) =>
  r === undefined ? null : r.axe.counts.critical + r.axe.counts.serious;
const ruleIds = (r?: RouteRecord) =>
  new Set(
    (r?.axe.violations ?? [])
      .filter((v) => v.impact === "critical" || v.impact === "serious")
      .map((v) => v.id),
  );

/** Changed-pixel ratio of two first screens, and a diff image, in the page. */
async function diffImages(page: Page, a: string, b: string, target: string) {
  const b64 = (p: string) => readFileSync(p).toString("base64");
  const result = await page.evaluate(
    async ({ a, b }) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((ok, fail) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = fail;
          img.src = `data:image/png;base64,${src}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = Math.max(ia.width, ib.width);
      const h = Math.max(ia.height, ib.height);
      const pixels = (img: HTMLImageElement) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        if (ctx === null) throw new Error("no 2d context");
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const pa = pixels(ia);
      const pb = pixels(ib);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (ctx === null) throw new Error("no 2d context");
      const outImg = ctx.createImageData(w, h);
      const o = outImg.data;
      let changed = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const d =
          Math.abs((pa[i] ?? 0) - (pb[i] ?? 0)) +
          Math.abs((pa[i + 1] ?? 0) - (pb[i + 1] ?? 0)) +
          Math.abs((pa[i + 2] ?? 0) - (pb[i + 2] ?? 0));
        if (d > 48) {
          changed += 1;
          o[i] = 255;
          o[i + 1] = 40;
          o[i + 2] = 40;
          o[i + 3] = 255;
        } else {
          const g = ((pb[i] ?? 0) + (pb[i + 1] ?? 0) + (pb[i + 2] ?? 0)) / 3;
          o[i] = o[i + 1] = o[i + 2] = 40 + g * 0.35;
          o[i + 3] = 255;
        }
      }
      ctx.putImageData(outImg, 0, 0);
      return {
        ratio: changed / (w * h),
        sizeChanged: ia.width !== ib.width || ia.height !== ib.height,
        png: c.toDataURL("image/png"),
      };
    },
    { a: b64(a), b: b64(b) },
  );
  writeFileSync(
    target,
    Buffer.from(result.png.slice(result.png.indexOf(",") + 1), "base64"),
  );
  return { ratio: result.ratio, sizeChanged: result.sizeChanged };
}

const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
const link = (file: string) => esc(relative(out, file).split("\\").join("/"));

type Row = {
  stem: string;
  slice: string;
  slug: string;
  viewport: string;
  note: string;
  before?: RouteRecord;
  after?: RouteRecord;
  diff?: { ratio: number; sizeChanged: boolean; file: string };
  axeNew: string[];
  axeFixed: string[];
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const stems = [
    ...new Set([...(before?.records.keys() ?? []), ...after.records.keys()]),
  ].sort();
  const rows: Row[] = [];
  for (const stem of stems) {
    const b = before?.records.get(stem);
    const a = after.records.get(stem);
    const any = a ?? b;
    if (any === undefined) continue;
    const row: Row = {
      stem,
      slice: any.slice,
      slug: any.slug,
      viewport: any.viewport,
      note: any.note,
      before: b,
      after: a,
      axeNew: [...ruleIds(a)].filter((id) => !ruleIds(b).has(id)),
      axeFixed: [...ruleIds(b)].filter((id) => !ruleIds(a).has(id)),
    };
    if (before !== null && b !== undefined && a !== undefined) {
      const fa = join(before.dir, b.files.fold);
      const fb = join(after.dir, a.files.fold);
      if (existsSync(fa) && existsSync(fb)) {
        const file = join(out, "diff", `${stem}.png`);
        row.diff = { ...(await diffImages(page, fa, fb, file)), file };
      }
    }
    rows.push(row);
  }

  const sliceOrder = (s: string) => Number(s.replace(/\D/g, "")) || 0;
  const slices = [...new Set(rows.map((r) => r.slice))].sort(
    (x, y) => sliceOrder(x) - sliceOrder(y),
  );

  const img = (
    run: Run | null,
    rec: RouteRecord | undefined,
    file: string | null | undefined,
  ) =>
    run === null || rec === undefined || file == null
      ? `<div class="none">—</div>`
      : `<a href="${link(join(run.dir, file))}"><img loading="lazy" src="${link(join(run.dir, file))}"></a>`;
  const cell = (r: Row) => {
    const sb = serious(r.before);
    const sa = serious(r.after);
    const facts = [
      r.diff === undefined
        ? ""
        : `<b>${(r.diff.ratio * 100).toFixed(1)}%</b> of the first screen changed${r.diff.sizeChanged ? " (size changed)" : ""}`,
      r.before !== undefined &&
      r.after !== undefined &&
      r.before.status !== r.after.status
        ? `<span class="bad">HTTP ${r.before.status ?? "—"} → ${r.after.status ?? "—"}</span>`
        : (r.after?.status ?? 0) >= 400
          ? `<span class="bad">HTTP ${r.after?.status}</span>`
          : "",
      `axe serious+critical: ${sb ?? "—"} → ${sa ?? "—"}`,
      r.axeNew.length > 0
        ? `<span class="bad">new: ${r.axeNew.map(esc).join(", ")}</span>`
        : "",
      r.axeFixed.length > 0
        ? `<span class="good">gone: ${r.axeFixed.map(esc).join(", ")}</span>`
        : "",
      r.after?.layout.overflowX === true
        ? `<span class="bad">overflows: ${r.after.layout.scrollWidth}px wide</span>`
        : "",
      `targets under 44px: ${r.before?.layout.under44 ?? "—"} → ${r.after?.layout.under44 ?? "—"}`,
      (r.after?.errors.length ?? 0) > 0
        ? `<span class="bad">${r.after?.errors.length} console errors</span>`
        : "",
      r.after !== undefined && r.after.finalPath !== r.after.path
        ? `landed on ${esc(r.after.finalPath)}`
        : "",
    ].filter((s) => s !== "");
    const states = (r.after?.states ?? r.before?.states ?? [])
      .map((s) => s.name)
      .map((name) => {
        const sb2 = r.before?.states.find((s) => s.name === name);
        const sa2 = r.after?.states.find((s) => s.name === name);
        return `<div class="row state"><div class="meta">${esc(name)}${sa2?.error ? ` <span class="bad">${esc(sa2.error)}</span>` : ""}</div>${before === null ? "" : img(before, r.before, sb2?.file)}${img(after, r.after, sa2?.file)}</div>`;
      })
      .join("");
    return `<section id="${esc(r.stem)}"><h3>${esc(r.slug)} <small>${esc(r.viewport)} · ${esc(r.note)}</small></h3>
      <div class="row"><div class="meta"><code>${esc(r.after?.path ?? r.before?.path ?? "")}</code><ul>${facts.map((f) => `<li>${f}</li>`).join("")}</ul></div>
      ${before === null ? "" : img(before, r.before, r.before?.files.fold)}${img(after, r.after, r.after?.files.fold)}
      ${r.diff === undefined ? "" : `<a href="${link(r.diff.file)}"><img loading="lazy" src="${link(r.diff.file)}"></a>`}</div>
      <details><summary>full scroll</summary><div class="row">${before === null ? "" : img(before, r.before, r.before?.files.full)}${img(after, r.after, r.after?.files.full)}</div></details>
      ${states}</section>`;
  };
  const title =
    before === null
      ? `Sweep ${esc(after.tree)}`
      : `Sweep ${esc(before.tree)} → ${esc(after.tree)}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${title}</title><style>
body{font:14px/1.4 system-ui,sans-serif;margin:16px;background:#111;color:#ddd}
a{color:#9cf}h2{margin-top:32px;border-bottom:1px solid #333}h3 small{color:#888;font-weight:400}
.row{display:flex;gap:12px;align-items:flex-start}.row img{width:260px;border:1px solid #333}
.meta{width:260px;flex:none}.meta ul{padding-left:16px;margin:4px 0}.none{width:260px;color:#666}
.bad{color:#f88}.good{color:#8e8}.state .meta{color:#aaa}details{margin:6px 0}
nav a{margin-right:10px}code{font-size:12px;word-break:break-all}
</style></head><body><h1>${title}</h1>
<p>${before === null ? "" : `before: <code>${esc(before.dir)}</code> (tree ${esc(before.tree)})<br>`}after: <code>${esc(after.dir)}</code> (tree ${esc(after.tree)})</p>
<nav>${slices.map((s) => `<a href="#${esc(s)}">${esc(s)}</a> <a href="contact-${esc(s)}.png">(sheet)</a>`).join(" ")}</nav>
${slices
  .map(
    (s) =>
      `<h2 id="${esc(s)}">${esc(s)}</h2>${rows
        .filter((r) => r.slice === s)
        .map(cell)
        .join("")}`,
  )
  .join("")}
</body></html>`;
  writeFileSync(join(out, "index.html"), html);

  // Contact sheets: one per slice, first screens, before beside after.
  for (const s of slices) {
    const sheetRows = rows.filter(
      (r) => r.slice === s && r.viewport === "m390",
    );
    if (sheetRows.length === 0) continue;
    const dataUri = (run: Run | null, rec?: RouteRecord) => {
      if (run === null || rec === undefined) return "";
      const p = join(run.dir, rec.files.fold);
      return existsSync(p)
        ? `data:image/png;base64,${readFileSync(p).toString("base64")}`
        : "";
    };
    const tiles = sheetRows
      .map(
        (r) =>
          `<figure><figcaption>${esc(r.slug)}${r.diff ? ` · ${(r.diff.ratio * 100).toFixed(0)}%` : ""}</figcaption><div>${
            before === null ? "" : `<img src="${dataUri(before, r.before)}">`
          }<img src="${dataUri(after, r.after)}"></div></figure>`,
      )
      .join("");
    await page.setViewportSize({
      width: before === null ? 1300 : 1800,
      height: 800,
    });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#111;color:#ddd;font:13px system-ui">
      <h1 style="margin:8px 12px;font-size:16px">${esc(s)} · ${title}</h1>
      <div style="display:flex;flex-wrap:wrap;gap:10px;padding:0 12px 12px">${tiles}</div>
      <style>figure{margin:0}figcaption{padding:2px 0}figure div{display:flex;gap:2px}img{width:${before === null ? 240 : 200}px;display:block}</style></body></html>`);
    await page.evaluate(() =>
      Promise.all(
        [...document.images].map((i) =>
          i.complete
            ? null
            : new Promise((r) => {
                i.onload = i.onerror = r;
              }),
        ),
      ),
    );
    await page.screenshot({
      path: join(out, `contact-${s}.png`),
      fullPage: true,
    });
  }

  const json = {
    before: before === null ? null : { dir: before.dir, tree: before.tree },
    after: { dir: after.dir, tree: after.tree },
    writtenAt: new Date().toISOString(),
    rows: rows.map((r) => ({
      stem: r.stem,
      slice: r.slice,
      viewport: r.viewport,
      firstScreenChanged: r.diff?.ratio ?? null,
      sizeChanged: r.diff?.sizeChanged ?? null,
      statusBefore: r.before?.status ?? null,
      statusAfter: r.after?.status ?? null,
      axeSeriousBefore: serious(r.before),
      axeSeriousAfter: serious(r.after),
      axeNew: r.axeNew,
      axeFixed: r.axeFixed,
      overflowAfter: r.after?.layout.overflowX ?? null,
      missingBefore: r.before === undefined,
      missingAfter: r.after === undefined,
    })),
  };
  writeFileSync(join(out, "compare.json"), JSON.stringify(json, null, 2));
  console.log(
    `wrote ${join(out, "index.html")} (${rows.length} captures, ${slices.length} slices) from ${basename(after.dir)}`,
  );
} finally {
  await browser.close();
}
