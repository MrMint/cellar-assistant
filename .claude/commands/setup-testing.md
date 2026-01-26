---
allowed-tools: Write, MultiEdit, Bash, Read
argument-hint: [jest|vitest|playwright|cypress]
description: Set up testing framework for Next.js 15
model: claude-3-5-sonnet-20241022
---

Set up testing for Next.js 15 with framework: $ARGUMENTS (default: jest)

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
