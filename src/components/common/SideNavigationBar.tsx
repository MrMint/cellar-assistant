"use client";

import {
  Box,
  Dropdown,
  IconButton,
  List,
  ListItem,
  Menu,
  MenuButton,
  MenuItem,
  Sheet,
  styled,
  Tooltip,
  type TooltipProps,
} from "@mui/joy";
import { usePathname } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { FaRankingStar } from "react-icons/fa6";
import {
  MdFavorite,
  MdFormatListNumbered,
  MdGroup,
  MdMap,
  MdMenuBook,
  MdMoreHoriz,
  MdSearch,
  MdWarehouse,
} from "react-icons/md";
import { signOut } from "@/lib/auth/actions";
import type { ServerUser } from "@/utilities/auth-server";
import { Link } from "./Link";
import { UserAvatar } from "./UserAvatar";

const NavLinkIconButton = styled(IconButton)(({ theme }) => ({
  color: theme.palette.text.secondary,
  "&.active > *": {
    color: `${theme.palette.text.primary} !important`,
  },
}));

type NavLinkButtonProps = {
  href: string;
  icon: ReactNode;
  pathname: string;
};

const NavLinkButton = styled(({ href, pathname, icon }: NavLinkButtonProps) => {
  const isActive = pathname === href;

  return (
    <Link href={href}>
      <NavLinkIconButton size="lg" className={isActive ? "active" : ""}>
        {icon}
      </NavLinkIconButton>
    </Link>
  );
})(({ theme }) => ({}));

type NavItem = {
  href: string;
  icon: ReactNode;
  title: string;
};

type NavigationItemProps = {
  item: NavItem;
  pathname: string;
  placement: TooltipProps["placement"];
};

const NavigationItem = ({ item, pathname, placement }: NavigationItemProps) => (
  <Box>
    <Tooltip title={item.title} arrow placement={placement}>
      <ListItem>
        <NavLinkButton href={item.href} pathname={pathname} icon={item.icon} />
      </ListItem>
    </Tooltip>
  </Box>
);

type UserMenuProps = {
  user: ServerUser;
  placement: "top-start" | "right-start";
  onSignOut: () => Promise<void>;
};

const UserMenu = ({ user, placement, onSignOut }: UserMenuProps) => (
  <ListItem>
    <Dropdown>
      <MenuButton slots={{ root: IconButton }}>
        <UserAvatar
          avatarUrl={user.avatarUrl}
          displayName={user.displayName ?? user.email}
          size="sm"
        />
      </MenuButton>
      <Menu size="lg" placement={placement}>
        <MenuItem component={Link} href="/users/edit">
          Edit Profile
        </MenuItem>
        <MenuItem onClick={onSignOut}>Sign out</MenuItem>
      </Menu>
    </Dropdown>
  </ListItem>
);

const NAV_ITEMS: NavItem[] = [
  { href: "/cellars", icon: <MdWarehouse />, title: "Cellars" },
  { href: "/search", icon: <MdSearch />, title: "Search" },
  { href: "/map", icon: <MdMap />, title: "Map" },
  { href: "/tier-lists", icon: <MdFormatListNumbered />, title: "Tier Lists" },
  { href: "/rankings", icon: <FaRankingStar />, title: "Rankings" },
  { href: "/favorites", icon: <MdFavorite />, title: "Favorites" },
  { href: "/recipes", icon: <MdMenuBook />, title: "Recipes" },
  { href: "/friends", icon: <MdGroup />, title: "Friends" },
];

type NavigationListProps = {
  orientation: "horizontal" | "vertical";
  display: Record<string, string>;
  navItems: NavItem[];
  pathname: string;
  tooltipPlacement: TooltipProps["placement"];
  menuPlacement: "top-start" | "right-start";
  user: ServerUser;
  onSignOut: () => Promise<void>;
};

