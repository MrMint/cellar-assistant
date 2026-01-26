---
allowed-tools: Write, MultiEdit, Read, Glob
argument-hint: <route-path> [dynamic-params]
description: Create a new Next.js page with proper structure and TypeScript types
---

Create a new Next.js 15 App Router page at the route path: $ARGUMENTS

Follow these requirements:

1. Create the page.tsx file in the appropriate app/ directory structure
2. Include proper TypeScript types for params and searchParams (they are Promises in Next.js 15)
3. Add a corresponding loading.tsx for loading state
4. Add an error.tsx for error boundary
5. If it's a dynamic route, ensure proper parameter typing
6. Make it a Server Component by default (no 'use client')
7. Include basic structure with semantic HTML
8. Add helpful comments about data fetching patterns

Example: If the argument is "products/[id]", create:

- app/products/[id]/page.tsx
- app/products/[id]/loading.tsx  
- app/products/[id]/error.tsx

Make sure to follow Next.js 15 conventions and best practices.
