import {
  Avatar,
  Box,
  IconButton,
  List,
  ListItem,
  Sheet,
  Tooltip,
  styled,
  useTheme,
} from "@mui/joy";
import { useSignOut, useUserAvatarUrl } from "@nhost/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { MdWarehouse } from "react-icons/md";
import { useMediaQuery } from "react-responsive";

const NavLinkIconButton = styled(IconButton)(({ theme }) => ({
  color: theme.palette.text.secondary,
  "&.active > *": {
    color: theme.palette.text.primary,
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

  const handleSignOutClick = async () => {
    await signOut();
  };

  const orientation = isMobile ? "horizontal" : "vertical";
  const placement = isMobile ? "top" : "right";

  return (
    <Sheet
      variant="outlined"
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
        <Tooltip title="Logout" arrow placement={placement}>
          <ListItem>
            <IconButton onClick={handleSignOutClick}>
              <Avatar src={userAvatar} size="sm" />
            </IconButton>
          </ListItem>
        </Tooltip>
      </List>
    </Sheet>
  );
};

export default SideNavigationBar;
