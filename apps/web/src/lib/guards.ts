/**
 * Route guards for `beforeLoad`. They take the session lookup as a
 * function (the route passes `queryClient.ensureQueryData(queries.auth.session())`)
 * so the decision is testable without a router or the API.
 */
import type { SessionState, User } from "@gmacko/domain";
import { redirect } from "@tanstack/react-router";

export type LoadSession = () => Promise<SessionState>;

/** Anonymous visitors go to the home page with the sign-in hint. */
export const requireUser = async (load: LoadSession): Promise<User> => {
  const session = await load();
  if (!session.user) {
    throw redirect({ to: "/", search: { signin: true } });
  }
  return session.user;
};

/** Signed-in non-admins go home without a hint; anonymous visitors as above. */
export const requireAdmin = async (load: LoadSession): Promise<User> => {
  const user = await requireUser(load);
  if (user.role !== "admin") {
    throw redirect({ to: "/" });
  }
  return user;
};
