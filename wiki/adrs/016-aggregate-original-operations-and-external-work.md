# Complete original operations and admission-Chain external execution

**Canonical input-history amendment — Plan 277 (2026-10-27):** [ADR 025](025-canonical-published-history-handoff.md) replaces permanent local admission-input retention and arbitrary-ID retry lookup with one adopted canonical publication prefix, source/Agent producer checkpoints and fresh-ID direct System calls. AggregateChain/ServiceChain retain original delivery and pending-work ownership; first external observations survive admission backpressure on those pending rows. VersionChain local publication acknowledgement permits source adoption before independent Archive acknowledgement. Only these placement/retry/observation clauses are replaced; resource/history separation, exact release interpretation, request ownership, projection/private history and physical Archive rules remain governing. Behavioral verification is recorded in [Plan 277](../archive/plans/277-plan-canonical-chain-history-handoff.md).

**Date:** 2026-10-15
**Status:** Accepted; AggregateChain outcome retention and the ordered Aggregate operations union implemented and verified 2026-10-15. The connected Service journey is verified under Plan 196 on 2026-10-23; its bounded proof is recorded below.
**Service output amendment:** [Plan 214](../archive/plans/214-plan-service-ordered-operations-and-finalized-at.md) implemented the then-ten-field Service output with one ordered compact `operations` union, one logical `outcome.finalizedAt`, ServiceVersionChain `commands` and original-outcome retention in ServiceChain `commands`. Scoped verification completed on 2026-10-22: real original-receiver pending/history recovery, acknowledgement-gated publication, immutable output equality/batch rollback, finalized-prefix replay/restoration and atomic Actor/Agent projection at the retained time. That checkout's test target passed 46 tests across eight files, including 21 Workerd cases and the separate Clock case. Provider/continuation delivery, selected Chain delivery, private authentication, browser behavior and automatic activation remain outside this proof. The full evaluated-command amendment below replaces the selected input representation; this report remains historical evidence.
**Full evaluated Service command amendment:** [Plan 256](../archive/plans/256-plan-service-evaluated-commands.md) replaces the execution-packet representation with `IEvaluatedServiceCommand`: full admitted input, canonical `id`, original `serviceVersion`, `serviceIndex`, `outcome`, `dispositionChainHash` and ordered `operations`. Original replies, pending publication, ServiceVersionChain history and actor/Agent delivery use the exact full value. The bound VersionRepo/VersionChain identifies the evaluating release; selected browser publication remains explicit. Changed fixed schemas require empty affected storage, without reset authorization, migration or compatibility path. Plan 256 records its verification separately from the historical reports here.
**Service fanout amendment:** [Plan 215](../archive/plans/215-plan-service-commands-backed-actor-fanout.md) removes ServiceVersionChain's physical actor payload copy and unused shared fanout-copy hooks. The logical actor queue delivers complete output directly from commands and advances only subscriber progress. Scoped Workerd verification completed on 2026-10-22: retained history without subscribers, independent recipient failure, post-commit lost-reply recovery across reconstruction, monotonic acknowledgement, fixed-tip delivery, catch-up/enrollment gap closure and producer-lease alarm protection. Trusted fixture source/Actor paths and explicit activation controls leave private authentication/filtering, browser behavior, selected Chain delivery, automatic activation and provider integration outside this proof. This dated fanout proof is separate from Plan 196's completed connected-journey proof and the other Service amendments.
**Aggregate pending-request amendment:** [Plan 213](../archive/plans/213-plan-aggregate-external-operation-outbox.md) implements the six-column AggregateChain model; scoped verification completed 2026-10-23. Four direct production-class Workerd cases establish physical SQL shape, atomic original receipt and observation admission/deletion, exact context, sparse retained AVC history and unchanged retry after reconstruction/native alarms. All 86 System Worker tests across 25 files pass with required typing/build dependencies. Trusted internal Actor input, seeded queue rows and authored provider probes leave authentication, a complete authored continuation journey and deployed/provider timing outside this proof. This Aggregate amendment changed no Service pending storage; Plan 219 independently applies its six-field model. No production changes, persistent-store reset or deployment in this verification.
**Service pending-request amendment:** [Plan 219](../archive/plans/219-plan-service-external-operation-outbox.md) implements the six-column ServiceChain invocation model without pending parent/index lineage. Prepared descriptions and ServiceVersionChain history preserve parent context and sparse authored `operationIndex`. Scoped SQL/Workerd verification completed on 2026-10-22, proving request/observation admission and recovery with fixture provider code and paused continuation execution. Aggregate storage and shared queue/settlement behavior remain unchanged; Plan 213 records its independent proof above.
**Connected Service execution verification — Plan 196 (2026-10-23):** [Plan 196](../archive/plans/196-plan-service-chain-original-operations-and-external-work.md) verifies authored emission, atomic original outcome/request retention, atomic observation admission/deletion and subsequent continuation outcome retention. Stable-ID recovery avoids reevaluating committed originals; continuation retry after pending deletion invokes no request. A deterministic completion-hook alarm-read fault preserves the existing original-delivery alarm before request launch. The continuation is model-free and handles external Success/Failure. Plan 196 owns full evidence; this fixture-provider/internal-method proof establishes no provider networking, authentication, UI, process-kill or deployed-timing guarantee.
**Implementation:** [Plan 195](../archive/plans/195-plan-aggregate-chain-original-operations-and-external-work.md), [Plan 196](../archive/plans/196-plan-service-chain-original-operations-and-external-work.md), [Plan 199](../archive/plans/199-plan-aggregate-ordered-operations-union.md), [Plan 200](../archive/plans/200-plan-aggregate-operation-context.md), [Plan 202](../archive/plans/202-plan-aggregate-version-chain-commands-and-actor-fanout.md) and [Plan 203](../archive/plans/203-plan-aggregate-version-chain-agent-fanout.md).
**Partially supersedes:** ADRs [012](012-opaque-external-work-and-originating-chain-continuations.md), [013](013-aggregate-delivery-history-and-projection-ownership.md), [014](014-synchronous-original-finalization.md) and [015](015-service-delivery-history-and-projection-ownership.md) for original operation retention and external execution ownership. Their remaining ordering, synchronous evaluation, authority, resource/history separation, projection and privacy rules continue to govern.

