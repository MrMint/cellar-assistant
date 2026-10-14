"use client";

import { useEffect, useState, useTransition } from "react";
import { useMutation } from "urql";
import { IconButton } from "@/components/app/IconButton";
import { Love } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { SetRecipeLoveMutation } from "@/components/bar/queries";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";

/**
 * D9: **Love replaces the recipe heart.** The old heart beside the title was
 * a `TODO` that logged "not implemented yet" and was dropped in the restore;
 * this is the real one, on `recipe_favorites` through `UserActor`.
 *
 * Optimistic: the fill flips on the tap and settles to the server's answer
 * (`loved` after the call), and a refusal flips it back with a toast — the
 * same contract `ItemDetails`' heart keeps. Claret when set (design §3.1,
 * never a pure red heart).
 */
export function RecipeLoveButton({
  recipeId,
  loved,
  name,
  className,
}: {
  recipeId: string;
  loved: boolean;
  /**
   * The recipe's name, where the button sits in a list of them (Loved ›
   * Recipes): every row's button would otherwise have the same name.
   */
  name?: string;
  className?: string;
}) {
  const [isLoved, setIsLoved] = useState(loved);
  const [isPending, startTransition] = useTransition();
  // A set, not a toggle: the tap names the state it wants, so a retried
  // request lands on it instead of taking the Love back (wave B).
  const [, setLove] = useMutation(SetRecipeLoveMutation);

  // A server refresh (another tab, the versions page) is the newer truth.
  useEffect(() => setIsLoved(loved), [loved]);

  const toggle = () => {
    const before = isLoved;
    const next = !before;
    setIsLoved(next);
    startTransition(async () => {
      const response = await setLove({ recipeId, loved: next });
      const result = unwrapResult(
        response.data?.setRecipeLove,
        "SetRecipeLovePayload",
      );
      if (result.ok) {
        setIsLoved(result.data.loved);
      } else {
        setIsLoved(before);
        notify(`Couldn't save that: ${result.error.message}`, {
          tone: "error",
        });
      }
    });
  };

  return (
    <IconButton
      onClick={toggle}
      disabled={isPending}
      aria-label={
        name === undefined
          ? isLoved
            ? "Loved — tap to remove"
            : "Love this recipe"
          : isLoved
            ? `${name}: loved — tap to remove`
            : `Love ${name}`
      }
      aria-pressed={isLoved}
      className={cn("shrink-0", className)}
    >
      <Love
        aria-hidden
        className={cn(
          "size-6 transition-transform duration-(--ca-dur-short) ease-standard motion-reduce:transition-none",
          isLoved ? "scale-110 fill-brand text-brand" : "text-ink-2",
        )}
      />
    </IconButton>
  );
}
