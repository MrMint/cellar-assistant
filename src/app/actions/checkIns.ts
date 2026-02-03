"use server";

import { graphql } from "@cellar-assistant/shared";
import { revalidatePath } from "next/cache";
import { serverMutation } from "@/lib/urql/server";
import { getOptionalServerUser } from "@/utilities/auth-server";

const addCheckInMutation = graphql(`
  mutation AddCheckIn($checkIn: check_ins_insert_input!) {
    insert_check_ins_one(object: $checkIn) {
      id
      cellar_item {
        id
      }
    }
  }
`);

const addCheckInsMutation = graphql(`
  mutation AddCheckIns($checkIns: [check_ins_insert_input!]!) {
    insert_check_ins(objects: $checkIns) {
      affected_rows
      returning {
        id
        cellar_item {
          id
        }
      }
    }
  }
`);

export type CheckInResult = {
  success: boolean;
  checkInId?: string;
  error?: string;
};

export type BulkCheckInResult = {
  success: boolean;
  affectedRows?: number;
  error?: string;
};

export async function addCheckInAction(
  cellarItemId: string,
): Promise<CheckInResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    // Use authenticated user's ID for single check-ins
    const result = await serverMutation(addCheckInMutation, {
      checkIn: {
        user_id: user.id,
        cellar_item_id: cellarItemId,
      },
    });

    // Revalidate cellar item pages
    revalidatePath("/cellars/[cellarId]/beers/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/wines/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/spirits/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/coffees/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/sakes/[itemId]", "page");

    return {
      success: true,
      checkInId: result.insert_check_ins_one?.id,
    };
  } catch (error) {
    console.error("Failed to add check-in:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add check-in",
    };
  }
}

export async function addBulkCheckInsAction(
  cellarItemId: string,
  userIds: string[],
): Promise<BulkCheckInResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    const result = await serverMutation(addCheckInsMutation, {
      checkIns: userIds.map((userId) => ({
        user_id: userId,
        cellar_item_id: cellarItemId,
      })),
    });

    // Revalidate cellar item pages
    revalidatePath("/cellars/[cellarId]/beers/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/wines/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/spirits/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/coffees/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/sakes/[itemId]", "page");

    return {
      success: true,
      affectedRows: result.insert_check_ins?.affected_rows,
    };
  } catch (error) {
    console.error("Failed to add bulk check-ins:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to add bulk check-ins",
    };
  }
}
