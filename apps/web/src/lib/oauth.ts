/**
 * The browser side of better-auth's OAuth provider (`/api/auth/oauth2/*`),
 * for the pages it redirects to: `/oauth/sign-in`, `/oauth/workspace`,
 * `/oauth/consent`. Each arrives with the authorization request in its query
 * string, signed by the provider (`sig`, `exp`, `ba_*`). Whatever goes back to
 * the provider is built from `window.location.search`, never the router's
 * search (`location.searchStr` is re-serialised from the parsed values, which
 * can change the bytes the signature covers); the router's copy is only read
 * for display.
 */
import { DEFAULT_SCOPES, isScope, OAUTH_SCOPES } from "@gmacko/domain";
import { Option, Schema } from "effect";

/** The provider's signing parameters; everything else is the client's request. */
const SIGNING_PARAMS = new Set(["sig", "exp", "ba_iat", "ba_pl", "ba_param"]);

const paramsOf = (searchStr: string) =>
  new URLSearchParams(
    searchStr.startsWith("?") ? searchStr.slice(1) : searchStr,
  );

/**
 * The `oauth_query` the provider's `continue` and `consent` endpoints verify:
 * the signature and exactly the parameters it lists in `ba_param`.
 */
export const signedOAuthQuery = (searchStr: string): string => {
  const params = paramsOf(searchStr);
  const signed = new Set(params.getAll("ba_param"));
  const kept = new URLSearchParams();
  for (const [key, value] of params) {
    if (key === "sig" || key === "ba_param" || signed.has(key)) {
      kept.append(key, value);
    }
  }
  return kept.toString();
};

/**
 * The client's original authorization request, to start it again once the
 * user is signed in. Without the signing parameters it is exactly what the
 * client sent, so restarting it grants nothing the client could not ask for.
 */
export const authorizeUrl = (searchStr: string): string => {
  const params = paramsOf(searchStr);
  for (const name of SIGNING_PARAMS) params.delete(name);
  return `/api/auth/oauth2/authorize?${params.toString()}`;
};

/** The requested scopes the consent page offers, split into what it shows and pre-ticks. */
export const requestedScopes = (searchStr: string) => {
  const requested = (paramsOf(searchStr).get("scope") ?? "")
    .split(" ")
    .filter((scope) => scope.length > 0);
  const offered = OAUTH_SCOPES.filter((scope) => requested.includes(scope));
  return {
    offered,
    preselected: offered.filter((scope) => DEFAULT_SCOPES.includes(scope)),
    /**
     * Requested values that are not permissions (`offline_access`, for a
     * refresh token); passed through on approval, never shown as a checkbox.
     */
    passthrough: requested.filter((scope) => !isScope(scope)),
  };
};

/** The host the client will send the user back to, for the consent screen. */
export const redirectHost = (searchStr: string): string => {
  const uri = paramsOf(searchStr).get("redirect_uri");
  if (uri === null) return "an unknown address";
  try {
    return new URL(uri).host;
  } catch {
    return "an unknown address";
  }
};

export const clientIdOf = (searchStr: string): string | null =>
  paramsOf(searchStr).get("client_id");

/** The provider's answers, decoded at this boundary. */
const decodeRedirect = Schema.decodeUnknownOption(
  Schema.Struct({ url: Schema.String }),
);
const decodeOAuthError = Schema.decodeUnknownOption(
  Schema.Struct({ error_description: Schema.String }),
);
const decodePublicClient = Schema.decodeUnknownOption(
  Schema.Struct({ client_name: Schema.optional(Schema.String) }),
);

/**
 * POSTs to one of the provider's browser endpoints and answers the URL it
 * redirects to: the next page of the flow, or back to the client.
 */
export const postOAuth = async (
  endpoint: "continue" | "consent",
  body: Readonly<Record<string, string | boolean>>,
): Promise<string> => {
  const response = await fetch(`/api/auth/oauth2/${endpoint}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  const redirect = decodeRedirect(payload);
  if (response.ok && Option.isSome(redirect)) return redirect.value.url;
  throw new Error(
    Option.match(decodeOAuthError(payload), {
      onNone: () => `The authorization server answered ${response.status}.`,
      onSome: (error) => error.error_description,
    }),
  );
};

/** The provider's public view of a client: its name, for the consent screen. */
export const fetchClientName = async (clientId: string): Promise<string> => {
  const response = await fetch(
    `/api/auth/oauth2/public-client?${new URLSearchParams({ client_id: clientId })}`,
    { credentials: "same-origin" },
  );
  const payload: unknown = await response.json().catch(() => null);
  const name = Option.flatMap(decodePublicClient(payload), (client) =>
    Option.fromNullishOr(client.client_name),
  ).pipe(Option.map((value) => value.trim()));
  return Option.isSome(name) && name.value !== "" ? name.value : "An app";
};
