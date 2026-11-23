# Recorded external work

Read this when adapting public operations, crossing owner boundaries, or choosing
provider retry and recovery behavior.

## Shared program and provider boundary

One ordinary program records its complete model, command and same-family external
batch. Both optimistic staging and original execution run that program once per
evaluation and check its declared result and failures. Actor commands read current
selected rows and exposed columns. Owner guards retain their separate policy
scope; ordinary programs do not gain private owner reads. A claims-free
internal ordinary command invoked with System Origin can perform private owner
reads when the initiating program records an explicit command to it. Reads never
observe model operations recorded earlier in the same batch.

Keep pure model/contract/owner/external definitions in browser-safe defining files.
Backend external implementations import those exact definitions and supply request
callbacks and recorded continuation programs. The example combines the modules
for type checking. In the application, split them at the file comments and
import each declaration from its defining file. Provider authorization, bounded
retries and business idempotency remain application responsibilities.

```ts
import * as sdk from '@zerospin/sdk';
import * as browser from '@zerospin/sdk/browser';
import { Context, Effect, Schema } from 'effect';

// paymentV1.ts (browser-safe)
export const payment = browser.defineModel({
  name: 'payment',
  abbreviation: 'pay',
});
export const paymentV1 = browser.makeModelVersion(payment, {
  version: 1,
  attributes: {
    requestKey: browser.primitives.text(),
    total: browser.primitives.integer(),
    state: browser.primitives.text(),
    reference: browser.primitives.text({ nullable: true }),
  },
  indexes: [],
});
// processExternalPaymentDefinitionV1.ts (browser-safe)

export const processExternalPaymentDefinitionV1 =
  browser.defineServiceExternalContract({
    name: 'processExternalPayment',
    version: 1,
    payload: {
      id: browser.modelId({ model: payment }),
      key: browser.primitives.text(),
      total: browser.primitives.integer(),
    },
    response: Schema.Struct({ key: Schema.String, reference: Schema.String }),
  });
// requestPaymentV1.ts (browser-safe)

export const requestPaymentV1 = browser.makeServiceContractRelease(
  browser.defineServiceContract('requestPayment'),
  {
    version: 1,
    payload: processExternalPaymentDefinitionV1.payload,
    operations: {
      createPayment: paymentV1.operations.create,
      pay: processExternalPaymentDefinitionV1.externalOperation,
    },
    program: Effect.fn('requestPaymentV1.program')(function* ({
      payload,
      operations,
    }) {
      yield* operations.createPayment({
        resourceId: payload.id,
        attributes: {
          requestKey: payload.key,
          total: payload.total,
          state: 'pending',
          reference: null,
        },
      });
      yield* operations.pay({ payload });
    }),
  },
);
// processExternalPaymentV1.ts (backend only)

export class PaymentProvider extends Context.Service<
  PaymentProvider,
  {
    pay(input: { key: string; total: number }): Effect.Effect<
      {
        key: string;
        reference: string;
      },
      sdk.IAnyError
    >;
  }
>()('PaymentProvider') {}

export const processExternalPaymentV1 = sdk.makeServiceExternalContractRelease(
  processExternalPaymentDefinitionV1,
  {
    request: Effect.fn('processExternalPayment.request')(function* ({
      payload,
    }) {
      const provider = yield* PaymentProvider;
      return yield* provider.pay({ key: payload.key, total: payload.total });
    }),
    onSuccess: {
      contract: applyPaymentObservationV1,
      payload: Effect.fn('applyPaymentObservation.payload')(function* (input) {
        return yield* Effect.succeed({
          paymentId: input.payload.paymentId,
          requestKey: input.payload.key,
          reference: input.response.reference,
        });
      }),
    },
    onFailure: {
      contract: markPaymentForReconciliationV1,
      payload: ({ payload }) =>
        Effect.succeed({
          paymentId: payload.paymentId,
          requestKey: payload.key,
        }),
    },
  },
);
```

The ordinary contracts own their payload schemas, guards, programs and any
adapters across contract versions. In a payment guard, compare the admitted
request key to the current payment record before updating its state.

## Originating owner and authority

Aggregate and service external emissions supply `{ payload }`. Each external operation definition
captures the exact pure external definition whose same-family backend
implementation is registered in the emitting owner's `external` map. Original preparation
checks `implementation.external.definition` by object identity before allocating
work. The Chain retains the first `externalOutcome` on its pending row.
The pinned emitting release decodes the request payload and response or takes
the recorded request failure. Its branch builder encodes the chosen ordinary
contract's payload. The Chain appends that command under the frozen child ID
and consumes pending work in one transaction.

The ordinary continuation's declaration owns any required fields. Its guard
and program check current owner state. Replay uses the admitted command's
contract and encoded payload. It uses the ordinary contract's adapters when
versions differ and never produces another external request.

For ordinary commands in the same System, declare a browser-safe command operation:

```ts
import { Effect } from 'effect';

const updateMembership = sdk.makeCommandOperation({
  destination: { service: membershipService, version: 1 },
  contract: setMembershipV1,
});
// In the ordinary program or continuation: operations: { updateMembership }
const program = Effect.fn('program')(function* () {
  yield* operations.updateMembership({ payload: membership });
});
```

The constructor binds an exact browser-safe owner definition, explicit release
version and completed ordinary contract without actor claims. System construction
and original preparation require the same owner definition on the completed
release and the same exact contract object in its `system` map. Aggregate destinations require `aggregateId` in addition to payload.
The runtime supplies command identity and scalar `kind: 'system'`; an ordinary
recorded command keeps that kind even when emitted by a continuation. Source
Actor claims are never another owner's authority. The source transaction freezes
complete
destination commands with its model changes, result and outcome. Source refusal
retains no pending commands.

