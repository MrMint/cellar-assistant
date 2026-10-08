import type { ReactNode } from "react";
import { Add, ICON_STROKE } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

/**
 * "Add an item", as a link dressed as a button: `outline` under an empty
 * result (the old outlined Joy button), `ghost` under a list of results (the
 * old plain one). Server-renderable — no client button needed for a link.
 */
export function AddItemLink({
  variant = "outline",
  children = "Add an item",
}: {
  variant?: "outline" | "ghost";
  children?: ReactNode;
}) {
  return (
    <Link
      href="/add"
      underline="none"
      className={cn(
        buttonVariants({ variant }),
        // The ghost line is a sentence; on a phone it may need two lines.
        "h-auto min-h-11 whitespace-normal text-center",
      )}
    >
      <Add strokeWidth={ICON_STROKE} />
      {children}
    </Link>
  );
}

/**
 * The search results' empty state, shared by text, barcode and image search:
 * the old page's one line and its "Add an item" link, centred.
 */
export function NoSearchResults({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <p className="type-body text-center">{children}</p>
      <AddItemLink />
    </div>
  );
}
