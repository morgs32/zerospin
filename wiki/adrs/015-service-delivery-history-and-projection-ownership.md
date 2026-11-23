# Service delivery, history and projection ownership

**Agent callback amendment — Plan 309 (2026-11-17):** [ADR 029](029-independent-agent-command-callbacks.md) supersedes Agent embedding, selection replay, attempted-wake scheduling and replacement/initialization clauses. Agent projections compute selected deltas from owner history. Stable execution Repos own selected-model tables, pending rule deadlines and pending delivery for the current installation. Other ownership and retention responsibilities remain governing.

**Canonical input-history amendment — Plan 277 (2026-10-27):** [ADR 025](025-canonical-published-history-handoff.md) replaces permanent local admission-input retention and arbitrary-ID retry lookup with one adopted canonical publication prefix, source/Agent producer checkpoints and fresh-ID direct System calls. AggregateChain/ServiceChain retain original delivery and pending-work ownership; first external observations survive admission backpressure on those pending rows. VersionChain local publication acknowledgement permits source adoption before independent Archive acknowledgement. Only these placement/retry/observation clauses are replaced; resource/history separation, exact release interpretation, request ownership, projection/private history and physical Archive rules remain governing. Behavioral verification is recorded in [Plan 277](../archive/plans/277-plan-canonical-chain-history-handoff.md).

**Archive retention amendment:** [ADR 024](024-version-chain-sql-archives.md) governs physical evaluated-history relocation into SQL Archives; logical retained history and projection ownership remain unchanged.

**Agent release amendment — Plan 262 (2026-10-25):** Agent declaration identity, release selection, upgrade scheduling, wake-marker identity and observer binding clauses below are superseded by [ADR 021](021-independent-agent-releases.md). Other ownership and retention decisions remain governing.

