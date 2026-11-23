# Repo schema, activation, and recovery

**Model tables store rows, resource boundaries carry full identity.** Each Model's
canonical table stores authored attributes plus id/createdAt/updatedAt. Its
propertiesShape, resourceJsonCodec and published specification still describe full
resource envelopes containing modelName/version. Use existing model/table codecs
to validate full incoming identity before row writes and reconstruct it for
selection/snapshot export and inverse resources. SQL query fields and indexes
refer only to stored columns. This common format applies to source/projection
Repos, Nodes, replicas and optimistic databases; do not add an authoring policy,
per-owner runtime binding or parallel query facade. Plan 236 requires empty
affected persistent storage and keeps verification deferred.

**Migratable Repos have a local framework migration ledger.** Use `makeMigratableDORepo` for Repos that apply ordered SQL migrations. Fresh storage provisions the resolved current graph and stamps baseline zero and the declared history atomically, without replaying historical ALTER statements. The `applied_migrations` ledger stores exactly `migrationId` and `definitionChecksum`, retaining an exact ordered prefix of supported immutable history. Baseline ID is zero; positive authored IDs are safe, strictly increasing integers with valid gaps. The SHA-256 definition checksum binds the exact `[id, name, sqlStatements]` tuple, including the authored name without persisting its duplicate. The constant baseline checksum does not fingerprint the physical schema or data; validate the current graph separately. The ledger records represented history without an application or commit timestamp. Apply only pending up migrations, each with its stamp and complete ledger check in one synchronous transaction; after the final stamp, verify the full current physical graph before committing. Verification refuses views, triggers and undeclared column collations and never creates missing tables or indexes. Confirm provisioning and each committed migration with `storage.sync()` before the next step; later constructor failure must preserve confirmed history. Migration failure blocks recovery and alarms; a corrective migration advances the schema. Initial fixed storage without a ledger requires empty storage, including view-only storage. The old four-column ledger is incompatible and requires empty affected storage; do not adopt, translate or automatically reset it. Authored release/model/contract versions remain immutable; contract payload `up`/`down` adapters are separate. Do not add global system versions, CLI migration generation, or separate Worker routing for this local lifecycle.

**Agent Node Repos use `makeMigratableDORepo`.** Both Agent Node classes retain a stable physical identity across installations. On first use the constructor provisions the operational tables and stamps the migration baseline. On later activations it validates those tables together with the installed model table definitions. The Agent runtime replaces the installed model tables within its synchronous snapshot or stop transaction. The former installation's pending deliveries and wakes belong to that transaction.

**Each concrete Repo explicitly owns one alarm registry.** Construct its registry
before dependent queues/runtime fields. Construction and registration remain
inert until schema initialization. Recovery-owning Repos use RecoveryRegistry;
AggregateAgentNodeRepo and ServiceAgentNodeRepo use the separate WakeRegistry.
Never install both on one Durable Object. `makeMigratableDORepo` constructs
neither registry. Each concrete `onAlarm(): Promise<void>` runs its registry Effect
through config.managedRuntime and its invocation wrapper once. The factory routes
native alarm dispatch directly to onAlarm, or lets PartyServer's initialized
alarm path invoke that hook; never dispatch both paths.

RecoveryRegistry owns only interrupted/backlog recovery. Its recoveryHolds Set
protects queue work with a shared one-second alarm; hold checks durable alarm
state even when already held, preserves an earlier alarm and rearms an absent
one. Release removes the alarm only after the last hold. Alarm dispatch runs all
registered recovery Effects against durable state, independently of the Set, and
settles every outcome before propagating combined failures. Queue holds release
only after recoverable work settles with no active producer or newer revision.
Subscriptions belong to onRepoStartup, not recovery registrations.

WakeRegistry owns named Agent passes and synchronous durable next-wake readers.
Establish a one-second retry alarm before invoking readers or executing passes;
reader failure must leave durable protection intact. Capture the applied owner
version, selected resources and attempt markers in one local transaction, deriving
deadlines only under the matching definition pin. Preserve pending-delivery retries
independently. Successful reconciliation arms the earliest required alarm or removes
temporary protection when no work remains. Failed/interrupted passes remain
recoverable; overdue failures retry after one second without an immediate loop.
Agent passes catch up and recheck current eligibility/time before freezing commands.
Do not extend RecoveryRegistry with business deadlines.

