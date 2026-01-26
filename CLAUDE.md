# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cellar Assistant is a Next.js application for managing wine, beer, spirit, and coffee collections. Built with TypeScript, it uses Nhost as a serverless backend platform providing GraphQL API, authentication, and storage capabilities.

## Development Setup

### Prerequisites
- Node.js and Docker
- Nhost CLI installed

### Key Commands
```bash
# Development
# NOTE: DO NOT run pnpm dev or pnpm build - user runs dev server in background
nhost up --apply-seeds # Start local Nhost backend environment
pnpm typecheck        # Run TypeScript type checking
pnpm lint            # Run ESLint
pnpm format          # Format code with Prettier

# GraphQL
pnpm codegen         # Generate GraphQL types
pnpm codegen-watch   # Watch mode for GraphQL codegen

# Dependencies
pnpm update:all      # Update all dependencies interactively
```

### Local Development URLs
- App: http://localhost:3000
- Hasura: https://local.hasura.nhost.run
- GraphQL: https://local.graphql.nhost.run
- Test accounts: test@test.com:123456789, test2@test.com:123456789

## Architecture

### Workspace Structure
This is a pnpm workspace with three main packages:
- **Root**: Next.js frontend application
- **functions/**: Nhost serverless functions for backend operations
- **packages/shared/**: Shared utilities, GraphQL types, and fragments

### GraphQL with gql.tada
The project uses **gql.tada** for type-safe GraphQL operations:
- Configuration in `tsconfig.json` with `@0no-co/graphqlsp` plugin
- Shared GraphQL setup in `packages/shared/gql/graphql.ts`
- Fragment patterns organized in `src/components/shared/fragments/`
- Type generation outputs to `packages/shared/gql/graphql-env.d.ts`

### URQL Client Architecture
- **Client components**: Use `makeClientClient()` from `src/lib/urql/client.ts`
- **Server components**: Use `makeServerClient()` from `src/lib/urql/server-client.ts`
- Includes SSR exchange, auth exchange, and subscription support
- Nhost integration for authentication

### Next.js App Router Structure
- **Route groups**: `(authenticated)` for protected pages
- **Dynamic routes**: `[itemId]`, `[cellarId]` for resource-specific pages
- **Item types**: Organized by wine, beer, spirit, coffee categories
- **Nested layouts**: Authentication wrapper in `(authenticated)/layout.tsx`

### Component Organization
- **Type-specific components**: `src/components/{beer,wine,spirit,coffee}/`
- **Shared fragments**: Reusable GraphQL fragments in `src/components/shared/fragments/`
- **Fragment patterns**: Core, stats, images, user data, and full fragments for items/cellars

### State Management
- **XState**: Used for complex state machines
- **React Hook Form**: Form state management
- **URQL**: GraphQL state and caching

## Key Technologies
- **Frontend**: Next.js 15, React 19, TypeScript, Material-UI Joy
- **GraphQL**: gql.tada, URQL, GraphQL Code Generator
- **Backend**: Nhost (Hasura GraphQL, PostgreSQL, Auth, Storage)
- **Styling**: Emotion, Material-UI Joy
- **Development**: ESLint, Prettier, pnpm workspaces

## Fragment Usage Patterns
When working with GraphQL queries:
1. Use existing fragments from `src/components/shared/fragments/`
2. Follow the pattern: Core → Stats → Images → UserData → Full
3. Import fragments using `readFragment()` for type safety
4. Create component-specific fragments in respective folders

## UI and Styling Best Practices

### Material-UI Joy Guidelines
- **Prefer Joy UI components** over custom components whenever possible
- Use Joy's design system tokens (theme values) for consistent spacing, colors, and typography
- Follow Joy's component composition patterns (e.g., `Card` + `CardContent`)
- Leverage Joy's built-in variants and color schemes rather than custom CSS
- Use Joy's responsive breakpoints and spacing system: `theme.spacing()`, `theme.breakpoints`
- Prefer Joy's CSS-in-JS approach with `sx` prop over external stylesheets
- Use Joy's semantic color tokens (`primary`, `neutral`, `success`, etc.) over hardcoded colors

### Styling Patterns
- **Component styling hierarchy**: Joy components → `sx` prop → Emotion styled → custom CSS (last resort)
- Use `sx` prop for one-off component styling and responsive design
- Create reusable styled components with Emotion only when Joy components don't suffice
- Follow Joy's naming conventions for custom variants and extend existing component APIs
- Maintain design consistency by using theme tokens throughout the application

## Database Access
- **PostgreSQL database name**: `local` (not `postgres`)
- **Connection for debugging**: `docker exec cellar-assistant-postgres-1 psql -U postgres -d local`
- **Hasura user**: Functions and queries run as `nhost_hasura` user
- **Test function access**: `docker exec cellar-assistant-postgres-1 psql -U nhost_hasura -d local`

## Nhost/Hasura Operations
**IMPORTANT**: When working with Nhost MCP tools, Hasura metadata, GraphQL schema modifications, or database operations, ALWAYS use the `nhost-hasura-admin` agent. This specialized agent:
- Handles all database schema changes and migrations
- Manages Hasura metadata configuration and permissions
- Ensures proper source control capture of metadata changes
- Follows established patterns for database operations
- Provides expert guidance on PostgreSQL and GraphQL best practices

Use the nhost-hasura-admin agent for:
- Creating/modifying database tables
- Setting up GraphQL permissions and relationships
- Debugging database access issues
- Managing Hasura actions and custom types
- Applying migrations and metadata changes
- Any interaction with `mcp__mcp-nhost__*` tools

## Testing and Validation
- Always run `pnpm typecheck` before committing changes
- Use `pnpm lint` to ensure code style compliance
- Test GraphQL operations against local Nhost environment
- Verify authentication flows with test accounts
- always use nhost dev hasura for the hasura commands

## Browser Testing with Playwright MCP
When using Playwright MCP tools to test the local development environment:
- **Use `http://host.docker.internal:3000`** instead of `http://localhost:3000`
- Playwright runs in a Docker container and cannot access localhost directly
- The `host.docker.internal` hostname resolves to the host machine from inside containers
- Test credentials are available: `test@test.com:123456789` and `test2@test.com:123456789`
- Authentication flows redirect from `/sign-in` to `/cellars` on successful login

## Quick Visual Check
IMMEDIATELY after implementing any front-end change:

1. **Identify what changed** - Review the modified components/pages
2. **Navigate to affected pages** - Use `mcp__playwright__browser_navigate` to visit each changed view
3. **Verify design compliance** - Compare against `/context/design-principles.md` and `/context/style-guide.md`
4. **Validate feature implementation** - Ensure the change fulfills the user's specific request
5. **Check acceptance criteria** - Review any provided context files or requirements
6. **Capture evidence** - Take full page screenshot at desktop viewport (1440px) of each changed view
7. **Check for errors** - Run `mcp__playwright__browser_console_messages`

This verification ensures changes meet design standards and user requirements.
- Always use the ide getDiagnostics tool to check for problems in code