**Date:** 2026-10-15
**Status:** Accepted; implemented and verified in [Plan 194](../archive/plans/194-plan-service-delivery-history-and-projection-ownership.md) on 2026-10-15.
**Partial supersession:** [ADR 016](016-aggregate-original-operations-and-external-work.md) governs Service original-outcome retention and external-request ownership: ServiceChain runs requests and retains the first original outcome; complete model/external SVC output recovers replies. The projection, privacy, resource/history and ordering rules below remain governing.
**Replay-time amendment:** [Plan 239](../archive/plans/239-plan-shopping-promotion-reservations.md) established retained original `outcome.finalizedAt` for replay and a frozen Effect wall Clock scoped to synchronous Service validation/evaluation. Original execution still samples once; source/projection writes retain that logical time. Monotonic timing/sleep, external requests, alarms and ordinary queries use live timing. Replay/frozen-clock verification is complete at the scoped Workerd/Clock seams in [Plan 214](../archive/plans/214-plan-service-ordered-operations-and-finalized-at.md) on 2026-10-22, independently of application closure. Ordinary queries are runtime-proved; external-request and alarm integrations remain outside that proof. [ADR 018](018-shopping-promotion-ownership-and-observation.md) records the concrete promotion ownership requirement.
**Service output amendment:** [Plan 214](../archive/plans/214-plan-service-ordered-operations-and-finalized-at.md) implemented the then-ten-field ordered output, one logical `outcome.finalizedAt`, ServiceVersionChain `commands` and ServiceChain `commands.outcome` without `originalExecutions`. Scoped verification completed on 2026-10-22: original reply recovery before and after publication deletion, acknowledgement-gated publication, exact immutable output, finalized-prefix replay/restoration and atomic Actor/Agent projection at retained timestamps. That checkout's test target passed 46 tests across eight files, including 21 Workerd cases and the separate Clock case. Actual provider/continuation delivery, selected Chain delivery, private authentication, browser behavior and automatic activation are outside that proof. The full evaluated-command amendment below replaces the selected input representation; this report remains historical evidence.
**Full evaluated Service command amendment:** [Plan 256](../archive/plans/256-plan-service-evaluated-commands.md) replaces the execution-packet representation with `IEvaluatedServiceCommand` throughout original replies, pending publication, ServiceVersionChain `commands`, recovery and actor/Agent projection delivery. It retains full admitted input, canonical `id` and original `serviceVersion`, plus `serviceIndex`, `outcome`, `dispositionChainHash` and ordered `operations`. The bound VersionRepo/VersionChain identifies the evaluating release. Selected browser publication remains explicit and unchanged. Changed fixed schemas require empty affected storage; this amendment authorizes no reset, migration or compatibility path. Plan 256 records its own verification independently of the historical reports here.
**Service fanout amendment:** [Plan 215](../archive/plans/215-plan-service-commands-backed-actor-fanout.md) removes the physical `actorVersionRepoFanout` copy and delivers the same complete output directly from retained commands. Subscriber progress, receiving transactions, leases and alarms remain. The unused shared fanout-copy hooks are removed; distinct outbox original-completion hooks remain. Scoped Workerd verification completed on 2026-10-22: retained history without subscribers, independent recipient failure, post-commit lost-reply recovery across reconstruction, monotonic acknowledgement, fixed-tip delivery, catch-up/enrollment gap closure and producer-lease alarm protection. Trusted fixture source/Actor paths and explicit activation controls leave private authentication/filtering, browser behavior, selected Chain delivery, automatic activation and provider integration outside this proof. Other Service amendments retain their separate verification status.
**Service subscriber amendment:** [Plan 216](../archive/plans/216-plan-service-actor-subscriber-identity.md) replaces the stored physical receiving Repo name/cursor with `actorName`, `actorPath`, `acknowledgedServiceIndex`, unique on the actor pair. Scoped Workerd verification completed on 2026-10-22: exact release-derived Actor versions, independent Actor names/paths, rejection before membership mutation, receiver source/path guards, matching pending private-resolution ownership and unavailable-code recovery without another-release fallback. The `SYSTEM_REPO` fixture bypasses accepted-definition catalogue checks; this does not prove acceptance of a production redeployment that changes an immutable projected Service definition. Selected Chain full-claims filtering, authentication/browser/provider integration and automatic activation retain separate verification ownership.
**Service connection amendment:** [Plan 218](../archive/plans/218-plan-service-connection-capabilities-and-disposal.md) established compact connection capability storage, disposal and orphan reconciliation; its completed verification remains historical. The approved historical-contract cutover now stores exactly `connectionId`, `contractVersions` and `modelNames`. Admission may select a historical ordinary public contract only within the exact bound actor's exposed lineage, with full lock/selected declaration/model validation. Recovery resolves each stored version in that same lineage and returns null for invalid or missing capabilities; no current-version substitution or global lookup is allowed. Exact Service release/actor binding and older frontend release pinning are unchanged. This fixed-schema change requires empty affected ServiceActorVersionChain storage; no reset is authorized or performed, and no aliases, fallback decoder or translation migration exist. Current-change implementation/verification is in progress.
**Service pending external-request amendment:** [Plan 219](../archive/plans/219-plan-service-external-operation-outbox.md) removes pending `initiatingCommandId`, `operationIndex` and their composite index. ServiceChain retains six complete invocation fields with unique `externalCommandId`; prepared descriptions and ServiceVersionChain history retain parent context and sparse authored indexes. Scoped SQL/Workerd verification completed on 2026-10-22, proving request/observation admission and recovery with fixture provider code and paused continuation execution. Aggregate storage and the shared queue/settlement behavior remain unchanged.
**Connected Service execution verification — Plan 196 (2026-10-23):** [Plan 196](../archive/plans/196-plan-service-chain-original-operations-and-external-work.md) verifies that ServiceVersionRepo recovers committed output ahead of ServiceChain's finalized prefix without reevaluation, and ServiceVersionChain later retains the same continuation outcome as ServiceChain. Observation admission remains distinct from continuation commit; failure/reconstruction preserves that boundary. The fixture continuation is model-free and handles both external branches. Plan 196 owns complete results and limits: public methods inside initialized Durable Objects and fixture provider code do not establish real provider networking, authentication, UI, process-kill recovery or deployed timing.
**Session-ticket amendment:** [Plan 221](../archive/plans/221-plan-session-ticket-admission-cleanup.md) retains distinct Service Actor/Agent full-lock admissions under [ADR 008](008-ordinary-and-recorded-continuation-authority.md). Service Actor identity comes from ServiceSessionLock; Service Agent Node identity binds observation/resume. Scoped verification completed on 2026-10-23: actual configured Service credential authentication through authorization, snapshot, ticket issuance and Service Actor socket resume, plus captured Service Agent forwarding. The latter finite response does not prove an Agent socket lifecycle. This amendment changes no Service Chain storage or protocol and does not close Agent observation lifecycle verification.
**Service Agent backend amendment (2026-10-18):** ServiceVersionChain adds an independent Agent subscriber queue alongside its actor queue. ServiceAgentVersionRepo owns resources, materialization progress and complete pending selected publication; ServiceAgentVersionChain owns retained public/private selected history and Agent sockets. Separate Agent locks and ordinary contract admission preserve actor boundaries. Browser and Studio integration now mirror Aggregate Agents through an explicit `makeServiceAgentSession`, Service selections and command inspector, and kind-discriminated `SystemApi.openAgentSession`. SystemApi resolves Service identity from the registered Agent; the credential-owning Studio broker returns its bound Service socket URL. Service Agent browser state lives only for the mounted Studio session. The transient AgentNode amendment below replaces the direct browser reconciliation path; backend admission, projection and publication ownership remain as described here. Shopping declarations and commands remain separate work. Scoped backend checks and existing external-work regressions pass; the new Service Agent runtime paths have source review without dedicated automated runtime coverage; this amendment does not change any earlier plan's deferred verification status. Changed fixed schemas require empty affected storage; no migration, reset or activation was performed.
**Transient AgentNode amendment (2026-10-18):** [Plan 244](../archive/plans/244-plan-transient-agent-nodes.md) replaces direct Service Agent browser machinery with one transient ServiceAgentNode and a thin `makeServiceAgentSession` facade. The Node owns one memory SQLite connection, originating input, authoritative baseline/checkpoint, rebuilt optimism and the sole command/read publication. It commits received authority before a separate speculative rebuild and fences capabilities between commits. Aggregate Agents receive the corresponding explicit Node/API. No Actor or backend wire/storage redesign is part of that replacement. Its verification belongs to Plan 244, without dedicated new AgentNode runtime tests; all earlier deferred statuses, including Shopping Plan 239, remain unchanged.
**Cleanup amendment (2026-10-18):** [Plan 245](../archive/plans/245-plan-remove-unnecessary-agent-and-runtime-machinery.md) narrows Agent views to guarded `readSelection` and derives construction identity from the Agent release. Session `ready` records first validated replay; current resource/write/connection availability remains Node-owned through reconnect. Shared Worker factories require injected invocation/encoding policies, preserving config-independent imports. Recovery registers plain drain Effects under the containing Repo's invocation policy; direct background delivery invokes its supplied policy once. Catch-up still precedes durable cursor reread and enrollment. This cleanup changes no Service admission, acknowledgement, pending-publication retention, fixed schema or Actor behavior.
**Actor exposed-command amendment:** [Plan 207](../archive/plans/207-plan-actor-model-exposure-and-aggregate-command-names.md), implemented and verified 2026-10-16, applies the normalized Actor publication model to Service as well as Aggregate.
**Supersedes:** [ADR 007](007-canonical-results-and-selected-chain-ownership.md) only for combined Service resource/history ownership and absence of same-identity publication. Its exact identity, privacy, browser lifetime, immutable catalogue and ordered execution guarantees remain governing. [ADR 013](013-aggregate-delivery-history-and-projection-ownership.md) and [ADR 014](014-synchronous-original-finalization.md) continue to govern Aggregate ownership and original completion.

