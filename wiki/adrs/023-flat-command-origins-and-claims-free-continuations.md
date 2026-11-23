# Flat command kinds and claims-free external commands

**Date:** 2026-10-25
**Status:** Accepted; implemented under [Plan 265](../archive/plans/265-plan-flat-command-origins.md),
with the Actor submission amendment under [Plan 271](../archive/plans/271-plan-remove-connected-session-command-execution.md)
and the command-kind/admission-ticket amendment under [Plan 270](../archive/plans/270-plan-contract-release-names-and-command-kinds.md).
**Partially supersedes:** the copied Actor/Agent authority and nullable Actor producer
representation in [ADR 008](008-ordinary-and-recorded-continuation-authority.md),
[ADR 012](012-opaque-external-work-and-originating-chain-continuations.md) and
[ADR 016](016-aggregate-original-operations-and-external-work.md). Their ordering,
request ownership/retry, original-only production, atomic recording, exact release,
retained history and privacy decisions continue to govern.

## Context

Object command origin plus a separate nullable Node tuple admitted representable
Actor commands without a submitting Node. External commands copied historical
Actor authority despite recording an external observation rather than a new Actor
submission. Nested provenance also conflicted with indexed SQL producer fields.

## Decision

Canonical Aggregate and Service commands use scalar `kind` and root variant fields:

1. Actor requires Actor name/version, complete encoded claims, nonempty
   Node/session and a positive safe-integer push position. Ordinary session
   staging reaches canonical admission through that Node producer position;
   the Actor schema admits neither missing nor partially populated provenance.
2. Agent requires owner-local Agent name/version and omits Actor/Node fields.
3. System omits Actor/Agent/Node/parent fields. Both administrative command APIs
   accept only this ordinary variant.
4. External requires its own frozen child ID, immediate `originCommandId`
   and non-null external observation. It carries no Actor claims or Node position.

Ordinary variants have null external input. SQL retains scalar kind, nullable
flat provenance columns and structured claims JSON. Row codecs reject contradictory
columns and reconstruct absent inactive fields. Existing Node-position uniqueness
and duplicate-first complete immutable-input recovery remain.

Only the owning Chain's exact pending external work occurrence authorizes
observation recording. That transaction reads the stable child ID, exact
contract/payload/release and immediate parent from retained work, admits the
external command, and deletes pending work atomically. A parent ID grants no caller
permission. Ordinary ingress rejects external commands. A child B emitting work for C
records B as C's parent. No runtime parent traversal or claims hydration occurs.

External implementations cannot declare a claims codec. Their guard/program runs
with `claims: null` and canonical owner reads, without an Actor-specific guard.
Business identity needed at completion is explicit frozen payload and must be
checked against current model state. External Success/Failure remains recorded
input distinct from the external command's own execution outcome.

Session locks retain principal identity separately from command kind, including
the Aggregate lock's non-command `origin` field. Tickets derive principal
names/versions from that exact lock and retain actual Actor claims once outside it;
Agent tickets retain no Actor claims. Aggregate Actor snapshots expose flat
`actorName`, `actorVersion` and full encoded `claims`. Forwarding sends actual
Actor claims through `x-zerospin-claims`; the receiving Chain validates the selected
lock against its bound Actor key. Actor attachments retain those claims with
owner/session and connection phase/Node fields. Projection/history requests retain
flat caller Actor fields, and private completion compares the bound Actor identity,
full claims, session and Node. Agent snapshots and trusted Agent headers retain
`AgentOriginSchema`; Agent attachments derive their principal from the bound Chain
key. The identity cleanup is recorded in [Plan 272](../archive/plans/272-plan-remove-actor-origin-and-session-origin-union.md).

Flat pre-Node Actor drafts receive the required tuple at Node retention. Browser
publication stays selected and redacted; minimal public browser frames omit
provenance and claims. Ordinary recorded destination commands retain System kind.

## Trade-off and rollout

Flat variants put required invariants in concrete schemas and preserve direct SQL
indexes, at the cost of an explicit nullable-column row mapping. Claims-free
external commands remove historical Actor coupling; authors must freeze needed business
identity in payload rather than rely on inherited credentials. Immediate parents
retain causal inspection without creating a history dependency for execution.

This is a breaking fixed-format source cutover, including canonical/evaluated
command rows and pending command JSON plus retained
`SystemRepo.sessionWebSocketTickets.admission` JSON. Deployment requires separately
authorized empty affected Durable Object/browser storage; no compatibility decoder,
translation, reset or publication is part of this decision. A coordinated package
release and consumer pin/lockfile reconciliation follow the source gate.

## Actor submission amendment

Connected browser sessions expose synchronous local staging rather than a
separate canonical execution method. Actor commands reach admission through
ordered Node delivery and always retain their authenticated Actor identity and
complete Node producer position. The Node-less direct Actor variant and its
private execution RPCs are removed. Administrative System commands and Aggregate
authorization execution retain their own execution interfaces and canonical
`outcome`; they do not borrow an Actor submission path.

