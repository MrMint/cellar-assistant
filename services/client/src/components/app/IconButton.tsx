import type { VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export type IconButtonProps = Omit<ComponentProps<"button">, "aria-label"> & {
  /**
   * Required: a glyph is never a control's only label (design §3.4). It is
   * the button's accessible name and, on hover-capable devices, the place a
   * tooltip would read from.
   */
  "aria-label": string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  /** `default` is 44×44. `sm` draws a 36 px button inside a 44 px hit area. */
  size?: "default" | "sm" | "lg";
  asChild?: boolean;
};

/**
 * An icon-only button: 44×44 target, press scale .97 over 90 ms (N12), and an
 * `aria-label` the type system will not let you forget. Icons inside are
 * drawn at 20 px with the app's 1.75 stroke.
 */
export function IconButton({
  className,
  variant = "ghost",
  size = "default",
  asChild = false,
  type,
  ...props
}: IconButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="icon-button"
      type={asChild ? type : (type ?? "button")}
      className={cn(
        buttonVariants({ variant }),
        // `has-[>svg]:p-0`: buttonVariants' default size pads an icon child
        // (`has-[>svg]:px-4`), which tailwind-merge keeps beside a plain p-0.
        "rounded-full p-0 has-[>svg]:p-0 [&_svg:not([class*='size-'])]:size-5 [&_svg]:[stroke-width:1.75]",
        size === "default" && "size-11",
        size === "lg" && "size-12",
        // The visual is 36 px; a pseudo-element keeps the target at 44.
        size === "sm" &&
          "relative size-9 after:absolute after:-inset-1 after:content-['']",
        className,
      )}
      {...props}
    />
  );
}
