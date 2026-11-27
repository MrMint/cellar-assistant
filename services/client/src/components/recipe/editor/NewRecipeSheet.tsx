"use client";

import { useId } from "react";
import { BottomSheet } from "@/components/app/BottomSheet";
import {
  type AppIcon,
  Camera,
  ChevronRight,
  ICON_STROKE,
  Paste,
  Write,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { useNavigate } from "@/components/app/useNavigate";
import { holdRecipePhoto } from "./pending-photo";

export type NewRecipeSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Whether reading a photo or pasted text is offered (D25: the AI
   * capability). Off, the sheet offers Type alone rather than two rows the
   * server would refuse.
   */
  aiOffered?: boolean;
};

const ROW =
  "relative flex min-h-14 items-center gap-3 rounded-md px-2 py-2 active:bg-surface-3";

function RowBody({
  icon: Icon,
  title,
  description,
}: {
  icon: AppIcon;
  title: React.ReactNode;
  description: string;
}) {
  return (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-3 text-ink-1">
        <Icon aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        {title}
        <span className="t-cap text-ink-3">{description}</span>
      </span>
      <ChevronRight
        aria-hidden
        className="size-5 text-ink-3"
        strokeWidth={ICON_STROKE}
      />
    </>
  );
}

/**
 * New recipe (X15): Photo · Paste · Type. Photo opens the camera or the
 * library straight from the row — one tap — and reading starts the moment a
 * photo is chosen; Paste and Type open the composer. Whatever the AI reads
 * lands as a private draft in the editor, never as a published recipe (D22).
 */
export function NewRecipeSheet({
  open,
  onOpenChange,
  aiOffered = true,
}: NewRecipeSheetProps) {
  const navigate = useNavigate();
  const inputId = useId();

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="New recipe">
      <ul className="flex flex-col pb-2">
        {aiOffered && (
          // The input is visually hidden, so the row shows its keyboard focus.
          <li
            className={`${ROW} has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50`}
          >
            {/* The row is the file input's label, so the tap that opens the
                sheet's row opens the picker — no second "Choose photo". */}
            <input
              id={inputId}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file === undefined || !file.type.startsWith("image/")) {
                  return;
                }
                holdRecipePhoto(file);
                onOpenChange(false);
                navigate.push("/recipes/new?from=photo");
              }}
            />
            <RowBody
              icon={Camera}
              title={
                <label
                  htmlFor={inputId}
                  className="t-head text-ink-1 after:absolute after:inset-0 after:content-['']"
                >
                  Photo
                </label>
              }
              description="A recipe card, a book page or a screenshot"
            />
          </li>
        )}
        {aiOffered && (
          <li className={ROW}>
            <RowBody
              icon={Paste}
              title={
                <Link
                  href="/recipes/new?from=paste"
                  overlay
                  underline="none"
                  className="t-head text-ink-1"
                  onClick={() => onOpenChange(false)}
                >
                  Paste
                </Link>
              }
              description="Text from a website or a message"
            />
          </li>
        )}
        <li className={ROW}>
          <RowBody
            icon={Write}
            title={
              <Link
                href="/recipes/new?from=type"
                overlay
                underline="none"
                className="t-head text-ink-1"
                onClick={() => onOpenChange(false)}
              >
                Type
              </Link>
            }
            description="Write it in yourself"
          />
        </li>
      </ul>
    </BottomSheet>
  );
}
