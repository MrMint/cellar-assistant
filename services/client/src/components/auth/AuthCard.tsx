"use client";

import { type ReactNode, useState } from "react";
import { Back, ICON_STROKE } from "@/components/app/icons";
import { mainContentProps } from "@/components/app/main-content";
import {
  BeerGlyph,
  CoffeeGlyph,
  SakeGlyph,
  SpiritGlyph,
  TeaGlyph,
  WineGlyph,
} from "@/components/app/parts/glyphs";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PressLink } from "@/components/user/PressLink";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";

/**
 * The page sign-in and sign-up sit on (Shell-Entry): the page's `<main>`
 * (X21), with no other chrome. On a phone the form starts near the top;
 * from md it is a card in the middle of the window.
 */
export function AuthPage({ children }: { children: ReactNode }) {
  return (
    <main
      {...mainContentProps}
      className="flex flex-1 justify-center bg-bg px-4 pt-10 pb-8 outline-none md:items-center md:py-12"
    >
      {children}
    </main>
  );
}

/** The column: 400 wide at most; a card from md up. */
export function AuthPanel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="auth-panel"
      className={cn(
        "flex w-full max-w-[400px] flex-col gap-5 md:rounded-lg md:border md:border-edge md:bg-card md:p-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

const KINDS = [
  WineGlyph,
  BeerGlyph,
  SpiritGlyph,
  CoffeeGlyph,
  TeaGlyph,
  SakeGlyph,
] as const;

/**
 * Sign-in's head (Shell-Entry): a row of the six kinds, each in its well,
 * then the app's name and what signing in is for.
 */
export function AuthBrand({ line }: { line: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden className="flex gap-2">
        {KINDS.map((Glyph) => (
          <span
            key={Glyph.displayName}
            className="flex size-10 items-center justify-center rounded-md bg-raised text-glyph"
          >
            <Glyph className="size-5" strokeWidth={ICON_STROKE} />
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="t-title m-0 text-ink">Cellar Assistant</h1>
        <p className="t-body m-0 text-ink-2">{line}</p>
      </div>
    </div>
  );
}

/** Sign-up's head: Back to sign-in, then the page's title. */
export function AuthBack({ href, title }: { href: string; title: string }) {
  return (
    <div className="flex flex-col gap-3">
      <PressLink
        href={href}
        aria-label="Back"
        underline="none"
        kind="back"
        className="-ml-2.5 flex size-11 items-center justify-center rounded-full text-glyph outline-none focus-visible:outline-2 focus-visible:outline-act-ink active:bg-raised"
      >
        <Back aria-hidden className="size-6" strokeWidth={ICON_STROKE} />
      </PressLink>
      <h1 className="t-title m-0 text-ink">{title}</h1>
    </div>
  );
}

/** A rule with a word in the middle ("or"), or a plain rule without one. */
export function WordDivider({ children }: { children?: ReactNode }) {
  return (
    <div
      data-slot="word-divider"
      className="t-cap flex items-center gap-3 text-ink-3"
    >
      <span aria-hidden className="h-px flex-1 bg-rule" />
      {children !== undefined && <span>{children}</span>}
      {children !== undefined && (
        <span aria-hidden className="h-px flex-1 bg-rule" />
      )}
    </div>
  );
}

/**
 * One labelled input of the auth forms. `optional` says so at the right of
 * the label row; `invalid` paints the field and its message as the error
 * and points `aria-describedby` at it. A `password` field carries a Show
 * toggle inside it (its name is "Show", so the field alone is "Password").
 */
export function AuthField({
  id,
  label,
  optional = false,
  invalid = false,
  message,
  description,
  type,
  ...input
}: Omit<React.ComponentProps<typeof Input>, "id"> & {
  id: string;
  label: string;
  optional?: boolean;
  invalid?: boolean;
  /** Shown under the field; read as the error when `invalid`. */
  message?: string | null;
  description?: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const hint = `${id}-hint`;
  const hasHint =
    (message !== undefined && message !== null) || description !== undefined;
  const password = type === "password";
  return (
    <Field data-invalid={invalid || undefined} className="gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {optional && <span className="t-cap text-ink-3">Optional</span>}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={password && shown ? "text" : type}
          aria-invalid={invalid || undefined}
          aria-describedby={hasHint ? hint : undefined}
          {...input}
          className={cn(password && "pr-16", input.className)}
        />
        {password && (
          <button
            type="button"
            aria-pressed={shown}
            aria-controls={id}
            disabled={input.disabled}
            onPointerDown={() => feedback("tick", { phase: "down" })}
            onClick={() => setShown((now) => !now)}
            className="t-cap absolute inset-y-0 right-0 flex min-w-14 items-center justify-center px-3 font-semibold text-act-ink outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-act-ink disabled:opacity-50"
          >
            {shown ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {hasHint && (
        <FieldDescription
          id={hint}
          className={cn(
            "t-cap",
            invalid && message ? "text-destructive" : "text-ink-2",
          )}
        >
          {message ?? description}
        </FieldDescription>
      )}
    </Field>
  );
}
