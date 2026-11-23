# Aggregate delivery, history and projection ownership

**Agent callback amendment — Plan 309 (2026-11-17):** [ADR 029](029-independent-agent-command-callbacks.md) supersedes Agent embedding, selection replay, attempted-wake scheduling and replacement/initialization clauses. Agent projections compute selected deltas from owner history. Stable execution Repos own selected-model tables, pending rule deadlines and pending delivery for the current installation. Other ownership and retention responsibilities remain governing.

**Canonical input-history amendment — Plan 277 (2026-10-27):** [ADR 025](025-canonical-published-history-handoff.md) replaces permanent local admission-input retention and arbitrary-ID retry lookup with one adopted canonical publication prefix, source/Agent producer checkpoints and fresh-ID direct System calls. AggregateChain/ServiceChain retain original delivery and pending-work ownership; first external observations survive admission backpressure on those pending rows. VersionChain local publication acknowledgement permits source adoption before independent Archive acknowledgement. Only these placement/retry/observation clauses are replaced; resource/history separation, exact release interpretation, request ownership, projection/private history and physical Archive rules remain governing. Behavioral verification is recorded in [Plan 277](../archive/plans/277-plan-canonical-chain-history-handoff.md).

**Agent release amendment — Plan 262 (2026-10-25):** Agent declaration identity, release selection, upgrade scheduling, wake-marker identity and observer binding clauses below are superseded by [ADR 021](021-independent-agent-releases.md). Other ownership and retention decisions remain governing.

