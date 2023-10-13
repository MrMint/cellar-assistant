"use client";
import { Button, Input, Stack } from "@mui/joy";
import { useRouter } from "next/navigation";
import { MdAdd, MdSearch } from "react-icons/md";

const ItemsLayout = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  return (
    <Stack>
      <Stack direction="row">
        <Input startDecorator={<MdSearch />} placeholder="Search" />
        <Button
          startDecorator={<MdAdd />}
          onClick={() => router.push("items/add")}
        >
          Add Item
        </Button>
      </Stack>
      {children}
    </Stack>
  );
};

export default ItemsLayout;
