"use server";

import { graphql } from "@cellar-assistant/shared";
import { revalidatePath } from "next/cache";
import { serverMutation } from "@/lib/urql/server";
import { getOptionalServerUser } from "@/utilities/auth-server";

const updateUserMutation = graphql(`
  mutation UpdateUser($userId: uuid!, $displayName: String!) {
    updateUser(
      pk_columns: { id: $userId }
      _set: { displayName: $displayName }
    ) {
      id
    }
  }
`);

export type UpdateUserResult = {
  success: boolean;
  error?: string;
};

export async function updateUserAction(
  userId: string,
  displayName: string,
): Promise<UpdateUserResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Ensure user can only update their own profile
  if (user.id !== userId) {
    return { success: false, error: "Not authorized" };
  }

  try {
    await serverMutation(updateUserMutation, { userId, displayName });

    // Revalidate profile pages
    revalidatePath("/profile", "page");
    revalidatePath("/profile/edit", "page");

    return { success: true };
  } catch (error) {
    console.error("Failed to update user:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update user",
    };
  }
}
