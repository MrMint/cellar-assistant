"use client";

import {
  Avatar,
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
import type { ReactNode } from "react";
import { FaRankingStar } from "react-icons/fa6";
import {
  MdFavorite,
  MdGroup,
  MdMap,
  MdMenuBook,
  MdSearch,
  MdWarehouse,
} from "react-icons/md";
import { signOut } from "@/lib/auth/actions";
import type { ServerUser } from "@/utilities/auth-server";
import { Link } from "./Link";

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
        <Avatar src={user.avatarUrl || undefined} size="sm">
          {!user.avatarUrl &&
            (user.displayName?.charAt(0)?.toUpperCase() ||
              user.email.charAt(0).toUpperCase())}
        </Avatar>
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
  { href: "/map", icon: <MdMap />, title: "Map" },
  { href: "/search", icon: <MdSearch />, title: "Search" },
  { href: "/recipes", icon: <MdMenuBook />, title: "Recipes" },
  { href: "/rankings", icon: <FaRankingStar />, title: "Rankings" },
  { href: "/favorites", icon: <MdFavorite />, title: "Favorites" },
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
      {/* Mobile horizontal navigation */}
      <NavigationList
        orientation="horizontal"
        display={{ xs: "flex", sm: "none" }}
        navItems={NAV_ITEMS}
        pathname={pathname}
        tooltipPlacement="top"
        menuPlacement="top-start"
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
