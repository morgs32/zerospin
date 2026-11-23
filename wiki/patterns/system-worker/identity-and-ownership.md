# Identity and SystemRepo ownership

Do not hide tuple semantics behind loose labels such as "authenticated aggregate target." When discussing a target, identity, key, tuple, or scope, enumerate its exact fields at first use and state which boundary supplies each field (for example: identity result, admission check, caller-owned namespace, capability binding, or persistence). Do not call an admitted or caller-selected field authenticated merely because it travels beside authenticated fields. If the same tuple needs a stable discussion name and no canonical type exists, propose a named type with its exact shape and use sites, resolve the material naming decision through the shared `spec` workflow; do not re-approve a name or shape already requested or settled.

Use **SystemRepo**, not "controller," for the singleton `{ systemId }` Repo inspection, immutable authored-definition acceptance, session-ticket, and WebSocket-routing role. `DevWorker` and `ProductionWorker` are entrypoints that route to `SystemRepo(systemId)`. Authored browser configurations are session definitions; `IAggregateSession` and `IServiceSession` describe live instances. SystemRepo atomically accepts the complete SystemSpec and requires acceptance of the executing hash before child Repo activation; the CLI owns production staging and preflight. The self-hosted CLI owns deployment coordination, generation selection, drains, promotion, and rollback. Each Repo owns its physical schema.

For the hosted Service patch flow, the Instance SystemRepo serializes two decisions. After Cloud verifies a candidate, `acceptServiceBuild` compares the prior accepted build and publishes the new one for the declared Service release. At execution start, `startServiceExecution` assigns the accepted build to the Service Chain index. Recovery and reply mapping use that persisted assignment. The ServiceVersionRepo runs the handler against its own SQLite database.

## Agent definitions, views and execution owners

Register Agents in each Aggregate/Service release's `agents` map beside Actors.
Their owner-free specs carry independent Agent versions; complete owner specs
include them. Changing Agent registration requires a new owner composition
version. Separate locks include owner name, Agent name and Agent version, excluding
owner release version. Commands carry scalar `kind: 'agent'` with root
`agentName` and `agentVersion` within the retained command's enclosing owner
context. Stable session identities retain their separate object shape. For native Agent deployments, callback changes require an Agent version bump
even when portable specs compare equal. See ADR 022. A hosted Service Agent
can instead redeploy an onWake fix in place when the accepted Agent declaration
stays identical.

Select automation through `system.aggregateAgentNodes[aggregateName][agentName]`
and `system.serviceAgentNodes[serviceName][agentName]`. Values are exact
registered enclosing releases from `system.aggregates[name].releases` or
`system.services[name].releases`. Each owner separately selects its mandatory
`canonical` release key for command-history adoption. Every declared projection is observable regardless
of Node selection; only the selected binding produces automatic commands.

AggregateAgentVersionRepo/Chain identities retain `(systemId, aggregateName,
aggregateId, aggregateVersion, agentName, agentVersion)`; ServiceAgentVersionRepo/Chain retain
`(systemId, serviceName, serviceVersion, agentName, agentVersion)`. Version means owner release.
Repos own resources/checkpoints/complete pending publication; Chains own retained
public selected history and observer sockets. Agent snapshots need no private
completion prefix. Actor private history and recovery remain separate.

AggregateAgentNodeRepo and ServiceAgentNodeRepo are unversioned MigratableDOs,
keyed by `(systemId, aggregateName, aggregateId, agentName)` and
`(systemId, serviceName, agentName)`. They own selected resources, applied agentVersion and owner
version/index/hash, current one-shot wake attempts and complete pending commands.
Their separate durable ownership requires local selected materialization.
Commit resource/checkpoint changes, wake reconciliation and frozen commands
synchronously together. A present checkpoint initializes index zero too.

Hosted Service Agent delivery uses the complete frozen command and the private
admission binding. ServiceChain matches the originating Service and Agent
releases, then returns the original receipt for an exact command retry. On
first admission it checks build eligibility and the accepted grant, validates
the payload, and commits the assigned serviceIndex and receipt together.
The receipt survives ServiceChain history compaction. The Agent Node clears its
delivery only after the receipt confirms the command id.

