import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { queries } from "~/lib/api";
import { isUnauthorized, toastApiError } from "~/lib/errors";

/**
 * The mutation `onError` for signed-in screens: a toast for every failure,
 * and for `Unauthorized` (the session expired under the form) a trip back to
 * the sign-in shell with the `?signin=1` hint.
 */
export const useApiErrorHandler = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useCallback(
    (error: Error, fallback?: string) => {
      toastApiError(error, fallback);
      if (isUnauthorized(error)) {
        // The cached session is stale by definition; refetch it so the home
        // page renders for the anonymous visitor the server now sees.
        void queryClient
          .invalidateQueries({ queryKey: queries.auth.session().queryKey })
          .then(() => navigate({ to: "/", search: { signin: true } }));
      }
    },
    [navigate, queryClient],
  );
};
