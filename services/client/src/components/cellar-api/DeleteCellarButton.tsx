"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useMutation } from "urql";
import { Delete } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { useNavigate } from "@/components/app/useNavigate";
import { formatCount } from "@/components/cellar/list/model";
import { Button } from "@/components/ui/button";
import { CreateCellarMutation, DeleteCellarMutation } from "@/lib/api/cellars";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import { ApiError } from "./ApiError";

type Privacy = "FRIENDS" | "PRIVATE" | "PUBLIC";

/** "Holds 240 bottles. Empty it first." */
export const deleteRefusal = (bottles: number): string | null =>
  bottles <= 0
    ? null
    : `Holds ${formatCount(bottles)} ${bottles === 1 ? "bottle" : "bottles"}. Empty it first.`;

/**
 * Delete cellar (lot-cellars-shelves-02, -09). The brief's rule for toast or
 * confirm: confirm only when Undo cannot bring back what the owner made. A
 * cellar holding bottles is refused up front ("Holds 240 bottles. Empty it
 * first."; `deleteCellar` is a `ConflictError` then anyway). An empty one
 * goes at once, with an Undo toast: there is nothing in it to lose, so Undo
 * makes it again with the same name, privacy and co-owners.
 *
 * The count is from the last render and can be stale, so the server's own
 * refusal still shows, as an `ApiError`, when it disagrees.
 */
export function DeleteCellarButton({
  cellarId,
  cellarName,
  itemCount,
  privacy,
  coOwnerIds,
}: {
  cellarId: string;
  cellarName: string;
  itemCount: number;
  privacy: Privacy;
  coOwnerIds: readonly string[];
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [error, setError] = useState<ApiFailure | null>(null);
  const [{ fetching }, deleteCellar] = useMutation(DeleteCellarMutation);
  const [, createCellar] = useMutation(CreateCellarMutation);

  const undo = useCallback(async () => {
    const response = await createCellar({
      input: { name: cellarName, privacy, coOwnerIds: [...coOwnerIds] },
    });
    const result = unwrapResult(
      response.data?.createCellar ?? undefined,
      "Cellar",
    );
    if (!result.ok) {
      notify(`Couldn't bring back ${cellarName}`, { tone: "error" });
      return;
    }
    router.refresh();
  }, [cellarName, coOwnerIds, createCellar, privacy, router]);

  const remove = useCallback(async () => {
    setError(null);
    const response = await deleteCellar({ cellarId });
    const result = unwrapResult(
      response.data?.deleteCellar ?? undefined,
      "DeletedCellar",
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate.push("/cellars");
    router.refresh();
    notify(`Deleted ${cellarName}`, { undo: () => void undo() });
  }, [cellarId, cellarName, deleteCellar, navigate, router, undo]);

  const refusal = deleteRefusal(itemCount);

  return (
    <section
      aria-label="Delete cellar"
      data-slot="delete-cellar"
      className="flex flex-col gap-2 border-line border-t pt-4"
    >
      <Button
        variant="quiet"
        className="self-start text-danger disabled:text-ink-3"
        disabled={refusal !== null || fetching}
        aria-describedby={refusal === null ? undefined : `${cellarId}-refusal`}
        onClick={() => void remove()}
      >
        <Delete aria-hidden />
        Delete cellar
      </Button>
      {refusal !== null && (
        <p id={`${cellarId}-refusal`} className="t-cap m-0 text-ink-2">
          {refusal}
        </p>
      )}
      {error !== null && <ApiError error={error} />}
    </section>
  );
}
