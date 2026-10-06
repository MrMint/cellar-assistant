<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

## Project-specific instructions

The block above is managed by `next dev` and is the Next.js half only. Everything
specific to this repository — stack, commands, conventions, gates — lives in
`CLAUDE.md` at the **workspace root**, two directories up. Read it as well.

This file sits in `services/client` rather than at the repo root on purpose: the
managed block above resolves `node_modules/next/dist/docs/` from its own
directory, and `next` is installed here, as this package's dependency. At the
repo root there is no `next` to find, so the same sentence would point at
nothing.

`next dev` maintains the managed block only when it detects a coding agent in its
environment, so a plain `bun run dev` in a human shell leaves it alone. It is committed
here so the pointer survives regardless.
