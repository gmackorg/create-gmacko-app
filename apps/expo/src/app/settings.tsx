import {
  supportedLocales,
  useLocaleNative,
  useTranslationsNative,
} from "@gmacko/i18n/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Stack } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import { setLocale } from "~/utils/i18n";

const PERMISSIONS = ["read", "write", "delete", "admin"] as const;
const COLLABORATION_ROLES = ["member", "admin"] as const;

function formatMoney(amountInCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountInCents / 100);
}

function formatDate(value: Date | string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function PreferencesSection() {
  const queryClient = useQueryClient();
  const _t = useTranslationsNative();
  const currentLocale = useLocaleNative();

  const { data: preferences, isLoading } = useQuery(
    trpc.settings.getPreferences.queryOptions(),
  );

  const { mutate: updatePreferences } = useMutation(
    trpc.settings.updatePreferences.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(
          trpc.settings.getPreferences.queryFilter(),
        );
      },
    }),
  );

  const handleThemeChange = (theme: "light" | "dark" | "system") => {
    updatePreferences({ theme });
  };

  const handleLanguageChange = (lang: string) => {
    void setLocale(lang);
    updatePreferences({ language: lang });
  };

  const toggleNotification = (type: "email" | "push") => {
    if (!preferences) return;

    if (type === "email") {
      updatePreferences({
        emailNotifications: !preferences.emailNotifications,
      });
    } else {
      updatePreferences({ pushNotifications: !preferences.pushNotifications });
    }
  };

  if (isLoading) {
    return (
      <View className="border-border bg-card rounded-lg border p-4">
        <Text className="text-foreground text-lg font-semibold">
          Preferences
        </Text>
        <Text className="text-muted-foreground mt-2">Loading...</Text>
      </View>
    );
  }

  return (
    <View className="border-border bg-card rounded-lg border p-4">
      <Text className="text-foreground mb-4 text-lg font-semibold">
        Preferences
      </Text>

      <Text className="text-foreground mb-2 text-sm font-medium">Theme</Text>
      <View className="mb-4 flex-row gap-2">
        {(["light", "dark", "system"] as const).map((theme) => (
          <Pressable
            key={theme}
            onPress={() => handleThemeChange(theme)}
            className={`rounded-md px-4 py-2 ${
              preferences?.theme === theme
                ? "bg-primary"
                : "border-border bg-background border"
            }`}
          >
            <Text
              className={
                preferences?.theme === theme
                  ? "text-primary-foreground"
                  : "text-foreground"
              }
            >
              {theme.charAt(0).toUpperCase() + theme.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="text-foreground mb-2 text-sm font-medium">Language</Text>
      <View className="mb-4 flex-row flex-wrap gap-2">
        {supportedLocales.map((lang) => (
          <Pressable
            key={lang}
            onPress={() => handleLanguageChange(lang)}
            className={`rounded-md px-4 py-2 ${
              currentLocale === lang
                ? "bg-primary"
                : "border-border bg-background border"
            }`}
          >
            <Text
              className={
                currentLocale === lang
                  ? "text-primary-foreground"
                  : "text-foreground"
              }
            >
              {lang.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="text-foreground mb-2 text-sm font-medium">
        Notifications
      </Text>
      <View className="gap-2">
        <Pressable
          onPress={() => toggleNotification("email")}
          className="flex-row items-center gap-2"
        >
          <View
            className={`h-5 w-5 rounded border ${
              preferences?.emailNotifications
                ? "border-primary bg-primary"
                : "border-border bg-background"
            }`}
          />
          <Text className="text-foreground">Email notifications</Text>
        </Pressable>
        <Pressable
          onPress={() => toggleNotification("push")}
          className="flex-row items-center gap-2"
        >
          <View
            className={`h-5 w-5 rounded border ${
              preferences?.pushNotifications
                ? "border-primary bg-primary"
                : "border-border bg-background"
            }`}
          />
          <Text className="text-foreground">Push notifications</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([
    "read",
  ]);
  const [newKey, setNewKey] = useState<string | null>(null);

  const { data: apiKeys, isLoading } = useQuery(
    trpc.settings.listApiKeys.queryOptions(),
  );

  const { mutate: createKey, isPending: isCreating } = useMutation(
    trpc.settings.createApiKey.mutationOptions({
      onSuccess: (data) => {
        setNewKey(data.key);
        setNewKeyName("");
        setSelectedPermissions(["read"]);
        setShowCreateForm(false);
        void queryClient.invalidateQueries(
          trpc.settings.listApiKeys.queryFilter(),
        );
      },
    }),
  );

  const { mutate: revokeKey, isPending: isRevoking } = useMutation(
    trpc.settings.revokeApiKey.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(
          trpc.settings.listApiKeys.queryFilter(),
        );
      },
    }),
  );

  const handleCreateKey = () => {
    if (!newKeyName.trim() || selectedPermissions.length === 0) return;
    createKey({
      name: newKeyName,
      permissions: selectedPermissions as (
        | "read"
        | "write"
        | "delete"
        | "admin"
      )[],
    });
  };

  const handleRevokeKey = (id: string, name: string) => {
    Alert.alert(
      "Revoke API Key",
      `Are you sure you want to revoke "${name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: () => revokeKey({ id }),
        },
      ],
    );
  };

  const togglePermission = (permission: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((p) => p !== permission)
        : [...prev, permission],
    );
  };

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", "API key copied to clipboard");
  };

  return (
    <View className="border-border bg-card mt-4 rounded-lg border p-4">
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-foreground text-lg font-semibold">API Keys</Text>
        {!showCreateForm && (
          <Pressable
            onPress={() => setShowCreateForm(true)}
            className="bg-primary rounded-md px-3 py-1"
          >
            <Text className="text-primary-foreground">New Key</Text>
          </Pressable>
        )}
      </View>

      {newKey && (
        <View className="mb-4 rounded-lg border border-green-500 bg-green-50 p-3 dark:bg-green-950">
          <Text className="mb-1 font-medium text-green-800 dark:text-green-200">
            API Key Created
          </Text>
          <Text className="mb-2 text-xs text-green-700 dark:text-green-300">
            Copy now. You won&apos;t see this again.
          </Text>
          <Pressable
            onPress={() => void copyToClipboard(newKey)}
            className="rounded bg-white p-2 dark:bg-gray-900"
          >
            <Text className="text-foreground font-mono text-xs">{newKey}</Text>
          </Pressable>
          <Pressable onPress={() => setNewKey(null)} className="mt-2">
            <Text className="text-sm text-green-700 dark:text-green-300">
              Dismiss
            </Text>
          </Pressable>
        </View>
      )}

      {showCreateForm && (
        <View className="border-border mb-4 rounded-lg border p-3">
          <Text className="text-foreground mb-2 font-medium">
            Create New API Key
          </Text>

          <TextInput
            value={newKeyName}
            onChangeText={setNewKeyName}
            placeholder="Key name"
            className="border-border bg-background text-foreground mb-3 rounded-md border px-3 py-2"
            placeholderTextColor="#888"
          />

          <Text className="text-foreground mb-2 text-sm">Permissions</Text>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {PERMISSIONS.map((permission) => (
              <Pressable
                key={permission}
                onPress={() => togglePermission(permission)}
                className="flex-row items-center gap-1"
              >
                <View
                  className={`h-4 w-4 rounded border ${
                    selectedPermissions.includes(permission)
                      ? "border-primary bg-primary"
                      : "border-border bg-background"
                  }`}
                />
                <Text className="text-foreground capitalize">{permission}</Text>
              </Pressable>
            ))}
          </View>

          <View className="flex-row gap-2">
            <Pressable
              onPress={handleCreateKey}
              disabled={
                isCreating ||
                !newKeyName.trim() ||
                selectedPermissions.length === 0
              }
              className="bg-primary rounded-md px-4 py-2"
            >
              <Text className="text-primary-foreground">Create</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowCreateForm(false);
                setNewKeyName("");
                setSelectedPermissions(["read"]);
              }}
              className="border-border rounded-md border px-4 py-2"
            >
              <Text className="text-foreground">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {isLoading ? (
        <Text className="text-muted-foreground">Loading...</Text>
      ) : apiKeys?.length === 0 ? (
        <Text className="text-muted-foreground">No API keys created yet.</Text>
      ) : (
        <View className="gap-2">
          {apiKeys?.map((key) => (
            <View
              key={key.id}
              className="border-border flex-row items-center justify-between rounded-lg border p-3"
            >
              <View className="flex-1">
                <Text className="text-foreground font-medium">{key.name}</Text>
                <Text className="text-muted-foreground text-xs">
                  {key.keyPrefix}... | {key.permissions.join(", ")}
                </Text>
                {key.lastUsedAt && (
                  <Text className="text-muted-foreground text-xs">
                    Last used: {new Date(key.lastUsedAt).toLocaleDateString()}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => handleRevokeKey(key.id, key.name)}
                disabled={isRevoking}
                className="bg-destructive rounded-md px-3 py-1"
              >
                <Text className="text-destructive-foreground">Revoke</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function CollaborationSection() {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");

  const { data: workspaceContext, isLoading: isWorkspaceLoading } = useQuery(
    trpc.settings.getWorkspaceContext.queryOptions(),
  );

  const { data: invites, isLoading: isInvitesLoading } = useQuery({
    ...trpc.settings.listInvites.queryOptions(),
    enabled: workspaceContext?.canManageWorkspace ?? false,
  });

  const { mutate: createInvite, isPending: isCreatingInvite } = useMutation(
    trpc.settings.createInvite.mutationOptions({
      onSuccess: async () => {
        setInviteEmail("");
        setInviteRole("member");
        await queryClient.invalidateQueries(
          trpc.settings.getWorkspaceContext.queryFilter(),
        );
        await queryClient.invalidateQueries(
          trpc.settings.listInvites.queryFilter(),
        );
        Alert.alert("Invite created", "The teammate invite is now pending.");
      },
      onError: (error) => {
        Alert.alert(
          "Could not create invite",
          error.message || "Try again from the current workspace.",
        );
      },
    }),
  );

  if (isWorkspaceLoading || !workspaceContext?.canManageWorkspace) {
    return null;
  }

  const handleCreateInvite = () => {
    if (!inviteEmail.trim()) {
      return;
    }

    createInvite({
      email: inviteEmail.trim(),
      role: inviteRole,
    });
  };

  return (
    <View className="border-border bg-card mt-4 rounded-lg border p-4">
      <Text className="text-foreground mb-2 text-lg font-semibold">
        Collaboration
      </Text>
      <Text className="text-muted-foreground mb-4">
        Invite teammates into{" "}
        {workspaceContext.workspace?.name ?? "this workspace"}. v1 keeps each
        account on a single active workspace and limits invites to member/admin
        roles.
      </Text>

      <Text className="text-foreground mb-2 text-sm font-medium">
        Invite teammate
      </Text>
      <TextInput
        value={inviteEmail}
        onChangeText={setInviteEmail}
        placeholder="teammate@example.com"
        className="border-border bg-background text-foreground mb-3 rounded-md border px-3 py-2"
        placeholderTextColor="#888"
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <Text className="text-foreground mb-2 text-sm font-medium">Role</Text>
      <View className="mb-4 flex-row flex-wrap gap-2">
        {COLLABORATION_ROLES.map((role) => (
          <Pressable
            key={role}
            onPress={() => setInviteRole(role)}
            className={`rounded-md px-4 py-2 ${
              inviteRole === role
                ? "bg-primary"
                : "border-border bg-background border"
            }`}
          >
            <Text
              className={
                inviteRole === role
                  ? "text-primary-foreground capitalize"
                  : "text-foreground capitalize"
              }
            >
              {role}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={handleCreateInvite}
        disabled={isCreatingInvite || inviteEmail.trim().length === 0}
        className="bg-primary mb-4 rounded-md px-4 py-3"
      >
        <Text className="text-primary-foreground text-center font-medium">
          {isCreatingInvite ? "Sending…" : "Send Invite"}
        </Text>
      </Pressable>

      <Text className="text-foreground mb-2 text-sm font-medium">
        Pending invites
      </Text>
      {isInvitesLoading ? (
        <Text className="text-muted-foreground">Loading…</Text>
      ) : invites && invites.length > 0 ? (
        <View className="gap-2">
          {invites.map((invite) => (
            <View
              key={invite.id}
              className="border-border rounded-lg border p-3"
            >
              <Text className="text-foreground font-medium">
                {invite.email}
              </Text>
              <Text className="text-muted-foreground capitalize">
                {invite.role}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-muted-foreground">No pending invites yet.</Text>
      )}
    </View>
  );
}

function BillingUsageSection() {
  const { data, isLoading } = useQuery(
    trpc.settings.getBillingOverview.queryOptions(),
  );

  if (isLoading) {
    return (
      <View className="border-border bg-card mt-4 rounded-lg border p-4">
        <Text className="text-foreground text-lg font-semibold">
          Billing & Usage
        </Text>
        <Text className="text-muted-foreground mt-2">Loading...</Text>
      </View>
    );
  }

  if (!data?.billing.visible && !data?.usage.visible) {
    return null;
  }

  return (
    <View className="border-border bg-card mt-4 rounded-lg border p-4">
      <Text className="text-foreground mb-2 text-lg font-semibold">
        Billing
      </Text>
      <Text className="text-muted-foreground mb-4">
        Billing stays per-workspace in v1, and seat billing is intentionally
        deferred.
      </Text>

      <View className="border-border mb-4 rounded-lg border p-3">
        <Text className="text-foreground font-medium">Current plan</Text>
        {data?.billing.plan ? (
          <>
            <Text className="text-foreground mt-2">
              {data.billing.plan.name}
            </Text>
            <Text className="text-muted-foreground">
              {formatMoney(
                data.billing.plan.amountInCents,
                data.billing.plan.currency,
              )}{" "}
              / {data.billing.plan.interval}
            </Text>
          </>
        ) : (
          <Text className="text-muted-foreground mt-2">
            No workspace plan is configured yet.
          </Text>
        )}
      </View>

      <View className="border-border mb-4 rounded-lg border p-3">
        <Text className="text-foreground font-medium">Subscription</Text>
        {data?.billing.subscription ? (
          <>
            <Text className="text-foreground mt-2 capitalize">
              {data.billing.subscription.status.replaceAll("_", " ")}
            </Text>
            <Text className="text-muted-foreground capitalize">
              Provider: {data.billing.subscription.provider}
            </Text>
            <Text className="text-muted-foreground">
              Current period ends{" "}
              {formatDate(data.billing.subscription.currentPeriodEnd)}
            </Text>
          </>
        ) : (
          <Text className="text-muted-foreground mt-2">
            No paid subscription is attached yet.
          </Text>
        )}
      </View>

      <View className="border-border rounded-lg border p-3">
        <Text className="text-foreground font-medium">Usage & Limits</Text>
        {data?.usage.limits.length ? (
          <View className="mt-3 gap-2">
            {data.usage.limits.map(
              (limit: (typeof data.usage.limits)[number]) => (
                <View
                  key={limit.key}
                  className="border-border rounded-md border p-3"
                >
                  <Text className="text-foreground font-medium">
                    {limit.key}
                  </Text>
                  <Text className="text-muted-foreground capitalize">
                    {limit.period.replaceAll("_", " ")}
                  </Text>
                  <Text className="text-foreground mt-1">
                    {limit.currentUsage} /{" "}
                    {limit.value === null ? "Unlimited" : limit.value}
                  </Text>
                </View>
              ),
            )}
          </View>
        ) : (
          <Text className="text-muted-foreground mt-2">
            No limits are configured yet.
          </Text>
        )}

        {data?.usage.meters.length ? (
          <View className="mt-4 gap-2">
            {data.usage.meters.map(
              (meter: (typeof data.usage.meters)[number]) => (
                <View
                  key={meter.key}
                  className="border-border rounded-md border p-3"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-foreground font-medium">
                      {meter.name}
                    </Text>
                    <Text className="text-foreground">
                      {meter.currentUsage} {meter.unit}
                    </Text>
                  </View>
                  <Text className="text-muted-foreground mt-1">
                    {meter.key} • {meter.aggregation}
                  </Text>
                  <Text className="text-muted-foreground mt-1">
                    {formatDate(meter.latestPeriodStart)} -{" "}
                    {formatDate(meter.latestPeriodEnd)}
                  </Text>
                </View>
              ),
            )}
          </View>
        ) : (
          <Text className="text-muted-foreground mt-4">
            No usage meters are configured yet.
          </Text>
        )}
      </View>
    </View>
  );
}

function AccountSection() {
  const { mutate: deleteAccount, isPending } = useMutation(
    trpc.settings.deleteAccount.mutationOptions({
      onSuccess: async () => {
        await authClient.signOut();
        Alert.alert("Account deleted", "Your account has been deleted.");
      },
    }),
  );

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your account, sessions, API keys, and preferences.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => deleteAccount(),
        },
      ],
    );
  };

  return (
    <View className="border-border bg-card mt-4 rounded-lg border p-4">
      <Text className="text-foreground mb-2 text-lg font-semibold">
        Account
      </Text>
      <Text className="text-muted-foreground mb-4">
        App Store review requires in-app account deletion when account creation
        is supported.
      </Text>
      <Pressable
        onPress={handleDeleteAccount}
        disabled={isPending}
        className="bg-destructive rounded-md px-4 py-3"
      >
        <Text className="text-destructive-foreground text-center font-medium">
          {isPending ? "Deleting…" : "Delete Account"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function SettingsScreen() {
  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ title: "Settings" }} />
      <ScrollView className="flex-1 p-4">
        <Text className="text-foreground mb-4 text-2xl font-bold">
          Settings
        </Text>
        <PreferencesSection />
        <ApiKeysSection />
        <BillingUsageSection />
        <CollaborationSection />
        <AccountSection />
      </ScrollView>
    </SafeAreaView>
  );
}
