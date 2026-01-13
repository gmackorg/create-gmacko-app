import { authRouter } from "./router/auth";
import { postRouter } from "./router/post";
import { settingsRouter } from "./router/settings";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  post: postRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
