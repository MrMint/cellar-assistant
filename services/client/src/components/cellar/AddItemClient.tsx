"use client";

import Image, { type StaticImageData } from "next/image";
import { Link } from "@/components/app/Link";
import beer1 from "@/images/beer1.png";
import coffee1 from "@/images/coffee1.png";
import sake1 from "@/images/sake1.png";
import spirit1 from "@/images/spirit1.png";
import tea1 from "@/images/tea1.png";
import wine1 from "@/images/wine1.png";
import { cn } from "@/lib/utils";

type ItemType = "Beer" | "Wine" | "Spirit" | "Coffee" | "Sake" | "Tea";

/** Each type's illustration and its alt text, as the old cards had them. */
const ART: Readonly<Record<ItemType, { src: StaticImageData; alt: string }>> = {
  Beer: { src: beer1, alt: "An image of a beer glass" },
  Wine: { src: wine1, alt: "An image of a wine bottle" },
  Spirit: { src: spirit1, alt: "An image of a liquor bottle" },
  Coffee: { src: coffee1, alt: "A bag of coffee beans" },
  Sake: { src: sake1, alt: "A sake bottle" },
  Tea: { src: tea1, alt: "A tea container" },
};

type AddItemTypeCardProps = {
  type: ItemType;
  /** Absent: shown, not linked (no permission). */
  href?: string;
};

const AddItemTypeCard = ({ type, href }: AddItemTypeCardProps) => (
  <div
    data-slot="add-item-type-card"
    className={cn(
      "relative flex min-w-0 flex-col overflow-hidden rounded-lg bg-surface-1",
      href !== undefined &&
        "transition-[background-color,transform] duration-(--ca-dur-micro) ease-standard hover:bg-surface-2 has-[a:active]:scale-97 motion-reduce:has-[a:active]:scale-100",
    )}
  >
    <div className="relative aspect-square">
      <Image
        src={ART[type].src}
        alt={ART[type].alt}
        fill
        placeholder="blur"
        className="object-cover"
      />
    </div>
    <div className="flex p-4">
      {href === undefined ? (
        <span className="type-headline grow text-center text-ink-1">
          {type}
        </span>
      ) : (
        <Link overlay underline="none" href={href} className="grow">
          <span className="type-headline block text-center text-ink-1">
            {type}
          </span>
        </Link>
      )}
    </div>
  </div>
);

interface AddItemClientProps {
  cellarId?: string;
  /** The cellar's name, for the heading; the server page reads it. */
  cellarName?: string;
  /** Creator or co-owner. Ignored without a cellar (`/add`). */
  canAdd?: boolean;
}

/**
 * `82450ad1:src/components/cellar/AddItemClient.tsx`, restored: the heading,
 * the permission note, and six image cards in the old order linking to the
 * onboarding routes (`/cellars/<id>/<type>s/add`, or `/add/<type>s`).
 *
 * The old component read the cellar's name and owners with a client query;
 * the server page now passes them. One fix (§7): without permission the cards
 * no longer link — the old ones led into a flow whose save could only fail.
 */
export function AddItemClient({
  cellarId,
  cellarName,
  canAdd: canAddProp = true,
}: AddItemClientProps) {
  const canAdd = !cellarId || canAddProp;

  return (
    <div className="flex flex-col gap-8">
      <h2 className="type-title-1 text-ink-1">
        {cellarId ? `Add an item to ${cellarName}` : "Add an item"}
      </h2>
      {cellarId && !canAdd && (
        <p className="type-body">
          You do not have permission to add items to this cellar.{" "}
          {/* The cards are inert here, so this is the page's one control —
              and axe's scrollable-region-focusable needs one in <main>. */}
          <Link href={`/cellars/${cellarId}`} underline="always">
            Back to {cellarName ?? "the cellar"}
          </Link>
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {(
          [
            "Wine",
            "Beer",
            "Spirit",
            "Coffee",
            "Sake",
            "Tea",
          ] satisfies ItemType[]
        ).map((x) => (
          <AddItemTypeCard
            key={x}
            type={x}
            href={
              !canAdd
                ? undefined
                : cellarId
                  ? `/cellars/${cellarId}/${x.toLowerCase()}s/add`
                  : `/add/${x.toLowerCase()}s`
            }
          />
        ))}
      </div>
    </div>
  );
}
