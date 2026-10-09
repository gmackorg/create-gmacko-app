import { createFileRoute } from "@tanstack/react-router";

import {
  MarketingCard,
  MarketingPage,
  marketingHead,
} from "~/components/marketing";

const DESCRIPTION =
  "A partner gets six calls from two Forge declarations: a customer record, and one notification when that customer changes.";

const CALLS = [
  ["POST", "/v1/customers", "Create a customer. Name is required."],
  ["GET", "/v1/customers", "List customers. Limit defaults to 50."],
  ["GET", "/v1/customers/{id}", "Read one customer."],
  ["PATCH", "/v1/customers/{id}", "Change the name, the email, or both."],
  ["DELETE", "/v1/customers/{id}", "Delete a customer."],
  ["POST", "/v1/integrations/notify", "Tell another system it changed."],
] as const;

export const Route = createFileRoute("/integrate")({
  head: marketingHead("Integrate", DESCRIPTION),
  component: IntegratePage,
});

function IntegratePage() {
  return (
    <MarketingPage
      eyebrow="Integrate"
      title="A partner calls six routes"
      description={DESCRIPTION}
    >
      <div className="space-y-4">
        <MarketingCard>
          <h2 className="font-semibold">What you declare</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            A customer is one resource. <code>@crud</code> is the list, read,
            create, update, and delete API. A change notification is one
            function. You do not write those routes, and you do not write an
            OpenAPI file.
          </p>
          <pre className="bg-muted mt-4 max-w-full overflow-x-auto rounded-xl p-4 text-xs leading-5">
            {`export resource Customer
  @tenant
  @timestamps
  @crud("/v1/customers")
{
  id : id
  name : text length 1..200
  email : email?
}

shape NotifyPartnerInput {
  customer : Customer
  event : text length 1..64
}

shape NotifyPartnerResult {
  accepted : boolean
}

export function NotifyPartner @http(POST, "/v1/integrations/notify") {
  input NotifyPartnerInput
  output NotifyPartnerResult
}`}
          </pre>
        </MarketingCard>
        <MarketingCard>
          <h2 className="font-semibold">The six calls</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {CALLS.map(([method, path, detail]) => (
              <li
                key={`${method} ${path}`}
                className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1"
              >
                <code className="font-semibold">{method}</code>
                <code className="break-all">{path}</code>
                <span className="text-muted-foreground col-start-2">
                  {detail}
                </span>
              </li>
            ))}
          </ul>
        </MarketingCard>
        <MarketingCard>
          <h2 className="font-semibold">What the partner sends</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Create a customer with a name and an optional email. The call uses
            the contract&apos;s bearer credential. <code>Idempotency-Key</code>{" "}
            is optional: the same key and body replay the stored result.
          </p>
          <pre className="bg-muted mt-4 max-w-full overflow-x-auto rounded-xl p-4 text-xs leading-5">
            {`POST /v1/customers
Authorization: Bearer <token>
Content-Type: application/json

{ "name": "Northwind", "email": "ap@northwind.example" }`}
          </pre>
          <p className="text-muted-foreground mt-4 text-sm">
            The response is the customer record. <code>id</code>,{" "}
            <code>createdAt</code>, and <code>updatedAt</code> are filled in by
            the API. A list returns <code>items</code>, <code>next</code>, and{" "}
            <code>limit</code>.
          </p>
          <pre className="bg-muted mt-4 max-w-full overflow-x-auto rounded-xl p-4 text-xs leading-5">
            {`{
  "id": "northwind",
  "name": "Northwind",
  "email": "ap@northwind.example",
  "createdAt": "2026-10-09T20:15:00.000Z",
  "updatedAt": "2026-10-09T20:15:00.000Z"
}`}
          </pre>
          <p className="text-muted-foreground mt-4 text-sm">
            Tell another system it changed. <code>customer</code> is that id.{" "}
            <code>event</code> is 1–64 characters.
          </p>
          <pre className="bg-muted mt-4 max-w-full overflow-x-auto rounded-xl p-4 text-xs leading-5">
            {`POST /v1/integrations/notify
Content-Type: application/json

{ "customer": "<customer id>", "event": "customer.updated" }`}
          </pre>
          <p className="text-muted-foreground mt-4 text-sm">
            The partner gets back whether the notice was accepted:
          </p>
          <pre className="bg-muted mt-4 max-w-full overflow-x-auto rounded-xl p-4 text-xs leading-5">
            {`{ "accepted": true }`}
          </pre>
        </MarketingCard>
        <MarketingCard>
          <h2 className="font-semibold">Where this lives</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Those declarations are the Forge package in <code>forge/</code>.{" "}
            <code>pnpm forge:api</code> checks them with forgec 0.5.0 and writes
            the contract, the OpenAPI document, and a TypeScript client. This
            web app still serves its own screens through <code>/api</code>.
          </p>
        </MarketingCard>
      </div>
    </MarketingPage>
  );
}
