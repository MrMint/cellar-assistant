import { IconButton, List, ListItem, Sheet, styled } from "@mui/joy";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { MdPerson, MdWarehouse, MdWineBar } from "react-icons/md";

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
      <NavLinkIconButton className={isActive ? "active" : ""}>
        {icon}
      </NavLinkIconButton>
    </Link>
  );
})(({ theme }) => ({}));

const NavContainer = styled(Sheet)(({ theme }) => ({
  // width: "24px",
  display: "flex",
  flexDirection: "column",
}));

const SideNavigationBar = () => {
  const pathname = usePathname();

  return (
    <NavContainer>
      <List>
        <ListItem>
          <NavLinkButton
            href="/cellars"
            pathname={pathname}
            icon={<MdWarehouse />}
          />
        </ListItem>
        <ListItem>
          <NavLinkButton href="/" pathname={pathname} icon={<MdPerson />} />
        </ListItem>
      </List>
    </NavContainer>
  );
};

export default SideNavigationBar;
