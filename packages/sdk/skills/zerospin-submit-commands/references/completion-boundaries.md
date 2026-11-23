# Submission, confirmation and failure

Read this when a UI needs to distinguish pending work from final execution, handle
uncertain delivery, or present failures.

## Public call contract

All four functions are exported from `@zerospin/sdk/browser` and take
`{ session, contractName, payload }`. Use the actual initialized session rather than
a release, and the exact name and payload registered in its public contract map.
The payload contains every business input, including named model IDs. Command
invocation has no generic `resourceId`; recording a model operation supplies that
operation's `resourceId`.

| Function                          | Return and boundary                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `validateAggregateSessionCommand` | Synchronous `IResult<void>`; rollback-only rehearsal, including application of the checked operations.  |
| `validateServiceSessionCommand`   | Synchronous `IResult<void>`; rollback-only rehearsal of the bound public guard/program and application. |
| `stageAggregateSessionCommand`    | Synchronous `IResult<submission>` after optimistic staging commits in the owning session.               |
| `stageServiceSessionCommand`      | Synchronous `IResult<submission>` after optimistic staging commits in the owning session.               |

Each recognized result is `{ _tag: 'Failure', failure }` or
`{ _tag: 'Success', success }`; validation success is void. Staging success returns
`success.sessionId`, `success.sessionIndex` and `success.stagingOutcome.result`.
Staging has no canonical command ID. Preserve its Session coordinates for handoff
recovery. The Node assigns canonical identity transactionally during handoff.
Staging and Node acceptance precede original execution. The addressed owner
release retains its `outcome` as `{ result: Success | Failure, finalizedAt }`.
Success carries `success`, Failure carries `failure`, and branch selection uses
`outcome.result._tag`.
`finalizedAt` is outside both branches. `dispositionChainHash` records replay
position integrity separately from the original admitted command's `outcome`.

Validation uses disposable IDs and retains neither commands nor projection changes.
A recognized validation refusal does not publish a session failure. Escaping defects can
still be reported and thrown; do not assume every possible failure is an `IResult`.
Staging checks readiness again. Failed local staging retains no submission work,
while a locally successful command may later fail admission or be refused by
its addressed release's guards.

The session owns background delivery, Node persistence and reconciliation after
local staging. Later handoff failures cannot rewrite a successful staging result.
Preserve retained work; do not conclude nothing was submitted or automatically
restage the action after an uncertain delivery.

## Correlate the retained command

Values typed as `ICommand` or any encoded, admitted, retained, or evaluated command remain commands. Never call these values “receipts” in variables, comments, documentation, or explanations. Use `admittedCommand`, `retainedCommand`, or `evaluatedCommand` as appropriate.

The framework delivers immutable command input and provenance, preserving its ID
through uncertain attempts. Do not call staging again to retry transport delivery:
that produces a new occurrence. A genuinely new business attempt is a separate
application decision and may require its own idempotency policy.

An admitted command carries its retained chain position. The socket admission
acknowledgement reports submission progress; neither establishes an execution
verdict or supplies an authoritative resource delta. Pending
optimism remains until final execution or a verified snapshot covers it. Execution
can arrive before the admission acknowledgement; confirmation with an empty delta still settles the
command. Snapshot/reconnect reconciliation is owned by the session, including
recovering uncertain handoff by Session coordinates and immutable input. Do not manually replay
local programs, remove optimistic rows, or treat a missing acknowledgement as a
server refusal.

Authoritative `exposedDelta` contains the recorded resource changes; receiving it
applies those changes rather than rerunning the completed contract. The Node then
rebuilds optimism only from unresolved original command inputs, and a tab replays
only local commands not covered by the received Node view. Those evaluations read
the updated model state using the business IDs retained in their payloads.

Application UIs issue commands and observe domain state through live queries.
Payment completion, for example, belongs to the purchase row rather than an
acknowledgement or the original command's final phase. Retained command rows remain
available for diagnostics: service execution uses `serviceIndex`, aggregate
execution uses `aggregateIndex`, and Node/submission/session positions have
different meanings.

## Present failures at their boundary

Subscribe to the mounted session's existing store and release the subscription
with its owning React effect or application lifetime. Mount the toast renderer
once. Observe only new nonterminal error occurrences:

```ts
const unsubscribe = session.store.subscribe((state, previous) => {
  if (
    state.failure !== null &&
    state.failure !== previous.failure &&
    state.status !== 'failed'
  ) {
    toast.error(state.failure.message);
  }
});
```

`failure` means the latest reported session error. Recognized staging, admission
and execution refusals publish fresh error instances without withdrawing
readiness. Repeated equal messages still notify. Originating command admission
and execution refusals are reported once during the active lifetime; historical
rows and duplicate deliveries stay quiet. Do not also toast a returned staging
refusal separately. A remounted subscriber does not replay a retained failure.
Use returned command results and retained command rows for command-specific
correlation, and live queries for domain outcomes.

The lifecycle statuses are `idle`, `initializing`, `ready`, `disposed` and
`failed`. General execution before initialization leaves status `idle`;
`ready` publishes usable initialized resources. Explicit disposal revokes that
capability synchronously and its Promise establishes completed cleanup. Ordinary
reinitialization waits for cleanup and preserves the latest nonterminal failure.

Query, render, startup, persistence, authentication, protocol and unexpected
connection failures stop the session. The common reporter fences execution and
publishes `status: 'failed'`, a normalized `IZerospinError` and `initialized: null`
atomically. Managed React hooks own acquisition, retry and release. `SessionReady`
contains the owning reader boundary and presents terminal errors through required
`renderError(error, retry)` without replacing public provider children.
The first terminal error survives cleanup; subsequent execution and initialization
reject with it. A failed instance requires a fresh owner. Explicit offline
transport recovery remains available.

Session execution automatically reports escaping Effect defects without changing
their original Exit/Cause. Merely returned or rejected typed application failures
are not automatically reported. Code outside session execution reports explicitly
with `session.reportFailure({ origin: 'session', error })`; recognized command
refusals use `{ origin: 'command', error }`. Connection, persistence,
authentication and protocol failures describe session availability; they do not
prove a particular admitted command's final `outcome`.

External provider work runs after original commit and completes through a later
recorded continuation. An original checkout/payment-request result cannot prove
provider success. Observe the application's authoritative domain state/evidence for
that later completion; a terminal producer failure does not rewrite the original
command's result.

Source basis: SDK browser exports;
aggregate/service staging and validation functions, common session failure
reporting and command schemas under `packages/core/src`; [pre-consolidation browser session notes](https://github.com/morgs32/zerospin/blob/79c1824b1a0353f770211851c0bfe1cc54d0ba46/packages/browser/src/browserSession/README.md),
`Node/makeSessionFailureObserver.ts`, and React session and query ownership. These
are provenance labels; this reference is self-contained.

Session staging returns Session submission coordinates and the local result synchronously, without a canonical ID. Node handoff assigns producer coordinates once per immutable submission. Recording them ends handoff retries while the overlay remains until covered by an installed Node view. Producer admission progress proves neither payload equality, execution commit nor a retained outcome.
