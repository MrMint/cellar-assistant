import { FriendsClient } from "./FriendsClient";

interface FriendsProps {
  userId: string;
}

export function Friends({ userId }: FriendsProps) {
  // For now, pass through to the client component since this page has complex
  // real-time features (subscriptions, mutations, search)
  // This establishes the server-first pattern while preserving functionality
  return <FriendsClient userId={userId} />;
}
