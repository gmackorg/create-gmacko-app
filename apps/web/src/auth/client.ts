import { authClientPlugins } from "@gmacko/auth/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ plugins: authClientPlugins() });
