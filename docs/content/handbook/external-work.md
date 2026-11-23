---
title: External work
description: Schedule server-owned requests and deterministic continuations for providers and cross-owner command requests.
order: 9
---

## Separate a provider request from resource mutation

Provider requests cannot participate in the synchronous resource transaction.
Pure external declarations and their backend implementations preserve that boundary:

1. The shared ordinary program records a same-family pure definition's exact
   `.externalOperation` with payload alone. Browser staging checks it and applies
   only the batch's model operations.
2. Original canonical execution resolves its exact owner-local backend
   implementation and freezes work with source changes and `outcome`.
3. AggregateChain or ServiceChain invokes the emitting release's backend
   `request` after commit and retains the first provider observation on the
   pending operation.
4. The pinned emitting release selects `onSuccess` for a usable response and
   `onFailure` for a recorded request failure. The selected Effect builds the
   payload of a claims-free ordinary contract registered in the emitting release’s `contracts` inventory.
   The Chain appends that command and deletes pending work in one transaction.
5. The ordinary command runs its guard and program against current owner
   state. Every replaying release consumes the admitted contract and encoded
   payload through ordinary replay and adaptation rules.

Import `defineAggregateExternalContract` and `defineServiceExternalContract` from
`@zerospin/sdk/browser` for pure name, version, payload, response and timeout
declarations. Supply the backend implementation using
`makeAggregateExternalContractRelease(definition, { request, onSuccess, onFailure })`
or its Service equivalent. Each branch supplies `{ contract, payload }`.
Its Effect receives `{ payload, response }` on success or
`{ payload, failure }` on request failure, using the decoded frozen request
payload. A usable declined payment response selects `onSuccess`.

Keep provider services in `request`. Model reads belong in the ordinary
continuation's guard or program. If the builder or admission fails, the Chain
keeps the observation for retry. Admission commits one child at its stable ID.
Execution refusal belongs to that child's own `outcome`.

## The opponent in Tic Tac Toe

The ordinary `playX` program records the board update and, while the game is in
play, `operations.playO(...)` using the pure
`playExternalOMoveDefinitionV1.externalOperation`. Browser staging applies only the
X update. Original canonical preparation freezes the payload-only O work under
the originating aggregate instance and release. `playExternalOMove` consumes that
definition, requests a square through backend `ChooseComputerMove`, and checks the
response through the definition's `Schema.Int` codec.

The continuation checks the retained board and the current authoritative game before applying O. If the move no longer fits, it fails as `invalid-move`. The external response is data for that check, not permission to bypass it.