**Date:** 2026-10-15
**Archive retention amendment:** [ADR 024](024-version-chain-sql-archives.md) governs physical evaluated-history relocation into SQL Archives; logical retained history and projection ownership remain unchanged.
**Status:** Accepted. Plans 189/190 and the Plan 202 `commands`/history-backed actor delivery amendment were implemented and verified on 2026-10-15. The Plan 203 history-backed agent delivery amendment was implemented and verified on 2026-10-15.
**Plan 204 amendment:** The uniform structured-identity queue API was implemented and verified with a four-column actor row. The actor identity amendment below replaces that row.
**Plan 206 amendment:** The three-column agent subscriber model and bound-owner queue binding are implemented and verified.
**Partial supersession:** [ADR 016](016-aggregate-original-operations-and-external-work.md) supersedes the Aggregate original-output, external-request ownership and duplicate-recovery portions below. AggregateChain now retains original `outcome` on `commands` plus complete pending external requests and runs those requests; Service and all other governing rules remain unchanged.
**Agent simplification amendment — Plan 151 (2026-10-21):** The unversioned Agent Node Repo, owner-release view identity, public-only Agent history and exact admission-receipt decision below supersede earlier Agent version/producer/private-completion requirements, including the relevant parts of Plans 210–212/249. Actor recovery and unrelated verification obligations remain governing. Earlier Node scheduling, enrollment and observer-independence results retain their recorded scope; current public-history/socket reconciliation belongs to Plans 211/212.
**Implementation:** [Plans 189](../archive/plans/189-plan-aggregate-command-execution-resolution.md), [190](../archive/plans/190-plan-aggregate-delivery-history-and-projection-ownership.md), [202](../archive/plans/202-plan-aggregate-version-chain-commands-and-actor-fanout.md) and [203](../archive/plans/203-plan-aggregate-version-chain-agent-fanout.md).
**Actor subscriber amendment:** [Plan 204](../archive/plans/204-plan-aggregate-actor-fanout-subscriber-identity.md).
**Agent subscriber amendment:** [Plan 206](../archive/plans/206-plan-aggregate-agent-fanout-subscriber-identity.md).
**Actor exposed-command amendment:** [Plan 207](../archive/plans/207-plan-actor-model-exposure-and-aggregate-command-names.md), implemented and verified 2026-10-16; the corresponding Service actor decision is recorded in ADR 015.
**Agent exposed-command amendment:** [Plan 211](../archive/plans/211-plan-agent-exposed-command-history.md) retains five public fields under the exact owner-release view. Plan 151/249 supersedes its intermediate private resolution child, producer recovery and independent Agent version. Current public-history/observer verification resumed on 2026-10-23; all 107 scoped System Worker tests across 25 files pass on 2026-10-23. Six new cases prove frozen publication retries after post-commit reply loss/reconstruction, immutable public history and real observer resume/hibernation/live/error cleanup. Trusted forwarded headers establish local observer transport, not authenticated opening or provider/deployed behavior.
**Agent connection capability amendment:** [Plan 212](../archive/plans/212-plan-agent-derived-connection-capabilities.md) retains table-free authored capability derivation, exact observer attachment checks and teardown. Full locks still contain ordinary contract definitions; Agent sockets grant no command-submission capability. Its current public-observer proof is reconciled with Plan 211, using the existing Plan 249/257 evidence within its recorded limits.
**Aggregate pending external-request amendment:** [Plan 213](../archive/plans/213-plan-aggregate-external-operation-outbox.md) implements the six-column AggregateChain model; scoped verification completed 2026-10-23. Four direct production-class Workerd cases establish physical SQL shape, atomic original receipt and observation admission/deletion, exact context, sparse retained AVC history and unchanged retry after reconstruction/native alarms. All 86 System Worker tests across 25 files pass with required typing/build dependencies. Trusted internal Actor input, seeded queue rows and authored provider probes leave authentication, a complete authored continuation journey and deployed/provider timing outside this proof. This Aggregate amendment changed no Service pending storage; Plan 219 independently applies its six-field model. No production changes, persistent-store reset or deployment in this verification.
**Session-ticket amendment:** [Plan 221](../archive/plans/221-plan-session-ticket-admission-cleanup.md) retains Aggregate Actor/Agent full-lock admission under [ADR 008](008-ordinary-and-recorded-continuation-authority.md), with session identity derived from that lock. The Agent Node binds observation/resume, not command production. Scoped verification completed on 2026-10-23: actual four-family ticket issue/spend and exact captured Aggregate forwarding; finite responses do not prove Aggregate socket lifecycles. This amendment changes no Aggregate Chain storage or protocol and does not close Agent observation lifecycle verification.
**Partial supersession:** [ADR 014](014-synchronous-original-finalization.md) replaces only the split original-dispatch/original-outcome protocol. The remaining ownership, publication/fanout, projection, privacy and external-work decisions below continue to govern.
**Supersedes:** [ADR 007](./007-canonical-results-and-selected-chain-ownership.md) for Aggregate execution-history and selected-view physical ownership. Its immutable catalogue, identity, privacy and browser lifetime guarantees remain governing; [ADR 015](015-service-delivery-history-and-projection-ownership.md) now governs Service ownership.

## Decision

AggregateChain owns admitted input and original outcome. AggregateVersionRepo
owns release resources and `finalizeCommand`: synchronous evaluation, successful
application or public refusal, and atomic retention of a minimal
materialization head plus complete pending deliveries. AggregateVersionChain owns immutable
release-local `commands` and history-backed actor/agent delivery with independent subscriber cursors.
No `executedCommands` or `modelOperations` journal remains in AggregateVersionRepo.

The resource transaction writes a complete `IEvaluatedAggregateCommand` to `aggregateVersionChainOutbox`.
Original finalization returns that complete evaluated command directly; AggregateChain
validates the bound reply and retains the first exact `outcome` after
predecessor validation. Duplicate finalization recovers pending publication or
immutable AggregateVersionChain history without reevaluation. The former separate
outcome message and dispatch flag are superseded by
[ADR 014](014-synchronous-original-finalization.md). Each remaining pending message
is deleted only after its own receiver commits. Original/replay order and business
savepoint behavior remain governed by [ADR 005](./005-ordered-original-execution-and-finalized-replay.md).

