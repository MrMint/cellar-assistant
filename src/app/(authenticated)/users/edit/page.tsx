import { notFound } from "next/navigation";
import { EditProfileClient } from "@/components/user/EditProfileClient";
import { GetUserEditQuery } from "@/components/user/fragments";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function EditProfile() {
  const userId = await getServerUserId();
  const data = await serverQuery(GetUserEditQuery, { userId });

  if (!data.users_by_pk) {
    notFound();
  }

  // Pass both userId and user data to client component
  return (
    <EditProfileClient
      userId={userId}
      userData={
        data.users_by_pk as {
          id: string;
          displayName: string;
          email: unknown;
          avatarUrl: string;
        }
      }
    />
  );
}
