"use client";

import {
  Box,
  Chip,
  IconButton,
  Snackbar,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/joy";
import Link from "next/link";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useEffect, useState } from "react";
import {
  MdEdit,
  MdGroup,
  MdLock,
  MdLockOpen,
  MdMap,
  MdPublic,
  MdShare,
} from "react-icons/md";
import { setTierListEditingLockAction } from "@/app/actions/tierLists";
import { TierListInsightsPanel } from "./insights/TierListInsightsPanel";
import { TierListView } from "./TierListView";
import type { TierListData, TierListInsightsData } from "./types";

interface TierListViewPageProps {
  data: TierListData;
  insightsData: TierListInsightsData;
}

const privacyLabels: Record<string, { icon: typeof MdLock; label: string }> = {
  PRIVATE: { icon: MdLock, label: "Private" },
  FRIENDS: { icon: MdGroup, label: "Friends" },
  PUBLIC: { icon: MdPublic, label: "Public" },
};

export function TierListViewPage({
  data,
  insightsData,
}: TierListViewPageProps) {
  const TAB_VALUES = ["rankings", "insights"] as const;
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TAB_VALUES).withDefault("rankings"),
  );

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
            {data.listType === "place" && (
              <Tooltip title="View on map">
                <IconButton
                  component={Link}
                  href={`/map?tierLists=${data.id}`}
                  variant="outlined"
                  color="neutral"
                  size="sm"
                >
                  <MdMap />
                </IconButton>
              </Tooltip>
            )}
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

        {/* Tabs: Rankings + Insights */}
        <Tabs
          value={tab}
          onChange={(_e, v) => setTab(v as typeof tab)}
          sx={{ backgroundColor: "transparent" }}
        >
          <TabList
            disableUnderline
            sx={{
              gap: 1,
              borderRadius: "md",
              backgroundColor: "background.level1",
              p: 0.5,
            }}
          >
            <Tab
              value="rankings"
              disableIndicator
              sx={{
                flex: 1,
                borderRadius: "sm",
                fontWeight: "md",
                "&[aria-selected='true']": {
                  backgroundColor: "background.surface",
                  boxShadow: "sm",
                },
              }}
            >
              Rankings
            </Tab>
            <Tab
              value="insights"
              disableIndicator
              sx={{
                flex: 1,
                borderRadius: "sm",
                fontWeight: "md",
                "&[aria-selected='true']": {
                  backgroundColor: "background.surface",
                  boxShadow: "sm",
                },
              }}
            >
              Insights
            </Tab>
          </TabList>
          <TabPanel value="rankings" sx={{ px: 0 }}>
            <TierListView
              tierListId={data.id}
              items={data.items}
              isOwner={data.isOwner}
              isEditingLocked={isEditingLocked}
            />
          </TabPanel>
          <TabPanel value="insights" sx={{ px: 0 }}>
            <TierListInsightsPanel insights={insightsData} />
          </TabPanel>
        </Tabs>
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
