import {
  type WaitlistSource,
  WaitlistSubmit,
  WaitlistSubmitForm,
} from "@gmacko/domain";
import { Button } from "@gmacko/ui/button";
import { Field, FieldContent, FieldError, FieldLabel } from "@gmacko/ui/field";
import { Input } from "@gmacko/ui/input";
import { MarketingCard } from "@gmacko/ui/marketing-page";
import { Textarea } from "@gmacko/ui/textarea";
import { toast } from "@gmacko/ui/toast";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";

import { mutations } from "~/lib/api";
import { toastApiError } from "~/lib/errors";
import { useSession } from "~/lib/session";

/**
 * The public waitlist / contact form: one `settings.submitWaitlistEntry`
 * per submit, validated client-side with the contract's `WaitlistSubmit`
 * schema, so the server's 400 is never the first thing a person sees.
 */
export function WaitlistForm(props: {
  source: WaitlistSource;
  title: string;
  description: string;
  buttonLabel: string;
}) {
  const session = useSession();
  const submit = useMutation({
    ...mutations.settings.submitWaitlistEntry(),
    onSuccess: (submission) => {
      form.reset();
      toast.success(
        submission.status === "pending"
          ? "Thanks! You're on the list; we'll be in touch."
          : `Thanks! Your request is ${submission.status}.`,
      );
    },
    onError: (error) => toastApiError(error, "Could not submit your request."),
  });

  const form = useForm({
    // Typed as the contract's wire shape (message and source optional) so
    // the Standard Schema validator and the form agree.
    defaultValues: {
      email: session.user?.email ?? "",
      message: "",
      source: props.source,
    } as (typeof WaitlistSubmit)["Encoded"],
    validators: { onSubmit: WaitlistSubmitForm },
    onSubmit: async ({ value }) => {
      const message = value.message?.trim() ?? "";
      await submit.mutateAsync({
        email: value.email.trim(),
        source: value.source ?? props.source,
        ...(message.length > 0 ? { message } : {}),
      });
    },
  });

  return (
    <MarketingCard>
      <form
        noValidate
        data-testid="waitlist-form"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">{props.title}</h2>
          <p className="text-muted-foreground text-sm">{props.description}</p>
        </div>

        <div className="mt-6 space-y-4">
          <form.Field
            name="email"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <FieldContent>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                  </FieldContent>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="email"
                    required
                    placeholder="name@company.com"
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
            name="message"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <FieldContent>
                    <FieldLabel htmlFor={field.name}>Message</FieldLabel>
                  </FieldContent>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    rows={4}
                    placeholder="Tell us a bit about what you want to build."
                    value={field.state.value ?? ""}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          />
          <form.Subscribe
            selector={(state) => state.isSubmitting}
            children={(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting || submit.isPending}>
                {props.buttonLabel}
              </Button>
            )}
          />
        </div>
      </form>
    </MarketingCard>
  );
}
