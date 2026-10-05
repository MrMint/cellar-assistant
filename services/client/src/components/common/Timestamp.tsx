"use client";

import { useEffect, useState } from "react";

/**
 * An absolute instant, shown in the viewer's own timezone without tripping
 * React's hydration check.
 *
 * ## The bug this exists to stop
 *
 * `new Date(iso).toLocaleString()` in a client component that a server
 * component seeded is a **production crash**, not a cosmetic warning. The
 * server formats in the container's zone — `cellar-stack-client-1` sets no
 * `TZ`, so Node resolves `UTC` — while the browser formats the same instant in
 * the viewer's zone. For `2026-09-11T04:46:36.348Z` the server wrote
 *
 *     <span class="…MuiTypography-body-xs…">9/11/2026, 4:46:36 AM</span>
 *
 * and a viewer in `America/Chicago` produced `9/10/2026, 11:46:36 PM` — a
 * different *day*, in a text node React compares during hydration. `next dev`
 * logs that as a recoverable warning and quietly patches the DOM; a production
 * build throws **React error #418**. That is why `/map/scans` failed the e2e
 * suite the first time it ran against `next build` rather than `next dev`, and
 * why nobody had seen it before despite the code being years old.
 *
 * ## Why it defers instead of formatting on the server
 *
 * The other stable fix is to format once on the server and pass the string
 * down. It cannot be right here: the server does not know the viewer's
 * timezone, so it would have to show everyone UTC, and a scan timestamp is
 * precisely the kind of value a viewer reads as "when *I* did this". So the
 * first render is deterministic and the viewer's zone is applied afterwards.
 *
 * The first render — the server's, and the client's hydration pass — is built
 * from UTC parts **by hand**, deliberately never through `Intl`. Pinning a
 * locale and zone (`toLocaleString("en-US", { timeZone: "UTC" })`) would agree
 * across this stack's two Node builds today, but it stakes hydration on the
 * server's ICU and the viewer's browser ICU producing byte-identical output,
 * and they are separately versioned: ICU 72 switched the space before `AM` to
 * U+202F, so one Chrome release could reintroduce #418 as a single invisible
 * character. Hand-built digits cannot skew.
 *
 * `suppressHydrationWarning` is deliberately **absent**: both first renders
 * emit the same string, so there is no mismatch to suppress, and leaving it off
 * means a future mismatch here is still reported rather than hidden.
 */
export type TimestampPrecision = "date" | "datetime";

const PRECISION_OPTIONS = {
  date: { dateStyle: "medium" },
  datetime: { dateStyle: "medium", timeStyle: "short" },
} satisfies Record<TimestampPrecision, Intl.DateTimeFormatOptions>;

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * The pre-hydration string, identical on every machine.
 *
 * ISO-shaped and labelled `UTC` so that the brief moment before the effect
 * lands reads as an unconverted timestamp rather than as the wrong local time.
 */
const stableText = (date: Date, precision: TimestampPrecision): string => {
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}`;
  return precision === "date"
    ? day
    : `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
};

/**
 * The viewer's own locale and zone — `undefined` asks the runtime for both.
 *
 * Only ever reached from an effect, after hydration has committed, so React
 * never compares this against server output.
 */
const localText = (date: Date, precision: TimestampPrecision): string =>
  date.toLocaleString(undefined, PRECISION_OPTIONS[precision]);

export function Timestamp({
  iso,
  precision = "datetime",
}: {
  iso: string;
  precision?: TimestampPrecision;
}) {
  const parsed = new Date(iso);
  const valid = !Number.isNaN(parsed.getTime());
  const [text, setText] = useState(() =>
    valid ? stableText(parsed, precision) : "",
  );

  useEffect(() => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return;
    setText(localText(date, precision));
  }, [iso, precision]);

  if (!valid) {
    return null;
  }
  return <time dateTime={iso}>{text}</time>;
}