SANR/AANR persist only attemptedAgentWakes(behaviorKey, resourceId), required and
unique together. Derive nullable deadlines from selected rows and exact applied
behaviors; store no deadline copy, false marker or unattempted row. Validate every
scheduled selected row before baseline commit or page acknowledgement,
even when its marker exists. Insert a due marker and freeze complete command input
in the same synchronous transaction. Preserve matching markers across null deadlines
and owner-pin replacement; prune exited pairs without deleting pending delivery.

**Configure execution once.** For a co-located Worker, `makeConfig({ system,
systemId })` prepares the authored System and framework services in
`config.managedRuntime`. For a release Worker, the factory prepares the host
runtime with that release's declarations and compiled grants. Both paths
acquire each release's authored Layer lazily and reuse it within the isolate.
Procedures obtain definitions with `yield* System`. Orchestration, queues,
session helpers, and `makeMigratableDORepo` receive the host runtime from the
entrypoint. Synchronous evaluation and SQL owners preserve invocation services,
capture a completed Exit, and classify native suspension before re-entering the
Effect failure channel.

**Both constructors share the Durable Object activation gate.** Production classes pass
`repoType` and their SystemSpec identity. Release Workers pass the CLI-compiled
hash and System ID. Co-located classes pass the authored System to compute its
hash. After parsing the physical name, the factory checks its configured system ID and
resolves its configured database definition without reading storage. Resource
materializers and Agent views retain their exact authored-code requirements;
fixed VersionChain and Actor Chain history schemas do not require the old release
to remain registered.
Inside the constructor gate, it derives the actual configured SystemSpec hash and
calls `SystemRepo.registerRepo({ registration, systemSpecHash })` before local SQL,
migration, bootstrap or subscriptions. Strict hash validation and accepted
whole-snapshot membership precede metadata writes. Registration cannot accept a
new snapshot. Every child, including AggregateChain, records physical metadata
through this ordinary operation. AggregateChain separately awaits
`SystemRepo.registerAggregate({ aggregateName, aggregateId })` first during
`onRepoStartup`, after durable local initialization and before recovery holds or
queue wakeups. That idempotent membership insert commits independently. Failure
prevents activation completion while physical registration remains committed;
the next addressed activation retries both operations. Discovery omits the
Aggregate during the gap and does not trigger repair. Membership may survive a
later activation failure, so neither catalogue proves completed activation.
Preserve AggregateChain's existing Agent initialization recovery for identities
missed by SystemRepo's concurrent catalogue scan. SystemRepo is
exempt from self-registration so initial acceptance can run. The factory does not
import application config; standalone consumers omit system registration and
provide their own namespace bindings. Normalize absent bootstrap to `null`, write no marker without a callback, and confirm successful bootstrap SQL and its marker with `storage.sync()` before fallible activation. Override `onRepoStartup()` for per-activation preparation after durable schema/bootstrap and before completing the constructor concurrency block. `awaitStartup()` explicitly wakes a Repo through that gate; do not expose an initialization Promise. AggregateChain and ServiceChain hold original/replay recovery before transactionally enrolling new authored releases. AggregateChain records the same current admitted position as the deployment watermark for each newly enrolled child. Both Chains start actual acknowledgements at zero and preserve dormant cursor rows. Enrollment and dispatch use the same authored membership. VersionRepo activation awaits local `catchupMaterialization` through the existing replay subscriber `.catchup()`; AggregateChain and ServiceChain keep authored release enrollment. Dynamic actor/agent projections catch up and enroll with `.subscribe()`; session subscriptions preserve browser synchronization. Do not hold an execution permit or SQL transaction across subscriber RPCs. Queue drains own alarms and delivery recovery; retain holds before committing pending delivery. Source-bound capabilities validate exact owner identity and retained projection progress. Fanout enrollment holds a scoped producer lease across source-tip validation and its atomic upsert, independently of the delivery semaphore; its revision protects that wake from concurrent empty-drain release.

