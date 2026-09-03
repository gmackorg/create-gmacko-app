/**
 * Who is signed in, from the contract's public `auth.session` query. The
 * root loader prefetches it, so every route (and its guards) reads one
 * cached answer and the browser never asks better-auth separately.
 */
import type { SessionState } from "@gmacko/domain";
import { useSuspenseQuery } from "@tanstack/react-query";

import { queries } from "~/lib/api";

export const useSession = (): SessionState =>
  useSuspenseQuery(queries.auth.session()).data;