**Agent simplification amendment — Plan 151 (2026-10-21):** The current Agent
sections below supersede earlier independent Agent versions, originating browser
input and Agent private completion. Agent definitions are unversioned; owner
release versions remain exact. The old amendment reports above are historical
verification evidence only. Actor recovery and unrelated deferred checks remain
unchanged. Current public-history/observer verification is reconciled under
[Plans 211](../archive/plans/211-plan-agent-exposed-command-history.md) and
[212](../archive/plans/212-plan-agent-derived-connection-capabilities.md), reusing the bounded
Plan 249/257 results; all 107 scoped System Worker tests across 25 files pass on 2026-10-23. Six new cases prove frozen publication retries after post-commit reply loss/reconstruction, immutable public history and real observer resume/hibernation/live/error cleanup. Trusted forwarded headers establish local observer transport, not authenticated opening or provider/deployed behavior.

## Decision

ServiceChain retains admitted input and the first original `outcome` in
`serviceIndex` order. ServiceVersionRepo owns one exact release's resources,
original/replay evaluation, a minimal `materializationHead` and complete pending
`serviceVersionChainOutbox` evaluated commands. It owns no retained execution or model-operation
history. Both ServiceVersionRepo and ServiceActorVersionRepo use a three-field
materializationHead: singletonId, serviceIndex and dispositionChainHash, in slot 1.
Command IDs remain in admitted commands and retained execution/exposed-command history.
ServiceVersionChain owns permanent logical release-local history and separate actor
and Agent projection subscriber progress. Its logical `actorVersionRepoFanout` and
`agentVersionRepoFanout` queues deliver complete output through the local/Archive
reader for both delivery and catch-up. Projection acknowledgements advance only
their subscriber cursors and never delete logical history. There is no separate
fanout payload table or copy backfill. Independent durable Archive acknowledgement
permits covered local copies to be pruned under ADR 024. Retained commands cover late enrollment and the
catch-up/enrollment interval. Producer leases, fixed-tip pages, monotonic enrollment
and acknowledgement, exact receiving identity/privacy and alarm recovery remain.