**Accept the whole SystemSpec once.** SystemRepo retains complete immutable
snapshots in `acceptedSystemSpecs`, with unique `hash` and typed JSON `spec`.
Strictly decode the supplied candidate and recompute its hash before retention;
the supplying candidate and SystemRepo's executing Cloudflare Worker versions may
differ. In one synchronous transaction, compare immutable owner-scoped version
facts against every retained snapshot, then insert the whole successful snapshot.
Conflicts write nothing; equal hashes are idempotent. Omitted versions remain
protected by older snapshots. Collect complete model, Contract, Actor and Agent
facts from owner-local `modelVersions`, `contractVersions`, `actorVersions` and
`agentVersions`. Their immutable identities use Aggregate/Service namespace,
owner name, declaration name and exact version, excluding enclosing release
version. Compare release binding inventories separately. Model references resolve
inside the same owner; Actor exposed-model projections remain inline and exact.
These are internal checks during whole-SystemSpec acceptance; persist no separate
component approval records, identity envelopes or second index. Owner-scoped Node
selections may change between snapshots without redefining a versioned declaration.

**Finalize the runtime lineage before compiling its spec.** Successful `makeSystem`
validation finalizes every participating contract node reachable through runtime
`previous` and `next`. Build upgrades first; extending that shared graph afterward
is refused. Reusing a finalized graph remains valid. Factory-owned release and
Agent `.spec` snapshots remain detached and immutable. `makeSystemSpec` separately
compiles each owner's `releases` and complete `contractVersions`, including source,
intermediate and descendant codecs omitted from current release bindings. Each
version has its own singular payload, claims, failure/result, model, operation and
external response facts; portable specs contain no lineage or property-history
maps. Exact release bindings alone support new commands. Normalize and validate
portable JSON, canonicalize object keys without changing array order, compute
SHA-256 excluding `.hash`, then freeze the complete snapshot plus its hash.
Executable codec transforms, guards, programs and adapters are not fingerprinted.

**Startup and ticket issuance check the actual compiled hash.** Child startup
requires its configured SystemSpec hash to be accepted before local SQL. It sends
no scoped metadata and performs no structural re-comparison. Preserve required
declaration/retirement refusals in their owning materialization, admission,
connection-capability and removed-Node frozen-delivery lookups. Retained Actor
history reads and Archive recovery remain available after release deregistration;
new and hibernated socket authority still requires its current exact declaration.
SystemRepo has no self-registration prerequisite. Ticket issuance
locally checks SystemRepo's own executing compiled hash after ordinary session
validation, not a browser-supplied hash. Keep exact release/Actor/Agent/session
bindings, claims and identity checks, plus ticket family/expiry/one-use behavior.
Spending a retained ticket does no fresh acceptance check. Replay adds no
comparison RPC: retain source/intermediate payload validation, recorded authority,
history hashes and exact-model operation decoding. The snapshot storage/spec
cutover requires empty affected storage, including SystemRepo.acceptedSystemSpecs
when mandatory SystemSpec metadata changes its stored JSON codec, without compatibility readers,
translation migrations or automatic resets; resetting storage needs explicit
authorization. No async resolver belongs inside synchronous execution/admission
transactions.

A hosted Service release can receive `ZEROSPIN_HOSTED_RELEASE_RPC` from
the platform. On cold startup, including an alarm wake, its ServiceVersionRepo,
ServiceVersionChain and ServiceVersionArchive call
`getReleaseRpc().registerRepo({ repoType, repoName, tableNames })`. The issuer
binds the accepted spec hash, Instance and Service release, and verifies each
physical name, including the archive's first Service index. An independent
projection receives only its own registration and finalized replay authority.

ServiceChain sends its complete pending admitted command to the addressed
ServiceVersionRepo. A retry compares those same immutable input fields against
the locally committed or published command before returning its recorded result.
ServiceChain checks the returned command against its retained input before
finalizing the outcome and recording outgoing work.
`ServiceVersionRepo.awaitCommandResult` calls `executeCommandsThrough(serviceIndex)` before replaying to the index
and reading its pending or published outcome. Finalized replay reads the
captured prefix with `readReplayPage(afterIndex, maxIndex)`. When an older
release's input needs adapting, `prepareServiceReplayInput(serviceIndex, commandId)`
uses the receiving release fixed by the issuer. Each capability is used and
disposed within one event. The Instance SystemRepo and ServiceChain namespaces
stay on the platform.

