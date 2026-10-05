---
allowed-tools: Write, MultiEdit, Bash, Read
argument-hint: [jest|vitest|playwright|cypress]
description: Set up testing framework for Next.js 15
model: claude-3-5-sonnet-20241022
---

Set up testing for Next.js 15 with framework: $ARGUMENTS (default: jest)

> **This repo already has a working test setup — do not scaffold a second one.**
> Verified: there is **no jest** in any `package.json` here, so the default above
> is wrong for this repo. What actually exists:
>
> - `services/client` → `bun test --isolate --timeout=30000 src/lib/` (bun's own
>   runner, not jest and not vitest)
> - `packages/db`, `packages/contracts`, `packages/policy`, `services/api`,
>   `services/actors` → `bun run --bun vitest run`
> - E2E → Playwright, already configured in `packages/e2e`
>   (`packages/e2e/playwright.config.ts`), run with `bun run test:e2e`
> - CI → already wired in `.github/workflows/`
>
> Steps 2, 5, 6 and 7 below would therefore **overwrite working configuration
> that other agents own** — `packages/e2e/playwright.config.ts` and
> `.github/workflows/**` especially. Add tests to the existing harness instead.
> Treat this command as applying only to a package that genuinely has no tests,
> read root `AGENTS.md` ("Key commands", "Testing and validation") first, and say
> what you intend to create before creating it.

Steps to complete:

1. Install necessary dependencies
2. Create configuration files (jest.config.js, vitest.config.ts, playwright.config.ts, or cypress.config.js)
3. Set up test utilities and helpers
4. Create example test files for:
   - Client Components
   - Server Components (with limitations noted)
   - Server Actions
   - API routes
   - E2E user flows (if Playwright/Cypress)
5. Add test scripts to package.json
6. Configure GitHub Actions workflow for CI
7. Set up code coverage reporting

Ensure the testing setup:

- Works with Next.js 15's App Router
- Handles async components appropriately
- Includes proper mocking for Next.js modules
- Supports TypeScript
- Includes accessibility testing setup
- Has good defaults for performance

Create a comprehensive testing guide in the project documentation.
