import { UserAvatar } from "@/components/app/UserAvatar";

/** Who: the avatar, their name (the page's one h1), and the line under it. */
export function ProfileHeader({
  name,
  avatarUrl,
  line,
  headingLevel = 1,
}: {
  name: string;
  avatarUrl: string | null;
  line?: string;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <header className="flex items-center gap-4">
      {/* Decorative: the name is the heading beside it. */}
      <UserAvatar
        aria-hidden
        avatarUrl={avatarUrl}
        displayName={name}
        size="xl"
      />
      <div className="flex min-w-0 flex-col">
        <Heading className="t-title truncate text-ink">{name}</Heading>
        {line !== undefined && (
          <p className="t-cap truncate text-ink-2">{line}</p>
        )}
      </div>
    </header>
  );
}

/** The crumbs every person page shares (desktop only). */
export const personCrumbs = (name: string) =>
  [
    { label: "Me", href: "/me" },
    { label: "Friends", href: "/friends" },
    { label: name },
  ] as const;