AggregateVersionChain atomically appends immutable `commands`. Both logical fanout
queues deliver from those commands; neither has a separate physical payload table.
Every retained command is the full
`IEvaluatedAggregateCommand`: admitted input with canonical `id`, `outcome`,
`dispositionChainHash` and ordered operations. Its `aggregateVersion` preserves the
original admission release; the bound AggregateVersionChain identifies the evaluating
release. Parent `outcome.finalizedAt` supplies source and projection application time.
Model operations retain explicit model versions and original sparse indexes.

The `actorVersionChainFanout` and `agentVersionChainFanout` queues read complete
commands through AggregateVersionChain's Archive-backed history reader. Neither
queue owns a separate fanout payload copy or backfill. Durable Archive acknowledgement
permits covered local copies to be pruned under ADR 024. Actor and agent subscriber cursors, fixed-tip paging, source-bound
capabilities, producer leases and durable alarm recovery remain independent.
A successful AggregateActorVersionRepo or AggregateAgentVersionRepo receipt proves
that Repo committed resource changes, materialization progress and complete pending
selected publication together. Only then does AggregateVersionChain advance the
corresponding subscriber's acknowledgement. This does not establish publication
to AggregateActorVersionChain or AggregateAgentVersionChain. Lost receipts may
redeliver the same immutable command; projection progress prevents reapplication.
Late projection activation catches up from retained commands and enrolls its committed
cursor; commands cover the catch-up/enrollment interval. Neither acknowledgement
nor enrollment deletes logical retained history. Physical relocation and the
independent Archive acknowledgement follow ADR 024; projection progress does not
establish archival durability.

`actorVersionChainFanoutSubscribers` stores exactly three non-null columns:
`actorName`, `actorPath`, `acknowledgedAggregateIndex`, with composite uniqueness
over the actor pair. AggregateVersionChain validates requested `actorVersion`
against its bound immutable Aggregate release before extracting the stored pair.
Complete AggregateActorVersionRepo keys retain `actorVersion`, derived from that
release alongside the Chain's bound owner fields. No full name, packed substitute,
hash or synthetic identity is stored. This fixed-schema cutover requires empty
affected AggregateVersionChain storage; no reset is authorized or performed, and
no compatibility migration or fallback exists. Agent identity is unchanged.

`agentVersionChainFanoutSubscribers` stores exactly two non-null columns:
unique `agentName` and `acknowledgedAggregateIndex`. The bound
AggregateVersionChain owner reconstructs AggregateAgentVersionRepo's complete key
from Agent name plus its owner release. This table
stores no complete physical name, packed replacement identity or actor path.
Individual agent session `nodeId` values do not define separate projections.

The shared queue binds named identity columns and Effect conversions between
complete Repo keys and stored identity records. Enrollment, conflict handling,
lookup, acknowledgement and bounded SQL selection use the complete identity.
Availability and in-flight/failed exclusion run before the selection limit.
Other owners bind their existing one-field identity through this same API and
retain their existing physical schemas. Queue RPCs retain `currentIndex`; both
Aggregate subscriber tables name the SQL fact `acknowledgedAggregateIndex`.

An absent actor or agent row means unenrolled; zero means enrolled without an
acknowledged command. Atomic enrollment and successful page receipts advance
acknowledgement monotonically; reaching the source tip keeps membership for future
commands. Each source acknowledgement can lag the corresponding
AggregateActorVersionRepo or AggregateAgentVersionRepo materialization head after
a lost receipt and does not establish selected-history publication to that
projection's Chain. Catch-up/enrollment sequencing, fixed-tip drains,
independent recipient settlement, producer leases and durable alarm recovery
remain governing. This amendment adds no authored-availability, retirement,
unsubscribe, expiry or failure-gate policy.

