"use client";

import {
  CheckCircle,
  Close,
  Coffee,
  LocalBar,
  LocationOn,
  Notifications,
  Restaurant,
  SportsBar,
  WineBar,
} from "@mui/icons-material";
import {
  Alert,
  Badge,
  Box,
  IconButton,
  Snackbar,
  Stack,
  Typography,
} from "@mui/joy";
import { useCallback, useState } from "react";
import {
  type MapSubscriptionData,
  useMapSubscriptions,
} from "../hooks/useMapSubscriptions";

interface NotificationItem {
  id: string;
  type: "place_update" | "menu_discovery" | "match_suggestion";
  title: string;
  message: string;
  icon: React.ReactNode;
  timestamp: Date;
  actionUrl?: string;
}

interface MapNotificationsProps {
  userId: string;
}

export function MapNotifications({ userId }: MapNotificationsProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [currentNotification, setCurrentNotification] =
    useState<NotificationItem | null>(null);

  const addNotification = useCallback(
    (notification: NotificationItem) => {
      setNotifications((prev) => [notification, ...prev.slice(0, 4)]); // Keep last 5

      // Show as snackbar if no current notification
      if (!currentNotification) {
        setCurrentNotification(notification);
      }
    },
    [currentNotification],
  );

  const getItemIcon = useCallback((itemType: string) => {
    switch (itemType) {
      case "wine":
        return <WineBar sx={{ color: "danger.500", fontSize: 16 }} />;
      case "beer":
        return <SportsBar sx={{ color: "warning.500", fontSize: 16 }} />;
      case "spirit":
        return <LocalBar sx={{ color: "neutral.500", fontSize: 16 }} />;
      case "coffee":
        return <Coffee sx={{ color: "success.500", fontSize: 16 }} />;
      default:
        return <Restaurant sx={{ fontSize: 16 }} />;
    }
  }, []);

  const handleMenuDiscovery = useCallback(
    (discoveries: MapSubscriptionData["menuDiscoveries"]) => {
      // Only show notification for new discoveries (within last 30 seconds)
      const recentDiscoveries = discoveries.filter((discovery) => {
        const discoveryTime = new Date(discovery.created_at);
        const now = new Date();
        return now.getTime() - discoveryTime.getTime() < 30000; // 30 seconds
      });

      recentDiscoveries.forEach((discovery) => {
        addNotification({
          id: `discovery-${discovery.id}`,
          type: "menu_discovery",
          title: "New Menu Item Discovered",
          message: `Found "${discovery.menu_item_name}" at ${discovery.place.name}`,
          icon: getItemIcon(discovery.detected_item_type),
          timestamp: new Date(discovery.created_at),
          actionUrl: `/places/${discovery.place.id}`,
        });
      });
    },
    [addNotification, getItemIcon],
  );

  const handleMatchSuggestion = useCallback(
    (matches: MapSubscriptionData["pendingMatches"]) => {
      // Only show notification for new matches (within last 30 seconds)
      const recentMatches = matches.filter((match) => {
        const matchTime = new Date(match.created_at);
        const now = new Date();
        return now.getTime() - matchTime.getTime() < 30000; // 30 seconds
      });

      if (recentMatches.length > 0) {
        const match = recentMatches[0]; // Show first match
        addNotification({
          id: `match-${match.id}`,
          type: "match_suggestion",
          title: "New Item Match Found",
          message: `${Math.round(match.confidence_score * 100)}% match for "${match.place_menu_item.menu_item_name}"`,
          icon: <CheckCircle sx={{ color: "success.500", fontSize: 16 }} />,
          timestamp: new Date(match.created_at),
          actionUrl: "/discoveries",
        });
      }
    },
    [addNotification],
  );

  const handlePlaceUpdate = useCallback(
    (places: MapSubscriptionData["places"]) => {
      // Only show notification for recently updated places (within last 60 seconds)
      const recentUpdates = places.filter((place) => {
        const updateTime = new Date(place.updated_at);
        const now = new Date();
        return now.getTime() - updateTime.getTime() < 60000; // 60 seconds
      });

      // Show notification for places that were just accessed
      const newlyAccessed = recentUpdates.filter(
        (place) => place.last_accessed_at && place.access_count === 1,
      );

      newlyAccessed.forEach((place) => {
        addNotification({
          id: `place-${place.id}`,
          type: "place_update",
          title: "New Place Cached",
          message: `${place.name} has been added to your map`,
          icon: <LocationOn sx={{ color: "primary.500", fontSize: 16 }} />,
          timestamp: new Date(place.updated_at),
          actionUrl: `/places/${place.id}`,
        });
      });
    },
    [addNotification],
  );

  // Set up subscriptions
  useMapSubscriptions({
    userId,
    onPlaceUpdate: handlePlaceUpdate,
    onMenuDiscovery: handleMenuDiscovery,
    onMatchSuggestion: handleMatchSuggestion,
  });

  const handleCloseNotification = () => {
    setCurrentNotification(null);

    // Show next notification if available
    if (notifications.length > 0) {
      setTimeout(() => {
        const nextNotification = notifications.find(
          (n) => n.id !== currentNotification?.id,
        );
        if (nextNotification) {
          setCurrentNotification(nextNotification);
        }
      }, 500);
    }
  };

  const handleNotificationClick = () => {
    if (currentNotification?.actionUrl) {
      window.location.href = currentNotification.actionUrl;
    }
    handleCloseNotification();
  };

  return (
    <>
      <Snackbar
        open={!!currentNotification}
        onClose={handleCloseNotification}
        autoHideDuration={4000}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Alert
          color={
            currentNotification?.type === "match_suggestion"
              ? "success"
              : "primary"
          }
          variant="solid"
          startDecorator={currentNotification?.icon}
          endDecorator={
            <IconButton
              variant="plain"
              size="sm"
              color="neutral"
              onClick={handleCloseNotification}
            >
              <Close />
            </IconButton>
          }
          onClick={
            currentNotification?.actionUrl ? handleNotificationClick : undefined
          }
          sx={{
            cursor: currentNotification?.actionUrl ? "pointer" : "default",
            minWidth: "300px",
          }}
        >
          <Stack spacing={0.5}>
            <Typography level="title-sm" sx={{ color: "inherit" }}>
              {currentNotification?.title}
            </Typography>
            <Typography level="body-sm" sx={{ color: "inherit", opacity: 0.9 }}>
              {currentNotification?.message}
            </Typography>
          </Stack>
        </Alert>
      </Snackbar>

      {/* Notification indicator (could be used in header) */}
      {notifications.length > 0 && (
        <Box
          sx={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 1000,
            display: "none", // Hidden by default, can be shown via prop
          }}
        >
          <Badge badgeContent={notifications.length} color="primary">
            <IconButton variant="solid" color="primary">
              <Notifications />
            </IconButton>
          </Badge>
        </Box>
      )}
    </>
  );
}