**Superseded decisions — command provenance (2026-10-25):**
[ADR 023](023-flat-command-origins-and-claims-free-continuations.md) replaces copied
parent Actor/Agent authority with claims-free immediate-parent Continuations,
object command origin with scalar flat fields, and nullable Actor producer metadata
with a required Node tuple. Both administrative command APIs are System-only.
Statements below about frozen Origin/claims inheritance or null Actor producer
fields are historical. Independent ordering, external request ownership/retry,
exact release, atomic recording, history and privacy decisions remain active.

## Decision

AggregateChain owns admitted input, its original outcome and complete pending
external operations. ServiceChain likewise owns admitted input, its first original
outcome and complete pending external operations. Each Chain alone executes
its family's external.request. VersionRepos evaluate synchronous
guards/programs and apply model operations; they never invoke, schedule or recover
external requests. The normal synchronous program handling an admitted external
observation remains in its pinned VersionRepo and may emit new output.

**AVC and SVC retain all operations.** AggregateVersionRepo constructs one
`IEvaluatedAggregateCommand`: the full admitted command with canonical `id`, non-null
`outcome: { result: Success | Failure, finalizedAt }`, `dispositionChainHash` and
one ordered `operations` union. Original replies, pending publication, immutable
AVC `commands` and actor/agent delivery use that complete value. Both logical fanout
queues read retained commands directly, with independent subscriber cursors and
no physical payload copies, backfill or pruning.
It retains payload, external observation, source contract/release, aggregate
identity, Origin, producer tuple and admission position. Its `aggregateVersion`
remains the original admission release; the bound execution owner identifies the
release that evaluated it. This supersedes the earlier eleven-column selected
Aggregate representation and separate execution-start timestamp.