**Submission permission belongs at trusted ingress.** Actor authentication, authorization and session capabilities establish permitted contracts and exact claims/Origin/owner/Node binding. Agent Node Repos produce their compiled permitted contracts and stamp their own Agent identity; frozen retries retain that input. AggregateChain and ServiceChain resolve ordinary contracts through the enclosing release and preserve owner identity, exact release-selected contract-version payload decoding, ordinary/external restrictions, non-Actor null producer tuples and claims-free requirements, idempotency and ordering. Fresh admission checks the exact Actor/Agent/System grant; a claims-free contract alone grants nothing. Actor push recovery and recorded System/Agent producer checkpoints recover covered positions before fresh declaration or grant checks, preserving frozen delivery after a Node binding changes. Do not reconstruct lifetime arbitrary-ID lookup from a pruned local command table. External observation uses the originating release's exact external registration and pending-work authority. VersionRepos still resolve Actor-aware execution contracts, interpret complete claims and run guards. Declaration lookup inside admission and execution transactions stays synchronous.

**Activation owns VersionRepo materialization.** Await the real local `catchupMaterialization` inside the existing constructor gate. An Aggregate child first initializes from its named predecessor through the saved deployment watermark. It can wake original delivery and wait for finalization through that position without awaiting the original drain. For ordinary startup replay, capture one finalized source prefix through the first replay page and commit through that fixed position. Preserve a local execution checkpoint ahead of that source prefix. Arm existing publication/fanout and external-operation/command recovery even when no replay is needed. Aggregate replay acknowledgement proves VersionChain publication even during startup catch-up. Service replay acknowledgement reports local materialization. The stable ServiceChain reads the selected ServiceVersionChain’s published position before adopting history or pruning. Outside the Aggregate proof, startup does not wait for background publication, projection fanout or external requests, or call its own Repo through an RPC stub. VersionRepo replay commits each command independently, so interrupted later pages preserve earlier resource/checkpoint/output commits. The fixed prefix bounds history followed, not total duration; failure must leave initialization failed. Ordinary queries, session authorization and snapshots read current committed local state after activation without forcing backlog execution or source-tip replay. Preserve original N's predecessor replay through N-1 and explicit command-result waits; remove public progress and unused `flush` controls.

**Aggregate and Service ownership separate retention from pending delivery.** AggregateVersionRepo
commits resources, its minimal materialization head (`materializationHead` in both AggregateVersionRepo and ServiceVersionRepo) and complete history publication
together. Original finalization returns the full admitted `IEvaluatedAggregateCommand` with canonical
`id`, ordered operations and `outcome: { result, finalizedAt }`;
AggregateChain retains the original outcome and complete pending external requests
synchronously before later original delivery. AggregateVersionArchive retains
immutable evaluated commands. AggregateVersionChain routes through the Archive
directory and publishes its head once the whole page is durable. Actor and Agent
queues read through that head and advance independent subscriber cursors.
AggregateVersionRepo retains the pending page until publication acknowledgement.
AggregateVersionChain actor membership stores exactly actorName, actorPath and
acknowledgedAggregateIndex, with a unique actor pair. It validates incoming
actorVersion against the bound immutable Aggregate release and derives that
version when reconstructing AggregateActorVersionRepo's full key. Agent
membership stores agentName, agentVersion and acknowledgedAggregateIndex, unique
over the Agent name/version pair; the bound owner release and pair reconstruct
AggregateAgentVersionRepo's full key. Neither subscriber table stores a complete Repo name or packed replacement ID.
The shared queue uses named identity columns and Effect key/identity conversions
for all owners; other physical subscriber schemas stay unchanged. Atomic enrollment
and receipt updates match the full identity and never rewind source acknowledgement.
Caught-up rows retain membership. Each source acknowledgement remains distinct
from its AggregateActorVersionRepo or AggregateAgentVersionRepo materialization
and corresponding Chain publication; no availability, expiry or retirement policy
is introduced. Queue RPCs retain `currentIndex`.
Projection
Repos commit resources, progress and complete selected publication together; AggregateActorVersionRepo
and AggregateAgentVersionRepo use materializationHead with singletonId, aggregateIndex
and dispositionChainHash in singleton slot 1. Their
Chains commit immutable projected history before acknowledging publication. Arm
all affected recovery holds before producer commits. Delete each pending message
only after its own receiver commits. Recover duplicate finalization from a pending
evaluated-command publication or permanent AggregateVersionChain history, without reevaluation.

