"use client";
import { Box, Button, Input, Stack } from "@mui/joy";
import { useRouter } from "next/navigation";
import { MdAdd, MdSearch } from "react-icons/md";

const ItemsLayout = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end" }}>
        <Input startDecorator={<MdSearch />} placeholder="Search" disabled />
        <Button
          startDecorator={<MdAdd />}
          onClick={() => router.push("items/add")}
        >
          Add Item
        </Button>
      </Stack>
      <Box>{children}</Box>
    </Stack>
  );
};

export default ItemsLayout;