Model members retain their mutation discriminator and exact model version but omit
`commandId`. External members use `operationName: 'external'` and omit
`initiatingCommandId`, `origin` and `aggregateVersion`. Parent `id`/`origin` and the
bound execution release supply those facts. Every member retains its authored
`operationIndex`, including sparse replay positions. Service uses the same ordered
union rule in its full admitted `IEvaluatedServiceCommand`: parent `id` supplies model
command association and external initiating identity, parent `origin` supplies
authority and the bound executing release supplies `serviceVersion`. Service
publication, immutable ServiceVersionChain `commands`, actor fanout and original
reply retain that same complete evaluated command, including encoded payload,
external observation, contract version, Service identity and original `serviceVersion`.
ServiceChain remains authoritative for that admitted input; replay never overwrites
its original release with the evaluating release. Both families use
`outcome: { result, finalizedAt }`; the result branches have no timestamp.

Aggregate and Service finalization sample one logical `finalizedAt` inside the synchronous transaction
after identity/progress checks using Effect Clock, and reuse it for model
application and outcome. Their shared `withCommandEvaluationClock` freezes Effect
wall time throughout the synchronous business savepoint, including payload
adapters, guards and contract programs. Monotonic timing and sleep remain live;
external requests, alarms and ordinary queries retain live timing. Fresh parallel
evaluation uses retained original `outcome.finalizedAt`; restoration applies
retained output without reevaluation.
Success or retained Failure, the complete pending evaluated command and the
materialization head commit atomically with resources. Infrastructure failure
rolls back the whole transaction. Missing payload adapters, typed adapter callback
failures and invalid adapter output abort both owners' original execution and
fresh parallel replay, retaining no outcome or materialization progress. Adapter
suspension and defects preserve their Cause and abort. Guard/program
synchronous-failure policy is unchanged. Fresh parallel replay must resolve and
interpret every admitted command; absent contracts, unsupported actor exposure or
lineage and incompatible contract kinds abort without outcome/checkpoint progress
until the developer corrects the release. No contract skipping/sunsetting exists.
Guard/program business Failure after successful resolution remains an evaluated
outcome; original-execution and post-resolution technical-error policies stay separate.
Both projection families use the same
`outcome.finalizedAt` as their source resource writes. Service has no separate
execution-start clock or second finalization sample. Selected publication/history retains no separate
timestamp column: the selected delta already carries resulting resource timestamps. Retries and recovery preserve the entire outcome. The external request
observation remains `externalOutcome.recordedAt`.

Duplicate originals recover pending publication, then immutable VersionChain history
once publication is acknowledged/deleted. Complete descriptions and stable external
IDs survive lost replies without reevaluation. Original return is independent of
VersionChain publication.

The earlier proposal for aggregateChainOutbox/serviceChainOutbox and background
admission-Chain confirmation is superseded and removed. There is no second output
queue or reverse fresh-completion path. Original return remains independent of
VersionChain publication. Missing or unavailable history after pending deletion
fails recovery; it does not authorize reexecution.

AggregateChain.commands retains eleven immutable input/position fields plus nullable
outcome, initialized to null at admission and set once by original receipt
acknowledgement. First receipt validates every immutable admitted input field, the finalized
predecessor and operation-index order, then sets that outcome and inserts complete
pending external rows in one synchronous transaction. AggregateChain selects the
union's external members and encodes six complete invocation fields:
externalCommandId, externalContractName, externalContractVersion, frozen payload,
full origin from the parent and aggregateVersion from the admitted command's bound
original release. The pending table retains externalCommandId uniqueness but no
initiatingCommandId, operationIndex or composite lineage index. Parent identity and
sparse authored operationIndex remain in complete evaluated-command publication and
AggregateVersionChain history. Repeated receipts compare the
exact retained outcome, including finalizedAt, and return without recreating
requests. AggregateChain does not retain originalExecutions, model-operation history or dispositionChainHash. It deliberately stops comparing
repeated evaluated commands' operation bodies and hash. AggregateVersionChain
continues comparing complete immutable evaluated commands. Admission retries compare immutable
input independently of outcome; replay uses its contiguous nonnull prefix.

