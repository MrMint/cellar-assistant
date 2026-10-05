# What this changes

<!-- What does this do, and why? Link the issue it closes, if there is one. -->

Closes #

## How it was verified

<!--
Say what you actually ran, not what you believe would pass. If you verified a
front-end change in the browser rather than only by type-checking, say so.
-->

- [ ] `bun run typecheck`
- [ ] `bun run check`
- [ ] `bun run test`
- [ ] `bun run test:e2e` (if it touches a user-facing flow)
- [ ] Checked it in a browser (if it touches the UI)

## Notes for the reviewer

<!--
Anything worth knowing: a decision you weren't sure about, a trade-off, a
follow-up you deliberately left out of scope.
-->

---

- [ ] The commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
      (`feat:`, `fix:`, `chore:`, …) — the prefix decides the release bump.
- [ ] No secrets, `.env` files, personal paths or hostnames in the diff.
- [ ] `CHANGELOG.md` is untouched (release-please generates it).

> If this pull request fixes a security vulnerability, please stop and read
> [SECURITY.md](../SECURITY.md) first — a public pull request discloses the
> problem before there is a released fix.
