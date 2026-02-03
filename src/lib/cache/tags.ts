/**
 * Centralized cache tag definitions for consistent invalidation.
 * Use these tags with unstable_cache and revalidateTag.
 */
export const CacheTags = {
  // Global tags
  searchVectors: "search-vectors",
  items: "items",
  reviews: "reviews",

  // User-specific tags
  user: (userId: string) => `user:${userId}` as const,
  userCellars: (userId: string) => `user-cellars:${userId}` as const,

  // Cellar-specific tags
  cellar: (cellarId: string) => `cellar:${cellarId}` as const,
  cellarItems: (cellarId: string) => `cellar-items:${cellarId}` as const,
  cellarMetadata: (cellarId: string) => `cellar-metadata:${cellarId}` as const,
} as const;
