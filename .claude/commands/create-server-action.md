---
allowed-tools: Write, Read, MultiEdit
argument-hint: <action-name> [model/entity]
description: Create a type-safe Server Action with validation and error handling
---

Create a Next.js 15 Server Action named "$ARGUMENTS" with:

1. Proper 'use server' directive
2. Zod schema for input validation
3. Error handling and try-catch blocks
4. Type-safe return values
5. Authentication check (if applicable)
6. Rate limiting setup
7. Database operation (if entity provided)
8. Cache revalidation (revalidatePath/revalidateTag)
9. Proper TypeScript types throughout
10. Example usage in a form component

The Server Action should follow security best practices:

- Input validation and sanitization
- CSRF protection considerations
- Proper error messages (don't leak sensitive info)
- Audit logging for important operations

Include both the server action file and an example client component that uses it with useActionState.
