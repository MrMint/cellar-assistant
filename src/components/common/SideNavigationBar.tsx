import {
  Avatar,
  Box,
  IconButton,
  List,
  ListItem,
  Sheet,
  Tooltip,
  styled,
} from "@mui/joy";
import { useSignOut, useUserAvatarUrl } from "@nhost/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { MdWarehouse } from "react-icons/md";

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

const NavContainer = styled(Sheet)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
}));

const SideNavigationBar = () => {
  const pathname = usePathname();
  const userAvatar = useUserAvatarUrl();
  const { signOut } = useSignOut();

  const handleSignOutClick = async () => {
    await signOut();
  };

  return (
    <NavContainer>
      <List size="sm" sx={{ justifyContent: "space-between" }}>
        <Box>
          <Tooltip title="Cellars" arrow placement="right">
            <ListItem>
              <NavLinkButton
                href="/cellars"
                pathname={pathname}
                icon={<MdWarehouse />}
              />
            </ListItem>
          </Tooltip>
        </Box>
        <Tooltip title="Logout" arrow placement="right">
          <ListItem>
            <IconButton onClick={handleSignOutClick}>
              <Avatar src={userAvatar} size="sm" />
            </IconButton>
          </ListItem>
        </Tooltip>
      </List>
    </NavContainer>
  );
};

export default SideNavigationBar;