The source Chain delivers frozen operations independently outside its source
transaction. It keeps the destination's first finalized `outcome` on the pending
`commandOperationOutbox` row until settlement. An explicit terminal admission
refusal is logged with the source position, destination command and refusal
code before consuming the row. An uncertain admission retries the same frozen
command ID, which the destination Chain deduplicates.

## Destination outcomes and continuations

Declare `onSuccess` and `onFailure` branches on `makeCommandOperation` as
needed. Register each branch's exact claims-free contract in the sending
release's `contracts` inventory. The payload builders receive
`{ payload, success }` and `{ payload, failure }`, respectively. These values
come from the frozen outgoing command and its finalized destination outcome.
The source Chain recovers mapper or admission interruptions from the outcome
on the pending row. It admits the ordinary continuation and deletes the row
atomically. The continuation owns its `outcome`. Authors choose which business
facts to preserve in its payload.

## Server-only Aggregate and Service extensions

`makeAggregateContractExtension(source, { models, operations, program })` binds
an exact ordinary Aggregate contract to additional server-owned behavior. For a Service, use `makeServiceContractExtension` with an exact ordinary Service contract. Its program runs on every original invocation, including direct system calls, and can record Service model, command and external operations. Import
it from `@zerospin/sdk` and register the extension under the source command name
in the owning release’s `extensions` map. Declare its own model read
projections and exact operation definitions. The shared program's model
operations are applied before extension evaluation. The extension may read those
changes and records its own operations; both batches and outgoing intents commit
in one source transaction. A failure rolls the transaction back. On first replay
in another release, that release's extension runs only if the originating
release also declared an extension for the command. It computes target-release
model effects without re-emitting outbound work or allocating new command IDs.
Source and target outcomes can differ. Reconstructing from retained output
applies recorded model operations without reevaluating the extension.

Source replay and additional source releases materialize only source models and
allocate no destination IDs or deliveries. Optimistic staging/rebasing validates
the complete batch and likewise creates no outbound work. Model application keeps
original sparse operation indexes and inverse undo order. Destination releases replay their own
admitted history. Changing historical derivation does not regenerate downstream
commands; changed downstream facts require an explicit new source command.
Projections apply model operations only. Provider requests remain external work
with authored retry, idempotency and response evidence.

## Private observations

Use the existing administrative `getSystemApi` facade for backend reads of
declared service models. Keep the exact release and typed selection explicit:

```ts
import { getSystemApi } from '@zerospin/core/utils/getSystemApi/getSystemApi';
import { makeQueryDbVersion } from '@zerospin/sdk';
import { Effect } from 'effect';

const readProducts = Effect.fn('readProducts')(function* () {
  const api = yield* getSystemApi();
  const db = makeQueryDbVersion({ models: { product: productV1 } });
  return yield* api.executeServiceQuery({
    serviceName: 'marketplace',
    serviceVersion: 1,
    query: db.query.product.findMany({
      where: { id: { in: productIds } },
    }),
  });
});
```

The configured administrative capability supplies System authority; the selection
supplies model facts, projection and local row mapping. Service releases have no
named query registry. This read creates no admitted command, `serviceIndex` or
command `outcome`. It observes current committed materialization; it does not
reserve data, drain admitted backlog or make a later command atomic with that
observation. Recheck necessary domain facts in the owning command.

Native callers acquire `getNativeSystemApi(systemId)` from
`@zerospin/system-worker/getNativeSystemApi` and call the same typed
`api.executeServiceQuery({ serviceName, serviceVersion, query })` interface.
Selection preparation, result validation and row mapping belong to the typed
SystemApi methods; the native adapter consumes linked envelopes. Do not supply a
per-read transport callback, add a loopback URL, duplicate the mapper, or pass
administrative credentials to the browser. Browser data comes from authenticated
service actor selections and local session queries. Provider observations become
model changes only through their registered continuation.

## Retry and completion

| Retained state                        | Consequence                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| No `externalOutcome` recorded         | Alarm recovery may invoke the request again after uncertain process loss.                                   |
| Recorded Failure                      | Request production stops; the same originating Chain builds and admits the declared failure-branch command. |
| Recorded Success, including JSON null | The success builder uses the retained response. Recovery reuses that observation.                           |

`timeoutMs` defaults to 30 seconds and includes authored retry waits. There is no
framework retry-delay setting or persisted authored attempt counter. A process lost
before outcome recording permits blind recovery with a fresh authored budget;
exactly-once remote effects are not guaranteed. Use provider idempotency or reconcile
uncertain results. Continuation admission does not establish its execution or
domain success. Pending delivery acknowledgement is separate from retained Chain
history. Validate stale evidence inside the continuation, and expose domain state
for eventual success/refusal.

Source basis: SDK root/browser exports;
[pre-consolidation contract notes](https://github.com/morgs32/zerospin/blob/79c1824b1a0353f770211851c0bfe1cc54d0ba46/packages/core/src/contracts/README.md), ordinary/external constructors and external operation definitions under
`packages/core/src`; `packages/system-worker/src/externalOperations`; Shopping
`checkoutV1`, `getExternalPurchaseQuoteV1` and `processExternalPaymentV1`; ADRs 010/011.
These are provenance labels; no repository access is needed to use this reference.
