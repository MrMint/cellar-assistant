import { ErrorIcon } from "@/components/app/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ApiFailure } from "@/lib/api/result";
import { cn } from "@/lib/utils";

/**
 * One of the five typed errors, rendered.
 *
 * `message` comes from the actor and is written for a person; `code` is the
 * stable half and is only shown for the ones a viewer can act on. A
 * `NotFoundError` should generally not reach here — §1.6 makes it mean "no such
 * thing, or not yours", and pages render that as an empty state instead.
 *
 * `FORBIDDEN` is not a fault (Joy drew it amber, "warning"): it reads in ink,
 * with the danger hue kept for errors (`data-tone` says which).
 */
export function ApiError({
  error,
  title,
}: {
  error: ApiFailure;
  title?: string;
}) {
  const forbidden = error.code === "FORBIDDEN";
  return (
    <Alert
      variant={forbidden ? "default" : "destructive"}
      data-tone={forbidden ? "warning" : "danger"}
      className={cn(
        "border-transparent bg-surface-2",
        !forbidden && "border-destructive/60",
      )}
    >
      <ErrorIcon aria-hidden />
      {title !== undefined && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription className={forbidden ? "text-ink-2" : undefined}>
        {error.message}
      </AlertDescription>
    </Alert>
  );
}