ServiceChain likewise retains eleven immutable input/position fields plus nullable
`commands.outcome`; new admission sets it to null. First original receipt validates
every immutable admitted input field, the bound Service identity, the original execution release
and finalized predecessor, then retains outcome and pending requests in one
synchronous transaction. It projects external members into exactly six required
pending fields: unique `externalCommandId`, `externalContractName`,
`externalContractVersion`, frozen `payload`, full parent `origin` and
`serviceVersion` from the admitted command's pinned original release. The pending
row omits `operationName`, `initiatingCommandId` and `operationIndex` and has no
composite lineage index. Shared prepared descriptions and ServiceVersionChain
`commands` preserve parent context and sparse authored `operationIndex`. No parent
lookup is needed to run or settle a pending request.

ServiceChain `recordOriginalCommandOutcomeTx` compares an existing outcome exactly,
including `finalizedAt`, before any new request insertion; equal-outcome repeated
receipts ignore operation/hash differences and cannot recreate deleted requests.
Conflicting outcomes fail. ServiceChain no longer retains `originalExecutions`,
complete operation history or a disposition hash. Pending originals and contiguous
finalized replay read `commands.outcome` directly; there are no original-output
joins or reconstruction helper. ServiceVersionRepo still validates every
authoritative admitted input before execution and after complete result recovery.
ServiceVersionChain owns complete-output duplicate equality and release-local hash
validation. Timestamp or operation changes contradict its retained output even when
the disposition hash matches.

Historical aggregate dispositionChainHash values belong to AVC commands;
AggregateVersionRepo and projection materializationHead rows retain their current hash, and selected
session histories retain it as needed by consumers. The hash uses only the previous
hash, command position/ID and Success/Failure tag. Matching AVC hashes at the same
aggregate identity and aggregateIndex establish the same ordered command IDs and
Success/Failure decisions through that position, not equal results, operation bodies
or resource state. No comparison feature or AggregateChain hash copy is introduced.

Each pending operation freezes the emitting aggregateVersion/serviceVersion, exact
external contract name/version, encoded payload, Origin and stable external command
ID. Aggregate and Service Origin permit Actor, Agent and System; Agent commands use null producer coordinates. First
observation re-reads frozen pending work, admits its external command at the next
aggregateIndex/serviceIndex and deletes the request in one synchronous transaction.
A missing pending request makes late callbacks no-ops. Observation/admission
transaction order assigns command positions; independent requests have no FIFO
guarantee. Pending deletion proves external observation admission, not execution or
outcome retention for that command. No external-command queue,
FIFO allocator, remote source-proof/reconstruction capability or copied initiating
position remains. Immutable AVC evaluated commands and SVC `commands` retain parent identity and sparse operation lineage;
admitted external commands do not copy it and have an all-null producer tuple.

Aggregate projection Repos consume their release's complete evaluated commands; Service
projection Repos consume their release's complete evaluated Service commands. Both apply model
operations only. They retain resources/checkpoints and complete pending selected
publication; their separate Chains retain selected history/private completion and
connections. External descriptions never schedule requests through VersionChain
history, replay or projections and do not enter browser/native/agent command frames.
Replay continues to omit external emissions before preparation or ID allocation.
It evaluates its receiving release's program and retains that release's model output
with unchanged sparse operationIndex values. Aggregate replay's union has no external
members; Service replay likewise retains only model union members with their original
sparse positions. A public Failure has an empty union in both representations. Aggregate projection Repos select model
members only; the complete source union remains available for history and recovery.

## Consequences

One existing complete publication/history path now recovers original RPC replies;
no new cross-owner confirmation protocol is needed. Independent history publication,
original retention and projection acknowledgement remain distinct durable facts.
All remote calls stay outside SQL and execution permits. Source checkpoint and
bounded-predecessor rules remain, including checkpoint-ahead startup after lost reply.

Historical request code must remain available while requests are pending, and
commands pinned to a release still require its execution resources. No latest-version
fallback, upgrade mapping or release-retirement guarantee is introduced. external.request
receives no database. Remote effects may repeat before observation commit; provider
idempotency and reconciliation remain authored responsibilities.