`actorVersionRepoFanoutSubscribers` stores exactly required `actorName`, `actorPath`
and `acknowledgedServiceIndex`, with unique `(actorName, actorPath)`. The bound
Service release maps each actor name to one exact actor version. Keep `actorVersion`
in the complete incoming queue key and compare it against that declaration before
extracting the stored pair or upserting progress. Delivery reconstructs the full
ServiceActorVersionRepo key from this owner, stored actor pair and that same bound
declaration's version. Never choose latest code or scan another Service release.
Missing release/actor code fails while membership/progress remain for alarm retry;
it does not authorize filtering, retirement, deletion or replacement routing.
The RPC cursor remains `currentIndex`; SQL names source acknowledgement explicitly.
Monotonic transactions and receipt-before-acknowledgement remain intact. Canonical
actor-path and full-claims privacy checks retain their receiving boundary.

`agentVersionRepoFanoutSubscribers` independently retains unique `agentName`
and `acknowledgedServiceIndex`. Enrollment and delivery resolve only that exact registered Service Agent
and reject an Aggregate Agent or an Agent bound to another Service name/version.
An acknowledgement advances only this subscriber cursor; it never deletes source
`commands` or proves selected Chain publication. Missing authored code retains
membership and progress for retry. Both fanouts preserve producer leases before
publication and enrollment, explicit wake-up after those operations, and
`recoveryRegistry` holds while delivery remains.

ServiceVersionRepo commits successful resources or a public refusal, its checkpoint
and a complete `IEvaluatedServiceCommand` atomically. It retains every admitted
input field, including canonical `id`, encoded `payload`,
`contractVersion`, `serviceName`, original `serviceVersion`, full Origin and
producer tuple, plus `serviceIndex`, `outcome`, `dispositionChainHash` and
`operations`. One ordered `operations` union contains
model mutations and frozen external descriptions. Every member retains authored
sparse `operationIndex` and exact model/contract versions. Model members omit
`commandId`; external members omit `initiatingCommandId`, `origin` and
`serviceVersion`. Parent identity/Origin and the bound evaluating release supply
that context. Model command association derives from parent `id`. ServiceChain
remains authoritative for admitted input; its exact values also survive in the
evaluated command. Replay can evaluate under another bound release without
overwriting the admitted `serviceVersion`.

Original execution samples one logical `finalizedAt` inside the materialization
transaction after authority/input/progress checks. Replay reuses the admitted
command's retained original `outcome.finalizedAt`; it does not sample a fresh wall
time. The shared `withCommandEvaluationClock` freezes Effect wall time throughout
the synchronous business savepoint in both ServiceVersionRepo and
AggregateVersionRepo, including payload adapters, guards and contract programs. Source resource writes, retained Success or Failure
and projection application use the same `outcome.finalizedAt`. Monotonic timing
and sleep delegate to the live Clock; external requests, alarms and ordinary
queries retain live timing. A recognized refusal retains this time after
business-savepoint rollback; infrastructure failure commits no outcome. There is
no separate execution-start clock, new durable timestamp or caller clock protocol.
Missing payload adapters, typed adapter callback failures and invalid adapter
output abort original execution and fresh parallel replay in both owners, retaining
no outcome and advancing no materialization checkpoint. Adapter suspension and
defects preserve their Cause and abort; guard/program synchronous-failure
classification is unchanged. Fresh parallel replay must resolve and interpret
every admitted command: absent contracts, unsupported actor exposure/lineage and
incompatible contract kinds abort without outcome or checkpoint progress until
the developer corrects the release. No contract skipping/sunsetting is provided.
Guard/program business Failure after successful execution resolution remains an
evaluated outcome; original-execution and post-resolution technical-error policies remain
separate.
Recovery preserves the retained timestamp. This amends Plan 214's original
fresh-replay-time rule without rewriting its historical implementation report.

Original finalization returns the complete committed output without awaiting
history publication. ServiceChain validates the bound original reply and finalized
predecessor, then atomically sets its first `commands.outcome` and inserts complete
pending external requests. New commands have null outcome; no original-output table,
operation history or hash is retained on ServiceChain. Repeated receipts compare
exact outcome, including `finalizedAt`, before request insertion: equal outcomes
are no-ops even when schema-valid operation bodies/hash differ; conflicting outcomes
fail. ServiceVersionChain compares complete immutable output, including timestamps
and operations, and validates its release-local disposition hash. Equal hashes alone
do not establish output equality.

ServiceChain's `externalOperationOutbox` has exactly six required fields:
`externalCommandId`, `externalContractName`, `externalContractVersion`, frozen
`payload`, full `origin` and original `serviceVersion`. External ID uniqueness
remains; pending `initiatingCommandId`, `operationIndex` and their composite index
are absent. First receipt projects external union members into complete pending
invocations, supplying parent Origin and the admitted command's pinned original
release. The original transaction and retained-outcome retry rule prevent a second
emission transaction, including after a request is settled and deleted. Complete
prepared descriptions and ServiceVersionChain `commands` retain parent context and
sparse authored `operationIndex`; pending execution and settlement require no
parent lookup.

