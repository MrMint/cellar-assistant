"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { notify } from "@/components/app/notify";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { BrandPicker } from "@/components/brand/BrandPicker";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ApiFailure } from "@/lib/api/result";
import { isBrandChange, type ShownBrand, useBrandChange } from "./brand-change";

/** What a failed change says — the actor's English is never shown. */
export const brandChangeMessage = (error: ApiFailure): string =>
  error.code === "FORBIDDEN"
    ? "Only whoever added this can change its brand."
    : error.code === "TRANSPORT"
      ? "No connection — the brand wasn't changed. Try again."
      : "The brand wasn't changed. Try again.";

/**
 * D8 — "Wrong brand? Change it", one tap from the item page, for the item's
 * creator (the page renders it only for them; `replaceItemBrand` refuses
 * anyone else). A sheet on phones with the same `BrandPicker` the add and edit
 * forms use; Save swaps the brand in one call and the toast offers Undo
 * (design §4.7: a reversible change does not ask first).
 */
export function ChangeBrand({
  type,
  itemId,
  itemName,
  shown,
  linkedBrandIds = [],
}: {
  type: ApiItemType;
  itemId: string;
  itemName: string;
  /** The brand the page shows, or `null` when it shows none. */
  shown: ShownBrand | null;
  /** Every brand the item is linked to, so Undo keeps a link it already had. */
  linkedBrandIds?: readonly string[];
}) {
  const brands = useBrandChange(type, itemId, linkedBrandIds);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openSheet = () => {
    setName("");
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    setPending(true);
    setError(null);
    const result = await brands.change(shown, name);
    setPending(false);
    if (!result.ok) {
      setError(brandChangeMessage(result.error));
      return;
    }
    setOpen(false);
    if (!result.changed) return;
    router.refresh();
    const { from, to } = result;
    notify(to === null ? "Brand removed" : `Brand changed to ${to.name}`, {
      undo: () => {
        void (async () => {
          const undone = await brands.undo(result);
          if (!undone.ok) {
            notify(brandChangeMessage(undone.error), { tone: "error" });
            return;
          }
          router.refresh();
          notify(
            from === null ? "Brand removed" : `Brand back to ${from.name}`,
          );
        })();
      },
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        className="-ml-3 self-start px-3 text-ink-2"
        onClick={openSheet}
      >
        {shown === null ? "Add the brand" : "Wrong brand? Change it"}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title={shown === null ? "Add the brand" : "Change the brand"}
        description={
          shown === null
            ? itemName
            : `${itemName} is filed under ${shown.name}.`
        }
        footer={
          <div className="flex w-full flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                pending || name.trim() === "" || !isBrandChange(shown, name)
              }
              aria-busy={pending || undefined}
              onClick={() => void save()}
            >
              {pending && <Spinner aria-hidden />}
              Save brand
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 pb-2">
          <BrandPicker value={name} onChange={setName} disabled={pending} />
          {error !== null && (
            <p role="alert" className="type-callout text-destructive">
              {error}
            </p>
          )}
        </div>
      </ResponsiveDialog>
    </>
  );
}
