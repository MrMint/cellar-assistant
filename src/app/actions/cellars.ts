"use server";

import { graphql, type Permission_Type_Enum } from "@cellar-assistant/shared";
import { revalidatePath } from "next/cache";
import { serverMutation } from "@/lib/urql/server";
import { getOptionalServerUser } from "@/utilities/auth-server";

const addCellarMutation = graphql(`
  mutation AddCellar($cellar: cellars_insert_input!) {
    insert_cellars_one(object: $cellar) {
      id
    }
  }
`);

const editCellarMutation = graphql(`
  mutation EditCellar(
    $id: uuid!
    $cellar: cellars_set_input!
    $co_owners: [cellar_owners_insert_input!]!
  ) {
    update_cellars_by_pk(pk_columns: { id: $id }, _set: $cellar) {
      id
    }
    delete_cellar_owners(where: { cellar_id: { _eq: $id } }) {
      affected_rows
    }
    insert_cellar_owners(objects: $co_owners) {
      affected_rows
    }
  }
`);

export type CellarResult = {
  success: boolean;
  cellarId?: string;
  error?: string;
};

export async function addCellarAction(
  name: string,
  privacy: Permission_Type_Enum,
  coOwnerIds: string[],
): Promise<CellarResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    const result = await serverMutation(addCellarMutation, {
      cellar: {
        name,
        privacy,
        co_owners: { data: coOwnerIds.map((x) => ({ user_id: x })) },
      },
    });

    // Revalidate cellar pages
    revalidatePath("/cellars", "page");

    return {
      success: true,
      cellarId: result.insert_cellars_one?.id,
    };
  } catch (error) {
    console.error("Failed to add cellar:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add cellar",
    };
  }
}

export async function editCellarAction(
  id: string,
  name: string,
  privacy: Permission_Type_Enum,
  coOwnerIds: string[],
): Promise<CellarResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    const result = await serverMutation(editCellarMutation, {
      id,
      cellar: {
        name,
        privacy,
      },
      co_owners: coOwnerIds.map((x) => ({ user_id: x, cellar_id: id })),
    });

    // Revalidate cellar pages
    revalidatePath("/cellars", "page");
    revalidatePath(`/cellars/${id}`, "page");
    revalidatePath("/cellars/[cellarId]", "page");

    return {
      success: true,
      cellarId: result.update_cellars_by_pk?.id,
    };
  } catch (error) {
    console.error("Failed to edit cellar:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to edit cellar",
    };
  }
}
