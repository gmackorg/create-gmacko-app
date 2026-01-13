export type Theme = "light" | "dark" | "system";

export interface UserPreferences {
  theme: Theme;
  language: string;
  timezone: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: ApiKeyPermission[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}

export type ApiKeyPermission = "read" | "write" | "delete" | "admin";

export interface CreateApiKeyInput {
  name: string;
  permissions: ApiKeyPermission[];
  expiresInDays?: number;
}

export interface CreateApiKeyResult {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  permissions: ApiKeyPermission[];
  expiresAt: Date | null;
}
