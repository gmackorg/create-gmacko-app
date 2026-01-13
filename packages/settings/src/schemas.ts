import { z } from "zod/v4";

export const themeSchema = z.enum(["light", "dark", "system"]);

export const userPreferencesSchema = z.object({
  theme: themeSchema.default("system"),
  language: z.string().default("en"),
  timezone: z.string().default("UTC"),
  emailNotifications: z.boolean().default(true),
  pushNotifications: z.boolean().default(true),
});

export const updateUserPreferencesSchema = userPreferencesSchema.partial();

export const apiKeyPermissionSchema = z.enum([
  "read",
  "write",
  "delete",
  "admin",
]);

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(apiKeyPermissionSchema).min(1),
  expiresInDays: z.number().int().positive().optional(),
});

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  permissions: z.array(apiKeyPermissionSchema),
  createdAt: z.date(),
  lastUsedAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
});
