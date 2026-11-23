---
title: Run server commands and external work
description: Keep trusted endpoints and provider effects on the backend, with retained identities and replay-safe continuations.
order: 9
---

## Prerequisites

Understand [command completion](/guides/write-commands) and [contracts](/handbook/contracts-and-operations). You need a backend owner/actor, an application server endpoint for trusted requests where necessary, and provider services supplied through the release's Layer. This guide follows Tic Tac Toe's backend opponent and Shopping's checkout/payment flow.

## Execute administrative commands

Use one exact owner release with the typed SystemApi:

```ts
const outcome =
  yield *
  api.executeServiceCommand(marketplaceServiceReleaseV1, {
    contractName: 'createProduct',
    payload: {
      id: 'prd_one',
      name: 'T-shirt',
      description: 'Classic cotton tee',
      price: 2000,
    },
  });
```

Only names in `marketplaceServiceReleaseV1.system` are eligible. The facade
validates and freezes ID-less input before transport. AggregateChain or ServiceChain
allocates each invocation's position and canonical ID inside its admission transaction.
Re-executing the Effect creates another command, including after an ambiguous timeout.
Inspect `outcome.result._tag`; business Failure is finalized outcome data and invocation
failures use the Effect error channel. Authored programs must handle repeated business
attempts; the facade adds no implicit retry or outcome cache. Aggregate execution uses
`api.executeAggregateCommand(release, { aggregateId, contractName, payload })`.
The [SDK reference](/reference/sdk#administrative-owner-reads) shows server-only HTTP
acquisition; Native acquisition uses the same typed facade. An ordinary release
may also have an explicit Actor or Agent grant, without acquiring a fixed category.

## Share the ordinary program and separate provider code

One ordinary program records model, command and same-family pure external
operations during both optimistic and canonical evaluation. Browser staging
validates the complete batch and applies only model operations. It creates no
destination command IDs and invokes no provider. Original canonical execution
prepares the outgoing intents and commits them with local changes and `outcome`.

Import ordinary constructors, `makeCommandOperation`, owner definitions and pure
external definitions from `@zerospin/sdk/browser`. Backend implementations use
`makeAggregateExternalContractRelease(definition, { request, onSuccess, onFailure })` or the service
equivalent from `@zerospin/sdk`. Keep provider Layers, bindings, secrets, owner
authentication and continuation implementations in the backend graph.

## Schedule work in the ordinary move program

Tic Tac Toe registers the same `playX` object in its browser session, backend
actor; the owner derives its ordinary inventory from that Actor grant. Its existing move guard validates the current selected game.
The ordinary program records the X update and an O request while the game remains
in play. These fields belong directly to that contract:

```ts
result: Schema.Null,
operations: {
  updateGame: game.operations.update,
  playO: playExternalOMoveDefinitionV1.externalOperation,
},
program: Effect.fn('playX.program')(function* ({ payload, operations }) {
  const board = payload.board.slice(0, payload.square) + 'X' +
    payload.board.slice(payload.square + 1);
  yield* operations.updateGame({ resourceId: payload.id, attributes: { board } });
  if (outcome(board) === 'playing') {
    yield* operations.playO({ payload: { id: payload.id, board } });
  }
  return null;
}),
```

The [ordinary move](https://github.com/morgs32/zerospin/blob/main/examples/tic-tac-toe/src/contracts/playXV1.ts)
imports only the [pure external definition](https://github.com/morgs32/zerospin/blob/main/examples/tic-tac-toe/src/contracts/playExternalOMoveDefinitionV1.ts),
which owns name/version/payload/response/timeout and the exact emission descriptor.
The backend [O implementation](https://github.com/morgs32/zerospin/blob/main/examples/tic-tac-toe/src/contracts/playExternalOMoveV1.ts)
consumes that same definition and supplies the provider request and two branches.
Each branch defines an ordinary contract and an Effect to build its payload.
The owner release resolves exact definition identity before preparing work.
The recording accepts payload alone; aggregate identity and release come from
originating execution. Completed games record no O request. An escaping failure
rolls back the entire source transaction.

## Provide the external dependency

The example's provider is a small Effect service:

```ts title="src/chooseComputerMove.ts"
import { Context, Effect, Layer } from 'effect';

export class ChooseComputerMove extends Context.Service<
  ChooseComputerMove,
  (board: string) => Effect.Effect<number>
>()('ChooseComputerMove') {}

export const deterministicComputerMove = Layer.succeed(
  ChooseComputerMove,
  board => Effect.succeed(board.indexOf('.')),
);
```

The external request resolves that service; `makeAggregateRelease` supplies its Layer. A real provider replaces that dependency, and its external response codec must describe the actual response. The success builder puts the square and frozen board in the `recordComputerMove` command. Its program checks the current board before applying the move. Replay consumes the admitted `recordComputerMove` payload through the receiving release's ordinary contract.

Use this same separation for payment and shipping. Network I/O must happen outside the synchronous model transaction. The continuation checks evidence and emits owner-local operations; a stale response cannot blindly overwrite newer state.

## Follow checkout through its domain state

Shopping stages an ordinary authenticated user-aggregate `checkout({ cartId, purchaseId })`. The shared program creates a preparing purchase, freezes product IDs and quantities in purchase items, and links the cart to that purchase. That same program records `getExternalPurchaseQuoteDefinitionV1.externalOperation` alongside those model writes. It does not charge prices supplied by the browser.

The external request uses the backend `ShoppingSystemApi` capability to call a typed read-only Marketplace product selection and derives the quote. Configure backend `SHOPPING_ZEROSPIN_API_URL` and `ZEROSPIN_SECRET_KEY`; neither belongs in browser configuration or external-operation payloads. Clerk verification and owner authorization remain in the ordinary session boundary. A dedicated checkout HTTP endpoint is unnecessary.

The quotation continuation validates line identities, product IDs, quantities, nonnegative prices and the safe total before recording authoritative prices and queuing `processExternalPayment`. Expected quote refusals are typed response data. Refusal or an unavailable read-only quote records `refused` and leaves the cart editable; no charge has begun.

The existing payment request runs outside the transaction with the retained key `shopping:<aggregateId>:<purchaseId>:payment`. The request release maps a usable payment response into `applyPaymentObservation` and a request failure into `markPaymentForReconciliation`. Both commands check the current cart pointer and pending purchase against their own admitted payloads. A paid outcome and clearing that cart's items commit together. Decline preserves the cart; uncertain payment records `needs_reconciliation` and keeps it locked. A new checkout cannot bypass that uncertainty.

The button renders one cart query including its items and `checkoutPurchase`. The pointer remains after settlement, preserving the final outcome without component state, timers or subscriptions. Staging success means local journal commit; a command acknowledgement never means payment completion.

Shipping retains purchase, label and refresh-sequence identities independently. Paid purchases alone can request tracking work; repeated work coalesces and stale observations fail their checks. The payment and carrier implementations are deterministic examples, not real provider integrations.

## Retry the same intent after an uncertain response

The session owns command handoff and reconciliation. Applications do not create a new command merely because an acknowledgement has not arrived. The purchase ID is generated once per checkout click and retained in the original command payload.

External requests can repeat during recovery. Provider idempotency keys must remain stable, and the provider must honor them. Zerospin's replay discipline does not make an arbitrary payment API exactly once. Quote refusals and payment outcomes are retained domain state, while genuine command refusals use the session notification layer.

## Check the behavior

Use Shopping's existing scoped source checks and [authored-behavior tests](/guides/test-authored-behavior)
for frozen checkout, quote validation, decline, payment uncertainty, recorded
responses and tracking refusal. Use Workerd checks for durable delivery and
recovery. Shopping prohibits browser-driven verification. Tic Tac Toe's existing
harness cases exercise the opponent continuation and Actor-selected reads/guards;
they do not prove closed-tab recovery.

See [External work](/handbook/external-work), [Failures and recovery](/handbook/failures-and-recovery), and the [SDK reference](/reference/sdk).