Only ServiceChain runs these requests, resolving the exact frozen release and
external declaration without a current-release fallback. Its first observation
transaction re-reads the pending invocation, admits the stable-ID external command
with frozen payload/Origin/release and an all-null producer tuple, and deletes the
pending row. Admission failure rolls back deletion; missing pending work makes late
callbacks no-ops. Deletion proves observation admission, independently of that
command's execution or retained `outcome`. Request reservations, alarms, authored
retry/timeout behavior and observation/admission ordering remain unchanged.

A duplicate checks the materialization head before predecessor replay or declaration
lookup and recovers pending complete publication or exact ServiceVersionChain
`commands` after acknowledged publication deletion. Validate its full authoritative
admitted-input association outside SQL and execution permits. Missing, conflicting
or unavailable history fails recovery and never permits reevaluation, resampling or
repeated external production. ServiceChain point/replay reads use `commands`
directly; pending originals have null outcome and replay exposes only the contiguous
nonnull prefix. The original-delivery completion hook retains replay wake recovery
across the acknowledgement boundary.

ServiceActorVersionRepo owns the complete release resource graph needed by
relational selections, selected-delta computation, `materializationHead` and complete
pending `exposedCommandOutbox` messages for one exact service release, actor
name/version and actor path. Its page transaction applies validated operations,
computes selected entry/exit deltas and commits resources, progress and publication
together. It never evaluates authored command programs. The pending row contains
exactly `serviceIndex`, `dispositionChainHash`, canonical admitted `id`,
`commandName`, selected `delta` and nullable `commandResolution`. A present
resolution contains required `nodeId`, `pushIndex`, `sessionName` and full original
encoded `claims`, plus nullable public `failure`. Only the complete producer for
this bound actor version and projection identity gets a resolution. Fixed actor
kind/name/version derive from the immutable ServiceActorVersionChain owner.

ServiceActorVersionChain atomically appends immutable public `exposedCommands`
and its optional private `commandResolutions` child in one synchronous
transaction, acknowledges that complete publication once and broadcasts after
commit. The public row contains the first five pending fields. The child has
`serviceIndex` as primary/foreign key, required producer/session/full-claims
fields, nullable `failure` and unique `(nodeId, pushIndex)`. Insertion seals the
exact resolution or its absence. An exact retry compares the public row and
joined resolution-or-null; later attachment, changed metadata, command-ID
conflicts and gaps fail the page. No separate resolution writer, queue,
acknowledgement or socket stream exists. Private recovery uses this local relation,
proves exact node/session/full-claims ownership and contiguous push progress,
bounded by the captured `serviceIndex`.

ServiceAgentVersionRepo owns resources/checkpoint/complete pending public
publication under `(systemId, serviceName, serviceVersion, agentName)`.
ServiceAgentVersionChain retains five public exposedCommands fields:
serviceIndex, dispositionChainHash, canonical admitted id, commandName and frozen
selected delta. It owns observer sockets without Agent SQL connectionLocks,
private commandResolutions or outcome/bootstrap readers. Append validates exact
public equality and contiguous positions before acknowledging publication.
Selection exit and acknowledgement never delete public selected history.
Full admission locks retain contract definitions without an ordinary browser
command-submission capability. Observer Node identity binds ticket/resume rather
than production. Service final replay handoff uses phase/Node liveness checks and
disposal fences for late replay work.

ServiceAgentNodeRepo is the separate unversioned MigratableDO keyed by
`(systemId, serviceName, agentName)`. It owns selected resources, applied
serviceVersion/serviceIndex/dispositionChainHash, sparse attemptedAgentWakes and
complete commandDeliveryOutbox rows. Its WakeRegistry is explicitly constructed
before runtime fields; makeMigratableDORepo constructs neither alarm registry.
The concrete onAlarm hook executes its registry through configured runtime and
invocation policy once. RecoveryRegistry stays recovery-only on other Repos.

attemptedAgentWakes has exactly required behaviorKey/resourceId with unique pair
identity. Selected resources and the exact applied behavior supply current
nullable deadlines; unattempted pairs have no marker. Baseline/page reconciliation
validates every selected scheduled row and deadline before baseline commit or page acknowledgement,
including pairs whose marker already exists. The synchronous next-wake reader
captures head, resources and markers together and derives deadlines only when
the applied owner version matches the current pin. Pending delivery keeps its
independent retry responsibility. WakeRegistry protects the read with a one-second
retry alarm before invoking it; a failed reader leaves that protection intact.