For the native Agent producer protocol, freeze canonical command id, owner/contract versions, scalar Agent kind and
root Agent name/version; omit observer Node/session/push fields. Allocate the
unversioned Agent Node Repo's durable `producerIndex` with its frozen command and
retain that counter across empty outboxes or release changes. Retry identical input
until the receiving Chain acknowledges that producer position, then delete the
delivery row. Receiving Chains commit dense Agent progress with admission and
acknowledge covered positions before fresh grant checks. Agent Node Repos own no
private outcomes. Already admitted
commands replay through retained owner/contract context without current scheduled
Agent permission lookup. On release change, deliver existing outbox commands using their recorded
producer/owner/contract versions before atomically replacing the selected baseline.
Constructor activation only arms WakeRegistry; explicit initialization and alarm
advancement perform fallible delivery/snapshot/subscription outside the gate.
Rebinding retains matching attempted markers and rejects old-source pages.
Removing a Node binding stops production, drains frozen commands and becomes
dormant without deleting resources/checkpoints/markers or persisting a phase.

Agent browser Nodes retain selected rows/checkpoints and guarded read views.
Observer nodeId binds tickets/resume; it is not command producer identity.
SystemApi.openAggregateAgentSession and openServiceAgentSession read a coherent public snapshot directly. Agents have
no Actor claims or authentication callbacks; Studio owns administrative access.

## Aggregate actor and agent fanout subscriber identity

AggregateVersionChain fixes `systemId`, `aggregateId`, `aggregateName` and the
evaluating `aggregateVersion`. Its `actorVersionChainFanoutSubscribers` table
stores only `actorName`, `actorPath` and `acknowledgedAggregateIndex`; the actor
pair is unique and all three columns are non-null. Validate incoming actorVersion
against the bound immutable Aggregate release before storing membership or
progress. Derive actorVersion from that release to reconstruct the complete
AggregateActorVersionRepo key with the pair and bound Chain owner. Preserve the canonical authored actor path
and full owner-qualified identity at RPC boundaries; do not store a full Repo
name, opaque packed identity, hash or synthetic ID in this actor table.

`agentVersionChainFanoutSubscribers` stores only `agentName`, `agentVersion` and
`acknowledgedAggregateIndex`, unique by the agent name/version pair. Derive the complete receiving
AggregateAgentVersionRepo key from that name and the bound Chain owner. Service
Agent fanout similarly stores `agentName` and `acknowledgedServiceIndex` under the
bound Service release. Individual observer nodeId values never create projections.

Each Agent Chain has one fixed Node Repo recipient. Its
`nodeDeliveryAcknowledgement` singleton retains only acknowledgement progress;
derive the recipient from the Chain identity. Enrollment and catch-up retain
public history across their gap. Acknowledgement advances delivery state without
deleting public history.

The shared queue binds named identity columns and Effect callbacks from complete
Repo keys to identity records and back. Use the same record for enrollment,
lookup, acknowledgement and SQL exclusion. Other queues bind their existing
single identity column through this same API. Each Aggregate subscriber table's
acknowledgement records what AggregateVersionChain knows the corresponding
AggregateActorVersionRepo or AggregateAgentVersionRepo committed. It can lag that
Repo's materialization head and does not establish publication to its Chain.
Queue RPCs retain `currentIndex`. An absent row is unenrolled, zero is enrolled
without an acknowledged command, and reaching the source tip does not remove
membership. This representation introduces no availability or retirement policy.

## Service actor fanout subscriber identity

ServiceVersionChain fixes `systemId`, `serviceName` and the evaluating
`serviceVersion`. Its `actorVersionRepoFanoutSubscribers` table stores exactly
nonnullable `actorName`, `actorPath` and `acknowledgedServiceIndex`, unique over
`(actorName, actorPath)`. The bound Service release fixes one actor version per
actor name: derive it only from `boundServiceRelease.actor[actorName].version`.
Use that exact version and this Chain's owner fields to reconstruct the complete
ServiceActorVersionRepo key; store no version, physical Repo name or packed identity.

Enrollment retains the complete incoming key, including `actorVersion`, and the
RPC's `currentIndex`. Validate every bound source field and compare that version
with the bound declaration before reducing identity to the stored actor pair.
A mismatch cannot alias valid membership or advance acknowledgement. The shared
queue matches both actor columns for upsert, acknowledgement, selection and
in-flight/failed exclusion. Missing authored code fails reconstruction without
deleting membership or advancing progress, leaving durable alarm retry armed;
this binding adds no availability filter or retirement policy.

Canonical actor-path validation and exact source/actor/claims/producer privacy
remain with the receiving boundaries. Monotonic source acknowledgement can lag
ServiceActorVersionRepo's materialization head and does not establish its selected
publication to ServiceActorVersionChain. Caught-up rows remain enrolled. This
Service representation does not change Aggregate actor or agent identity models.
