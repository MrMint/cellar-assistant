/**
 * `buttonVariants`, kept out of `button.tsx` so server components can import
 * it: this module has no "use client" (client-boundary.test.ts).
 *
 * Changed from the shadcn new-york registry output (review these on any
 * re-vendor):
 * - touch sizes: `default` and `icon` are 44 px (design §3.3, N12); `sm` and
 *   `icon-sm` stay for dense desktop rows only;
 * - press state: scale .97 over `--ca-dur-micro` (design §4.5), transform and
 *   colour only instead of `transition-all`;
 * - `destructive` is danger text + outline (design §3.1). Solid danger lives in
 *   `app/ConfirmSheet` and nowhere else.
 */
import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-[color,background-color,box-shadow,transform] duration-(--ca-dur-micro) ease-standard focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-97 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 motion-reduce:active:scale-100 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "border border-destructive/60 bg-transparent text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/30",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2 has-[>svg]:px-4",
        xs: "h-6 gap-1 rounded-sm px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-12 px-6 text-base has-[>svg]:px-5",
        icon: "size-11",
        "icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
