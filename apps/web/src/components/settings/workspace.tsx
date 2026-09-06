import { CreateInvite, CreateInviteForm } from "@gmacko/domain";
import { Button } from "@gmacko/ui/button";
import { Field, FieldContent, FieldError, FieldLabel } from "@gmacko/ui/field";
import { Input } from "@gmacko/ui/input";
import { Select } from "@gmacko/ui/select";
import { SettingsCard } from "@gmacko/ui/settings-card";
import { toast } from "@gmacko/ui/toast";
import { useForm } from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";

import { useApiErrorHandler } from "~/components/use-api-error";
import { mutations, queries } from "~/lib/api";

/**
 * The caller's workspace and, for owners/admins, the invite allowlist.
 * `listInvites` is `Forbidden{reason: "role"}` for anyone else, so it is
 * only asked for when `canManageWorkspace` says so.
 */
export function WorkspaceSection() {
  const { data: context } = useSuspenseQuery(
    queries.settings.workspaceContext(),
  );
  const name = context.workspace?.name ?? "this workspace";

  return (
    <SettingsCard
      title="Workspace"
      data-testid="workspace"
      description={
        context.workspace
          ? `${context.workspace.name} (${context.workspace.slug}) · your role: ${context.workspaceRole ?? "none"}`
          : "You are not a member of a workspace yet."
      }
    >
      {context.canManageWorkspace && context.workspace ? (
        <Collaboration workspaceName={name} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Workspace owners and admins can invite teammates from here.
        </p>
      )}
    </SettingsCard>
  );
}

function Collaboration({ workspaceName }: { workspaceName: string }) {
  const { data: invites } = useSuspenseQuery(queries.settings.listInvites());
  const onError = useApiErrorHandler();
  const create = useMutation({
    ...mutations.settings.createInvite(),
    onSuccess: (invite) => {
      form.reset();
      toast.success(`Invite created for ${invite.email}.`);
    },
    onError: (error) => onError(error, "Could not create the invite."),
  });
  // Typed as the contract's wire shape (role optional, defaulting
  // server-side) so the Standard Schema validator and the form agree.
  const defaultValues: (typeof CreateInvite)["Encoded"] = {
    email: "",
    role: "member",
  };
  const form = useForm({
    defaultValues,
    validators: { onSubmit: CreateInviteForm },
    onSubmit: async ({ value }) => {
      await create
        .mutateAsync({
          email: value.email.trim(),
          role: value.role ?? "member",
        })
        .catch(() => undefined);
    },
  });

  return (
    <div className="space-y-6" data-testid="collaboration">
      <p className="text-muted-foreground text-sm">
        Invite teammates into {workspaceName}. v1 keeps each account on a single
        active workspace and limits invites to member/admin roles.
      </p>

      <form
        noValidate
        className="space-y-4"
        data-testid="invite-form"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
          <form.Field
            name="email"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <FieldContent>
                    <FieldLabel htmlFor="inviteEmail">Email</FieldLabel>
                  </FieldContent>
                  <Input
                    id="inviteEmail"
                    name={field.name}
                    type="email"
                    placeholder="teammate@example.com"
                    required
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          />
          <form.Field
            name="role"
            children={(field) => (
              <Field>
                <FieldContent>
                  <FieldLabel htmlFor="inviteRole">Role</FieldLabel>
                </FieldContent>
                <Select
                  id="inviteRole"
                  name={field.name}
                  value={field.state.value ?? "member"}
                  onChange={(event) =>
                    // The two options below are the whole choice; anything
                    // else the DOM could carry is not one of them.
                    field.handleChange(
                      event.target.value === "admin" ? "admin" : "member",
                    )
                  }
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </Select>
              </Field>
            )}
          />
          <div className="flex items-end">
            <form.Subscribe
              selector={(state) => state.isSubmitting}
              children={(isSubmitting) => (
                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  disabled={isSubmitting || create.isPending}
                >
                  Send Invite
                </Button>
              )}
            />
          </div>
        </div>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Pending invites</h3>
          <span className="text-muted-foreground text-sm">
            {invites.length}
          </span>
        </div>

        {invites.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No pending invites yet.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="invite-list">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between rounded-lg border px-4 py-3"
                data-invite-email={invite.email}
              >
                <div>
                  <p className="font-medium">{invite.email}</p>
                  <p className="text-muted-foreground text-sm capitalize">
                    {invite.role}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
