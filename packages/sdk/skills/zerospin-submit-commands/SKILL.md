---
name: zerospin-submit-commands
description: >-
  Use when validating or staging Zerospin aggregate or service session commands,
  tracking their identities, or handling optimistic, admission, execution
  and later external outcomes. Session construction and contract authoring are
  separate tasks.
metadata:
  purpose: Submit ordinary session commands and distinguish each completion and failure boundary.
  type: core
  library: '@zerospin/sdk'
  library_version: '38.1.1'
requires:
  - zerospin-parallel-models
---

# Submit and observe session commands

Values typed as `ICommand` or any encoded, admitted, retained, or evaluated command remain commands. Never call these values “receipts” in variables, comments, documentation, or explanations. Use `admittedCommand`, `retainedCommand`, or `evaluatedCommand` as appropriate.

First load `pnpm exec intent load @zerospin/sdk#zerospin-parallel-models` and
apply its model-data invariant throughout this task.

1. Use an initialized session and its exact public contract map. Import
   `validateAggregateSessionCommand`, `stageAggregateSessionCommand`,
   `validateServiceSessionCommand` and `stageServiceSessionCommand` from
   `@zerospin/sdk/browser`. Each takes `{ session, contractName, payload }`.
   Names and payloads follow the selected Actor's explicit contract grant. Put named business IDs
   and all other contract inputs in that payload. `resourceId` belongs to model
   operations, not command invocation.
2. Use synchronous validation to rehearse guards, programs and operation
   application. It returns `IResult<void>` and rolls back changes with disposable
   IDs. Recognized refusals remain silent. Validation cannot reserve authority or
   predict admission or the execution outcome. Staging reevaluates.
3. Aggregate and service staging return an `IResult` synchronously after local
   optimistic work commits to the session's journal. The session owns background
   delivery, Node persistence and reconciliation. Staging success does not prove
   server execution. Branch on
   `_tag`: `Failure` carries `failure`; `Success` carries the Session submission in `success`.
   Retain `(success.sessionId, success.sessionIndex)` for correlation; it has no canonical ID. `success.stagingOutcome.result` is the local
   result. The addressed release originally executes the admitted command and
   retains its `outcome` as `{ result: Success | Failure, finalizedAt }`. Inspect
   `outcome.result._tag`. `finalizedAt` sits outside both result branches. A
   different release's replay outcome describes that release's evaluation.
4. Let the session deliver and recover retained work under its original command
   identity. Local Actor drafts have flat identity fields; the Node allocates the
   required `nodeId`, `sessionName` and `pushIndex` before submitting the command
   for admission.
   Stable session/ticket identities remain separate. Admitted commands carry their retained chain positions. Only execution
   `outcome` or a covering verified snapshot settles optimism, even when no
   resources changed. Server guards can refuse a locally successful action. Do
   not restage after an uncertain delivery to simulate transport retry.
   Received `exposedDelta` applies authoritative recorded changes. Optimistic
   replay evaluates only unresolved original inputs against the updated baseline;
   it does not rerun finalized contracts to reconstruct their changes.
5. In React, pass `{ onFailure }` as the managed session hook's third argument
   to observe new nonterminal failures before initialization and through recovery.
   Other hosts subscribe to changed nonnull `session.store.failure` occurrences
   with `status !== 'failed'` and release that subscription with their lifetime.
   Avoid toasting the same returned staging refusal separately. Terminal React
   errors belong to `SessionReady`'s required `renderError(error, retry)`. Observe
   provider evidence and domain completion through live queries; those outcomes
   belong to a later continuation. Never wait for persistence, delivery or original
   execution before navigation, cleanup or account changes. Use existing checks
   for authored behavior and state any runtime verification gap.

Canonical commands have scalar `kind` and applicable fields at the command
root. Actor submissions require their complete Node tuple. Automatic Agent and
System commands omit that tuple. External observations produce claims-free
external commands with their own frozen ID and immediate `originCommandId`; callers
cannot submit those through ordinary or administrative APIs.

## Administrative execution

Call the typed administrative facade with one exact owner release:

```ts
import { Effect } from 'effect';

const createProduct = Effect.fn('createProduct')(function* () {
  // Aggregate input additionally supplies aggregateId.
  return yield* api.executeServiceCommand(marketplaceServiceReleaseV1, {
    contractName: 'createProduct',
    payload: { id: 'prd_one', name: 'T-shirt', price: 2000 },
  });
});
```

Names and payloads infer only from `release.system`. The method validates and
encodes immutable ID-less input when the operation is constructed. Each Effect execution, including an authored retry after an ambiguous timeout, admits a new command and awaits that invocation's outcome. Reusing an ordinary release in an Actor or Agent
map does not grant System execution. A seed module exports one named `seeds`
program of type `ISeedProgram`; it owns sequential execution and must fail on a
business Failure before submitting the next command.

Administrative `executeAggregateCommand`, `executeServiceCommand` and aggregate
authorization’s `executeCommand` return the retained `ICommandOutcome` directly,
with `{ result: Success | Failure, finalizedAt }`. Both administrative methods
accept only ordinary System commands. Inspect `outcome.result._tag`;
a finalized business rejection remains in `outcome.result`, while API/framework
failures use the Effect/RPC failure channel. Success remains JSON: use the
ordinary contract codec and the submitted command’s name/version to decode a
business value. Direct System retries create new commands; business programs must handle repeated attempts. Recorded commands retain their separate immutable-ID recovery path. These calls wait for the original command’s outcome, not later
external work. Admission acknowledgements still carry retention and position.

For failure presentation, confirmation, or uncertain delivery, read
[completion boundaries](references/completion-boundaries.md).

Agent browser Sessions observe confirmed selected resources. The independent Agent release is the automatic Agent’s session definition. During `onWake`, `yield* stageCommand(commandRef, payload)` runs the granted ordinary contract locally using the Agent’s identity and its exact owner binding. The typed local result and optimistic model changes are available inside the transaction. The owner performs authoritative execution and dispatches external requests. Confirmation of the original command ID retires its optimism even if the exposed delta is empty.
