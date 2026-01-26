---
allowed-tools: Read, Write, MultiEdit, Glob, Grep, TodoWrite
argument-hint: [page-path|all]
description: Migrate Pages Router components to App Router
---

Migrate Pages Router to App Router for: $ARGUMENTS

## Migration Steps

1. **Analyze Current Structure**
   - Identify pages to migrate
   - Check for getServerSideProps, getStaticProps, getStaticPaths
   - Find _app.tsx and_document.tsx customizations

2. **Create App Router Structure**
   - Create corresponding app/ directory structure
   - Convert pages to page.tsx files
   - Extract layouts from _app.tsx

3. **Migrate Data Fetching**
   - getStaticProps → Direct fetch in Server Component
   - getServerSideProps → Direct fetch in Server Component
   - getStaticPaths → generateStaticParams
   - API calls in useEffect → Keep in Client Component or move to Server

4. **Update Routing Hooks**
   - useRouter from next/router → next/navigation
   - Update router.push() calls
   - Handle query params with useSearchParams

5. **Migrate Metadata**
   - Head component → metadata export or generateMetadata
   - Update SEO configuration

6. **Handle Special Files**
   - _app.tsx → app/layout.tsx
   - _document.tsx → app/layout.tsx (html/body tags)
   - _error.tsx → app/error.tsx
   - 404.tsx → app/not-found.tsx

7. **Test and Validate**
   - Ensure all routes work
   - Verify data fetching
   - Check that layouts render correctly
   - Test client-side navigation

Create a migration log documenting all changes and any issues that need manual review.