AggregateActorVersionRepo and AggregateAgentVersionRepo own resource graphs,
selection and projection progress. Their transaction applies operations, computes
selected entry/exit deltas, advances progress and writes complete pending selected
publication. Retaining the full release graph is currently required because
selection `where.RAW` SQL has no complete declared dependency boundary. Browser
output still contains selected rows only. Aggregate and Service actor declarations
name their published model/column graph `exposedModels`; their canonical query
`db.models`, contract models and session-lock `models` retain their separate roles.

AggregateActorVersionRepo's `exposedCommandOutbox` stores exactly
`aggregateIndex`, `dispositionChainHash`, canonical admitted `id`, `commandName`,
frozen selected `delta` and nullable `commandResolution`. A present
`commandResolution` contains required `nodeId`, `pushIndex`, `sessionName` and the
full original encoded `claims`, plus nullable public `failure`. It exists only
for a complete producer belonging to the bound actor version and projection
identity. The immutable bound owner supplies actor kind/name/version; those
constants are not repeated in resolution storage.

AggregateActorVersionChain atomically appends the public five-field
`exposedCommands` row and its optional `commandResolutions` child before one
publication acknowledgement. `commandResolutions.aggregateIndex` is both its
primary key and a foreign key to `exposedCommands`; `(nodeId, pushIndex)` is unique.
The child retains full claims, session and producer metadata and nullable failure.
Insertion seals either that exact resolution or its absence. An exact retry must
match the public row and joined resolution-or-null; attaching a resolution later,
changing it, conflicting command IDs or leaving a position gap fails the page.
There is no independent resolution insertion, queue, acknowledgement or stream.

Private recovery reads local `commandResolutions` bounded by the captured
aggregate position, proves full claims/node/session ownership and advances only a
contiguous push prefix. Public replay and live delivery join that optional child,
reconstruct actor Origin from the bound owner, and expose `failure` only to the
admitted recipient. `IAggregateExposedCommand` retains nullable `failure` on the
existing browser stream. Synchronous replay tail delivery and transition to live
remain one turn. No private recovery is derived from AggregateVersionChain.

AggregateAgentVersionRepo's exposedCommandOutbox and
AggregateAgentVersionChain's exposedCommands retain only five public fields:
aggregateIndex, dispositionChainHash, canonical admitted id, commandName and
frozen selected delta. Every evaluated command keeps its position, including
Failure, no-op and empty selected deltas. Append validates exact public duplicate
equality and contiguous positions before acknowledgement; publication deletes
only the receiving Repo's pending message, never retained Chain history.
There is no Agent commandResolution, commandResolutions, private bootstrap or
outcome polling. Actor private history above remains unchanged.

