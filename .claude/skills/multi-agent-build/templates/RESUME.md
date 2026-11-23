# Resume · <build>

The lead's state. A fresh lead session reads this file and nothing older. Update it at every phase
change, and keep it under about 150 lines by deleting what's finished.

- **Phase:** <plan | spec gaps | briefs | build | verify | fix | PR | teardown>
- **Integration branch:** `claude/<build>`, worktree `.claude/worktrees/<build>`
- **Build dir:** `<primary checkout>/.builds/<build>/`
- **Issue / epic:** #<n>
- **Concurrency:** <streams at once>, with check times measured at that load: <median, tree state>

## Streams

| Id | Agent | Worktree | PR | State |
|---|---|---|---|---|
| <id> | <agent id> | `<build>-<id>` | #<n> | <spawned / PR open / merged / handed back> |

## Spend at the last phase change

<the head of `node tools/agent-spend.ts --session <id prefix>`, with its date>

## Open rulings

- <question> → <recommendation>

## Next step

<one line>