Bound each AggregateActorVersionRepo/ServiceActorVersionRepo pending selected
publication outbox at 64 positions in its projection transaction, before model,
checkpoint or pending-output changes. Count genuinely new positions; committed
repeats consume no capacity. Drain already-committed pending output through the
captured materialization head before Actor Repo activation catch-up/subscription,
without a SQL transaction or resource permit across publication RPCs. Preserve
Agent materialization behavior. On the owner's specific pending-capacity refusal,
drain prior output through its captured committed head outside SQL and retry the
same page once; preserve the original capacity failure if delivery fails. Leave
a second capacity race to source recovery, and keep successful first-attempt
acknowledgements independent of their own outgoing publication. Actor Chain publication acknowledgement uses its
local durable logical head to prove covered positions, trusting its bound
producer's frozen publication. Ignore changed covered retries without Archive
reads or rebroadcast; physical Archive append still compares the complete
public/private pair exactly.

The Chain's original-delivery completion hook acquires the replay `producerLease`
before external recovery and explicitly calls replay `wake()` on exit, including
retries with no pending originals. The producer revision prevents an older replay
drain from clearing the newly finalized prefix's recovery before the queued pass
starts. Outbox and fanout `producerLease`
Effects arm durable recovery before pending-row production or retained-history
append and protect it with active-producer counts and revisions. Releasing a lease
only updates that bookkeeping. Callers explicitly run `wake()` afterward; use an
exit-preserving finalizer where earlier commits can survive failure or interruption.
Await `drain()` only when delivery acknowledgement is required.
ServiceVersionRepo and ServiceActorVersionRepo have the corresponding resource,
materializationHead (singletonId, serviceIndex, dispositionChainHash in slot 1) and complete-message responsibilities; ServiceVersionChain and
ServiceActorVersionChain retain complete `commands`/selected history respectively.
ServiceVersionChain's logical actorVersionRepoFanout reads the same local/Archive
history for delivery and catch-up. Projection acknowledgement advances only
subscriber progress; there is no physical fanout payload copy or backfill.
ServiceVersionChain may relocate covered local rows into ServiceVersionArchive
after its independent Archive acknowledgement. The shared fanout factory has one
required logical history reader and an optional synchronous acknowledgement
callback. Archive owners use it to advance their cursor and prune local copies
in the same transaction. AggregateChain uses the same callback to compact finalized commands after each
release owed the position acknowledges and a retained acknowledgement proves
publication. The deployment watermark sets the first position owed to the release.
ServiceChain checks the selected ServiceVersionChain's published progress
before adopting its prefix or pruning commands. A materialization acknowledgement
can precede publication. See
[Version Chain Archives](../../architecture/server/VersionChainArchives.md) and
[Canonical History Handoff](../../architecture/server/CanonicalHistoryHandoff.md). Preserve distinct outbox
original-completion hooks, producer leases, receiving transactions and alarm recovery.
ServiceVersionChain actor membership stores exactly nonnullable actorName, actorPath
and acknowledgedServiceIndex, with a unique actor pair. Its exact bound Service
release supplies actor[actorName].version for receiving-key reconstruction. Keep
the supplied actorVersion in the complete enrollment key and reject a mismatch
before reducing identity or mutating membership/progress. The RPC cursor remains
currentIndex. Missing authored actor code fails delivery while retaining the row
and acknowledgement for durable alarm retry; do not filter unavailable members or
delete caught-up rows. Source acknowledgement remains distinct from the receiving
materialization head and selected Chain publication. Exact source, actor-path and
producer/privacy checks remain at the receiving boundaries.
Service original finalization returns its complete committed IEvaluatedServiceCommand,
including full admitted input, canonical id and original serviceVersion,
serviceIndex, outcome, dispositionChainHash and ordered operations;
ServiceChain atomically retains only its first nullable `commands.outcome` and complete
pending external requests. It retains no original-output table, operation history or
disposition hash. Compare exact retained outcome before request insertion on repeat;
ServiceVersionChain owns whole-output equality and release-local hash validation.
Service pending requests store complete frozen invocation context: unique
externalCommandId, externalContractName, externalContractVersion, payload,
immediate originCommandId and original serviceVersion, plus separately nullable
externalOutcome and continuationFailure. Original finalization projects external members into this
invocation without pending initiatingCommandId, operationIndex or a composite
lineage index. Equal retained-outcome retries return before request insertion,
including after settlement has deleted pending work. First observation commits
on the existing pending row before the emitting release builds and encodes the
ordinary continuation payload. Mapper or encoding failure commits as
continuationFailure before admission. Admission backpressure
retries that retained result without reinvoking the provider. Successful admission
appends the stable-ID ordinary command and deletes pending work atomically;
missing pending rows make late callbacks no-ops. Request/settlement queues,
exact declaration resolution, reservations, alarms and authored retry rules remain.
Observation admission does not prove continuation execution or a retained outcome.
The admitted command survives an execution-commit failure for ordinary original
delivery to retry; once observation admission deletes pending work, that recovery
must not repeat the provider request. Hold original recovery through receipt
retention and the completion hook, which reconciles external recovery from durable
pending rows. An empty original drain must run that hook after interruption between
receipt commit and request launch.
Service output uses one ordered model/command/external `operations` union, deriving
repeated member context from parent command ID/Origin and the bound executing release.
Keep exact versions, stable external IDs and sparse authored `operationIndex`. Preserve the activation-owned fixed finalized prefix and
all publication/external recovery holds when changing owners.
RPC, source proof, catch-up and publication remain outside
synchronous transactions and execution permits. Capture snapshot resources/checkpoint
N locally, then validate publication through exactly N. Only Actor snapshots read private producer completion; Agent snapshots contain the coherent public graph/checkpoint.

