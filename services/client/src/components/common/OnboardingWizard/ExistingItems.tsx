import { ItemCard } from "@/components/item/ItemCard";
import { Button } from "@/components/ui/button";
import type { ExistingItem } from "./adapter";

type ExistingItemsProps = {
  items: ExistingItem[];
  onClickItem: (itemId: string) => void;
  onSkip: () => void;
};

/**
 * `82450ad1:…/OnboardingWizard/ExistingItems.tsx`, verbatim but for the item
 * shape: `{ item, type }` from `adapter.ts`, so the restored `ItemCard` gets
 * the props it takes now.
 */
export const ExistingItems = ({
  items,
  onClickItem,
  onSkip,
}: ExistingItemsProps) => {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      <div className="col-span-full flex flex-row items-center gap-4">
        <p className="type-body">Don&apos;t see what you are looking for?</p>
        <Button onClick={onSkip}>Create New</Button>
      </div>
      {items.map((x) => (
        <div key={x.item.id} className="min-w-0">
          <ItemCard
            key={x.item.id}
            item={x.item}
            type={x.type}
            onClick={() => onClickItem(x.item.id)}
          />
        </div>
      ))}
    </div>
  );
};
