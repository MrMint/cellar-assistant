import { canGoBack } from "@/components/app/nav-history";
import type { Navigate } from "@/components/app/useNavigate";

/**
 * Leave a full-screen surface (Make mode, the recap deck) the way it was
 * entered: history Back when an in-app page sits behind it, so the surface
 * does not stay in the stack for the next Back to re-enter (CR-6), and a
 * `replace` to its parent on a cold open, which leaves nothing behind either.
 */
export function leaveTo(
  navigate: Navigate,
  fallback: string,
  hasHistory: boolean = canGoBack(),
): void {
  if (hasHistory) navigate.back({ kind: "back" });
  else navigate.replace(fallback, { kind: "back" });
}
