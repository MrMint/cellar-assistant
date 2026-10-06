# Sort the column entries inside every `pgTable("…", {` … `}` block, so that the
# baseline check (cutover.sh `baseline`, step 2) compares a table's column SET
# and not its physical column ORDER. Runs after normalize-schema.sed, on both
# sides of the diff.
#
# WHY. `drizzle-kit pull` emits columns in `attnum` order, which is the order
# they were added on *that* database. Production's Nhost database and the local
# Nhost database the committed baseline was pulled from
# (`packages/db/transform/nhost-schema.sql`) did not add every column in the
# same order. Measured 2026-09-28 against the production backup of that day:
# production's `tier_lists.is_editing_locked` is column 9 of 12 (before
# `content_updated_at`); the baseline has it at 12. Nothing else differed. The
# baseline check therefore failed on production data, and `baseline` runs
# inside the freeze. Column order changes nothing Drizzle does (every statement
# names its columns), and the transform cannot fix it without rewriting the
# table, so the comparison is what changes.
#
# What is still compared exactly: every column's full definition (a column
# entry is its first line plus any continuation lines, e.g. a multi-line
# `generatedAlwaysAs(sql`…`)`, kept together), and everything outside the
# column block — indexes, uniques, checks, foreign keys — in its original order.
#
# Portable awk (BSD and GNU): no asort(); an insertion sort over one table's
# entries, which is at most a few dozen.

function flush_block(   i, j, tmp) {
  for (i = 2; i <= n; i++) {
    tmp = entry[i]
    for (j = i - 1; j >= 1 && entry[j] > tmp; j--) entry[j + 1] = entry[j]
    entry[j + 1] = tmp
  }
  for (i = 1; i <= n; i++) print entry[i]
  n = 0
}

/pgTable\(".*", \{$/ { print; inblk = 1; n = 0; next }
inblk && /^\}/ { flush_block(); inblk = 0; print; next }
# A column entry starts with one tab and `name:`; anything else inside the
# block continues the entry above it.
inblk && /^\t[A-Za-z_$][A-Za-z0-9_$]*: / { entry[++n] = $0; next }
inblk { if (n == 0) entry[++n] = $0; else entry[n] = entry[n] "\n" $0; next }
{ print }
