import Image, { type StaticImageData } from "next/image";
import { EmptyState } from "@/components/app/EmptyState";
import { Add } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { itemTypeTokens } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { Button } from "@/components/ui/button";
import beer1 from "@/images/beer1.png";
import cellar1 from "@/images/cellar1.png";
import coffee1 from "@/images/coffee1.png";
import sake1 from "@/images/sake1.png";
import spirit1 from "@/images/spirit1.png";
import tea1 from "@/images/tea1.png";
import wine1 from "@/images/wine1.png";
import type { CellarStatus } from "./cellarItemsQuery";

/**
 * The bundled illustrations' home now (design §3.5–3.6, B03): empty states,
 * not bottle tiles — a bottle with no photo gets its own LabelPlate.
 */
const TYPE_ART: Readonly<Record<ApiItemType, StaticImageData>> = {
  WINE: wine1,
  BEER: beer1,
  SPIRIT: spirit1,
  SAKE: sake1,
  COFFEE: coffee1,
  TEA: tea1,
};

const Illustration = ({ src }: { src: StaticImageData }) => (
  <Image
    src={src}
    alt=""
    width={144}
    height={144}
    placeholder="blur"
    className="size-36 rounded-2xl object-cover"
  />
);

export type CellarItemsEmptyCopy = {
  title: string;
  description: string;
  art: "cellar" | ApiItemType | null;
  /** Whether "Add a bottle" is the one action (an empty cellar, if you may). */
  addAction: boolean;
};

/**
 * Which empty this is, most specific first: a search that found nothing, a
 * type filter with nothing in it, nothing finished yet, or an empty cellar.
 * Pure, so the copy is tested without a render.
 */
export const cellarItemsEmptyCopy = ({
  search,
  types,
  status,
  canAdd,
}: {
  search: string;
  types: readonly ApiItemType[];
  status?: CellarStatus;
  canAdd: boolean;
}): CellarItemsEmptyCopy => {
  if (search.trim() !== "") {
    return {
      title: "Nothing matches that.",
      description: "Try another word, or clear the search.",
      art: null,
      addAction: false,
    };
  }
  if (types.length === 1) {
    const [type] = types;
    const word = itemTypeTokens[type].label.toLowerCase();
    return {
      title:
        status === "finished"
          ? `No finished ${word} yet.`
          : `No ${word} in here.`,
      description: "Clear the filter to see every bottle.",
      art: type,
      addAction: false,
    };
  }
  if (types.length > 1 && types.length < 6) {
    return {
      title: "No bottles of those types.",
      description: "Clear the filter to see every bottle.",
      art: null,
      addAction: false,
    };
  }
  if (status === "finished") {
    return {
      title: "Nothing finished yet.",
      description: "Bottles you finish stay here, with their notes.",
      art: null,
      addAction: false,
    };
  }
  return {
    title: "Your cellar is waiting.",
    description: "Add a bottle and it shows up here.",
    art: "cellar",
    addAction: canAdd,
  };
};

/** The items grid with nothing in it (design §3.6: one line, one action). */
export function CellarItemsEmpty({
  cellarId,
  canAdd,
  search,
  types,
  status,
}: {
  cellarId: string;
  canAdd: boolean;
  search: string;
  types: readonly ApiItemType[];
  status?: CellarStatus;
}) {
  const copy = cellarItemsEmptyCopy({ search, types, status, canAdd });
  return (
    <EmptyState
      illustration={
        copy.art === null ? undefined : (
          <Illustration
            src={copy.art === "cellar" ? cellar1 : TYPE_ART[copy.art]}
          />
        )
      }
      title={copy.title}
      description={copy.description}
      action={
        copy.addAction ? (
          <Button asChild>
            <Link href={`/cellars/${cellarId}/items/add`} underline="none">
              <Add />
              Add a bottle
            </Link>
          </Button>
        ) : undefined
      }
    />
  );
}
