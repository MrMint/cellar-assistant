"use client";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

interface GreetingProps {
  displayName?: string;
}

export function Greeting({ displayName }: GreetingProps) {
  const greeting = getGreeting();
  const firstName = displayName?.split(" ")[0];

  return (
    <h2 suppressHydrationWarning className="type-title-1 text-center">
      {greeting}
      {firstName ? `, ${firstName}` : ""}
    </h2>
  );
}
