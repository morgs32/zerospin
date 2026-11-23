---
name: zerospin-parallel-models
description: >-
  Use before designing or changing any Zerospin feature. After seed, models
  change only by command execution or replay. Original execution uses the
  addressed release. Aggregate predecessors supply initialization history.
  The Service canonical selection controls adopted history.
metadata:
  purpose: Preserve command-driven data provenance across Zerospin's parallel models.
  type: core
  library: '@zerospin/sdk'
  library_version: '46.0.0'
sources:
  - 'morgs32/zerospin:packages/system-worker/src/AggregateVersionRepo/materializeCommandTx.ts'
  - 'morgs32/zerospin:packages/system-worker/src/AggregateVersionRepo/replayCommands/replayCommand.ts'
  - 'morgs32/zerospin:packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts'
  - 'morgs32/zerospin:packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx.ts'
---

# Zerospin parallel models

**After seed, all data in Zerospin's parallel models must be created or changed
only by command execution or command replay.** This applies to creates, updates,
deletes, and moves.

**An admitted session command originally executes on its addressed owner
release.** Bind the session to the exact registered release, Actor and contract
versions. The Service `canonical` setting selects the ServiceChain's adopted
published history.

For example, a session bound to User release 2 can execute its granted
`starTask` command. If release 1 lacks the contract, it records an unsupported
replay outcome and applies no star.
Release 2 retains its own outcome and operations.

**Owner Chains stay in place across authored releases on compatible storage.**
The AggregateChain identity is the System, Aggregate name, and Aggregate ID.
The ServiceChain identity is the System and Service name. Each owner release
has its own VersionRepo and VersionChain and replays shared retained history.
`AggregateChain` captures its admitted position when it enrolls a release. A
new Aggregate release uses its declared predecessor through that position and
replays later finalized commands from `AggregateChain`. `ServiceChain` reads
its adopted prefix from the prior VersionChain until the selected canonical
release durably publishes through that prefix.

Browser optimistic execution, original execution, and replay materialize model
data through commands. Parallel aggregate releases consume the same retained
command history. A release's first evaluation runs its own registered guards and
programs against its own model state. Reconstructing a release with retained
immutable output replays its recorded model operations at the retained timestamp
and republishes that exact complete output without evaluating again. They are not
populated by querying and copying another release's model. Missing original
release output fails recovery rather than inventing replacement identities.

Authentication, admission, queries, render effects, external requests, and
administrative helpers must not directly create, backfill, synchronize, or repair
model rows. Express persisted domain changes through registered commands and
their recorded model operations. External observations become model data only
through a recorded command continuation; running a provider request is not a
model write.

For cross-owner facts, an ordinary program or recorded continuation may record
`makeCommandOperation({ destination: { service: ownerDefinition, version }, contract })`
from `@zerospin/sdk/browser` in its named operations. Aggregate destinations use
`{ aggregate: ownerDefinition, version }` and require `aggregateId` when recording.
The exact owner definition and claims-free ordinary contract must be registered
in that destination release of the same System. The
destination executes its own ordinary command to materialize its models. Original
source execution freezes the complete destination command; browser staging,
optimistic rebasing and materialization validate descriptions without producing
outbound work or allocating destination command IDs; source replay only
materializes source models and never allocates or dispatches destination commands.
Destination releases replay their own admitted command history. Changing a
historical derivation does not regenerate downstream commands: changed downstream
facts require an explicit new source command. An optional command continuation
runs in the originating exact release after the destination's final outcome.
On a release's first evaluation of a historical command, its server-only
Aggregate extension runs only when the originating release also declared an
extension for that command. It applies the target release's model effects but
does not allocate or dispatch new outgoing work. Source and target outcomes
are independent. Reconstruction from retained output applies the recorded model
operations without running the extension again.

Framework projections and snapshot installation transfer command-derived state;
they do not introduce another producer of model data. Admission/history/delivery
rows and materialization checkpoints are runtime bookkeeping rather than authored
model data.

A received `exposedDelta` carries authoritative resource changes and is applied
directly. After that baseline changes, optimistic replay reevaluates only original
commands still awaiting final evidence, using their complete payloads and current
model reads. Finalized contracts are not rerun to derive an exposed delta.

<!-- zerospin:agent-rules:start -->

## Call Zerospin constructors directly

**Never write an application factory that wraps a Zerospin `make*` constructor.**
Call the constructor directly where you define each declaration or release.
Pass its configuration as an inline object literal. Never forward a props
object, spread a shared configuration into the call, or build it with a helper.
Reuse named models, actors and contracts as values inside the literal.

For example, `userAggregateReleaseV2.ts` declares its own release.

```ts
export const userAggregateReleaseV2 = sdk.makeAggregateRelease(user, {
  version: 2,
  models: { profile: profileV1 },
  actors: { user: userActorV1 },
});
```

A helper such as `makeUserAggregateRelease(version, contracts)` hides which
models and actors each release selects. Inline its underlying SDK call at each
release declaration and delete the wrapper.

## Registered releases and history

Queries address a registered release directly. Verify its materialization
progress before assuming it has consumed a given command. Evaluate Service
promotion and release retirement separately from changing the release that a
consumer addresses.

## System registry changes

Before changing any `system.ts`, present the user with exact before-and-after
snippets of every proposed change and ask for approval. Wait for approval before
making the approved changes. The agent may then make those changes.

<!-- zerospin:agent-rules:end -->

Before proposing a cross-model read, hydration, or synchronization helper,
identify the owning model and the commands that materialize the required facts.
When required data is missing, diagnose seeding, declarations, command flow,
replay, and selections. Do not create a second write path to compensate.