Automatic commands retain canonical id, exact owner/contract versions and Agent
Origin with all producer coordinates null. Commit selected resources, checkpoint
and marker reconciliation synchronously together. Due processing freezes its
complete command and attempted marker in one transaction. Retry unchanged until
a matching frozen input and valid canonical admission index permit outbox deletion. A retained
Failure does not schedule another attempt. Preserve matching markers while selected,
including null-deadline and owner-pin changes; selection exit prunes markers while
frozen delivery survives independently. Pending commands block changed-pin activation:
drain under the old pin before deploying
the new binding. Successful rebind atomically installs the new baseline/checkpoint
and rejects previous-source pages. ADR 013 specifies the matching Aggregate rules.

ServiceAgentVersionChain derives its one fixed ServiceAgentNodeRepo recipient
from Chain identity and retains only nodeDeliveryAcknowledgement for that
delivery. Catch-up/enrollment preserves gap-free public history. No subscriber
identity columns repeat the bound owner.

`IServiceExposedCommand`, `ServiceExposedCommandSchema` and
`makeServiceExposedCommand` name the public selected command. It keeps nullable
`failure`; server-side joins disclose a refusal only to the admitted recipient.
Retained selected history has no execution-time column: resource timestamps
already arrive in `delta`. Source and projection resource writes share the retained
`outcome.finalizedAt`. Replay tail delivery and transition
to live remain synchronous. Socket failure cannot undo retained history or a
projection commit. Service actor declarations publish `exposedModels` separately
from canonical `db.models`; session and lock `models` retain their meaning.

Snapshot capture reads resources and actual checkpoint N together in
ServiceActorVersionRepo. Outside SQL it publishes through N, verifies the exact
history checkpoint/hash at N and reads the requesting producer's contiguous private
completion through N. ServiceSessionLock still filters snapshot and delivery models;
full encoded claims, actor identity, node and session govern private completion.
A newer publication cannot relabel the captured graph. Browser command fields and
socket progress retain their existing meanings.

ServiceActorVersionChain connection capabilities are temporary authorization
resource state, separate from retained public/private history. `connectionLocks`
has exactly three required columns: primary-key `connectionId`, JSON
`contractVersions` and JSON `modelNames`. The version map retains exact admitted
ordinary public contract names and lineage versions; modelNames retains the exact
admitted model set. A present empty row grants nothing and remains distinct from
a missing admission. Recovery resolves each stored version within the bound actor's
public lineage and returns null for invalid or missing capabilities. Full submitted ServiceSessionLock validation remains at admission,
including exact declarations, claims codec, model versions and selected relational
closure. The row stores no full lock or duplicate session identity.

SystemRepo's ticket admission retains the complete ServiceSessionLock, exact
Service owner, Actor path and actual claims. Actor name/version and session name
appear only in that lock and supply owner routing and trusted forwarding headers
directly. Ticket-local validation requires nonempty session/Actor names and a
valid Actor declaration version without changing shared core lock schemas. Service
Actor `nodeId` remains nullable. Full declaration/claims/path validation remains
mandatory. Matching-family atomic single-use deletion precedes retained-row decoding,
expiry checks and forwarding, leaving the credential consumed on later failure
under ADR 008.

Service Agent tickets retain a separate ServiceAgentSessionLock, Agent Origin,
exact Service name/version and nonempty observer nodeId. Agent Origin contains
kind/name, without an independent Agent version. Issuance validates the
complete lock against the named Agent's pinned owner release; forwarding strips
caller trusted headers and derives ServiceAgentVersionChain from spent admission.
The observer nodeId binds ticket/resume, never command production. Browser Agent
sockets only observe selected public history. SystemApi.openAgentSession reads a
coherent public snapshot directly and issues that bound ticket. Studio supplies
Agent name and observer identity; owner identity comes from the definition.

ServiceChain checks Agent permission at original admission using the exact pinned
owner/ordinary contract. Replay interprets retained admitted commands through
retained owner/contract context without consulting the currently scheduled Agent
for permission again. Actor claims, producer validation and private recovery
remain unchanged.

ServiceAgentNode retains selected rows/checkpoint in one transient memory SQLite
connection. Snapshot/delta and serviceIndex/dispositionChainHash commit in one
synchronous transaction. Guarded read views are fenced during reconciliation;
reconnect retains that Node/checkpoint without a command journal, optimism,
producer progress or private prefix. Disposal fences readers before cleanup.

One synchronous capability read serves messages and live broadcast. It validates
attachment identity against the exact bound Service release, actor name/version
and canonical actor path, preserves issued/resumed Node binding, and resolves the
selected ordinary public contracts and exposed models only through that bound
release. Unavailable, external or malformed selections fail closed; never use
latest/global declarations, default-to-all selection or a reconstructed submitted
lock. A pushed command still requires selected-name membership, exact contract
version and exact Service, actor Origin, Node, session and full actual claims
identity. The attachment retains actual encoded claims and session/producer/phase
facts. Private refusal disclosure continues to require exact recipient equality.