The SQL provenance columns remain nullable for command categories to which those
fields do not apply. Actor row decoding now requires the complete Node tuple,
so retained Node-less Actor rows are not valid input to the new fixed schemas.
Rollout requires separately authorized empty affected storage; no reset,
translation or compatibility decoder is part of this amendment.

## Explicit invocation grants and administrative programs

[ADR 031](031-register-ordinary-continuation-contracts.md) supersedes the
grant-derived inventory rule below. The release inventory can explicitly
register private follow-up and replay-only contracts.

Ordinary contract releases remain generic business declarations, with no immutable
invocation kind or principal. An owner derives its single execution-facing
`contracts` inventory from `actors[*].contracts`, `agents[*].contracts`, explicit
`system` grants and explicit `external` registrations. The same canonical ordinary
release may be granted to several principals and coalesces once. Competing objects
or versions under one command name, wrong keys/families and incompatible model or
external descriptor identities are refused. Actor grants satisfy declared claims;
Agent/System grants require claims-free ordinary contracts. Claims absence alone
confers no permission. External implementations cannot enter ordinary maps.

Fresh admission validates the exact Actor/Agent version and selected grant or the
owner's System grant. Non-Node exact retained-input recovery precedes these fresh checks; Node admission uses the independent producer checkpoint described below,
so grant changes do not reauthorize or invalidate already-admitted retries.
Execution/replay retains its admitted source release. External observation still
requires the originating Chain's pending occurrence and that emitting release's
exact `external` registration; parent identity alone grants no authority. Frozen
Agent deliveries retain their source binding while existing draining completes.
Command-operation destination validation, original preparation and Aggregate
`authorize.executeCommand` require an explicit destination System grant.

Completed and portable owner releases retain required System/external
name-to-version maps, including empty maps. Those maps are immutable owner-release
facts within atomic whole-SystemSpec acceptance; changing a previously accepted
release version's grants rejects the complete candidate. A new owner release may
change grants while reusing ordinary ContractSpecs. Selected lock codec facts and
principal identity retain their existing format. No additional accepted-grant or
support registry is introduced. Required grant maps change retained
`acceptedSystemSpecs.spec`; rollout requires separately authorized empty affected
storage, without missing-field defaults or translation.

Administrative callers supply a release and ID-less typed input to `executeAggregateCommand` or `executeServiceCommand`; `release.system` controls names/payloads. Preparation freezes immutable encoded input. Explicit fresh admission in AggregateChain/ServiceChain validates support and payload, allocates the shared logical position, derives the ID and retains the admitted command atomically. Aggregate IDs use `['system-aggregate', systemId, aggregateName, aggregateId, aggregateIndex]`; Service IDs use `['system-service', systemId, serviceName, serviceIndex]`, with the same `cmd_` and encoded JSON tuple construction as Node IDs. Releases, deployments and physical Archives do not enter identity. Public IDs remain opaque.

Every direct Effect execution, including an authored retry after an ambiguous timeout, creates another command and awaits that invocation's position. There is no allocator handle, producer facility, implicit retry or outcome cache. Frozen recorded System commands retain their separate recovery path. This makes the ambiguity explicit: authored business programs own convergence across repeated attempts. Shopping promotion keeps its existing bounded retries and response-integrity checks; its program handles repeated attempts for the same purchase.

The named `seeds` program receives `ISystemApi`, performs sequential create-only calls and checks every `outcome.result`. Failure stops later calls, including when a product already exists, while earlier command transactions remain committed. No deterministic canonical seed IDs, upsert, overwrite, whole-program rollback or automatic program retry are introduced.

## Derived Session identities, Plan 270 Phase 2C

Session staging retains an ID-less submission with non-reused Session coordinates and its local result. AggregateNode/ServiceNode allocate producer coordinates transactionally and derive the opaque canonical command ID from `['node', nodeId, pushIndex]`, encoded as `cmd_` plus `encodeURIComponent(JSON.stringify(tuple))`. Original Node rows retain Session and producer coordinates; final rows retain canonical IDs. Exact same-submission handoff compares immutable input before reusing the assignment.

AggregateChain and ServiceChain retain logical admission position and frozen per-Node producer bindings separately from command history. All append categories advance the same position. Node admission validates the derived ID, binding, next producer position and fresh grant/payload before atomic retention. Producer progress reconciles lost acknowledgements monotonically within locally issued bounds and the current Node/socket lifetime; it proves no execution or outcome fact. Other producers retain ID-based recovery. This trades explicit small checkpoints for admission independence from retained history without implementing Archive rollover.

The affected empty-state partitions are Aggregate/Service Session metadata and journals, Aggregate/Service Node journals (format 22), native persistent Session replicas (format 11), and AggregateChain/ServiceChain admitting databases. No reset, deployment or publication is performed; exact deployed/local partition identities must be inventoried and separately authorized before rollout.
