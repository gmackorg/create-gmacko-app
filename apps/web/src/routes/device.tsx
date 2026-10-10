import { createFileRoute, Link } from "@tanstack/react-router";
import { Option, Schema } from "effect";

import { DeviceApprovalForm } from "~/components/device-approval-form";
import { queries } from "~/lib/api";
import type { RawSearch, SearchValue } from "~/lib/search";
import { useSession } from "~/lib/session";

/** `?user_code=ABCD-EFGH`, as `verification_uri_complete` links carry it. */
interface DeviceSearch {
  user_code?: string | undefined;
}

/** A device code is a non-empty string. Anything else in the query is absent. */
const UserCode = Schema.String.pipe(Schema.check(Schema.isMinLength(1)));
const decodeUserCode = Schema.decodeUnknownOption(UserCode);

const codeOf = (value: SearchValue): string | undefined => {
  const decoded = decodeUserCode(value);
  return Option.isSome(decoded) ? decoded.value : undefined;
};

/**
 * RFC 8628 verification page. A device (the mobile app, a CLI) shows its
 * user a short code and points them here; approving it signs that device in
 * as the current user. Anonymous visitors are not redirected: the code is
 * kept in the URL so signing in and coming back lands on the same form.
 */
export const Route = createFileRoute("/device")({
  validateSearch: (search: RawSearch): DeviceSearch => ({
    user_code: codeOf(search.user_code),
  }),
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(queries.auth.session());
  },
  head: () => ({ meta: [{ title: "Pair a device · Gmacko App" }] }),
  component: DevicePage,
});

function DevicePage() {
  const session = useSession();
  const { user_code: userCode } = Route.useSearch();

  return (
    <main className="container mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-3xl font-bold">Pair a device</h1>
        <p className="text-muted-foreground">
          Approve the code shown on your device to sign it in.
        </p>
      </div>

      {session.user ? (
        <DeviceApprovalForm initialCode={userCode ?? ""} />
      ) : (
        <div className="bg-card rounded-lg border p-6 text-center">
          <p className="text-muted-foreground mb-4 text-sm">
            You need to be signed in to approve a device.
          </p>
          <Link
            to="/"
            search={{ signin: true }}
            className="text-sm font-medium underline"
          >
            Sign in, then come back to this page
          </Link>
        </div>
      )}
    </main>
  );
}