Capability insertion and attachment installation have synchronous compensation,
not a purported SQL/WebSocket transaction. Idempotent socket disposal first fences
attachment authority and independently attempts any notice, original-socket close
and capability-row deletion so a failed send or close cannot skip other cleanup.
Failed installation, invalid message/replay state, failed broadcast, close and
explicit error callbacks use this path. Activation obtains the complete surviving
socket ID set before transactionally pruning only absent IDs. Enumeration failure
deletes nothing; surviving hibernated/replaying sockets keep their capabilities.
Neither socket disposal nor orphan cleanup deletes command history or private
resolutions, and neither introduces expiry or credential revocation.

[Plan 192](../archive/plans/192-plan-activation-materialization-catchup.md)'s lifecycle
remains: VersionRepo activation awaits one captured finalized replay prefix inside
the existing constructor gate, with publication and external recovery armed even
when no new replay exists. A local checkpoint ahead of that prefix is valid after
a lost original reply. Outgoing history/fanout/external work does not gate activation.
Dynamic projection activation catches up and enrolls through its source subscriber.
Ordinary queries, authorization and snapshots read current committed materialization
without forcing pending originals or source-tip replay. Explicit authorizer commands,
original N's predecessor replay through N-1 and command-result waits remain.

## Consequences

Rows are retained according to responsibility: resource/checkpoint state,
complete pending delivery, permanent history or subscriber progress. Delete each
pending message only after its receiver durably commits. History-backed fanout
acknowledgement advances subscriber progress without deleting retained commands. A
ServiceActorVersionRepo receipt proves its resource/checkpoint/selected-publication
transaction, independently of ServiceActorVersionChain publication. Arm recovery before producer
commit. Source/history RPCs, publication and catch-up remain outside synchronous
SQL transactions and execution permits. Business-savepoint rollback and complete
infrastructure Causes remain intact.

Physical ServiceVersionRepo and ServiceActorVersionChain schemas change; affected
storage must be empty. New ServiceVersionChain (`svc`) and ServiceActorVersionRepo
(`savr`) namespaces have their own fixed schemas and migration ledgers. Add no
translation, aliases, legacy readers, dual paths or automatic reset. This decision
authorizes no storage reset, deployment or vendor propagation. It preserves
[ADR 005](005-ordered-original-execution-and-finalized-replay.md)'s original/replay
authority and [ADR 012](012-opaque-external-work-and-originating-chain-continuations.md)'s
external-work ownership.

The shared command outcome is `outcome: { result: Success | Failure, finalizedAt }`,
with no branch timestamp. Service retains the full admitted
`IEvaluatedServiceCommand` and Aggregate retains the full admitted `IEvaluatedAggregateCommand`;
both use canonical `id`, preserve the original admission release and use one ordered
operations union and one logical resource/outcome timestamp. Historically, Plan 214 left the
then-eight-column ServiceChain pending external requests and their ID/parent-index
constraints unchanged; Plan 219 subsequently removes pending parent/index lineage.
Plan 214 changes the fixed ServiceChain, ServiceVersionRepo publication and
ServiceVersionChain history/fanout schemas; empty affected storage and coherent
dependent materializations are required. It authorizes no reset or deployment.
Service materialization heads and selected/private/session schemas are unchanged.
Plan 214's scoped verification completed on 2026-10-22 with real original-receiver
pending/history recovery, commit-before-reply publication loss and identical retry,
full-output duplicate rejection and batch rollback, finalized-prefix replay and
existing-release restoration without evaluation. Actor/Agent projection checks
prove resource/checkpoint/pending-publication atomicity and retained timestamps.
Publication returns void success after ServiceVersionChain validates and commits
output; ServiceVersionRepo deletes only the acknowledged pending page. This is
separate from ServiceChain's outcome-only original receipt and from selected
Chain publication or external continuation delivery. Plan 215's separate proof
is recorded below. This historical Plan 214 report does not establish the later
connection, request, connected-journey or ticket guarantees; their own verification
records govern.

