"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { CellarForm } from "@/components/cellar/CellarForm";

const AddCellar = () => {
  const router = useRouter();

  const handleSubmitted = useCallback(
    (id: string) => {
      router.push(`/cellars/${id}/items`);
    },
    [router],
  );

  return <CellarForm onSubmitted={handleSubmitted} />;
};

export default AddCellar;