Agent definitions are unversioned and registered at system.agents[agentName].
The selected view's identity is `(systemId, aggregateName, aggregateId,
aggregateVersion, agentName)`. Version means Aggregate release. SystemRepo freezes
selection/capability/session meaning under `(aggregate, aggregateName,
aggregateVersion, agentName)`; changed meaning requires a new owner release.
Agent Origin retains only kind and agentName. The current scheduled definition
is not consulted again for permission when replaying admitted commands through
their retained owner/contract context.

AggregateAgentNodeRepo is a separate unversioned MigratableDO keyed by
`(systemId, aggregateName, aggregateId, agentName)`. It consumes public Agent Chain
history and owns local selected resources, applied aggregateVersion/aggregateIndex/
dispositionChainHash, sparse attemptedAgentWakes and complete commandDeliveryOutbox rows.
A present materializationHead initializes index zero too. Selected materialization
is required by this separate durable ownership; it is not retained history.
Commit selected resources, checkpoint and marker reconciliation in the same
synchronous transaction. Due processing commits its marker and complete frozen
command together.

attemptedAgentWakes stores only required behaviorKey/resourceId with unique pair
identity. Row presence records an attempt; selected resources and the exact
applied behavior supply nullable deadlines. Reconciliation validates every
selected scheduled row and deadline before baseline commit or page acknowledgement,
including pairs with existing markers. Due processing inserts the marker and
freezes the command in one synchronous transaction. Matching markers remain
through null-deadline changes and owner-pin replacement. Selection exit prunes
the marker while preserving already frozen delivery.
Retiming, recurring schedules and eligibility re-entry are outside this one-shot
behavior. A retained execution Failure creates no new automatic attempt.

Frozen automatic commands retain canonical id, exact owner/contract versions and
Agent Origin with null nodeId/sessionName/pushIndex. Retry the complete command
unchanged. Delete delivery only after validating a receipt containing exact
frozen input and a valid canonical admission index. Pending delivery refuses
activation under a changed owner pin; drain it under the old pin before deploying
the new binding. After drainage, install the new baseline/checkpoint atomically,
preserve matching attempted markers and reject old-source pages.

AggregateAgentVersionChain has one fixed AggregateAgentNodeRepo recipient,
derived from Chain identity, and one nodeDeliveryAcknowledgement row. Durable
catch-up/enrollment covers gaps; acknowledgement advances delivery progress
without deleting retained public history. AggregateAgentNodeRepo explicitly owns
WakeRegistry; RecoveryRegistry remains recovery-only. The concrete onAlarm hook
runs the registry Effect once, and makeMigratableDORepo constructs neither registry.
WakeRegistry establishes one-second retry protection before next-wake readers
and executing passes; a reader failure leaves that alarm intact. The runtime
captures applied head, selected resources and markers synchronously together,
derives deadlines only under the matching owner pin and retains pending-delivery
retries independently. The Agent pass rechecks time and eligibility before command creation.

AggregateAgentVersionChain retains no physical `connectionLocks` table, full-lock
copy, connection index or replacement capability storage. Single-use ticket
admission decodes the complete initial lock, Origin and observer nodeId, validates
the exact bound Agent and Aggregate release, and requires whole authored-lock
equality. [`resolveAgentSessionContext`](../../packages/system-worker/src/aggregateSessionChain/resolveAgentSessionContext.ts)
resolves that named Agent under its exact owner release/session context.
`makeAggregateSessionLock` and `makeConnectionCapabilities` derive readable names
from the Agent's selected `db.models` and exact ordinary contract-name/version
pairs, excluding external contracts. Contract definitions in that lock grant no
browser command-submission authority. The Aggregate release's larger model graph
and another Agent or owner release cannot supply capabilities.

SystemRepo's ticket admission retains the complete AggregateSessionLock and
canonical Origin without an outer session-name copy. Ticket-local lock validation
requires a nonempty session name; Aggregate Origin/lock identity agreement remains
mandatory. A nonempty observer Agent `nodeId` is required before secret generation,
hashing or insertion, while Aggregate Actor `nodeId` remains nullable. Agent Origin
contains kind/name without an independent Agent version. Matching-family atomic
single-use deletion precedes decoding, expiry checks and forwarding; later failure
does not restore the credential. Selected owner routing and actual claims retain
their existing responsibilities under ADR 008.

The trusted WebSocket attachment is per-connection admission and phase state.
Before Agent message or broadcast capability reads, its complete shape must match
the bound Aggregate ID/name/version, Agent Origin kind/name, exact declared
session and nonempty issued Node. Replaying/live state must retain that same Node.
Agent sockets only resume observation and carry no command submissions or private
completion cursor. Actor command admission and private recipient checks retain
their existing responsibilities. AggregateSessionChain captures
the configured `System` and explicitly supplies it for synchronous broadcast
capability derivation; no RPC, asynchronous lookup, cache or registry is added.
Final replay delivery and transition to live remain one synchronous turn.

Agent installation writes only the attachment. Agent disposal invalidates its
authority before closing the original accepted socket and attempts both even if
either throws. Failed installation, including defects or interruption, failed
notices/sends, invalid state and socket errors must dispose that socket. Structured
cleanup prevents a failed send from skipping teardown. Actor `connectionLocks`,
SQL cleanup and activation reconciliation, and every Service storage path retain
their responsibilities.

The [Plan 212](../archive/plans/212-plan-agent-derived-connection-capabilities.md) connection
cutover requires empty affected Agent Chain storage with no reset, migration,
fallback, installation marker or replacement capability copy. Plan 151 subsequently removes Agent commandResolutions while preserving public
exposedCommands and complete pending publication. The separate Chains own sockets and contain no resource
graph; within the Aggregate family, only AggregateActorVersionChain retains
connection capabilities in SQL.

VersionRepos await a fixed finalized prefix during activation with outgoing
publication/fanout and external recovery armed independently. Dynamic projection
activation catches up and enrolls its source subscription. Ordinary snapshots read
that current committed projection without forcing VersionRepo execution or another
source-tip replay. Snapshot capture fixes resources and checkpoint N together in
the projection Repo's synchronous transaction. Outside SQL, publication reaches N, the exact
history checkpoint/hash at N is verified, and the requesting producer's private
completion prefix is read through N for Actor snapshots. Agent snapshots contain
only the coherent public graph/checkpoint and have no private recovery step.
Concurrent newer publication cannot relabel resources.
Publication or socket failures do not undo committed resources or history.

AggregateChain owns complete `externalOperationOutbox` requests until external
observation admission. Each pending row has six required fields:
`externalCommandId`, `externalContractName`, `externalContractVersion`, frozen
`payload`, full `origin` and original `aggregateVersion`. `externalCommandId`
remains unique and becomes the admitted external command's canonical `id`.
The pending row contains neither `initiatingCommandId` nor `operationIndex`, and
has no composite lineage index. The one-time original-receipt transaction already
prevents duplicate emission; exact retained-outcome retries return before insertion.
Complete Aggregate evaluated-command publication and AggregateVersionChain history
retain parent identity and sparse authored `operationIndex`.

First observation atomically inserts the complete admitted command and deletes
the pending request. Deletion proves external observation admission; execution and
retention of that command's `outcome` follow through normal original delivery.
Observation/admission transaction order assigns `aggregateIndex`, with no FIFO
request guarantee. No Aggregate `externalCommandOutbox`, remote source-proof
capability or continuation position copy remains. The Aggregate amendment changed
no Service table. ServiceChain now has its own six-field pending invocation model
under [Plan 219](../archive/plans/219-plan-service-external-operation-outbox.md) and
[ADR 015](./015-service-delivery-history-and-projection-ownership.md); it retains
the original `serviceVersion` rather than `aggregateVersion`, without pending
parent/index lineage. Frozen input, observation, authority and authored retry rules in
[ADR 012](./012-opaque-external-work-and-originating-chain-continuations.md) continue
to govern where not superseded by [ADR 016](./016-aggregate-original-operations-and-external-work.md).
Framework same-role names use external operation/command; authored contract names
such as `processExternalPayment` remain canonical identities.

The six-column Aggregate pending cutover requires empty affected AggregateChain
storage. It supplies no reset, translation, migration, alias or fallback reader.

## Consequences

Resource state, immutable history and pending delivery have distinct deletion
conditions. Transfers add durable recovery boundaries: arm recovery before
producer commits, acknowledge only after the receiving Repo commits its complete delivery, and run all RPC
outside synchronous SQL and execution permits. Duplicate and lost-ack recovery
must use pending messages or immutable history without reevaluation or delta
reconstruction. Independent recipient failure must preserve healthy progress.

[ADR 015](015-service-delivery-history-and-projection-ownership.md) governs the
corresponding Service resource/history separation. This ADR continues to govern
Aggregate ownership.
Exact versioned Actor and owner-release Agent view identities, complete Origin privacy, single-use bound
tickets, transient Studio browser lifetime and immutable accepted definitions
remain unchanged requirements. Changed fixed schemas require empty affected
storage, with no translation, aliases, fallback readers or automatic reset.
