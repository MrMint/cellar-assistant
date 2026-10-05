#!/usr/bin/env python3
"""Compare soak runs side by side.

    services/actors/scripts/soak/compare.py .stack/<slug>/soak/*/summary.json

Prints one column per run. The number to read first is **bytes/rpc (rss)**: the
least-squares slope of resident memory against cumulative RPC count over the
steady-state window, which is the unit oven-sh/bun#40646 and its Node baseline
are both quoted in (237 B/RPC over TLS on Bun, 9.6 on Node, 8.5 plaintext).

`r2` is there to stop the slope being over-read. A slope of 40 B/RPC with an r2
of 0.02 is noise with a line drawn through it; the same slope at 0.95 is a leak.
RSS on both runtimes is allocator-managed and sawtoothed — it is not expected to
fit a line well when it is flat, and a *low* r2 on a near-zero slope is the
healthy outcome, not a failed measurement.
"""

import json
import os
import sys


def load(path):
    with open(path) as handle:
        return json.load(handle)


def row(label, values, width=26):
    print(f"  {label:<22}" + "".join(f"{v:<{width}}" for v in values))


def main(paths):
    runs = [(path, load(path)) for path in paths]
    if not runs:
        sys.exit("usage: compare.py <summary.json> [summary.json ...]")

    labels = [s.get("label", "?") for _, s in runs]
    print()
    row("", labels)
    print("  " + "-" * (22 + 26 * len(runs)))

    def get(summary, *keys, default="-"):
        node = summary
        for key in keys:
            if not isinstance(node, dict) or node.get(key) is None:
                return default
            node = node[key]
        return node

    row("duration (s)", [get(s, "durationS") for _, s in runs])
    row("rpc/s", [get(s, "rpcsPerSecond") for _, s in runs])
    row("rpcs (window)", [get(s, "rss", "lastRpc") for _, s in runs])
    row("samples", [get(s, "windowSamples") for _, s in runs])
    print()
    row("bytes/rpc (rss)", [get(s, "rss", "bytesPerRpc") for _, s in runs])
    row("  r2", [get(s, "rss", "r2") for _, s in runs])
    row(
        "  rss first -> last",
        [
            f'{mib(get(s, "rss", "firstBytes"))} -> {mib(get(s, "rss", "lastBytes"))}'
            for _, s in runs
        ],
    )
    row(
        "bytes/rpc (2nd half)",
        [tail_slope(path) for path, _ in runs],
    )
    row("bytes/rpc (heapUsed)", [get(s, "heapUsed", "bytesPerRpc") for _, s in runs])
    row("  r2", [get(s, "heapUsed", "r2") for _, s in runs])
    row("hours to 1 GiB", [get(s, "hoursToOneGiB", default="never") for _, s in runs])
    print()
    row("pings", [get(s, "counters", "pings") for _, s in runs])
    row("ping errors", [get(s, "counters", "pingErrors") for _, s in runs])
    row("outbox enqueued", [get(s, "counters", "outboxEnqueued") for _, s in runs])
    row("reference reads", [get(s, "counters", "refReads") for _, s in runs])
    row(
        "reminder probes",
        [
            f'{get(s, "reminderLiveness", "delivered")}/{get(s, "reminderLiveness", "armed")}'
            f' (late {get(s, "reminderLiveness", "late")})'
            for _, s in runs
        ],
    )
    row("verdict", [get(s, "verdict") for _, s in runs])
    print()
    for path, summary in runs:
        for failure in summary.get("failures", []):
            print(f"  ! {summary.get('label')}: {failure}")
    print()


def tail_slope(summary_path):
    """Re-fit RSS over the LAST HALF of the run's own samples.

    A process that has just started is still JIT-warming, filling pools and
    growing caches, and that shows up as a positive slope which then flattens.
    The whole-window fit cannot tell that apart from a slow leak; fitting the
    second half separately can. A leak keeps the same slope in both halves. A
    settling curve's second-half slope collapses toward zero.
    """
    samples_path = os.path.join(os.path.dirname(summary_path), "samples.jsonl")
    try:
        with open(samples_path) as handle:
            rows = [json.loads(line) for line in handle if line.strip()]
    except (OSError, ValueError):
        return "-"
    points = [
        (row["rpcs"], row["rss"])
        for row in rows
        if row.get("rss") is not None and row.get("rpcs") is not None
    ]
    points = points[len(points) // 2 :]
    if len(points) < 3:
        return "-"
    n = len(points)
    sum_x = sum(x for x, _ in points)
    sum_y = sum(y for _, y in points)
    sum_xy = sum(x * y for x, y in points)
    sum_xx = sum(x * x for x, _ in points)
    denominator = n * sum_xx - sum_x * sum_x
    if denominator == 0:
        return "-"
    slope = (n * sum_xy - sum_x * sum_y) / denominator
    return f"{slope:.2f} (n={n})"


def mib(value):
    if not isinstance(value, (int, float)):
        return "-"
    return f"{value / 1024 / 1024:.1f}M"


if __name__ == "__main__":
    main(sys.argv[1:])
