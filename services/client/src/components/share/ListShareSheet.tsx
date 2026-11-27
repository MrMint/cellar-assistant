"use client";

/**
 * A list's Share (Social-Lists 11-14; L14, L34): "Share · Friends can open
 * the link", the list's maker picks who can see it (Only me / Friends /
 * Everyone), then the link preview card (keep-dark: it is how the link looks
 * where it lands) or its QR code, then Copy link, Show code / Show preview
 * and More ways (the system share sheet, where there is one).
 *
 * L1's list page mounts it from its Share button with `{ tierListId, name,
 * privacy }`. The sheet reads the rest itself (`ListShareQuery`), including
 * who made the list: only they are offered the privacy strip, and the write
 * sends `privacy` alone, so the name and description are never touched.
 */

import { PanelLeft as PreviewGlyph, QrCode as QrGlyph } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "urql";
import {
  type AppIcon,
  CopyLink,
  ICON_STROKE,
  ShareOut,
} from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { PRESS_CLASS, pressFeedback } from "@/components/app/overlays/press";
import { QrCode } from "@/components/app/overlays/QrCode";
import { copyLink, useCanShare } from "@/components/app/overlays/ShareSheet";
import { BAND_FILL, type Band } from "@/components/app/parts/Rank";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import {
  asPrivacy,
  canEditList,
  kindNoun,
  PRIVACY_OPTIONS,
  type Privacy,
  privacyLine,
  rankedKind,
} from "@/components/tier-list/lists/model";
import { ListShareQuery } from "@/components/tier-list/lists/queries";
import { EditTierListMutation } from "@/components/tier-list/queries";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { absoluteUrl, canonicalPath } from "@/lib/share/routes";
import { cn } from "@/lib/utils";

export type ListSharePreview = {
  listType: string;
  itemCount: number;
  ownerName: string | null;
  photoUrl: string | null;
  top: { id: string; name: string; band: number }[];
};

function Row({
  icon: Icon,
  label,
  onSelect,
}: {
  icon: AppIcon;
  label: string;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        {...pressFeedback()}
        onClick={() => {
          feedback("tick");
          onSelect();
        }}
        className={cn(
          "t-body relative flex min-h-13 w-full items-center gap-4 rounded-md px-1 text-left text-ink outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring",
          PRESS_CLASS,
        )}
      >
        <Icon
          aria-hidden
          strokeWidth={ICON_STROKE}
          className="size-5 shrink-0 text-act-ink"
        />
        <span>{label}</span>
      </button>
    </li>
  );
}

/** The link preview card, as the link unfurls: one look, dark. */
function PreviewCard({
  name,
  preview,
}: {
  name: string;
  preview: ListSharePreview;
}) {
  return (
    <div
      data-slot="list-share-preview"
      className="keep-dark flex min-h-44 overflow-hidden rounded-lg border border-edge bg-bg text-ink"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
        <p className="t-cap m-0 text-ink-2">{rankedKind(preview.listType)}</p>
        <p className="t-head m-0 line-clamp-2 break-words">{name}</p>
        <p className="t-cap m-0 text-ink-2">
          {preview.ownerName !== null && `by ${preview.ownerName} · `}
          <span className="tabular">
            {kindNoun(preview.listType, preview.itemCount)}
          </span>
        </p>
        <ol className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
          {preview.top.map((entry, index) => (
            <li
              key={entry.id}
              className="t-cap flex min-w-0 items-center gap-2 text-ink"
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  BAND_FILL[(entry.band >= 1 ? entry.band : 1) as Band],
                )}
              />
              <span className="truncate">{`#${index + 1} ${entry.name}`}</span>
            </li>
          ))}
        </ol>
        <p className="t-cap m-0 mt-auto flex items-center gap-2 pt-2 text-ink-2">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-act" />
          Cellar Assistant
        </p>
      </div>
      {preview.photoUrl !== null && (
        // biome-ignore lint/performance/noImgElement: a presigned file URL that expires; the optimiser would cache it under a key that stops working.
        <img
          src={preview.photoUrl}
          alt=""
          className="w-[38%] shrink-0 object-cover"
        />
      )}
    </div>
  );
}

