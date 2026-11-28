/**
 * `buttonVariants`, kept out of `button.tsx` so server components can import
 * it: this module has no "use client" (client-boundary.test.ts).
 *
 * Changed from the shadcn new-york registry output (review these on any
 * re-vendor), to KIT § 2 "Buttons":
 * - 44 tall, r8, t-head; text buttons at least 44 wide; `sm` and `icon-sm`
 *   stay for dense desktop rows only;
 * - `default` is the primary, the act fill (one per screen); `outline` and
 *   `secondary` are both the kit's secondary, an edge outline in ink;
 *   `quiet` is act-ink text (doing), `quiet-muted` ink-2 text ("Finish
 *   later", "Not this", unlink); `ghost` stays a plain surface hover;
 * - press .97 over `--ca-dur-micro`, transform and colour only; disabled is
 *   the same control at 40 %;
 * - `destructive` is danger text + outline, with its trash glyph beside the
 *   word (KIT: only inside a confirm). No solid danger anywhere.
 * The press sound lives in `button.tsx` (`feedback("primary" | "press")`).
 */
import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "t-head inline-flex min-w-11 shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md outline-none transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:outline-offset-2 active:scale-97 disabled:pointer-events-none disabled:opacity-40 aria-disabled:opacity-40 aria-invalid:border-destructive motion-reduce:active:scale-100 [&_svg:not([class*='size-'])]:size-5 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground active:opacity-85 [@media(hover:hover)]:hover:opacity-90",
        destructive:
          "border border-destructive bg-transparent text-destructive active:bg-raised [@media(hover:hover)]:hover:bg-raised",
        outline:
          "border border-edge bg-transparent text-ink active:bg-raised [@media(hover:hover)]:hover:bg-raised",
        secondary:
          "border border-edge bg-transparent text-ink active:bg-raised [@media(hover:hover)]:hover:bg-raised",
        ghost:
          "text-ink active:bg-raised [@media(hover:hover)]:hover:bg-raised",
        quiet:
          "text-act-ink active:scale-100 active:opacity-60 [@media(hover:hover)]:hover:bg-raised",
        "quiet-muted":
          "text-ink-2 active:scale-100 active:opacity-60 [@media(hover:hover)]:hover:bg-raised",
        link: "text-act-ink underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-0 has-[>svg]:px-3",
        xs: "t-micro h-6 min-w-0 gap-1 rounded-sm px-2 has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "t-cap h-9 gap-1.5 px-3 font-semibold has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-12 px-6 has-[>svg]:px-5",
        icon: "size-11",
        "icon-xs":
          "size-6 min-w-0 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 min-w-0 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-12",
      },
    },
    compoundVariants: [
      {
        variant: ["quiet", "quiet-muted"],
        size: "default",
        class: "px-2.5 has-[>svg]:px-2.5",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
