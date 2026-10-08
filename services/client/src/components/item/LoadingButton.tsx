import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * `ui/button` with Joy's `loading`: while it is set the button is disabled,
 * says so (`aria-busy`) and shows a spinner before its label. The label stays,
 * so the button keeps its accessible name ("Open it!", "Check In") throughout.
 */
export function LoadingButton({
  loading = false,
  disabled,
  children,
  ...props
}: ComponentProps<typeof Button> & { loading?: boolean }) {
  return (
    <Button
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner aria-hidden />}
      {children}
    </Button>
  );
}
