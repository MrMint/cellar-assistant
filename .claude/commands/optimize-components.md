---
allowed-tools: Read, MultiEdit, Grep, Glob
description: Analyze and optimize React Server/Client Component boundaries
---

Analyze the current component structure and optimize the Server/Client Component boundaries:

1. Find all components currently marked with 'use client'
2. Analyze if they truly need client-side interactivity
3. Identify components that can be converted to Server Components
4. Find Server Components that are passing non-serializable props
5. Suggest component composition patterns to minimize client JS
6. Identify opportunities for:
   - Moving data fetching to Server Components
   - Extracting interactive parts into smaller Client Components
   - Using children pattern to compose Server and Client Components

Provide a detailed report with:

- Current client/server component ratio
- Components that can be optimized
- Specific refactoring suggestions
- Estimated bundle size reduction

Focus on reducing the amount of JavaScript sent to the client while maintaining functionality.
