import { type ApiKeyScope, CreateApiKeyForm } from "@gmacko/domain";
import { ApiKeyRow } from "@gmacko/ui/api-key-row";
import { ApiKeySecret } from "@gmacko/ui/api-key-secret";
import { Button } from "@gmacko/ui/button";
import { Field, FieldContent, FieldError, FieldLabel } from "@gmacko/ui/field";
import { Input } from "@gmacko/ui/input";
import { Label } from "@gmacko/ui/label";
import { SettingsCard, SettingsPanel } from "@gmacko/ui/settings-card";
import { toast } from "@gmacko/ui/toast";
import { useForm } from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useApiErrorHandler } from "~/components/use-api-error";
import { mutations, queries } from "~/lib/api";

const SCOPES: ReadonlyArray<ApiKeyScope> = ["read", "write", "delete", "admin"];

export function ApiKeysSection() {
  const { data: apiKeys } = useSuspenseQuery(queries.settings.listApiKeys());
  const onError = useApiErrorHandler();
  const [secret, setSecret] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const create = useMutation({
    ...mutations.settings.createApiKey(),
    onSuccess: (created) => {
      setSecret(created.key);
      setShowCreate(false);
      form.reset();
    },
    onError: (error) => onError(error, "Could not create the API key."),
  });
  const revoke = useMutation({
    ...mutations.settings.revokeApiKey(),
    onSuccess: () => toast.success("API key revoked."),
    onError: (error) => onError(error, "Could not revoke the API key."),
  });

  const form = useForm({
    defaultValues: {
      name: "",
      permissions: ["read"] as ReadonlyArray<ApiKeyScope>,
    },
    validators: { onSubmit: CreateApiKeyForm },
    onSubmit: async ({ value }) => {
      const [first, ...rest] = value.permissions;
      if (first === undefined) return;
      await create
        .mutateAsync({ name: value.name.trim(), permissions: [first, ...rest] })
        .catch(() => undefined);
    },
  });

  return (
    <SettingsCard
      title="API Keys"
      data-testid="api-keys"
      actions={
        showCreate ? null : (
          <Button onClick={() => setShowCreate(true)} size="sm">
            Create New Key
          </Button>
        )
      }
    >
      {secret ? (
        <ApiKeySecret
          secret={secret}
          onDismiss={() => setSecret(null)}
          onCopied={() => toast.success("Copied to clipboard.")}
        />
      ) : null}

      {showCreate ? (
        <SettingsPanel title="Create New API Key">
          <form
            noValidate
            className="mt-4 space-y-4"
            data-testid="create-api-key-form"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.Field
              name="name"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldContent>
                      <FieldLabel htmlFor="keyName">Key Name</FieldLabel>
                    </FieldContent>
                    <Input
                      id="keyName"
                      name={field.name}
                      placeholder="My API Key"
                      className="max-w-sm"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            />
            <form.Field
              name="permissions"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <Label className="mb-2 block">Permissions</Label>
                    <div className="flex flex-wrap gap-2">
                      {SCOPES.map((scope) => (
                        <label key={scope} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name={`permission-${scope}`}
                            checked={field.state.value.includes(scope)}
                            onChange={(event) =>
                              field.handleChange(
                                event.target.checked
                                  ? [...field.state.value, scope]
                                  : field.state.value.filter(
                                      (p) => p !== scope,
                                    ),
                              )
                            }
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <span className="capitalize">{scope}</span>
                        </label>
                      ))}
                    </div>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            />
            <div className="flex gap-2">
              <form.Subscribe
                selector={(state) => state.isSubmitting}
                children={(isSubmitting) => (
                  <Button
                    type="submit"
                    disabled={isSubmitting || create.isPending}
                  >
                    Create Key
                  </Button>
                )}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreate(false);
                  form.reset();
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </SettingsPanel>
      ) : null}

      <div className="space-y-3">
        {apiKeys.length === 0 ? (
          <p className="text-muted-foreground">No API keys created yet.</p>
        ) : (
          apiKeys.map((apiKey) => (
            <ApiKeyRow
              key={apiKey.id}
              apiKey={apiKey}
              disabled={revoke.isPending}
              onRevoke={(id) => {
                if (
                  !window.confirm(
                    "Are you sure you want to revoke this API key? This cannot be undone.",
                  )
                ) {
                  return;
                }
                revoke.mutate(id);
              }}
            />
          ))
        )}
      </div>
    </SettingsCard>
  );
}
