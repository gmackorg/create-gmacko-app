/**
 * Every query key, one entry per GET endpoint of the contract, nested under
 * its group's `all` so a group can be invalidated as a whole. The only
 * place keys are spelled; the factories and the invalidation map both read
 * from here (`__tests__/invalidation.test.ts` pins the correspondence).
 */
import type { ListUsersQuery } from "@gmacko/domain";

const root = ["gmacko"] as const;

const auth = [...root, "auth"] as const;
const posts = [...root, "posts"] as const;
const settings = [...root, "settings"] as const;
const admin = [...root, "admin"] as const;
const adminUsers = [...admin, "users"] as const;
const health = [...root, "health"] as const;

export type ListUsersInput = Partial<ListUsersQuery>;

export const queryKeys = {
  auth: {
    all: auth,
    session: () => [...auth, "session"] as const,
    secret: () => [...auth, "secret"] as const,
  },
  posts: {
    all: posts,
    list: () => [...posts, "list"] as const,
    byId: (id: string) => [...posts, "byId", id] as const,
  },
  settings: {
    all: settings,
    launchState: () => [...settings, "launchState"] as const,
    workspaceContext: () => [...settings, "workspaceContext"] as const,
    platformPrimitives: () => [...settings, "platformPrimitives"] as const,
    billingOverview: () => [...settings, "billingOverview"] as const,
    listInvites: () => [...settings, "listInvites"] as const,
    getPreferences: () => [...settings, "getPreferences"] as const,
    listApiKeys: () => [...settings, "listApiKeys"] as const,
  },
  admin: {
    all: admin,
    launchControls: () => [...admin, "launchControls"] as const,
    listWaitlistEntries: () => [...admin, "listWaitlistEntries"] as const,
    bootstrapStatus: () => [...admin, "bootstrapStatus"] as const,
    stats: () => [...admin, "stats"] as const,
    listWorkspaces: () => [...admin, "listWorkspaces"] as const,
    /** Prefix of every user list page and every user detail. */
    users: adminUsers,
    listUsers: (query: ListUsersInput = {}) =>
      [...adminUsers, "list", query] as const,
    getUser: (userId: string) => [...adminUsers, "byId", userId] as const,
  },
  health: {
    all: health,
    live: () => [...health, "live"] as const,
    ready: () => [...health, "ready"] as const,
    full: () => [...health, "full"] as const,
    forge: () => [...health, "forge"] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
