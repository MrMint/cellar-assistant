import type { ReactNode } from "react";
import { mainContentProps } from "@/components/app/SkipLink";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The page the sign-in and sign-up cards sit on: the card centred in the
 * space, over whatever background comes first (sign-in's poured beer).
 * It is the page's `<main>` (X21): there is no other chrome around it.
 */
export function AuthPage({ children }: { children: ReactNode }) {
  return (
    <main
      {...mainContentProps}
      className="relative flex flex-1 items-center justify-center overflow-hidden outline-none"
    >
      {children}
    </main>
  );
}

/**
 * The card: 400 pt wide from `sm` up, full width with a 16 pt margin below
 * it. `glass` is sign-in's frosted card over the background.
 */
export function AuthPanel({
  glass = false,
  className,
  children,
}: {
  glass?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="auth-panel"
      className={cn(
        "relative z-10 m-4 flex w-full max-w-[400px] flex-col rounded-lg p-6",
        glass ? "surface-glass" : "bg-surface-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A divider with a word in the middle ("or"), drawn on any surface. */
export function WordDivider({ children }: { children?: ReactNode }) {
  return (
    <div
      data-slot="word-divider"
      className="flex items-center gap-3 text-ink-3 type-callout"
    >
      <span aria-hidden className="h-px flex-1 bg-line" />
      {children !== undefined && <span>{children}</span>}
      {children !== undefined && (
        <span aria-hidden className="h-px flex-1 bg-line" />
      )}
    </div>
  );
}

/**
 * One labelled input of the auth forms. `required` marks the label as Joy's
 * `FormControl required` did (an asterisk), `invalid` paints the field and
 * its message in danger and points `aria-describedby` at the message.
 */
export function AuthField({
  id,
  label,
  required = false,
  invalid = false,
  message,
  description,
  ...input
}: Omit<React.ComponentProps<typeof Input>, "id"> & {
  id: string;
  label: string;
  invalid?: boolean;
  /** Shown under the field; read as the error when `invalid`. */
  message?: string | null;
  description?: ReactNode;
}) {
  const hint = `${id}-hint`;
  const hasHint =
    (message !== undefined && message !== null) || description !== undefined;
  return (
    <Field data-invalid={invalid || undefined} className="gap-1.5">
      <FieldLabel htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden className="text-ink-3">
            *
          </span>
        )}
      </FieldLabel>
      <Input
        id={id}
        required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={hasHint ? hint : undefined}
        {...input}
        // A recessed well, as Joy's auth inputs were: the kit's tinted
        // transparent field all but vanishes on the glass card over the pour.
        className={cn("dark:bg-background", input.className)}
      />
      {hasHint && (
        <FieldDescription
          id={hint}
          className={cn(invalid && message ? "text-destructive" : undefined)}
        >
          {message ?? description}
        </FieldDescription>
      )}
    </Field>
  );
}
