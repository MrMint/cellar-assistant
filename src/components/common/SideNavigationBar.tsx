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
  Tooltip,
  styled,
  useTheme,
} from "@mui/joy";
import { useSignOut, useUserAvatarUrl } from "@nhost/nextjs";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { FaRankingStar } from "react-icons/fa6";
import { MdGroup, MdSearch, MdWarehouse } from "react-icons/md";
import { useMediaQuery } from "react-responsive";
import Link from "./Link";

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

const SideNavigationBar = () => {
  const pathname = usePathname();
  const userAvatar = useUserAvatarUrl();
  const { signOut } = useSignOut();
  const theme = useTheme();
  const isMobile = useMediaQuery({
    minWidth: theme.breakpoints.values["xs"],
    maxWidth: theme.breakpoints.values["sm"],
  });

  const orientation = isMobile ? "horizontal" : "vertical";
  const placement = isMobile ? "top" : "right";

  return (
    <Sheet
      sx={(theme) => ({
        display: "flex",
        flexDirection: { xs: "row", sm: "column" },
        boxShadow: theme.shadow.lg,
      })}
    >
      <List
        orientation={isMobile ? "horizontal" : "vertical"}
        size="sm"
        sx={{ justifyContent: "space-between" }}
      >
        <Box>
          <Tooltip title="Cellars" arrow placement={placement}>
            <ListItem>
              <NavLinkButton
                href="/cellars"
                pathname={pathname}
                icon={<MdWarehouse />}
              />
            </ListItem>
          </Tooltip>
        </Box>
        <Box>
          <Tooltip title="Search" arrow placement={placement}>
            <ListItem>
              <NavLinkButton
                href="/search"
                pathname={pathname}
                icon={<MdSearch />}
              />
            </ListItem>
          </Tooltip>
        </Box>
        <Box>
          <Tooltip title="Rankings" arrow placement={placement}>
            <ListItem>
              <NavLinkButton
                href="/rankings"
                pathname={pathname}
                icon={<FaRankingStar />}
              />
            </ListItem>
          </Tooltip>
        </Box>
        <Box>
          <Tooltip title="Friends" arrow placement={placement}>
            <ListItem>
              <NavLinkButton
                href="/friends"
                pathname={pathname}
                icon={<MdGroup />}
              />
            </ListItem>
          </Tooltip>
        </Box>
        <Box flexGrow={1} />
        <ListItem>
          <Dropdown>
            <MenuButton slots={{ root: IconButton }}>
              <Avatar src={userAvatar} size="sm" />
            </MenuButton>
            <Menu size="lg" placement="right-start">
              <MenuItem component={Link} href="/users/edit">
                Edit Profile
              </MenuItem>
              <MenuItem onClick={signOut}>Sign out</MenuItem>
            </Menu>
          </Dropdown>
        </ListItem>
      </List>
    </Sheet>
  );
};

export default SideNavigationBar;
