# Integrate

A partner does not receive a hand-written OpenAPI file. The API they call is the Forge package in [`forge/`](../forge). The compiler writes the contract, the OpenAPI document, and a TypeScript client from those declarations.

The running web Worker still serves the Effect `HttpApi` at `/api/*`. That is the app the browser and Expo use today. The Forge package is the integration API new apps ship to other businesses. [ADR 0002](./adr/0002-forge-is-the-integration-api.md) records that split.

## What you declare

A customer is one resource. `@crud` is the list, read, create, update, and delete API. You do not write those five routes.

```forge
/// A customer of the business. Partners read and create these.
export resource Customer
  @tenant
  @timestamps
  @crud("/v1/customers")
{
  id : id
  name : text length 1..200
  email : email?
}
```

A call that is not ordinary record-keeping is one function. This one tells a partner that a customer changed.

```forge
shape NotifyPartnerInput {
  customer : Customer
  event : text length 1..64
}

shape NotifyPartnerResult {
  accepted : boolean
}

/// Tell a partner that a customer changed. The caller is another business system.
export function NotifyPartner @http(POST, "/v1/integrations/notify") {
  input NotifyPartnerInput
  output NotifyPartnerResult
}
```

That is the whole integration surface: [`forge/src/customers/customer.forge`](../forge/src/customers/customer.forge) and [`forge/src/partner/notify.forge`](../forge/src/partner/notify.forge).

## What a partner can call

`forgec 0.5.0` turns that source into these operations:

| Call | Path |
| --- | --- |
| Create a customer | `POST /v1/customers` |
| List customers | `GET /v1/customers` |
| Read one customer | `GET /v1/customers/{id}` |
| Update a customer | `PATCH /v1/customers/{id}` |
| Delete a customer | `DELETE /v1/customers/{id}` |
| Notify a partner | `POST /v1/integrations/notify` |

`POST /v1/integrations/notify` takes a customer reference and an event name (`1..64` characters) and returns `{ "accepted": true }` or `{ "accepted": false }`.

Create accepts `name` (1–200 characters) and an optional `email`. Reads and writes are scoped to the caller's tenant.

## What the partner sends

Create a customer. `email` may be omitted. The call uses the contract's bearer credential. `Idempotency-Key` is optional: the same key and the same body replay the stored result.

```http
POST /v1/customers
Authorization: Bearer <token>
Content-Type: application/json

{ "name": "Northwind", "email": "ap@northwind.example" }
```

The response record has `id`, `name`, `email`, `createdAt`, and `updatedAt`. The API fills in `id`, `createdAt`, and `updatedAt`. A list returns `items`, `next`, and `limit` (`limit` defaults to 50 and stops at 100).

```json
{
  "id": "northwind",
  "name": "Northwind",
  "email": "ap@northwind.example",
  "createdAt": "2026-10-09T20:15:00.000Z",
  "updatedAt": "2026-10-09T20:15:00.000Z"
}
```

Tell another system that the customer changed. `customer` is that id. `event` is 1–64 characters.

```http
POST /v1/integrations/notify
Content-Type: application/json

{ "customer": "<customer id>", "event": "customer.updated" }
```

```json
{ "accepted": true }
```

The same page is in the app at `/integrate`.

## Check it

Install forgec 0.5.0, then from the repo root:

```sh
forgec check forge
forgec build forge --out forge/generated --service-id gmacko
```

`pnpm forge:api` runs both. The build writes:

- `forge/generated/contract.json` — the ForgeGraph contract
- `forge/generated/openapi.json` — OpenAPI 3.1 for the same operations
- `forge/generated/client.ts` — a typed client

`forge/generated/` is build output and is not committed.

## Publish it

When the app is registered in ForgeGraph, publish the contract for the commit you shipped:

```sh
forge contract publish --app <app> --file forge/generated/contract.json --commit <sha>
```

The Forge console then lists these operations under Integrations. A partner, or the playground, calls them through that contract. Adding a field to `Customer` and running `forgec build` again is how the contract changes. There is no second spec to edit.

## Add the next call

Put a new resource or `@http` function under `forge/src/`. Run `pnpm forge:api`. If the new document is the API you want partners to call, publish the new `contract.json`.
