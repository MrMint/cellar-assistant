"use client";

import {
  Box,
  Chip,
  IconButton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/joy";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  MdEdit,
  MdGroup,
  MdLock,
  MdLockOpen,
  MdPublic,
  MdShare,
} from "react-icons/md";
import { setTierListEditingLockAction } from "@/app/actions/tierLists";
import { TierListView } from "./TierListView";
import type { TierListData } from "./types";

interface TierListViewPageProps {
  data: TierListData;
}

const privacyLabels: Record<string, { icon: typeof MdLock; label: string }> = {
  PRIVATE: { icon: MdLock, label: "Private" },
  FRIENDS: { icon: MdGroup, label: "Friends" },
  PUBLIC: { icon: MdPublic, label: "Public" },
};

export function TierListViewPage({ data }: TierListViewPageProps) {
  const privacyInfo = privacyLabels[data.privacy] ?? privacyLabels.PRIVATE;
  const PrivacyIcon = privacyInfo.icon;

  const [feedback, setFeedback] = useState<string | null>(null);
  const [isEditingLocked, setIsEditingLocked] = useState(data.isEditingLocked);
  const [isSavingEditingLock, setIsSavingEditingLock] = useState(false);

  useEffect(() => {
    setIsEditingLocked(data.isEditingLocked);
  }, [data.isEditingLocked]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/tier-lists/${data.id}`;
    const shareData = {
      title: data.name,
      text: `Check out my tier list: ${data.name}`,
      url,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setFeedback("Link copied to clipboard");
      }
    } catch {
      // User cancelled share
    }
  }, [data.id, data.name]);

  const handleToggleEditingLock = useCallback(async () => {
    if (!data.isOwner || isSavingEditingLock) return;

    const previousLocked = isEditingLocked;
    const nextLocked = !previousLocked;

    setIsEditingLocked(nextLocked);
    setIsSavingEditingLock(true);

    const result = await setTierListEditingLockAction(data.id, nextLocked);
    setIsSavingEditingLock(false);

    if (!result.success) {
      setIsEditingLocked(previousLocked);
      setFeedback(result.error ?? "Failed to update editing lock");
      return;
    }

    setIsEditingLocked(result.isEditingLocked ?? nextLocked);
    setFeedback(nextLocked ? "Editing locked" : "Editing unlocked");
  }, [data.id, data.isOwner, isEditingLocked, isSavingEditingLock]);

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", px: { xs: 1, sm: 2 } }}>
      <Stack spacing={2}>
        {/* Header */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          spacing={2}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography level="h3">{data.name}</Typography>
            {data.description && (
              <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                {data.description}
              </Typography>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Chip
                variant="soft"
                color="neutral"
                size="sm"
                startDecorator={<PrivacyIcon />}
              >
                {privacyInfo.label}
              </Chip>
              <Typography
                level="body-xs"
                sx={{ color: "text.tertiary", alignSelf: "center" }}
              >
                {data.itemCount} {data.itemCount === 1 ? "item" : "items"}
              </Typography>
            </Stack>
          </Box>
          <Stack direction="row" spacing={0.5}>
            {data.privacy !== "PRIVATE" && (
              <Tooltip title="Share">
                <IconButton
                  variant="outlined"
                  color="neutral"
                  size="sm"
                  onClick={handleShare}
                >
                  <MdShare />
                </IconButton>
              </Tooltip>
            )}
            {data.isOwner && (
              <Tooltip
                title={isEditingLocked ? "Unlock editing" : "Lock editing"}
              >
                <IconButton
                  variant={isEditingLocked ? "solid" : "outlined"}
                  color={isEditingLocked ? "warning" : "neutral"}
                  size="sm"
                  onClick={handleToggleEditingLock}
                  disabled={isSavingEditingLock}
                >
                  {isEditingLocked ? <MdLock /> : <MdLockOpen />}
                </IconButton>
              </Tooltip>
            )}
            {data.isOwner && (
              <Tooltip title="Edit list">
                <IconButton
                  component={Link}
                  href={`/tier-lists/${data.id}/edit`}
                  variant="outlined"
                  color="neutral"
                  size="sm"
                >
                  <MdEdit />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Stack>

        {/* Tier List DnD View */}
        <TierListView
          tierListId={data.id}
          items={data.items}
          isOwner={data.isOwner}
          isEditingLocked={isEditingLocked}
        />
      </Stack>

      <Snackbar
        open={feedback !== null}
        autoHideDuration={3000}
        onClose={() => setFeedback(null)}
        color="success"
        variant="soft"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {feedback}
      </Snackbar>
    </Box>
  );
}
