import { redirect } from "next/navigation";

/**
 * `/users` is not a page — it was the dead target of `/users/edit`'s old
 * "Profile" crumb, a bare framework 404 (UX review obs 52). Your profile is
 * the Me tab; a friend's is `/users/<id>`.
 */
export default function UsersIndex() {
  redirect("/me");
}
