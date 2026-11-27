"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useClient, useMutation, useQuery } from "urql";
import { IconButton } from "@/components/app/IconButton";
import { Add, Cellar, Decrease } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { announceSave } from "@/components/pwa/install-prompt";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { RemoveItemFromCellarMutation } from "@/lib/api/cellars";
import { UploadRejectedError, uploadFile } from "@/lib/api/files";
import {
  AddItemToCellarFromItemMutation,
  AttachItemImageMutation,
  ItemBottleHistoryQuery,
} from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import {
  defaultCellarId,
  readCapturePrefs,
  rememberCapturePrefs,
} from "@/lib/capture/capture-prefs";
import { AddPhotoModal, RebuyPhotoOffer } from "./AddPhoto";
import { addedMessage, MAX_BOTTLES_AT_ONCE, rebuyOffer } from "./add-to-cellar";

type CellarChoice = { id: string; name: string };

type AddToCellarActionsProps = {
  itemId: string;
  itemType: ApiItemType;
  cellars?: CellarChoice[];
};

/**
 * Where a bottle was found, when it was not on a shelf at home — X07's "Add
 * to cellar" from a menu line records the place and the line
 * (`cellar_items.source_*`).
 */
export type AddToCellarSource = {
  readonly placeId: string;
  readonly menuItemId: string;
};

export type AddToCellarSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemType: ApiItemType;
  /** The viewer's own and co-owned cellars; `undefined` while loading. */
  cellars: readonly CellarChoice[] | undefined;
  /** Reading the cellars failed: said as such, not as "no cellar yet". */
  loadError?: string | null;
  source?: AddToCellarSource;
};

/**
 * The item page's "Add to Cellar" (N21): a sheet, not a menu of cellars —
 * which cellar (the one used last, else the most recently active), how many
 * bottles, and whether one is already open — then a toast with **Undo**
 * instead of a confirm (design §4.7: reversible actions don't ask first).
 *
 * Each bottle is its own `addItemToCellar` with a client-minted
 * `cellarItemId`, so a retry after a dropped response files the same bottles,
 * not more; Undo removes exactly those ids. `router.refresh()` re-reads
 * "Located in:", as the old page's revalidation did.
 */
export const AddToCellarActions = (props: AddToCellarActionsProps) => {
  const [open, setOpen] = useState(false);
  if (props.cellars === undefined || props.cellars.length === 0) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Add aria-hidden />
        Add to Cellar
      </Button>
      <AddToCellarSheet
        open={open}
        onOpenChange={setOpen}
        itemId={props.itemId}
        itemType={props.itemType}
        cellars={props.cellars}
      />
    </>
  );
};

/**
 * The sheet itself, controlled — for a caller that owns the trigger: X09's
 * ActionBar, whose "Add to cellar" sits beside Log a drink rather than in a
 * header, and X07's menu line actions. With no cellar of the viewer's it says
 * so instead of offering nothing.
 */