const NavigationList = ({
  orientation,
  display,
  navItems,
  pathname,
  tooltipPlacement,
  menuPlacement,
  user,
  onSignOut,
}: NavigationListProps) => (
  <List
    orientation={orientation}
    size="sm"
    sx={{
      justifyContent: "space-between",
      display,
    }}
  >
    {navItems.map((item) => (
      <NavigationItem
        key={item.href}
        item={item}
        pathname={pathname}
        placement={tooltipPlacement}
      />
    ))}
    <Box flexGrow={1} />
    <UserMenu user={user} placement={menuPlacement} onSignOut={onSignOut} />
  </List>
);

// Width of each nav icon button slot (icon + ListItem padding)
const ITEM_WIDTH = 60;
// Reserve space for the "more" button + user avatar
const RESERVED_WIDTH = ITEM_WIDTH * 2;

type MobileNavigationListProps = {
  navItems: NavItem[];
  pathname: string;
  user: ServerUser;
  onSignOut: () => Promise<void>;
};

const MobileNavigationList = ({
  navItems,
  pathname,
  user,
  onSignOut,
}: MobileNavigationListProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(4);

  const measure = useCallback(() => {
    if (!wrapperRef.current) return;
    const width = wrapperRef.current.offsetWidth;
    const maxVisible = Math.floor((width - RESERVED_WIDTH) / ITEM_WIDTH);
    setVisibleCount(Math.max(1, Math.min(maxVisible, navItems.length)));
  }, [navItems.length]);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (wrapperRef.current) {
      observer.observe(wrapperRef.current);
    }
    return () => observer.disconnect();
  }, [measure]);

  const needsOverflow = visibleCount < navItems.length;
  const visibleItems = needsOverflow
    ? navItems.slice(0, visibleCount)
    : navItems;
  const overflowItems = needsOverflow ? navItems.slice(visibleCount) : [];

  return (
    <Box
      ref={wrapperRef}
      sx={{
        display: { xs: "flex", sm: "none" },
        width: "100%",
        overflow: "hidden",
      }}
    >
      <List
        orientation="horizontal"
        size="sm"
        sx={{
          flexWrap: "nowrap",
          width: "100%",
          justifyContent: "space-evenly",
        }}
      >
        {visibleItems.map((item) => (
          <NavigationItem
            key={item.href}
            item={item}
            pathname={pathname}
            placement="top"
          />
        ))}
        {needsOverflow && (
          <ListItem>
            <Dropdown>
              <MenuButton
                slots={{ root: IconButton }}
                slotProps={{ root: { size: "lg" } }}
              >
                <MdMoreHoriz />
              </MenuButton>
              <Menu size="lg" placement="top-start">
                {overflowItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <MenuItem
                      key={item.href}
                      component={Link}
                      href={item.href}
                      selected={isActive}
                    >
                      <Box
                        component="span"
                        sx={{ mr: 1, display: "flex", alignItems: "center" }}
                      >
                        {item.icon}
                      </Box>
                      {item.title}
                    </MenuItem>
                  );
                })}
              </Menu>
            </Dropdown>
          </ListItem>
        )}
        <UserMenu user={user} placement="top-start" onSignOut={onSignOut} />
      </List>
    </Box>
  );
};

interface SideNavigationBarProps {
  user: ServerUser;
}

const SideNavigationBar = ({ user }: SideNavigationBarProps) => {
  const pathname = usePathname();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  return (
    <Sheet
      sx={(theme) => ({
        display: "flex",
        flexDirection: { xs: "row", sm: "column" },
        boxShadow: theme.shadow.lg,
        zIndex: 1200, // Above drawer (1100) so nav bar stays visible
        position: "relative", // Required for z-index to work
      })}
    >
      {/* Mobile horizontal navigation with overflow menu */}
      <MobileNavigationList
        navItems={NAV_ITEMS}
        pathname={pathname}
        user={user}
        onSignOut={handleSignOut}
      />

      {/* Desktop vertical navigation */}
      <NavigationList
        orientation="vertical"
        display={{ xs: "none", sm: "flex" }}
        navItems={NAV_ITEMS}
        pathname={pathname}
        tooltipPlacement="right"
        menuPlacement="right-start"
        user={user}
        onSignOut={handleSignOut}
      />
    </Sheet>
  );
};

export default SideNavigationBar;
