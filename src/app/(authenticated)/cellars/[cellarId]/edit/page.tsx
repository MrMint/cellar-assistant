"use client";

import { CircularProgress } from "@mui/joy";
import { useRouter } from "next/navigation";
import { isNil, isNotNil } from "ramda";
import { useCallback } from "react";
import { useQuery } from "urql";
import { CellarForm } from "@/components/cellar/CellarForm";
import { PageLoading } from "@/components/common/PageLoading";
import { graphql } from "@/gql";
import { nullsToUndefined } from "@/utilities";

const editCellarQuery = graphql(`
  query EditCellarQuery($id: uuid!) {
    cellars_by_pk(id: $id) {
      id
      name
      privacy
    }
  }
`);

const EditCellar = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  const router = useRouter();
  const [{ data }] = useQuery({
    query: editCellarQuery,
    variables: { id: cellarId },
  });
  const handleSubmitted = useCallback(() => {
    router.push(`/cellars`);
  }, [router]);

  const cellar = nullsToUndefined(data?.cellars_by_pk);
  return (
    <>
      {isNil(cellar) && <PageLoading />}
      {isNotNil(cellar) && (
        <CellarForm
          id={cellarId}
          defaults={{ name: cellar.name, privacy: cellar.privacy }}
          onSubmitted={handleSubmitted}
        />
      )}
    </>
  );
};

export default EditCellar;