The Aggregate ordered-union cutover requires empty affected AggregateVersionRepo
publication and AggregateVersionChain history/fanout storage; that earlier cutover
did not change standalone pending-request or Service packet schemas. The separate
AggregateChain outcome-retention simplification changes only its fixed schema
and requires empty AggregateChain storage. Earlier Chain, VersionRepo and VersionChain
packet cutovers still require empty storage for their independently changed schemas.
Removing repeated nested context also requires empty affected AggregateVersionRepo
publication and AggregateVersionChain history/fanout storage; that earlier amendment
changed neither standalone pending requests nor Service operations. No reset, migration, decoder
fallback, alias or compatibility protocol is supplied. AggregateChain outcome-retention verification passed source/Workerd
TypeScript, lint, all 27 Workerd tests and 13 native acceptance groups. The prior
Shopping fault-injection fixture failure was repaired without relaxing schema
validation or increasing timeouts; Service and shared checkpoint/hash plans retain
their independent status.

Plan 200's shared outcome restructuring, complete Aggregate evaluated-command rows
and removal of the redundant selected-history clock require empty affected Aggregate
and Service storage.
This is a hard schema cutover with no alias, fallback decoder, translation or reset.
Earlier verification evidence above belongs to those earlier implementations;
Plan 200 records verification of this amendment separately.

[Plan 202](../archive/plans/202-plan-aggregate-version-chain-commands-and-actor-fanout.md)
renames AVC `executionHistory` to `commands` and removes only the redundant physical
`actorVersionChainFanout` payload table. The queue retains actor subscriber cursors,
leases and alarms and delivers the same full evaluated commands from retained
`commands`. That amendment was implemented and verified on 2026-10-15 and requires
empty affected AggregateVersionChain storage.

[Plan 203](../archive/plans/203-plan-aggregate-version-chain-agent-fanout.md) removes the remaining
physical `agentVersionChainFanout` table and its insertion, pending delivery reader,
backfill and pruning. Both queues now deliver complete evaluated commands directly
from retained `commands`; each acknowledgement advances only its subscriber cursor.
Agent bootstrap, independent subscriber progress, source-bound capabilities, leases
and alarms remain. An AggregateAgentVersionRepo receipt proves its resources,
materialization head and complete pending selected publication committed together;
it does not prove AggregateAgentVersionChain publication. Complete pending publication
in resource-owning Repos remains required. Plan 215 subsequently removes the
ServiceVersionChain pending-payload hooks described by the earlier amendment.
The Aggregate amendment was implemented and verified on 2026-10-15.
The fixed-schema cutover requires empty affected AggregateVersionChain storage.
ServiceVersionChain's later cutover is tracked separately in Plan 215.

Plan 215 removes the physical ServiceVersionChain `actorVersionRepoFanout` table,
its second append insert, alternate delivery reader, backfill and pruning. The
logical queue read the then-complete ten-field commands for delivery and catch-up;
acknowledgement advances only its subscriber cursor and never deletes commands.
The shared fanout factory no longer accepts copy-maintenance callbacks or an
alternate delivery reader. Keep exact source/actor/producer privacy, synchronous
receiver resource/checkpoint/selected-publication commitment, fixed-tip pages,
producer/enrollment leases and alarm recovery. Distinct outbox original-completion
hooks remain responsible for admission-Chain replay recovery. The fixed-schema
cutover requires empty affected ServiceVersionChain storage, with no replacement
table, compatibility path or automatic reset. This amendment changes no other
Service, Aggregate or Agent physical storage. Plan 215's scoped Workerd cases
verify retained-history delivery and acknowledgement without deletion, independent
recipient failure, reconstruction/native alarm retry without rematerialization,
finite drains, catch-up/enrollment handoff and producer-lease recovery protection.
Private authentication/filtering, browser behavior, selected Chain delivery,
automatic activation and provider integration remain outside the trusted fixture
source/Actor seam. That fanout evidence does not establish the separately completed
Plan 196 journey or close unrelated Service amendments.