AggregateVersionRepo and ServiceVersionRepo each sample one logical `finalizedAt`
inside materialization after authority/input/progress checks and reuse it for source
model writes, Success or retained Failure and projection model application. Selected
history retains no redundant timestamp column; resource times already arrive in its
delta. Complete pending-publication or VersionChain `commands` recovery preserves
`outcome.finalizedAt` without reevaluation or a second time sample.
`externalOutcome.recordedAt` remains the first external observation time.

AgentVersionRepos/Chains resolve their exact enclosing release and Agent identity.
AgentNodeRepos resolve the explicitly selected enclosing release; an omitted Node
binding permits metadata registration and frozen-delivery drain. Both use the
same whole-SystemSpec hash prerequisite as other children. Observation and
owner-history subscription do not consult Node selection. Cross-release Agent
version comparisons happen only during whole-SystemSpec acceptance. See ADR 022.

## Check deployment compatibility before writes

Treat an incompatible push as an ordinary rejection. Check retained storage
through the serving runtime's read-only inspection path or validate an isolated
copy against the candidate. Report the incompatible storage condition or the
owner, declaration, and version that conflict. On rejection, preserve serving
traffic, tables, migration history, and accepted rows. Candidate acceptance
before promotion does not establish this guarantee if contacting the candidate
can first activate a live Durable Object and write its schema or ledger.

For a SystemSpec format migration, use the raw-byte digest to verify the exact
source row reviewed for conversion and the exact text copied to provenance.
Evaluate compatibility by comparing the historical immutable declaration facts
with the candidate in a common format. The candidate's JSON can differ from
the original bytes, for example when the schema represents the same declaration
with version references. Recheck the reviewed source at the write boundary
under the migration's transaction or write fence so the preflight cannot go
stale. Recovery concerns failures after a committed change and cannot substitute
for a read-only compatibility check.

For the Plan 296 catalog conversion, `SystemApi.acceptSystemSpec` compares the
candidate to the reviewed baseline before calling SystemRepo. When SystemRepo
starts, it verifies the stored row hash, raw SHA-256, and registration
preconditions before schema provisioning or a ledger write. Normal acceptance
and migration preflight share the immutable declaration check. A version
conflict identifies the owner, declaration, version, and retained SystemSpec
hash. A source digest mismatch reports the expected and actual SHA-256.
The catalog transaction rechecks the source and copies the original SQLite
text into provenance. See [Plan 296](../../archive/plans/296-plan-qrk-systemrepo-catalog-migration.md#follow-up-preflight-before-durable-writes).
