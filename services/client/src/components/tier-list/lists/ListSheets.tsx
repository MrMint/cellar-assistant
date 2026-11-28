"use client";

/**
 * New list and List details as sheets (Social-Lists 25, 08: "was a page").
 * KIT § 4: a short form (six fields or fewer) that returns you where you
 * were is a sheet; a dialog from `md` up. The routes `/tier-lists/add` and
 * `/tier-lists/[id]/edit` stay, drawing the same form, for a link or a cold
 * open.
 *
 * `ListDetailsSheet` is the list page's "Details" (L1 mounts it): it draws
 * nothing for anyone but the list's maker (`canEditList`), so a visitor is
 * never offered a write the API would refuse.
 */

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { useNavigate } from "@/components/app/useNavigate";
import { DeleteTierListButton } from "../DeleteTierListButton";
import { TierListForm } from "../TierListForm";
import { asPrivacy, canEditList } from "./model";

export function NewListSheet({
  open,
  onOpenChange,
  listType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The kind picked first ("place" by default). */
  listType?: string;
}) {
  const navigate = useNavigate();
  const onSubmitted = useCallback(
    (id: string) => {
      onOpenChange(false);
      navigate.push(`/tier-lists/${id}`);
    },
    [navigate, onOpenChange],
  );
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="New list">
      {open && (
        <TierListForm
          onSubmitted={onSubmitted}
          onCancel={() => onOpenChange(false)}
          defaults={{
            name: "",
            description: "",
            privacy: "PRIVATE",
            list_type: listType ?? "place",
          }}
        />
      )}
    </ResponsiveDialog>
  );
}

export type ListDetailsData = {
  id: string;
  name: string;
  description: string | null;
  privacy: string;
  listType: string;
  itemCount: number;
  createdById: string;
};

type ListDetailsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tierList: ListDetailsData;
  /** The signed-in viewer; anyone but the maker gets nothing. */
  viewerId: string | null | undefined;
};

/** The guard runs before any hook: a visitor gets null, nothing else. */
export function ListDetailsSheet(props: ListDetailsSheetProps) {
  if (!canEditList(props.viewerId, props.tierList.createdById)) return null;
  return <OwnersListDetailsSheet {...props} />;
}

function OwnersListDetailsSheet({
  open,
  onOpenChange,
  tierList,
}: ListDetailsSheetProps) {
  const router = useRouter();
  const onSubmitted = useCallback(() => {
    onOpenChange(false);
    router.refresh();
  }, [onOpenChange, router]);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="List details"
    >
      {open && (
        <div className="flex flex-col gap-4">
          <ListDetailsForm
            tierList={tierList}
            onSubmitted={onSubmitted}
            onCancel={() => onOpenChange(false)}
          />
          <div className="border-edge border-t pt-2">
            <DeleteTierListButton
              tierListId={tierList.id}
              name={tierList.name}
              itemCount={tierList.itemCount}
              listType={tierList.listType}
              onDeleted={() => onOpenChange(false)}
            />
          </div>
        </div>
      )}
    </ResponsiveDialog>
  );
}

/** The details form with the list's values (the edit route draws it too). */
export function ListDetailsForm({
  tierList,
  onSubmitted,
  onCancel,
}: {
  tierList: ListDetailsData;
  onSubmitted: (id: string) => void;
  onCancel?: () => void;
}) {
  return (
    <TierListForm
      id={tierList.id}
      onSubmitted={onSubmitted}
      onCancel={onCancel}
      defaults={{
        name: tierList.name,
        description: tierList.description ?? "",
        privacy: asPrivacy(tierList.privacy),
        list_type: tierList.listType,
      }}
    />
  );
}
