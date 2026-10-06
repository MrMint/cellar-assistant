#!/usr/bin/env bash
# The `smoke` phase's surviving-table comparison, on its own so it can be
# tested under GNU coreutils (scripts/cutover/test/host-guards.sh):
#
#   compare-rowcounts.sh <source-snapshot> <target-snapshot>
#
# Each snapshot is rowcounts.sql's output, `schema.table|count` per line. Prints
# one line for every table present in BOTH whose count differs; prints nothing
# when every surviving table kept every row. Tables only on one side (the
# transform's intentional drops and additions) are `smoke`'s plain diff, not
# this.
#
# WHY THE SORT KEYS. `join` needs both inputs sorted on the JOIN FIELD, under
# the collation `join` itself compares with. The original
# `join -t'|' <(sort A) <(sort B)` sorted whole lines, and a whole-line sort is
# not a field-1 sort: under C collation `|` (0x7C) sorts after `_` (0x5F), so
# `public.outbox_dead_letter_acks|0` lands before `public.outbox|0`, while
# `join` (comparing field 1 only) needs `public.outbox` first. GNU join
# refuses that input — "is not sorted: public.outbox|0" — and under pipefail
# and errexit `smoke` exited 1 on every Linux host (found by the 2026-10-04
# rehearsal on Loki). BSD join on macOS passed silently, so no Mac run ever
# showed it. Under a UTF-8 locale the whole-line order differs again, which is
# why the collation is pinned for `sort` and `join` alike rather than left to
# whatever the cutover host's shell exports.
set -euo pipefail

[ $# -eq 2 ] || { printf 'usage: %s <source-snapshot> <target-snapshot>\n' "$(basename "$0")" >&2; exit 2; }

export LC_ALL=C
join -t'|' <(sort -t'|' -k1,1 "$1") <(sort -t'|' -k1,1 "$2") \
  | awk -F'|' '$2 != $3 { printf "  %-45s %s -> %s\n", $1, $2, $3 }'
