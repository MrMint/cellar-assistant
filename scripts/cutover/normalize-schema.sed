# Canonicalise a `drizzle-kit pull` schema file so that a freshly pulled one and
# the committed `packages/db/src/schema/tables.ts` compare equal *if and only if*
# they differ by nothing but the documented hand-edits.
#
# The hand-edits are listed in `packages/db/README.md` ("Hand-edits to re-apply
# after every re-pull"). Each substitution below erases exactly one of them, and
# nothing else — so any other difference between the transformed database and
# the Drizzle baseline survives into the diff and fails the cutover.
#
# Portable sed only (BSD and GNU): no `+N` address offsets, no `\+`, no `-E`.

# Whole-line `//` comments. Hand-edits are announced in comment blocks that the
# generator never writes; dropping every full-line comment removes them without
# needing a multi-line address range.
/^[ 	]*\/\//d

# HAND-EDIT #4, first half: the typed-wrapper import the generator never emits.
/from "\.\/custom-types\.ts"/d

# The `drizzle-orm/pg-core` import list. `pull` orders the identifiers by first
# use, so adding a hand-edit reorders them; the set is implied by the body.
s|^import {.*} from "drizzle-orm/pg-core"$|IMPORT_PG_CORE|

# HAND-EDIT #4, second half: three columns rc.4 can only introspect as untyped
# `customType(...)` placeholders.
s|customType({ dataType: () => 'geography(Point,4326)' })|geography|g
s|customType({ dataType: () => 'tsvector' })|tsvector|g
s|customType({ dataType: () => 'money' })|money|g

# HAND-EDIT #6: `pull` writes `mode: 'number'`, which loses bigint precision
# past 2^53; A7b's delivery ordering reads `outbox.seq` as a bigint.
s|bigserial({ mode: 'number' })|bigserial({ mode: "bigint" })|g

# HAND-EDIT #2: rc.4 drops the operator class from *expression* indexes, so
# `idx_places_name_compact_trgm` comes back without `gin_trgm_ops` — not merely
# different, invalid.
s| gin_trgm_ops||g

# Trailing whitespace is not a schema difference.
s|[ 	]*$||
