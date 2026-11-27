"use client";

import { cn } from "@/lib/utils";
import { useHasMounted } from "./useHasMounted";

/** "Good morning" / "Good afternoon" / "Good evening" for the hour `now` is at. */
export function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** The greeting line's text: the time of day and the first name, if any. */
export function greetingText(now: Date, displayName?: string): string {
  const firstName = displayName?.trim().split(/\s+/)[0];
  return firstName ? `${greetingFor(now)}, ${firstName}` : greetingFor(now);
}

interface GreetingProps {
  displayName?: string;
}

/**
 * The landing view's greeting, **rendered on the client only** (X01).
 *
 * The time of day is the viewer's, and only the browser knows it: rendered on
 * the server it used the server's clock, so a hard load at 23:30 in Chicago
 * said "Good morning" (it was 04:30 UTC) while the same page reached by a tab
 * tap said "Good evening" (observation 6). Until the first effect there is no
 * text at all — an empty line of the heading's height, so nothing below it
 * moves when the greeting fades in.
 */
export function Greeting({ displayName }: GreetingProps) {
  const mounted = useHasMounted();
  return (
    <div className="flex min-h-9 items-center justify-center">
      {mounted && (
        <h2
          className={cn(
            "t-title text-center text-ink",
            "animate-in fade-in-0 duration-(--ca-dur-medium) ease-enter",
          )}
        >
          {greetingText(new Date(), displayName)}
        </h2>
      )}
    </div>
  );
}