Plan 215 removes only ServiceVersionChain's physical actor fanout payload table.
The shared fanout factory uses one required history reader without alternate-reader,
enrollment, acknowledgement or drain callbacks for payload maintenance. Original
delivery completion hooks in the outbox factories retain their separate recovery
responsibility. The ServiceVersionChain fixed-schema cutover requires empty affected
storage and introduces no replacement state, compatibility path or automatic reset.
Other Service, Aggregate and Agent physical storage stays unchanged by this amendment.
Plan 215's scoped Workerd verification completed on 2026-10-22. A failed or lost
projection reply leaves source acknowledgement behind committed receiver state,
while a healthy actor path advances; reconstruction and native alarm retry preserve
that state and retained commands. The bounded-page/enrollment cases prove finite
drains, the catch-up/enrollment handoff and producer-lease alarm protection. This
uses trusted fixture source/Actor paths and explicit activation controls; private
authentication/filtering, browser behavior, selected Chain delivery, automatic
activation and provider integration remain outside the proof. Plans 218/221
and the other Service amendments retain their independent obligations.

Plan 216 changes only ServiceVersionChain's fixed actor subscriber representation
and exact-release identity binding. Shared callback/enrollment error types include
the existing Service/actor lookup failures without changing queue runtime behavior.
Empty affected ServiceVersionChain storage is required; no compatibility columns,
migration, fallback or automatic reset is introduced. Other Service, Aggregate and
Agent physical storage remains unchanged. Plan 216's scoped Workerd verification
completed on 2026-10-22. Wrong versions and source owners cannot mutate membership;
exact Actor name/version/path controls pending private resolution, preserving full
claims. Missing bound code retains the original row, cursor, history and alarm
until that exact binding returns. The fixture bypasses SystemRepo accepted-definition
checks, so unavailable-code recovery is not accepted production redeployment proof.
Selected Chain full-claims filtering, authentication/browser/provider integration
and automatic activation remain outside this seam. This dated subscriber report
does not establish the later connected-journey, request, connection or ticket
guarantees; their own verification records govern.

Plan 218 changes only ServiceActorVersionChain's fixed connection-capability
representation and its socket lifecycle/identity enforcement. Empty affected
ServiceActorVersionChain storage is required; add no translation, compatibility
decoder, replacement registry or automatic reset. Aggregate Actor, Agent and other
Service physical storage remain unchanged by this amendment. Plan 218's scoped
verification completed on 2026-10-22. Three passing SQL cases exercise the three-column/primary-key schema, exact
selected capability recovery, relational model closure through both admission and
runtime readers, pre-insert capability-preparation/SQL/attachment failure and interruption,
independent disposal and enumeration/prune rollback. Three passing Workerd cases
exercise trusted-header connect validation, exact-release command admission,
configured Actor selection/full-claims private output, broadcast failure isolation
and actual native hibernation. The hibernation case checks a changed incarnation,
preserves real awaiting/live sockets and a fixture-parked `replaying` attachment,
then prunes an absent socket row and exercises close/error disposal. It does not
prove resumption of an interrupted replay Effect. These cases bypass SystemRepo
ticket admission and authentication providers and do not exercise a browser SDK.
All six cases passed in the initial complete compiler/test graph. Current-baseline
and historical co-landed source comparisons establish qualified preservation,
rather than physical-database equivalence. The concurrent native SystemApi module
is separate work. Plans 219 and 196 record later request and connected-journey
proofs; Plan 221 retains its independent ticket/authentication obligations.

Plan 219 changes only ServiceChain's fixed pending external-request representation.
The six-column cutover requires empty affected ServiceChain storage. It adds no
replacement state, translation, compatibility decoder, migration or automatic reset
and authorizes no reset or deployment. Aggregate storage, ServiceVersionChain
history and the shared request/settlement runtime remain unchanged.
[Plan 219](../archive/plans/219-plan-service-external-operation-outbox.md)'s scoped
verification completed on 2026-10-22 with three SQL and three Workerd cases. They
prove six-field constraints, original receipt rollback, observation admission/deletion
rollback, late callbacks and original retries after actual settlement. Exact-release
requests progress independently; finalizer reservations prevent overlap, and pending
work survives reconstruction and native-alarm settlement failure. Request/response/timeout
Failures remain distinct from recoverable declaration/payload/storage failures.
Plan 214 supplies immutable history/replay proof. The fixture substitutes provider
code and SystemRepo registration, pauses continuation execution and manually dispatches
native alarms; it establishes neither provider network integration, accepted production
redeployment nor automatic activation/scheduler timing. Pending deletion proves
observation admission, not continuation execution or retained outcome. Provider effects
can repeat before local observation commit. The removed acceptance runner is not
reported as executed; other plans retain their independent obligations.

The Service Agent backend amendment adds fixed ServiceAgentVersionRepo and
ServiceAgentVersionChain schemas and changes the ServiceVersionChain subscriber
schema and shared Service-origin codecs. Empty affected storage is required;
no translation migration, compatibility decoder, automatic reset or activation
was performed. New Service Agent runtime paths were reviewed against source without dedicated automated runtime coverage. This does not revise any earlier plan's verification or archival status.