export const AddToCellarSheet = ({
  open,
  onOpenChange: setOpen,
  itemType,
  itemId,
  cellars,
  loadError = null,
  source,
}: AddToCellarSheetProps) => {
  const router = useRouter();
  const [cellarId, setCellarId] = useState<string | null>(
    cellars?.[0]?.id ?? null,
  );
  const [quantity, setQuantity] = useState(1);
  const [alreadyOpen, setAlreadyOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, addItemToCellar] = useMutation(AddItemToCellarFromItemMutation);
  const [, removeItemFromCellar] = useMutation(RemoveItemFromCellarMutation);
  const client = useClient();
  const [, attachImage] = useMutation(AttachItemImageMutation);
  // L02: the re-buy offer, which outlives the sheet that closed to show it.
  const [rebuy, setRebuy] = useState<{ title: string } | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const openId = useId();
  const quantityId = useId();
  // The ids one attempt minted, kept for a retry of the *same* ask (cellar,
  // count, open): a "Try again" after a dropped response re-sends them, so
  // the server files those bottles once instead of a second set.
  const minted = useRef<{ key: string; ids: string[] } | null>(null);

  // The remembered cellar is this browser's, so it is read after mount.
  useEffect(() => {
    if (!open || cellars === undefined) return;
    setCellarId(defaultCellarId(null, readCapturePrefs(), cellars));
    setQuantity(1);
    setAlreadyOpen(false);
    setError(null);
    minted.current = null;
  }, [open, cellars]);

  /**
   * After an add: had you had this before? Then offer a photo of the new
   * bottle's label or receipt. The check is a paused query, unpaused by the
   * add and read once by the effect below; it lands after the sheet has
   * closed (a round trip), so two modals never overlap. A failure offers
   * nothing.
   */
  const [asking, setAsking] = useState<{
    filed: readonly string[];
    target: string;
  } | null>(null);
  const [history] = useQuery({
    query: ItemBottleHistoryQuery,
    variables: { itemId, type: itemType },
    pause: asking === null,
    requestPolicy: "network-only",
  });
  useEffect(() => {
    if (asking === null || history.fetching || history.stale) return;
    if (history.data === undefined && history.error === undefined) return;
    setAsking(null);
    const found = history.data?.item;
    if (found?.__typename !== "QueryItemSuccess" || asking.filed.length === 0)
      return;
    const offer = rebuyOffer({
      bottlesOfItem: found.data.myBottles.totalCount ?? 0,
      added: asking.filed.length,
      name: found.data.name,
    });
    if (offer !== null) {
      setRebuy({ title: offer.title });
    }
  }, [asking, history]);

  if (cellars === undefined || cellars.length === 0) {
    return (
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Add to cellar"
      >
        <p className="t-body pb-4 text-ink-2">
          {loadError !== null ? (
            <span role="alert" className="text-destructive">
              Couldn&apos;t read your cellars: {loadError}
            </span>
          ) : cellars === undefined ? (
            <span className="inline-flex items-center gap-2">
              <Spinner aria-hidden /> Finding your cellars…
            </span>
          ) : (
            "You don't have a cellar yet. Make one from the Cellar tab, then add this to it."
          )}
        </p>
      </ResponsiveDialog>
    );
  }

  const cellarName =
    cellars.find((cellar) => cellar.id === cellarId)?.name ?? "your cellar";

  const undo = async (filed: readonly string[], target: string) => {
    // The bottles are going: no photo offer for them, asked or still pending.
    setAsking(null);
    setRebuy(null);
    const toast = notify("Taking them back out…", { tone: "loading" });
    const results = await Promise.all(
      filed.map((cellarItemId) =>
        removeItemFromCellar({ cellarId: target, cellarItemId }),
      ),
    );
    const failed = results.filter(
      (response) =>
        !unwrapResult(response.data?.removeItemFromCellar, "RemovedCellarItem")
          .ok,
    ).length;
    router.refresh();
    notify(
      failed === 0
        ? "Removed again"
        : `${failed} of ${filed.length} couldn't be removed. Remove them from the cellar.`,
      { id: toast, tone: failed === 0 ? "success" : "error" },
    );
  };

  /**
   * Upload and attach as a private image of the item (CR-8): a receipt is
   * yours, and it is not the bottle's display image — the cellar grid and
   * the bottle page keep showing the label.
   */
  const saveRebuyPhoto = async (image: File) => {
    if (rebuy === null) return;
    let fileId: string;
    try {
      fileId = await uploadFile(client, image, "item-image");
    } catch (cause) {
      if (cause instanceof UploadRejectedError) {
        throw new Error(cause.failure.message);
      }
      throw cause;
    }
    const attached = unwrapResult(
      (
        await attachImage({
          itemId,
          type: itemType,
          // Never on the item's public gallery.
          input: { fileId, isPublic: false },
        })
      ).data?.attachItemImage,
      "ItemImage",
    );
    if (!attached.ok) throw new Error(attached.error.message);
    setPhotoOpen(false);
    setRebuy(null);
    router.refresh();
    notify("Photo saved to your photos", { tone: "success" });
  };

  const submit = async () => {
    if (cellarId === null) return;
    const target = cellarId;
    setPending(true);
    setError(null);
    const key = `${target}:${quantity}:${alreadyOpen}`;
    if (minted.current?.key !== key) {
      minted.current = {
        key,
        ids: Array.from({ length: quantity }, () => crypto.randomUUID()),
      };
    }
    const { ids } = minted.current;
    const now = new Date().toISOString();
    const results = await Promise.all(
      ids.map((cellarItemId, index) =>
        addItemToCellar({
          cellarId: target,
          input: {
            cellarItemId,
            item: { id: itemId, type: itemType },
            ...(source === undefined
              ? {}
              : {
                  sourceType: "menu_scan" as const,
                  sourcePlaceId: source.placeId,
                  sourceMenuItemId: source.menuItemId,
                }),
            // "Already open?": the first bottle is the open one.
            ...(alreadyOpen && index === 0 ? { openAt: now } : {}),
          },
        }),
      ),
    );
    const filed: string[] = [];
    let refusal: string | null = null;
    results.forEach((response, index) => {
      const result = unwrapResult(response.data?.addItemToCellar, "CellarItem");
      if (result.ok) filed.push(ids[index] ?? "");
      else refusal ??= result.error.message;
    });
    setPending(false);
    if (filed.length === 0) {
      setError(refusal ?? "The bottle could not be added.");
      return;
    }
    // A bottle saved: the install prompt waits for the first (N15).
    announceSave();
    minted.current = null;
    rememberCapturePrefs({ cellarId: target });
    setOpen(false);
    router.refresh();
    notify(addedMessage(filed.length, cellarName), {
      tone: "success",
      ...(refusal === null
        ? {}
        : {
            description: `${quantity - filed.length} could not be added: ${refusal}`,
          }),
      undo: () => {
        void undo(filed, target);
      },
    });
    setAsking({ filed, target });
  };

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title="Add to cellar"
        footer={
          <div className="flex flex-col gap-2">
            {error !== null && (
              <p role="alert" className="t-cap text-destructive">
                {error}
              </p>
            )}
            <Button
              onClick={submit}
              disabled={pending || cellarId === null}
              aria-busy={pending || undefined}
            >
              {pending && <Spinner aria-hidden />}
              {quantity === 1 ? "Add bottle" : `Add ${quantity} bottles`}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5 pb-2">
          {cellars.length === 1 ? (
            <p className="flex min-h-11 items-center gap-3 rounded-lg bg-surface-1 px-4 t-body">
              <Cellar aria-hidden className="size-5 text-ink-2" />
              Into <span className="text-ink-1">{cellarName}</span>
            </p>
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="t-micro mb-2 px-4 text-ink-3">Into</legend>
              <RadioGroup
                value={cellarId ?? ""}
                onValueChange={setCellarId}
                className="gap-0 divide-y divide-line overflow-hidden rounded-lg bg-surface-1"
              >
                {cellars.map((cellar) => {
                  const id = `${openId}-${cellar.id}`;
                  return (
                    <label
                      key={cellar.id}
                      htmlFor={id}
                      className="flex min-h-11 items-center gap-3 px-4 py-2 t-body text-ink-1 active:bg-surface-3"
                    >
                      <RadioGroupItem id={id} value={cellar.id} />
                      <span className="min-w-0 truncate">{cellar.name}</span>
                    </label>
                  );
                })}
              </RadioGroup>
            </fieldset>
          )}

          <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-surface-1 px-4 py-1">
            <span id={quantityId} className="t-body text-ink-1">
              Bottles
            </span>
            <fieldset
              aria-labelledby={quantityId}
              className="m-0 flex items-center gap-1 border-0 p-0"
            >
              <IconButton
                aria-label="One fewer"
                variant="secondary"
                size="sm"
                disabled={quantity <= 1}
                onClick={() => setQuantity((n) => Math.max(1, n - 1))}
              >
                <Decrease />
              </IconButton>
              <output
                aria-live="polite"
                className="tabular w-8 text-center t-head"
              >
                {quantity}
              </output>
              <IconButton
                aria-label="One more"
                variant="secondary"
                size="sm"
                disabled={quantity >= MAX_BOTTLES_AT_ONCE}
                onClick={() =>
                  setQuantity((n) => Math.min(MAX_BOTTLES_AT_ONCE, n + 1))
                }
              >
                <Add />
              </IconButton>
            </fieldset>
          </div>

          <label
            htmlFor={openId}
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-surface-1 px-4 py-2"
          >
            <span className="flex flex-col">
              <span className="t-body text-ink-1">
                {quantity === 1 ? "Already open?" : "One already open?"}
              </span>
              <span className="t-cap text-ink-3">
                It starts at today, full — set the level on its page.
              </span>
            </span>
            <Switch
              id={openId}
              checked={alreadyOpen}
              onCheckedChange={setAlreadyOpen}
            />
          </label>
        </div>
      </ResponsiveDialog>
      <ResponsiveDialog
        open={rebuy !== null && !photoOpen && !open}
        onOpenChange={(next) => {
          if (!next) setRebuy(null);
        }}
        title={rebuy?.title ?? "Another bottle added"}
        hideTitle
      >
        {rebuy !== null && (
          <div className="pb-2">
            <RebuyPhotoOffer
              title={rebuy.title}
              onAddPhoto={() => setPhotoOpen(true)}
              onDismiss={() => setRebuy(null)}
            />
          </div>
        )}
      </ResponsiveDialog>
      <AddPhotoModal
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        onCapture={saveRebuyPhoto}
        title="Photo of this bottle"
      />
    </>
  );
};