/** The sheet's body, without the sheet (and so drawn by its test). */
export function ListShareBody({
  name,
  url,
  privacy,
  canEdit,
  onPrivacyChange,
  preview,
}: {
  name: string;
  url: string;
  privacy: string;
  /** Only the list's maker changes who can see it. */
  canEdit: boolean;
  onPrivacyChange: (privacy: Privacy) => void;
  preview: ListSharePreview | null;
}) {
  const canShare = useCanShare();
  const [showCode, setShowCode] = useState(preview === null);
  return (
    <div data-slot="list-share" className="flex flex-col gap-4 pb-2">
      {canEdit && (
        <SegmentedControl
          aria-label="Who can see it"
          options={PRIVACY_OPTIONS}
          value={asPrivacy(privacy)}
          onValueChange={onPrivacyChange}
        />
      )}
      {showCode || preview === null ? (
        <QrCode
          value={url}
          label={`QR code for ${name}`}
          className="mx-auto w-54 max-w-full"
        />
      ) : (
        <PreviewCard name={name} preview={preview} />
      )}
      <ul className="m-0 flex list-none flex-col p-0">
        <Row
          icon={CopyLink}
          label="Copy link"
          onSelect={() => {
            void copyLink(url);
          }}
        />
        {preview !== null && (
          <Row
            icon={showCode ? PreviewGlyph : QrGlyph}
            label={showCode ? "Show preview" : "Show code"}
            onSelect={() => setShowCode((value) => !value)}
          />
        )}
        {canShare && (
          <Row
            icon={ShareOut}
            label="More ways"
            onSelect={() => {
              navigator.share({ title: name, url }).catch(() => {
                /* The person closed the system sheet: nothing to say. */
              });
            }}
          />
        )}
      </ul>
    </div>
  );
}

const noop = () => () => {};

/** The page's origin, after hydration (none on the server). */
function useOrigin(): string {
  return useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );
}

export function ListShareSheet({
  open,
  onOpenChange,
  tierListId,
  name,
  privacy: initialPrivacy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tierListId: string;
  name: string;
  privacy: string;
}) {
  const router = useRouter();
  const origin = useOrigin();
  const [privacy, setPrivacy] = useState(asPrivacy(initialPrivacy));
  useEffect(() => setPrivacy(asPrivacy(initialPrivacy)), [initialPrivacy]);
  const [{ data }] = useQuery({
    query: ListShareQuery,
    variables: { id: tierListId },
    pause: !open,
  });
  const [, editList] = useMutation(EditTierListMutation);

  const list = unwrapResult(data?.tierList, "TierList");
  const canEdit =
    list.ok && canEditList(data?.me?.id ?? null, list.data.createdById);
  const preview: ListSharePreview | null = list.ok
    ? {
        listType: list.data.listType,
        itemCount: list.data.itemCount,
        ownerName: list.data.createdBy?.displayName ?? null,
        photoUrl: (() => {
          const first = list.data.items.edges[0]?.node;
          return (
            first?.item?.images.edges[0]?.node.file?.url ??
            first?.place?.photos.edges[0]?.node.file?.url ??
            null
          );
        })(),
        top: list.data.items.edges.map(({ node }) => ({
          id: node.id,
          name: node.item?.name ?? node.place?.name ?? "",
          band: node.band,
        })),
      }
    : null;

  const changePrivacy = (next: Privacy) => {
    if (!canEdit || next === privacy) return;
    const before = privacy;
    setPrivacy(next);
    void editList({ id: tierListId, input: { privacy: next } }).then(
      (response) => {
        const result = unwrapResult(
          response.data?.updateTierList ?? undefined,
          "TierList",
        );
        if (response.error !== undefined || !result.ok) {
          setPrivacy(before);
          feedback("refuse");
          notify("Couldn’t change who can see it", { tone: "error" });
          return;
        }
        router.refresh();
      },
    );
  };

  const url = absoluteUrl(
    origin,
    canonicalPath({ kind: "tier-list", id: tierListId }),
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share"
      description={privacyLine(privacy)}
    >
      {open && (
        <ListShareBody
          name={name}
          url={url}
          privacy={privacy}
          canEdit={canEdit}
          onPrivacyChange={changePrivacy}
          preview={preview}
        />
      )}
    </ResponsiveDialog>
  );
}