Read the complete [ordinary X move](https://github.com/morgs32/zerospin/blob/main/examples/tic-tac-toe/src/contracts/playXV1.ts) and [external O move](https://github.com/morgs32/zerospin/blob/main/examples/tic-tac-toe/src/contracts/playExternalOMoveV1.ts). The browser stage result for X does not mean O has finished, and O's work can continue with the tab closed.

## Call another owner through its command boundary

Use browser-safe `makeCommandOperation` for an ordinary command in another
registered release of the same System:

```ts
const updateMembership = sdk.makeCommandOperation({
  destination: { service: membershipService, version: 1 },
  contract: setMembershipV1,
});
// Declare operations: { updateMembership } in the ordinary program or continuation.
yield * operations.updateMembership({ payload: membership });
```

Aggregate destinations use `{ aggregate: ownerDefinition, version: 1 }` and require
`aggregateId` when recording. The exact owner definition and claims-free ordinary
contract must be granted in that release's `system` map. System construction and
original preparation check both object identities. Original source execution
allocates and freezes the complete `kind: 'system'` command with its source changes
and `outcome`.
The source Chain independently delivers each frozen command and retains its final
destination outcome. Uncertain delivery retries the same command identity. A final
admission refusal is logged and consumes the pending operation. An interrupted delivery
retries the frozen command ID. The originating Chain keeps the first destination
execution outcome or provider observation on the pending row until settlement.
Choose the business facts you want to keep in the continuation's payload.
Destination execution or refusal remains independent of source success. Source
replay, extra parallel releases, projections and optimistic rebasing create no
fresh outgoing commands or destination IDs.

To continue in the originating owner, add `onSuccess` or `onFailure` to
`makeCommandOperation` and register every selected ordinary contract under
`contracts` on the source release. Each branch is `{ contract, payload }`.
The Effect receives `{ payload, success }` or `{ payload, failure }`.
Here `payload` is the frozen outgoing command payload. `success` is the
decoded destination result, and `failure` is the destination command's
finalized execution failure. The pinned sending release builds the payload
and its Chain admits the ordinary command. A finalized destination outcome
selects the branch independently of work the destination emits. If continuation
admission is interrupted, the sending Chain retries with the retained destination
outcome and the same child ID.

For an Aggregate source contract, `makeAggregateContractExtension` adds a
server-only program with its own projections and operations. Register it under
`extensions` on the source release. Shared model operations apply before the
extension reads, and both batches and recorded outgoing work commit together.
A failure rolls them back. On first replay in another release, its extension
runs only if the originating release also declared an extension for the command.
It applies the target release's model effects without producing additional
outbound work. Reconstruction from retained output does not reevaluate it.

For an API outside that System, an authored external request may acquire an explicit
backend capability. Keep credentials out of browser code and retained payloads, and
reuse remote business idempotency keys across uncertain retries. Its recorded
continuation returns to the originating owner; provider evidence grants no authority
to bypass another owner's command rules.

## Freeze checkout lines before requesting a quote

Shopping keeps the cart and purchase together in the user aggregate. Checked `checkoutV1` creates a preparing purchase and frozen purchase-item rows and links the cart. The same ordinary program records the pure aggregate-owned quotation operation from that snapshot.

Its request reads a typed Marketplace product selection and derives a quote outside the model transaction. The response carries authoritative names, prices and a total, or a typed refusal. The continuation validates it against the frozen lines before recording prices, moving payment to pending and scheduling `processExternalPayment`. A quotation failure can safely refuse checkout because no payment was requested.

Payment uncertainty is different: a provider may have charged before its response was lost. Record `needs_reconciliation` and retain the cart lock. A paid result clears the matching cart items and updates the same purchase atomically; decline leaves the cart editable. The UI observes that retained purchase through its cart query.

Read the [ordinary Shopping checkout](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/zerospin/aggregates/user/contracts/checkoutV1.ts) and [quotation continuation](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/zerospin/aggregates/user/contracts/getExternalPurchaseQuoteV1.ts). Neither the local staging result nor the quotation command's completion represents a completed payment.

## Register declarations explicitly

The owner release’s `contracts` inventory includes explicitly listed versions
and contracts declared in its Actor, System and external grants. Register each
ordinary operation follow-up explicitly in `contracts`. Its recorded operation
and branch grant invocation. A successor can keep a contract in its inventory
for replay after removing the branch that produced it. Agent grants separately
bind exact versions from their owner release.
Each backend external implementation is registered in `release.external`. The
implementation retains its pure object as `contract.external.definition`. Every emitted definition must resolve to that
same-family implementation. Actor claims checks inspect the resolved implementation.
Recorded continuations retain the originating owner/release and immediate
`originCommandId`, with `claims: null` in their guard/program. Backend external
implementations cannot declare a claims codec. The retained work occurrence
provides continuation authority; the continuation has no Actor claims or Node
submission position. It uses canonical owner reads and its own guard/program,
without an Actor-specific guard or browser command allowlist entry.

The ordinary program receives decoded payload, claims, declared failures, scoped
reads, named recording methods and aggregate instance identity where applicable.
Actor commands retain selected rows and columns. Guards cannot record operations;
reads observe pre-application state throughout collection. Both evaluation contexts
check the complete batch/result, while only original canonical execution prepares
outgoing work. Escaping failure discards the complete evaluation, and whole-evaluation
retries use a fresh collector. Result encoding finishes before operation application.

Fresh settlement invokes the emitting release to select and encode the
ordinary continuation. Recovery reuses the first retained observation until
the child command and pending-row deletion commit. The admitted command
contains the authored continuation payload for replay.

## Design retries at the provider boundary

Durable scheduling does not make an external API exactly-once. A connection can fail after a provider processed a request. Use provider idempotency and stable domain identities where the provider supports them; inspect the example's provider adapter before choosing the key. Do not invent a new purchase or payment identity each time a continuation is retried.

The pure definition's `timeoutMs` bounds the complete backend request Effect,
including authored retries and delays; it defaults to 30 seconds. The first
`externalOutcome` records either `{ _tag: 'Success', success, recordedAt }` or
`{ _tag: 'Failure', failure, recordedAt }`. A successful JSON-null response has
`success: null`; absence of an observation is a separate state. A request failure
means no usable response was obtained and can still leave the provider's result
uncertain. Storage failure belongs to infrastructure recovery, not to a fabricated
provider observation. An admitted continuation retry uses the retained observation
without repeating the request. The continuation can handle either observation
branch and still commit a successful command `outcome.result`.

An originating command's retained `outcome` is independent of the continuation's
later `outcome`. Represent payment state, delivery status, or a tracking label in domain resources and make the UI observe that state. Shopping permits tracking only for paid purchases. Avoid a generic “done” toast that combines all those stages.

The [server and external-work guide](/guides/server-and-external-work) covers the executable path, including server commands and the exact finalization boundary.
