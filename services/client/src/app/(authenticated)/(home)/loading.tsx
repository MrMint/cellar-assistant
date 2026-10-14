import { TodayShell } from "@/components/home/TodayShell";

/**
 * Home's shell (X24). In its own route group so it is this page's alone: a
 * `loading.tsx` at `(authenticated)/` would be every signed-in page's.
 */
export default function TodayLoading() {
  return <TodayShell />;
}