[Plan 213](../archive/plans/213-plan-aggregate-external-operation-outbox.md) removes only
AggregateChain's pending initiatingCommandId and operationIndex columns and their
composite index. The remaining six fields form the complete invocation used by
external request execution and observation admission. Parent identity plus the
one-time retained outcome already prevents another emission transaction, and
strictly increasing operation indexes validate the first receipt. The shared
prepared descriptions, complete evaluated-command publication/history and sparse
operationIndex values remain unchanged. That amendment left Service's then-eight-field
pending model, constraints, publication and history unchanged; Plan 219 subsequently
removes only its pending parent/index lineage. This fixed-schema amendment
requires empty affected AggregateChain storage, with no reset, migration, alias or
fallback. Scoped direct production-class verification completed on 2026-10-23 under Plan 213, within its trusted-input/provider and deployment limits.

[Plan 214](../archive/plans/214-plan-service-ordered-operations-and-finalized-at.md) replaces
ServiceVersionChain `executionHistory` with `commands`, removes ServiceChain
`originalExecutions` and its joins, and retains nullable `commands.outcome` instead.
That Service output had ten fields after removing `executionStartedAt` and combining the
operation arrays. One logical `outcome.finalizedAt` supplies source resource writes,
projection application and retained outcome for Success or Failure. Four repeated
nested context fields are derived from the parent and bound release; exact versions,
stable external IDs and sparse `operationIndex` remain. The fixed-schema cutover
requires empty affected ServiceChain, ServiceVersionRepo and ServiceVersionChain
storage with coherent dependent materializations. It does not change Service
materialization heads, selected/private/session schemas, its then-eight-column
pending external requests or Aggregate/Agent storage. Plan 219 subsequently changes
only the Service pending-request representation. No reset, migration, compatibility
path or deployment is authorized. Scoped verification completed on 2026-10-22
under archived Plan 214. ServiceVersionRepo recovers identical original replies
from pending publication or remote immutable output, retries publication unchanged
after commit-before-reply loss and deletes only after successful acknowledgement.
ServiceVersionChain rejects changed timestamps or operation bodies despite equal
hash and rolls back an invalid publication batch. Cold replay restores existing
release output without evaluation; fresh parallel replay retains sparse model
positions while suppressing external output. Actor/Agent projections commit
resources, checkpoint and pending selected publication atomically at the retained
logical time. A successful publication acknowledgement has void output; exact
whole-output equality belongs to ServiceVersionChain, while ServiceChain compares
only its retained original outcome. This proof excludes actual provider and
continuation delivery, selected Chain delivery, private authentication, browser
behavior and automatic activation. That historical result did not complete Plan
196, whose later connected-journey proof is recorded above, or other independent
amendments.

[Plan 219](../archive/plans/219-plan-service-external-operation-outbox.md) removes only
ServiceChain's pending `initiatingCommandId`, `operationIndex` and their composite
index. The six remaining required fields retain the complete exact invocation and
unique external ID. Original receipt still atomically retains `commands.outcome`
with pending requests, and equal retained-outcome retries return before insertion,
so settled requests cannot be recreated. First observation still atomically admits
the stable-ID external command and deletes pending work; missing rows make late
callbacks no-ops. The shared request/settlement queue, authored retry/timeout rules,
prepared descriptions, ServiceVersionChain parent context and sparse operation
indexes remain unchanged. The fixed-schema cutover requires empty affected
ServiceChain storage, without a reset, migration, alias or fallback. Aggregate
storage is unchanged. Plan 219's scoped verification completed on 2026-10-22 with
three SQL and three Workerd cases. The proof covers six-field constraints, atomic
receipt/observation admission and deletion, post-settlement retries, exact-release
request resolution, independent finalizer reservations and reconstruction/native-alarm
recovery. Request refusal, invalid response and timeout become external Failure
observations; declaration/payload/storage failures preserve pending work. Plan 214's
history/replay proof remains separate. The fixture substitutes provider code and
SystemRepo registration, pauses continuation execution and manually dispatches native
alarms. It does not establish real provider integration, continuation outcomes,
accepted production redeployment or automatic activation/scheduler timing. The deleted
acceptance runner is not reconstructed. Pending deletion establishes observation
admission, not continuation execution or retained outcome, and loss before local
observation commit can repeat provider effects.
