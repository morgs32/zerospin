---
title: Glossary
updated: 2026-11-21
---

# Glossary

## Hosted on ZeroSpinner

**Hosted** means ZeroSpinner deploys and runs your System in ZeroSpinner’s Cloudflare account. A hosted Instance can be a dev or production Instance.

## Self-hosted on Cloudflare

**Self-hosted** means you run `zerospin deploy` with Wrangler credentials for your own Cloudflare account. Your System runs in that account.

## Browser peer invitation

In the local peer authentication spike, a guest introduction shares the guest's
public encryption key and passkey registration with the host. The host encrypts
an invitation for that guest; redeeming it and proving possession of the guest
passkey lets the host record an admitted guest for later reconnection.

- [`peer-spike.tsx`](../examples/tic-tac-toe/src/routes/peer-spike.tsx) — handles introductions, invitation redemption, and passkey verification.
- [`storage.ts`](../examples/tic-tac-toe/src/peerSpike/storage.ts) — retains admitted guest authorization in the host browser.

## Saved position

An immutable record of a Game board at a chosen point in play. Later moves do
not change it. A finished position has no next turn. Saved positions belong to
one Game; starting a new Game leaves earlier positions with their original Game.

- [`savePositionV2.ts`](../examples/tic-tac-toe/src/contracts/savePositionV2.ts) — captures the board and its next turn when saving a position.

## Promotion commitment request

A Purchase claims its reservation when `reservationId !== null && subtotal !==
null`, including a zero subtotal. AggregateVersionRepo commits the valid quote
and commitment emission together. The retained reservation and subtotal survive
later refusal, payment, release or redemption; they prevent reservation reuse
and supply the Purchase binding for cancellation. Quote-only refusal leaves
subtotal null and the hold reusable. These facts do not establish Promotion
admission, execution or allocation status.

Reserve, release and redeem use command operations; AggregateChain retains each
pending delivery until durable Promotion admission acknowledgement. The existing
commitment external request supplies the decision required before payment. The
read-only Promotion session observes allocation resources without changing
Cart/Purchase or initiating work.

- [ADR 018](adrs/018-shopping-promotion-ownership-and-observation.md) — defines reservation claims, command delivery and allocation ownership.

## Promotion reservation

A one-use Promotion Service resource identified by reservationId and scoped to
an Aggregate/Cart, with nullable Purchase binding/deadline and one current status:
reserved, denied, committed, released or redeemed. A live reserved hold occupies
capacity for ten minutes. Committed allocations keep capacity through uncertain
payment without automatic expiry; redeemed allocations count permanently toward
the fixed 100 lifetime limit. Denied/released rows retire IDs, and a released
tombstone prevents delayed reserve/commit from reopening a cancelled ID.

Cart retains only selected/removal intent. Purchase freezes
its original Cart/reservation identity for commitment/release/redemption even
after the Cart's checkout pointer changes. Promotion is fixed at 50%; amounts are
integer cents, discount is floor(subtotal/2), and total is subtotal minus discount.

- [`PromotionReservationV1.ts`](../examples/shopping/src/zerospin/services/promotion/models/promotionReservation/PromotionReservationV1.ts) — declares the eight SQL fields through existing Model codecs.
- [Plan 239](archive/plans/239-plan-shopping-promotion-reservations.md) — records completed application implementation and verified promotion outcomes; framework/provider checks remain separate.

## Uncommitted reservation release

The narrow administrative command `releaseUncommittedReservation@1` in
Promotion `1`. Its payload contains `reservationId`, and its program explicitly
reads the current reservation through its declared model. ServiceVersionRepo requires an existing reservation whose status
is `reserved` and whose `purchaseId` is null, then records only a status change to
`released`. Expiry does not disqualify it. Missing, terminal or Purchase-bound rows
refuse with `promotion-reservation-not-releasable`. The canonical row remains;
Cart/Purchase and provider state are unaffected.

The `reservations` Service Agent selects those eligible rows across shoppers.
Its row-based wake rule returns the
recorded absolute `expiresAt`; the wake callback stages this contract. Studio only observes the selected reservations.
The command itself permits early administrative execution. Selection exit cannot
delete ServiceAgentNodeRepo's frozen command delivery. The customer-facing
Promotion shopper Actor remains read-only. Current Shopping declarations use
only integer revision `1` for User and Promotion; both Agents select their explicit Agent release 1. Plan 252
owns the clean-state reset; superseded Shopping declarations are removed.

- [`ReleaseUncommittedReservationV1.ts`](../examples/shopping/src/zerospin/services/promotion/ReleaseUncommittedReservationV1.ts) — checks eligibility before recording the status-only update.
- [`reservationsAgentV1.ts`](../examples/shopping/src/zerospin/agents/reservationsAgentV1.ts) — declares the all-shopper query, canonical release contract and absolute wake deadline.
- [Plan 252](archive/plans/252-plan-integer-authored-versions.md) — owns the integer V1 reset and readiness evidence.
- [Plan 246](archive/plans/246-plan-shopping-reservations-service-agent.md) — records the earlier rollout, local reset and Studio startup.

## Service logical evaluation time

Original ServiceVersionRepo execution samples one logical outcome.finalizedAt.
Replay reuses the retained original outcome.finalizedAt. Synchronous Service
validation/evaluation receives a frozen Effect wall Clock at that value; source
resource writes and retained outcome use the same time. This preserves lease
state decisions when replay occurs after real-world expiry. Live Clock still
provides monotonic timing and sleep; external requests, alarms and ordinary
queries use live wall time. This adds no durable timestamp or caller clock field.

- [ADR 015](adrs/015-service-delivery-history-and-projection-ownership.md) — owns the Service execution/replay rule, amended by Plan 239.

## Machine action

A named operation declared in a machine State's `actions` map and invoked
through its current Handle. Its payload schema validates input, and its program
returns a registered State value that the Actor commits before returning the
new Handle. Actions run explicitly; `onActivation` runs automatically when a
State becomes active. Machine actions have no Zerospin command admission or
journal lifecycle.

Each admitted action program runs in an Actor-owned Fiber while the transition
permit serializes invocations. Caller interruption cancels that program and
joins its cooperative finalizers before releasing the permit. Actor shutdown
marks Closing, cancels and joins the current program, then acquires the permit
to close its activation and Actor Scope. The close/save/publish transition runs
outside the program Fiber in an uninterruptible region; shutdown waits for an
already committing transition. A program or finalizer that remains
uninterruptible forever can still prevent closure.

- [`Route.ts`](../packages/machine/src/makeMachine/Route.ts), [`types.ts`](../packages/machine/src/types.ts) — declare action routes and their callable Handle surface.
- [`invokeActionProgram.ts`](../packages/machine/src/makeActor/invokeActionProgram.ts) — validates the payload and returned State.
- [`runOwnedActionProgram.ts`](../packages/machine/src/makeActor/runOwnedActionProgram.ts), [`closeActor.ts`](../packages/machine/src/makeActor/closeActor.ts) — enroll, cancel and join the owned program before gate release or Actor shutdown.
- [`commitActorTransition.ts`](../packages/machine/src/makeActor/commitActorTransition.ts) — commits outside the action program Fiber.

## System

The authored collection of versioned Aggregates and Services, their owner-local Actors, and independently declared Agents selected in owner-scoped registries.
Construction validates its registration graph, retains exact declaration types
and finalizes every participating contract lineage. Declare all upgrades before
System composition; extending any participating shared lineage afterward is refused.

Authored relationships describe the capabilities declared by that collection:
model access and selections, contract exposure, model operations, external
requests, command emissions and Agent callbacks. They do not specify program
execution order or establish that an admitted command was executed.

The Effect `System` service exposes the configured name and registries to
procedures. Runtime execution stays at the class boundary; Durable Object
Repos provide the service through their instance runtime view.

- [`system.ts`](../examples/shopping/src/zerospin/system.ts) — Defines the Shopping System and its versioned aggregate and service definitions.
- [`makeSystem.ts`](../packages/core/src/system/make/makeSystem/makeSystem.ts), [`types.ts`](../packages/core/src/system/types.ts) — validates and types canonical System registration.
- [`System.ts`](../packages/core/src/system/System.ts) — declares the injectable definition without runtime execution.

## System Worker

The stable Worker for one System. It hosts the public Gateway, SystemRepo,
and the AggregateChain and ServiceChain that order commands across owner
releases.

[Generic System Worker and projection placement](adrs/030-generic-system-worker-and-actor-projections.md)

## Direct framework upgrade

An upgrade from a supported Zerospin version to a newer version in one
deployment of the existing System. The upgrade preserves the System identity
and retained data without requiring an intermediate Zerospin deployment.

[Direct framework upgrade policy](adrs/032-direct-framework-upgrades.md)

## Independently deployed owner release (design spike)

An Aggregate or Service release served by its own execution Worker. A browser
session addresses the System instance and pins the exact owner release and Actor
version. The stable Worker hosts the System registry and the AggregateChain
and ServiceChain Durable Objects. Those Chains order commands across releases.
Release Workers host their VersionRepos, VersionChains and archives. Agents
use an independently deployed Agent Worker.

[Self-hosted release deployment spike](research/self-hosted-system-releases.spike.ts)
· [Verification of finalized replay history](research/zerospinner-replay-decisions.md#verification-of-finalized-replay-history)

## Owner release publication

Making an Aggregate or Service release callable through its release binding.
The first version of the owner-release Worker is uploaded and activated in
the same deploy.

[Deployment workflow](architecture/AuthoredSystem.md#zerospin-deploy)

## Agent Worker preparation

Uploading the next Agent Worker version and verifying its namespace bindings
while the current version remains active. On first deploy, an initial private
Agent Worker version is activated to provision those namespaces.

[Deployment workflow](architecture/AuthoredSystem.md#zerospin-deploy)

## System harness

The scoped local execution host created by `makeSystemHarness` from
`@zerospin/sdk/testing`. It accepts complete Actor, Agent and System commands and typed query
selections, applies real model operations to disposable SQLite, and dispatches
emitted commands, external callbacks and due registered Agent wakes on
`flush`. It shares the test's Effect Clock and application services. Actor commands
validate captured claims and exact grants, run owner guards with Actor context,
and read through captured selections. Agent/System commands require their
respective explicit maps and use null claims. The Layer's typed Service API
selects only `release.system` actions.

The harness assumes distributed admission, delivery and persistence work. Its
local outcomes and command cache establish no durable Chain history,
recovery, browser replication or authentication result.

- [`makeSystemHarness.ts`](../packages/core/src/testing/systemHarness/makeSystemHarness.ts) — provides `push`, `flush` and typed `query`.
- [`system.spec.ts`](../examples/shopping/tests/system.spec.ts) — exercises Shopping through visible SDK commands and expected business results.

## shape

A map from field names to primitive descriptors. It defines a row's values,
nullability, and relationships, and is used for table properties and contract
payloads. One descriptor compiler owns decoded value validation and portable
encoding. Complete rows apply defaults and require declared fields; patches
preserve omission separately from explicit null. JSON fields retain their
authored decoded Type, including refinements and nested Dates.

- [`types.ts`](../packages/shapes/src/types.ts) — defines shapes, primitive descriptors, and inferred row values.
- [`makeShapeCodecs.ts`](../packages/shapes/src/makeShapeCodecs.ts) — derives complete, portable and patch codecs from the same descriptors.

## CartItem quantity

Shopping user AggregateVersionRepo.cartItem stores `quantity`, the positive
integer count of a Product in a Cart. addToCart.payload.quantity is an increment;
updateCartItemQuantity.payload.quantity is the desired absolute count. Checkout
and payment use the same term as PurchaseItem.quantity. The named unique index
`cartItem_cartId_productId_unique` declares one product line per Cart through
`UNIQUE(cartId, productId)` while retaining the canonical line ID. Deletion frees
the pair for readdition. Copied CartItem name/price remain display previews;
Marketplace independently determines the quote and payment total.

- [CartItemV1](../examples/shopping/src/zerospin/aggregates/user/models/cartItem/CartItemV1.ts) — declares quantity and the composite unique index.
- [Plan 237](archive/plans/237-plan-cart-item-quantity-and-product-uniqueness.md) — records the completed authored hard cutover and verified cart quantity/uniqueness behavior.

## model row and resource envelope

A model row stores authored attributes plus `id`, `createdAt` and `updatedAt`.
The canonical Model's table and SQL query types describe that row. A complete
resource envelope also contains the exact bound `modelName` and positive safe
integer `version`;
`propertiesShape`, resource schemas, specifications, snapshots, selected deltas
and deletion inverses retain them. Existing model/table codecs convert at those
boundaries, validating supplied full identity before writes and reconstructing
identity for export. The resource `version` uses an integer scalar descriptor;
the two constants are omitted from physical model table columns and are not
SQL filters or ordering fields. This is one common model format across resource owners, with no storage
policy or per-owner binding. [Plan 236](archive/plans/236-plan-model-rows-and-resource-envelopes.md)
records the cutover and its verification evidence. Changed persistent model
schemas require empty affected storage.

## modelId

A prefixed ID value constructed from a stable `defineModel` identity. It retains
only the ID abbreviation and supplied scalar options. It carries no local
relationship, selected model version or model capability. Contract payloads and
cross-owner identities can use it without requiring a local destination row.
Decoding a model ID neither generates it nor proves that a resource exists.

- [`modelId.ts`](../packages/core/src/models/modelId.ts) — constructs the scalar ID descriptor from the model definition.

## modelRef

A scalar ID descriptor with local `references` metadata naming a stable
`defineModel` identity and its prefixed `id` contract. The descriptor retains no
model or Table object. The owner release selects the concrete referenced model
version; database binding validates its logical name and compatible scalar key. Unrelated referenced-model attributes
do not version unchanged referencing models or contracts. Direct contract model
authority remains bound to exact canonical objects. Self references retain their
model's key; multi-table reference cycles remain rejected.

- [`modelRef.ts`](../packages/core/src/models/modelRef.ts) — declares stable relationship metadata.
- [Stable model reference identity](./research/stable-model-reference-identity.md) — records ownership, versioning and verification status.

## Database definition

The immutable physical table graph bound before a database opens. It retains
exact Table identities, physical names, primary keys, references and indexes;
Drizzle schemas, relations and provisioning statements derive from that graph.
Fixed phase indexes declare their null predicates here; provisioning compares
them with retained physical metadata. A mismatched existing schema refuses
provisioning. System-Worker framework tables evolve through local up-only
migrations; authored table definitions remain immutable. Connected browser Node
storage has its own supported forward-upgrade history under an unchanged authored
binding. Other changed fixed client schemas require empty storage unless a
supported upgrade path is explicitly approved. Retained Nodes keep their version
and identity gates; an upgrade incompatibility never authorizes replacement.
Connected Aggregate and Service workers may repair or recreate their affected
namespace in production and development after validating a fresh authenticated
snapshot. Preserving repair keeps recoverable producer and original-command
identities; unrecoverable state permits fresh-producer replacement after owned
storage handles drain under namespace exclusion. Failed authentication,
connectivity or snapshot validation preserves storage. Standalone local recovery,
native files and backend databases retain their own storage policy.

- [`bindDatabaseDefinition.ts`](../packages/core/src/drizzle/definition/bindDatabaseDefinition.ts) — validates and binds the physical graph.
- [`compileSqliteTableDefinition.ts`](../packages/core/src/drizzle/definition/compileSqliteTableDefinition.ts) — derives structured provisioning statements, including phase indexes.

## ShapeForm

A generated form whose shape defines its fields and submitted values. Editable
drafts remain separate from the decoded row delivered after whole-form
validation.

- [`ShapeForm.tsx`](../packages/react/src/primitives/ShapeForm.tsx) — owns form drafts, shape validation, and decoded submission.

## service

A versioned owner created with `defineService` and `makeServiceRelease`. It owns its models, contracts and actors. Commands operate on exact owned models. Typed administrative selections read its declared models through `SystemApi.executeServiceQuery`; browser queries read selected local materializations. Its retained final history supplies actor projections and service sessions.

## receiving obligation pin

The retained receiving service composition for one logical source owner, obligation type, and request ID. Producer version is provenance and is excluded from identity. A service's ordinary request declaration identifies its intake contract, identity field, and actor. Payment intake and processing share this scope; the source actor's service authentication declares their initial receiving version. Fulfillment takes its initial destination from the verified checkout invocation, including in manual compositions. ServiceChain retains the original receiving version after completion. Intake command admission and execution ownership checks prevent another receiving version from independently accepting or processing the same request.

The pin also retains the first admitted request command ID. An authenticated repeat with identical immutable facts recovers that command's original receiving version and result; changed facts conflict. A new producer version does not rewrite the retained invocation or create another obligation.

- [`admitServiceCommands.ts`](../packages/system-worker/src/ServiceChain/admitServiceCommands/admitServiceCommands.ts) — atomic first intake and original-command resolution.

## service-owned payment attempt

An ordinary immutable request accepted by the payment service from a source payment intent. It retains the accepted quote, original cart-item IDs, stable provider key, provider evidence revision, and acknowledged reporting revision. Uncertainty requires reconciliation of that same request; it does not permit replacement collection. Confirmed decline allows an explicitly new source intent. Known success can be reported again without calling the provider.

## declaration version and composition version

Every authored model, contract, actor and aggregate/service release uses a positive safe integer version, scoped to that named declaration. New revisions normally advance `1`, `2`, `3`; explicit lineage governs payload adaptation and does not infer compatibility from the number. Unchanged declarations retain their version when a containing release changes. A complete service composition has its own exact version in `makeServiceRelease`. Factory names such as `makeFulfillmentServiceModuleV1` identify a construction recipe and do not imply the composition's version. Agent declarations have their own `agentVersion`, bind one exact owner release and serve as their own session definitions. Owner-scoped `aggregateAgents` and `serviceAgents` registries select an active Agent release independently of owner composition and observation availability. npm package versions and deployment artifact identities remain separate.

- [`makeServiceRelease.ts`](../packages/core/src/service/make/makeServiceRelease.ts) — produces literal-keyed service releases.

## aggregateId

An opaque application-chosen string identifying one aggregate instance within its
`aggregateName` and owning system. Zerospin adds no prefix and assigns no meaning
to its format. Applications may constrain IDs through their own claims schemas.
Authentication must return the requested ID, and the selected actor still owns
authorization. Aggregate IDs are stored as text; model and protocol ID prefixes
remain separate conventions.

## systemId

The `sys_`-prefixed deployment identifier supplied through
`makeConfig({ system, systemId })` and embedded in generated Worker configuration. It
keys the singleton SystemRepo and is the first identity field for every direct
Repo. It remains in backend capabilities, tickets, routing, and Repo identities,
but is intentionally absent from `IAggregateSessionSnapshot`,
`IServiceSessionSnapshot`, aggregate/service browser session state, and durable browser node and standalone storage identities. Those session values are scoped by their
API origin or local storage namespace rather than carrying the deployment ID as
application state.

- [`makeWranglerConfig.ts`](../packages/dev-worker/src/makeWranglerConfig.ts) — embeds the configured system ID as the Worker binding.
- [`SystemRepo.ts`](../packages/system-worker/src/SystemRepo/SystemRepo.ts) — addresses the singleton SystemRepo by the decoded configured system id.
- [`AggregateChain.ts`](../packages/system-worker/src/AggregateChain/AggregateChain.ts) — includes `systemId` in aggregate-chain instance identity and configures its migratable framework schema.
- [`types.ts`](../packages/core/src/aggregateSession/types.ts), [`types.ts`](../packages/core/src/serviceSession/types.ts) — define aggregate and service session snapshots and session state without `systemId`.
- [`sessionKey.ts`](../packages/core/src/Node/sessionKey.ts) — hashes the bound definition, backend/system scope, versioned owner identity, and complete authenticated claims. Standalone sessions hash their authored scope, generated path and complete canonical session lock, then bind one aggregate ID independently of incidental claims values and worker builds.

## framework storage migration

An immutable, ordered SQL step that advances one physical Durable Object's
framework schema. Its SQL, ledger stamp and complete ledger check commit in one
synchronous transaction. The shared `applied_migrations` ledger retains only
`migrationId` and `definitionChecksum` for every represented entry, including
baseline zero. The SHA-256 checksum binds the authored ID, name and exact SQL;
the constant baseline checksum does not fingerprint the database graph or data.
The final pending step validates the full current physical graph after stamping,
refusing views, triggers and undeclared column
collations. History is append-only and up-only; a corrective migration follows
a bad migration. `storage.sync()` confirms each committed step before the next
one, so later constructor failure retains that progress. This revision is separate from authored release versions and
contract payload `up`/`down` adapters. The first baseline requires empty
pre-release storage, including unstamped view-only storage. Fresh storage
provisions the declared current graph and stamps represented history without
replaying old SQL.

- [`makeMigratableDORepo.ts`](../packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepo.ts) — validates history and schema before bootstrap, recovery and alarm dispatch.

## Repo

A direct Durable Object class that owns one keyed database, durable boundary,
and its deferred work. SystemRepo, input Chains, version Repos/Chains and selected
Actor/Agent Repos/Chains have distinct ownership and retention responsibilities.

- [`RepoTypeSchema.ts`](../packages/core/src/system/RepoTypeSchema.ts) — enumerates the supported concrete Repo kinds.
- [`makeWranglerConfig.ts`](../packages/dev-worker/src/makeWranglerConfig.ts) — assigns Repo namespaces to their owning Workers.

## SystemRepo

The singleton Repo keyed by `{ systemId }`. It owns accepted whole SystemSpecs, registered aggregate identities `{ aggregateName, aggregateId }`, Repo inspection, and single-use session WebSocket admission tickets. It forwards spent tickets only to the selected actor or agent Chain.

- [`systemRepoDbConfig.ts`](../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts) — declares whole accepted snapshots, registrations, aggregate identities and tagged tickets.
- [`handleFetch.ts`](../packages/system-worker/src/SystemRepo/handleFetch/handleFetch.ts) — spends a matching-family ticket before forwarding its retained admission.

## Telemetry capture

The completed Effect spans, logs, and causal links retained for one execution.
Local inspection includes records produced by that execution and records
received from remote executions. Hosted export is optional and includes only
records produced by the owning execution. Browser session inspection retains
its history until it is cleared.

Actor authentication, full claims validation and canonical identity checks run
without durable audit writes. [ADR 017](adrs/017-admission-without-durable-audit.md)
retires local admission-audit retention; optional hosted telemetry supplies
diagnostics without promising equivalent audit durability.

- [`TelemetryCollector.ts`](../packages/logger/src/TelemetryCollector.ts) — distinguishes produced records from imported history.
- [`captureTelemetry.ts`](../packages/logger/src/captureTelemetry.ts) — snapshots diagnostics and the complete execution Exit.

## Backend trace reference

The actual OTLP trace and span identifiers of a captured backend invocation
selected for configured hosted export. It provides an investigation coordinate,
not a promise of delivery, retention, or immediate provider indexing. An
originating reference survives error propagation. `getBackendTrace` reads a
valid reference from an unscoped framework failure; `ZerospinErrorPage` displays
its identifiers. Studio trace pages and provider links are deferred.

- [`BackendTraceSchema.ts`](../packages/error/src/BackendTraceSchema.ts) — requires nonzero canonical OTLP identifiers.
- [`reportRpcTelemetry.ts`](../packages/system-worker/src/reportRpcTelemetry/reportRpcTelemetry.ts) — attaches a reference to an encoded framework failure without mutating its source.
- [`getBackendTrace.ts`](../packages/error/src/getBackendTrace.ts) — reads a valid framework reference without changing the error.
- [`ErrorPage.tsx`](../packages/error-boundary/src/ErrorPage.tsx) — displays present trace and span identifiers.

## GatewayApi

The Worker-hosted root capability with exactly three public getters:
`getSystemApi`, `aggregate`, and `service`.

- [`GatewayApi.ts`](../packages/system-worker/src/GatewayApi/GatewayApi.ts) — defines the complete public Gateway surface.

## authored declaration

The TypeScript object authored for a release, Actor, Agent, model or contract,
including its executable functions. Declaration identity and its portable spec
are separate from those functions' behavior.

## spec

The portable JSON facts of an authored declaration. Each contract release owns a
complete singular spec: name/version, payload, contract claims, failures, result,
read models, operations and external response/timeout metadata. Runtime lineage,
programs, authentication, authorization and executable codec/adapter bodies are
outside those facts. Exact equality protects declared metadata, not executable
behavior.

Aggregate, Service, Actor and Agent Release factories retain native declaration
bindings and captured selections. `makeSystemSpec` projects their portable facts
after System composition has validated the graph and finalized Contract lineage.
Factory declarations are not separately accepted snapshots. Observer/session
locks keep their separate selected-version format. Portable facts never
reconstruct executable capability or authority.

- [`makeReleaseSpecs.ts`](../packages/core/src/declaration/makeReleaseSpecs.ts) — projects owner and Agent version bindings.
- [`makeActorSpecs.ts`](../packages/core/src/declaration/makeActorSpecs.ts) — projects Actor facts with inline exposed-model projections.
- [`projectSessionFacts.ts`](../packages/core/src/system/project/projectSessionFacts.ts) — selects singular contract facts for a session lock.

## SystemSpec

The complete compiled portable snapshot of a System. Each Aggregate/Service owner retains complete canonical definitions once in
`modelVersions`, `contractVersions`, `actorVersions` and `agentVersions`, keyed
by declaration name and exact version. Each owner retains its explicit `canonical`
selection and every registered release in `releases`. Release `models`, `contracts`,
`actors` are numeric version bindings into those owner-local
registries; `system` and `external` remain exact command-version grant maps.
Contract reads carry selected field shapes independent of the source model version;
Agent read-model maps retain full projected model specs. Mutation operation metadata carries
`{ modelName, version }`. Actor `exposedModels` stays inline in
each Actor version: a limited projection may share a canonical model identity
while intentionally exposing fewer fields.

The compiler retains every reachable Contract version's own facts, including
historical sources, intermediate codecs and descendants absent from current
release grants. It gathers canonical models from releases, Contract mutations while rejecting conflicting owner-local version facts. Agent limited models are validated against their exact bound owner and retained inline in their Agent specs. Contract read
requirements are checked against the model selected by each owner release.
Runtime `previous`/`next` links and callbacks stay executable. Historical metadata
never grants fresh command support.

`makeSystemSpec` is synchronous. It projects portable JSON and computes SHA-256
over canonical content excluding `.hash`. Object-key order is canonical; array
order remains significant. The returned snapshot is ordinary JSON, without
freezing it. `makeSystem` finalizes the participating Contract graph before spec
compilation. Receiving RPC/storage boundaries validate identities and references.
The same normalized format serves inspection, Studio, deployment artifacts and
acceptance. See [ADR 026](adrs/026-owner-local-system-spec-definition-registries.md).

- [`makeSystemSpec.ts`](../packages/core/src/system/make/makeSystemSpec.ts) — collects owner-local definitions and compiles their bindings.
- [`SystemSpecSchema.ts`](../packages/core/src/system/SystemSpecSchema.ts) — validates normalized identities, references, projections and release grants.
- [`hashSystemSpec.ts`](../packages/core/src/system/hashSystemSpec.ts) — computes deterministic content identity.

## accepted SystemSpec

A complete SystemSpec durably retained by SystemRepo after whole-spec acceptance.
`acceptedSystemSpecs` stores unique `hash` and complete typed JSON `spec`; the row
key matches the snapshot's `.hash`. Retention is permanent, including snapshots
omitted by later composition or retained after a failed promotion. The first
accepted pin fixes the exact Worker version for an owner release. No individual
model, Contract, release, Actor or Agent is separately accepted.

## SystemSpec acceptance

One atomic operation that accepts or rejects the supplied complete SystemSpec.
SystemRepo strictly validates candidate JSON and recomputes its supplied hash.
Within one synchronous transaction, it compares immutable version facts against
all retained snapshots, then inserts only the whole successful snapshot. These
component comparisons are internal acceptance checks. Model, Contract, Actor and
Agent scope is Aggregate/Service namespace plus owner name, declaration name and
exact version; enclosing release version is excluded. Release facts compare the
exact model, Contract, Actor, Agent and System/external grant bindings. Node selections
remain changeable composition facts. Equal acceptance writes nothing; conflicts
retain no new snapshot. Omission never erases earlier immutable facts.

Acceptance uses the supplied candidate's spec even when SystemRepo executes a
different Cloudflare Worker version. Acceptance does not prove promotion,
initialization or provider delivery. The storage/spec hard cutover requires empty
affected storage, without a compatibility decoder, migration or automatic reset;
resetting storage requires separate explicit authorization.

- [`acceptSystemSpec.ts`](../packages/system-worker/src/SystemRepo/registerSystemSpec/registerSystemSpec.ts) — validates candidate content/hash correspondence.
- [`registerSystemSpecTx.ts`](../packages/system-worker/src/SystemRepo/registerSystemSpec/registerSystemSpecTx.ts) — compares immutable facts and retains one whole snapshot atomically.

## SystemSpec hash check

The membership check that requires an actual compiled SystemSpec hash to be
present in SystemRepo's accepted snapshots. Child construction derives the hash
from its configured executable System and awaits registration before local SQL,
migration, bootstrap or activation. Registration records physical Repo metadata
only and cannot accept a new snapshot. SystemRepo keeps its self-registration
exemption; standalone Repos have no such prerequisite.

Session-ticket issuance checks SystemRepo's own executing compiled hash locally,
after ordinary session authority validation. No browser-supplied hash is accepted.
Startup and ticket issuance do no structural re-comparison. Replay adds no
acceptance RPC; stored payload, adapter-output, history and exact-model operation
validation remain separate.

- [`registerRepoWithSystem.ts`](../packages/system-worker/src/SystemRepo/registerRepo/registerRepoWithSystem.ts) — carries the configured hash with physical registration metadata.
- [`requireAcceptedSystemSpec.ts`](../packages/system-worker/src/SystemRepo/requireAcceptedSystemSpec.ts) — checks accepted whole-snapshot membership.

## Aggregate catalogue membership

The `(aggregateName, aggregateId)` pair retained in SystemRepo's `aggregates`
table. AggregateChain awaits `registerAggregate` during `onRepoStartup`, after
its hash-gated physical Repo registration and durable local initialization.
The idempotent insert commits separately from physical metadata. Discovery omits
an identity until membership exists; neither catalogue proves completed
activation. Membership failure propagates from activation, and the next addressed
activation retries registration.

- [`registerAggregate.ts`](../packages/system-worker/src/SystemRepo/registerAggregate/registerAggregate.ts) — inserts the Aggregate identity without changing physical Repo metadata.
- [`AggregateChain.ts`](../packages/system-worker/src/AggregateChain/AggregateChain.ts) — awaits membership registration before recovery holds and queue wakeups.

## Executing Worker version

The ID returned by authenticated `getExecutingWorkerVersion()` from the addressed
SystemRepo's own version-metadata binding, or null without that binding. HTTP
candidate routing and durable-object assignment are separate. Deployment accepts
once before promotion, then polls this read-only observation before initialization.

- [`awaitSystemRepoVersion.ts`](../packages/cli/src/deploy/utils/awaitSystemRepoVersion.ts) — waits for post-promotion assignment without repeating acceptance.

## SystemApi

The administrative capability bound to `{ systemId }`. It serves the System
spec, typed aggregate/service reads, singular aggregate/service command outcomes,
Repo inspection and health checks. HTTP callers acquire it through the deployment
secret-key policy; native callers already hold a trusted System identity. Both
receive `ISystemApi`: selected result types and row mapping remain local while
the raw capability retains its linked wire protocol. Aggregate and service
execution return the original retained `ICommandOutcome` directly, without the
admitted command or its chain/session coordinates. The typed methods take one
exact owner release and `{ contractName, payload }`; Aggregate input also
supplies `aggregateId`. Only `release.system` names and payloads are eligible.
Preparation freezes ID-less encoded input; each execution allocates a new command inside the admitting Chain. Business Failure remains in `outcome.result`.

- [`SystemApi.ts`](../packages/system-worker/src/SystemApi/SystemApi.ts) — binds the raw capability and its concrete administrative methods to `systemId`.
- [`ISystemApi.ts`](../packages/core/src/systemApi/ISystemApi.ts) — names the common typed administrative interface.
- [`getSystemApi.ts`](../packages/core/src/utils/getSystemApi/getSystemApi.ts) — acquires the HTTP capability before constructing typed methods.
- [`getNativeSystemApi.ts`](../packages/system-worker/src/getNativeSystemApi/getNativeSystemApi.ts) — acquires the same typed interface through native linked-envelope invocation.

## seed program

A named `seeds` export receiving the typed `ISystemApi` and returning an Effect
with a void result. The program owns sequential administrative calls, inspects
each `outcome.result` and stops on business Failure. Each command commits
independently; stable IDs recover exact reruns without overwriting existing data.
CLI success means the program completed, not that later external work finished.

## AggregateSessionApi

The authenticated aggregate session capability binds `{ systemId, aggregateId,
aggregateName, aggregateVersion, claims, actorName, actorVersion, actorPath, sessionName,
aggregateSessionLock }`. Worker configuration supplies `systemId`; gateway
selection supplies the aggregate name/version; admission supplies full claims,
`aggregateId`, actor name/version, and the canonical derived `actorPath`.
The Access API retains that context and constructs the capability from the
checked session spec returned after the actor authorizer succeeds. That
backend authorizer can execute owner-catalog commands through system authority
before granting access; its authoritative final commands remain backend-side.
Authentication receives the explicitly requested aggregate ID and credentials, verifies them, and supplies complete claims. Admission rejects a returned aggregate ID that differs from the request before creating access capabilities. Tickets retain those fields
for the ActorVAC socket, which admits commands only after history validation
and returns AC admission acknowledgements on that same socket. `getSnapshot({ nodeId })` supplies a version-pinned
`IAggregateSessionSnapshot` and node reconciliation watermark; `getBrowserCommands`
supplies retained browser command rows without resubmitting bound owner fields. The capability has no remote service-query method; browser data comes from actor-selected materialization.

- [`onMessage.ts`](../packages/system-worker/src/aggregateSessionChain/onMessage/onMessage.ts) — validates connection-bound input, directly admits ordinary commands and verifies the immutable receipt.
- [`AggregateAccessApi.openSession`](../packages/system-worker/src/AggregateAccessApi/openSession/openSession.ts) — constructs the session capability from retained admission context and the checked session spec.

## ServiceSessionApi

The independently disposable read-only child capability binds `{ systemId,
serviceName, serviceVersion, claims, actorPath, sessionName,
serviceSessionLock }`. Worker configuration supplies `systemId`; gateway
selection supplies service name/version. ServiceApi.admit retains full encoded
claims and the canonical derived `actorPath`; ServiceAccessApi.authorize supplies
`sessionName` and the full lock, including exact Actor name/version. Admission
authenticates configured credentials or validates claims under an authored
authentication-none policy; neither admission nor authorization depends on durable
diagnostic writes. It serves `IServiceSessionSnapshot`, filtered `IServiceExposedCommand` history
through `getBrowserCommands({ afterServiceIndex })`, and WebSocket tickets.
The authenticated service socket admits ordinary service commands independently
of this snapshot/history capability.

- [`ServiceAccessApi.authorize`](../packages/system-worker/src/ServiceAccessApi/authorize/authorize.ts) — authorizes verified service access and constructs the session capability.
- [`ServiceSessionApi.ts`](../packages/system-worker/src/ServiceSessionApi/ServiceSessionApi.ts) — exposes snapshots, browser-command history, and one-time ticket operations.

## aggregate release and service release

A complete authored definition of one named aggregate or service at an exact
version. A release contains its owned models, contracts, and actors, plus
aggregate guards. Service reads are typed selections on the administrative capability, not authored release callbacks. It is a release whether deployed or not;
its version is the registry key, not a deployment identifier.

- [`makeAggregateRelease.ts`](../packages/core/src/aggregate/make/makeAggregateRelease.ts) — constructs an aggregate release.
- [`makeServiceRelease.ts`](../packages/core/src/service/make/makeServiceRelease.ts) — constructs a service release.

## aggregate release predecessor

The earlier release of the same Aggregate named by `branchFrom` or `rebuildFrom`.
Only the first release may omit a predecessor. Every subsequent release declares
exactly one of the two, even when the Aggregate has no commands. The named
predecessor stays listed for as long as the referencing release is listed.

## aggregate release branch

An Aggregate release that inherits the evaluated state of an explicitly named
earlier release at a fixed branch point in the Aggregate's command history. The
new release begins its own evaluations after that position.

The proposed release declaration names the earlier release with `branchFrom`.
After the branch point, each configured release continues to receive finalized
commands for that Aggregate. Removing a release from the System configuration
ends ordinary replay. The removed release finishes commands already admitted
to it, including any replay needed to reach their preceding positions. A child
reads its fixed prefix from history its predecessor has already published.

## aggregate release branch point

The child release's deployment watermark for a particular Aggregate instance. A
branch inherits its predecessor's evaluations through that position and
evaluates subsequent commands itself. A rebuild uses the same cutoff to read
its predecessor's admitted commands.

## Aggregate deployment watermark

The admitted position of an Aggregate instance when `AggregateChain` first
enrolls a child release. Releases enrolled together get the same watermark.
The child reads its named predecessor through that fixed position and receives
later commands from `AggregateChain`.

## aggregate release rebuild

An Aggregate release that builds its own state by evaluating the full command
history of an explicitly named earlier release, including any prefix inherited
from that release's predecessors. The release declaration names the history
source with `rebuildFrom`.

## actor release

A complete authored Aggregate or Service actor implementation at an exact numeric
version. It owns authentication, identity, canonical query authority, exposed
models, selections, contracts and actor admission policies. The factory constructs
a release; `actorVersion` identifies which release a session or command names.

- [`makeAggregateActorRelease.ts`](../packages/core/src/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease.ts) — constructs `IAggregateActorRelease`.
- [`makeServiceActorRelease.ts`](../packages/core/src/serviceActor/make/makeServiceActorRelease.ts) — constructs `IServiceActorRelease`.

## contract release

An immutable authored Aggregate or Service contract implementation at an exact
numeric version. It owns payload and result codecs, failures, read and operation
permissions, guard and program. Its stable definition identifies the contract;
`contractVersion` identifies the release. External contract releases additionally
bind the exact shared external declaration to the backend request and program.
An owner release supports the exact versions listed in its `contracts` inventory.
Direct invocation requires its own Actor, Agent, or System grant. A private
operation follow-up is authorized by its recorded operation and declared branch.
The inventory can include replay-only contracts. [ADR 031](adrs/031-register-ordinary-continuation-contracts.md)

The same ordinary contract release may be granted through multiple principal
maps. `command.kind` identifies the actual invocation. System and Agent grants
require claims-free ordinary releases. External implementations are registered
through `external`. The owner rejects competing objects under the same name.

- [`makeAggregateContractRelease.ts`](../packages/core/src/contracts/make/makeAggregateContractRelease.ts) — constructs an `IAggregateContractRelease`.
- [`makeServiceContractRelease.ts`](../packages/core/src/contracts/make/makeServiceContractRelease.ts) — constructs an `IServiceContractRelease`.

## contract read projection

An explicit selection of whole model fields, shared by a contract's guard and
program. `models: { site: { model: siteV1, fields: ['userId'] } }` makes `id`
and `userId` readable through `db.models.site`. Zerospin checks the selected
release model's read shapes and scopes query results to those fields. A model may
gain unrelated fields without changing the contract. Model mutation descriptors
remain bound to their exact model version.

- [`readProjection.ts`](../packages/core/src/contracts/readProjection.ts) — captures and checks projected read requirements.

## aggregate registry and service registry

A map from exact integer versions to authored releases of one named aggregate or
service. `system.aggregates` and `system.services` map owner names to these
registries. `makeSystem` validates name/version keys, actor-version ambiguity,
service-model ownership, and Agent releases, then retains the supplied maps and
precise release types. Optional omitted service and agent maps are empty.
Releases of one service may reuse a canonical model; different services cannot
own the same model object. Model and contract registries have their own value
types; the release-value convention applies to aggregate and service registries.

- [`makeSystem.ts`](../packages/core/src/system/make/makeSystem/makeSystem.ts) — validates registration without rebuilding its maps or releases.

## replay subscriber and acknowledged position

A replay subscriber is one receiving release of an `AggregateChain` or `ServiceChain`. Its acknowledgement records the inclusive contiguous position confirmed to the Chain. A release may be ahead after partial page commitment or a lost acknowledgement. An Aggregate subscriber also has a deployment watermark that identifies which positions it receives from its predecessor. Authored release membership governs enrollment and dispatch. An omitted release retains its dormant cursor.

- [`aggregateChainDbConfig.ts`](../packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts) — declares the two-column replay enrollment.
- [`serviceChainDbConfig.ts`](../packages/system-worker/src/ServiceChain/serviceChainDbConfig.ts) — declares receiving service releases and their acknowledged positions.
- [`makeFanoutQueueStorage.ts`](../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts) — selects available recipients and advances confirmed progress monotonically.

## actor fanout subscriber and acknowledged Aggregate position

One enrolled AggregateActorVersionRepo within a bound AggregateVersionChain.
`actorVersionChainFanoutSubscribers` contains exactly `actorName`, `actorPath`
and nonnullable `acknowledgedAggregateIndex`, with composite uniqueness over the
actor pair. Enrollment validates incoming actorVersion against the bound immutable
Aggregate release; reconstruction derives that version from the same release. AggregateVersionChain's bound `systemId`,
`aggregateId`, `aggregateName` and evaluating `aggregateVersion` reconstruct the
complete AggregateActorVersionRepo key; the row stores no full Repo name or packed
replacement identity. An absent row is unenrolled; zero is enrolled with no
acknowledged command. Reaching the source tip retains membership for future pushes.

`acknowledgedAggregateIndex` is the inclusive contiguous command position whose
AggregateActorVersionRepo receipt AggregateVersionChain retained. Enrollment and
receipts advance it monotonically. It may lag AggregateActorVersionRepo's actual
materialization head after a lost receipt, and does not establish that
AggregateActorVersionChain retained selected publication. Shared queue RPCs still
call the reported cursor `currentIndex`. The queue binds named identity columns
and Effect conversions between complete Repo keys and identity records; the Agent
queue uses its Agent name/version pair and other owners bind their existing single
identity column through the same API.

- [`aggregateVersionChainDbConfig.ts`](../packages/system-worker/src/AggregateVersionChain/aggregateVersionChainDbConfig.ts) — declares three-column actor membership and the unique actor pair.
- [`makeFanoutQueueStorage.ts`](../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts) — matches structured identity for enrollment, bounded selection and monotonic acknowledgement.

## agent fanout subscriber and acknowledged Aggregate position

One enrolled AggregateAgentVersionRepo within a bound AggregateVersionChain.
`agentVersionChainFanoutSubscribers` stores nonnullable `agentName`, `agentVersion`
and `acknowledgedAggregateIndex`, unique by the Agent name/version pair. The bound `systemId`,
`aggregateName`, `aggregateId` and evaluating `aggregateVersion`, together with
the subscriber name/version pair, reconstruct its complete key. Individual observer `nodeId` values do not identify projections.

The acknowledgement proves committed materialization through that position; it
can lag the receiving checkpoint after a lost receipt and does not establish
publication to AggregateAgentVersionChain. Absent means unenrolled, zero means
enrolled without an acknowledged command, and caught-up rows stay enrolled.
Retained source history covers catch-up followed by enrollment. Each declared
Agent in the bound owner release may receive new history regardless of automation
selection. Subscriber acknowledgements remain independent; history is retained.

- [`aggregateVersionChainDbConfig.ts`](../packages/system-worker/src/AggregateVersionChain/aggregateVersionChainDbConfig.ts) — declares Agent membership and acknowledgement.
- [`AggregateVersionChain.ts`](../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts) — derives complete receiving keys from the bound owner.

## Service actor fanout subscriber and acknowledged Service position

One enrolled ServiceActorVersionRepo within a bound ServiceVersionChain.
`actorVersionRepoFanoutSubscribers` contains exactly nonnullable `actorName`,
`actorPath` and `acknowledgedServiceIndex`, unique over the actor pair. The bound
`systemId`, `serviceName` and evaluating `serviceVersion` supply the source owner;
that exact Service release's `actor[actorName].version` supplies the receiving
actor version. The complete enrollment key still carries `actorVersion`; it must
match that declaration before the stored identity omits it. A wrong-version key
cannot insert membership or advance its acknowledgement. No full Repo name,
packed identity or actor version is stored in this table.

`acknowledgedServiceIndex` records the inclusive contiguous position whose
ServiceActorVersionRepo receipt ServiceVersionChain retained. Monotonic enrollment
and receipt updates cannot rewind it; it can lag the receiving materialization head
and does not establish ServiceActorVersionChain publication. The queue RPC keeps
`currentIndex`. An absent row is unenrolled, zero is enrolled without acknowledged
commands, and caught-up rows remain members. Delivery reconstructs the complete
Repo key from the stored pair and the same bound release. Missing authored code
fails delivery without deleting membership or advancing progress; durable alarms
retry it without an availability filter or retirement policy. Canonical actor-path
and exact source/producer/privacy checks remain at the receiving boundaries.

- [`serviceVersionChainDbConfig.ts`](../packages/system-worker/src/ServiceVersionChain/serviceVersionChainDbConfig.ts) — declares the three-column Service actor membership and unique actor pair.
- [`ServiceVersionChain.ts`](../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts) — validates the supplied actor version before identity extraction and derives the same bound version for delivery.

## Service Agent fanout subscriber and acknowledged Service position

One enrolled ServiceAgentVersionRepo within a bound ServiceVersionChain.
`agentVersionRepoFanoutSubscribers` stores `agentName`, `agentVersion` and
`acknowledgedServiceIndex`, unique by the Agent name/version pair. The accepted Agent selection
belongs to the bound Service name/version. Acknowledgement proves committed
materialization, independently of publication to ServiceAgentVersionChain.
Delivery advances subscriber progress without deleting retained commands.

- [`ServiceVersionChain.ts`](../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts) — maintains independent history-backed Agent fanout.

## recovery registry

The concrete Repo's coordinator for named recovery procedures sharing its one
Durable Object alarm. Construction and registration are inert.
`recoveryHolds: Set<string>` protects queue work, including producers preparing
uncommitted writes. `hold(name)` ensures a durable alarm about one second ahead,
preserving an earlier alarm even for an already held name. `release(name)` removes
the alarm only after the last hold; every alarm runs all registered procedures
against durable state, independently of the reconstructed Set.

RecoveryRegistry handles interrupted delivery and backlog recovery. It owns no
business deadlines and is never installed alongside WakeRegistry on one Repo.
The concrete `onAlarm(): Promise<void>` runs its registry Effect through the
configured managed runtime and invocation wrapper once.

- [`makeRecoveryRegistry.ts`](../packages/system-worker/src/makeRecoveryRegistry/makeRecoveryRegistry.ts) — owns recovery protection and independent procedure outcomes.

## wake registry

The separate alarm owner used by AggregateAgentNodeRepo and ServiceAgentNodeRepo.
Named Agent passes supply synchronous durable next-wake readers. WakeRegistry
establishes one-second retry protection before invoking readers or executing a
pass, then reconciles the alarm from keyed pending wakes and pending delivery. A failed reader leaves the protection intact. Failed or
interrupted passes retain retry protection. The Agent pass catches up and
runs authored wake callbacks before recording commands; the registry does not
decide business eligibility. Overdue failed work retries after one second.

Concrete Repos construct either WakeRegistry or RecoveryRegistry before dependent
fields. `makeMigratableDORepo` constructs neither; initialized alarm dispatch
reaches the concrete `onAlarm()` once through native or PartyServer dispatch.

- [`makeWakeRegistry.ts`](../packages/system-worker/src/makeWakeRegistry/makeWakeRegistry.ts) — schedules Agent passes from durable responsibility.

## queue wake and drain

A queue's local `wake()` Effect establishes required durable recovery and
schedules background progress. Its completion proves neither external observation
recording nor admitted-command execution. A local `drain(...)` Effect awaits the
requested delivery and acknowledgement, honoring the queue's numeric bound or
captured fanout tip. Both methods are lazy until run. Queue construction registers
recovery without starting work. The external-operation queue exposes `wake`;
outbox and fanout queues also expose awaited `drain`. Fanout delivery remains
queue-owned when a caller stops waiting. Alarm registrations retain their own
completion semantics so delivery failures remain visible to the recovery registry.

- [`makeExternalOperationQueue.ts`](../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts) — schedules independent external requests and reconciles pending-work recovery.
- [`makeOutboxQueue.ts`](../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts), [`makeFanoutQueue.ts`](../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts) — separate background wake from awaited delivery.

## command chain

AggregateChain and ServiceChain are the owner Chains. They assign admission order,
dispatch original execution, record original finalization, and route shared command reads.
They retain pending work and the local admitted-command suffix. Permanent command
history and its Archives belong to the VersionChains.
AggregateVersionRepo owns release resources, finalization, a minimal checkpoint
and complete pending evaluated commands. AggregateVersionArchive owns immutable
release-local evaluated history. AggregateVersionChain owns Archive routing, the
published head and independent Actor and Agent subscriber cursors. It acknowledges
publication after Archive durability and the head commit. Aggregate actor and
agent Repos own projection resources and complete pending selected publication;
their Chains own immutable projected history and sockets. ServiceVersionRepo owns
service resources, a minimal checkpoint and complete pending publication;
ServiceVersionChain owns permanent release-local history across local `commands` and
ServiceVersionArchive ranges, with history-backed actor/Agent delivery and independent
subscriber cursors. Projection acknowledgement advances only subscriber progress.
ServiceVersionArchive acknowledgement permits pruning covered local ServiceVersionChain rows.
ServiceActorVersionRepo owns projection resources/progress/pending publication;
ServiceActorVersionChain owns public `exposedCommands`, optional private
`commandResolutions`, locks and sockets.
ServiceAgentVersionRepo owns materialized Service resources, progress and complete
pending selected publication; ServiceAgentVersionChain owns public selected history,
its fixed Node Repo acknowledgement and observer sockets.

- [`aggregateVersionChainDbConfig.ts`](../packages/system-worker/src/AggregateVersionChain/aggregateVersionChainDbConfig.ts) — declares the published head, Archive directory and independent Actor and Agent subscriber progress.
- [`serviceVersionChainDbConfig.ts`](../packages/system-worker/src/ServiceVersionChain/serviceVersionChainDbConfig.ts) — declares immutable Service commands and independent actor/Agent subscriber progress without duplicate fanout payload tables.

`AggregateChain` compacts finalized commands after each release owed those
commands acknowledges publication. A retained `AggregateVersionChain` supplies
the admitted input for compacted positions it has acknowledged. `ServiceChain`
retains its adopted canonical release and position for compacted reads. Changing
the Service selector preserves the adopted prefix until its replacement
publishes through it. Producer checkpoints retain delivery progress.

- [Canonical History Handoff](./architecture/server/CanonicalHistoryHandoff.md) — separates canonical publication proof, source input deletion and later Archive relocation.

## archive

An immutable contiguous range of retained command history. AggregateVersionArchive
and ServiceVersionArchive retain complete evaluated commands for one evaluating
release. AggregateActorVersionArchive and ServiceActorVersionArchive retain
complete exposed publications for one exact Actor projection, including their
optional private command resolutions. Public commands and private completions
remain permanently recoverable after local copies leave the source Chain.

Physical relocation preserves each command's fields, `dispositionChainHash` and
global `aggregateIndex` or `serviceIndex`. A successor Archive continues the same
logical history; it does not start a new command sequence. The source's Archive
acknowledgement authorizes local-copy deletion independently of Node progress.
Admission-Chain adoption uses VersionChain local publication acknowledgement; it
does not wait for this separate Archive acknowledgement.

- [`AggregateVersionArchive.ts`](../packages/system-worker/src/AggregateVersionArchive/AggregateVersionArchive.ts) — retains exact Aggregate evaluated output for one physical range.
- [`ServiceVersionArchive.ts`](../packages/system-worker/src/ServiceVersionArchive/ServiceVersionArchive.ts) — retains exact Service evaluated output for one physical range.
- [`AggregateActorVersionArchive.ts`](../packages/system-worker/src/AggregateActorVersionArchive/AggregateActorVersionArchive.ts) — retains complete Aggregate Actor exposed publications for one physical range.
- [`ServiceActorVersionArchive.ts`](../packages/system-worker/src/ServiceActorVersionArchive/ServiceActorVersionArchive.ts) — retains complete Service Actor exposed publications for one physical range.
- [Version Chain Archives](./architecture/server/VersionChainArchives.md) — distinguishes local publication acknowledgement, Archive acknowledgement and physical relocation.

## final command

A command with non-null `outcome: { result: Success | Failure, finalizedAt }`.
`outcome.result` contains `{ _tag: 'Success', success }` or
`{ _tag: 'Failure', failure }`; the timestamp sits next to `result`, outside both
branches. Final does not imply Success. Admission and optimistic staging do not
finalize a command. Duplicate recovery preserves the complete outcome and its time.

- [`CommandOutcomeSchema.ts`](../packages/core/src/contracts/CommandOutcomeSchema.ts) — defines the result union and its outer finalization timestamp.
- [`CommandSchema.ts`](../packages/core/src/contracts/CommandSchema.ts) — retains nullable outcomes on admitted commands until original finalization.

## exposed command

A confirmed command with canonical admitted `id`, `commandName`, selected `delta`
and nullable public `failure`. Aggregate transport uses `IAggregateExposedCommand`
with `aggregateIndex` and `dispositionChainHash`; Service uses
`IServiceExposedCommand` with `serviceIndex` and `dispositionChainHash`.
`IBrowserCommand` remains the common browser transport base. These positions
settle optimism by command ID, including refusals and empty deltas. Exact
redelivery is a no-op; conflicting retained output fails synchronization. Only
the originating node, session and full Origin receive a private refusal. Null
covers Success or a redacted Failure.

Actor Chains retain public `exposedCommands` and optional private metadata in
`commandResolutions`; their Repos publish nullable `commandResolution` with the
public fields. Agent Repos and Chains retain only the public fields. Agent
observers have no producer completion or private refusal recovery.

- [`AggregateActorCommandSchema.ts`](../packages/core/src/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts) — defines `AggregateExposedCommandSchema` for public Aggregate commands.
- [`aggregateExposedCommandsTable.ts`](../packages/core/src/aggregateSession/aggregateExposedCommandsTable.ts) — retains public Aggregate fields and constructs `IAggregateExposedCommand` with the selected private failure.
- [`ServiceSessionWireSchema.ts`](../packages/core/src/serviceSession/ServiceSessionWireSchema.ts) — defines the public Service exposed-command schema.

## command resolution

The private evidence that one exposed command resolves an admitted producer's
push. Actor pending publication stores nullable `commandResolution`: required
`nodeId`, `pushIndex`, `sessionName` and full original encoded `claims`, plus
nullable public `failure`. A successful result still has a resolution with `failure: null`.
The immutable bound actor owner supplies kind/name/version. Null resolution means
this actor publication has no private producer resolution, independently of its
public delta or source outcome.

AggregateActorVersionChain and ServiceActorVersionChain retain a present
resolution in local `commandResolutions`, with the parent command position as
primary/foreign key and unique `(nodeId, pushIndex)`. Insertion seals that exact
child or its absence. Public/private insertion has one transaction and one
acknowledgement; exact retries compare both joined parts. No later insertion API,
separate delivery or browser stream exists. Aggregate private recovery reads the
local child relation directly without decoding unused public deltas, validates
exact node/session/Origin ownership, including full actor claims, and proves a
contiguous push prefix bounded by the captured parent position. Recipient
mismatches fail; they are not filtered away. Publication acknowledgement deletes
only the Repo's pending message, never retained Chain command or resolution history.

## IActorDelta

`{ upserted, deleted }` for one selected command. Aggregate projection
Repos compute the selected diff; their history Chains retain and deliver it through
`IAggregateExposedCommand.delta` after applying the admitted session lock. Service
selected Repos compute the diff and selected Chains retain/deliver it. Local optimistic
results retain `stagingOutcome`; current undo state lives in the separate
`commands.inverseOperations` field. Ordinary Node final history uses `exposedDelta`; attached Aggregate/Service replicas retain only compact own resolutions.
Aggregate and Service use the same compact staging and model-bound undo shapes.
Authoritative execution history retains ordered
model operations and complete outcomes.

## operation definition

A declaration that provides a schema and `make` method for one model, command,
or external operation. A contract release's named `operations` map grants the
corresponding recording methods. Each operation definition retains the domain
references needed to validate ownership and project portable declarations; a
recorded operation is the value it constructs.

## model operation

A create, update, delete or constrained move bound to one completed Model and
resource ID. The Model owns correlated forward/inverse codecs. A contract's named
operation map grants mutations independently of readable models; local method
names are not portable identities. Operation definition codecs restore canonical model
references. Update omission differs from explicit null, and delete's forward body
is empty. Application captures inverse state from the current transaction.

Aggregate evaluated commands retain one ordered typed JSON `operations` union.
Model members keep their mutation discriminator, exact model version and authored
`operationIndex`, deriving command association from parent `id`. Frozen external
members use `operationName: 'external'`, preserve exact declaration/payload/external
ID, and derive initiating command, Origin and emitting release from the parent and
bound execution release. Replay omits external emissions before preparation and
preserves sparse model indexes. Aggregate projections apply model members only,
using parent `outcome.finalizedAt`. Evaluated Service commands use the same ordered
union, deriving model command association from parent `id`, external parent
identity/Origin from parent `id`/`origin` and emitting serviceVersion from the bound
evaluating release. Service projections select only model members at the same
retained outcome.finalizedAt used by source writes.
Neither resource VersionRepo retains a permanent operation table.

- [`operationCodecs.ts`](../packages/core/src/contracts/operationCodecs.ts) — owns model-specific body correlations.
- [`evaluatedAggregateCommand.ts`](../packages/system-worker/src/AggregateVersionChain/evaluatedAggregateCommand.ts) — defines the Aggregate ordered union without repeated parent context.
- [`applyOperationTx.ts`](../packages/core/src/contracts/applyOperationTx.ts) — applies decoded operations against current state.

## finalizedAt

`command.outcome.finalizedAt` supplies logical wall time for command evaluation.
AggregateVersionRepo and ServiceVersionRepo sample it once from Effect Clock during
original synchronous materialization after authority/input/progress checks. Fresh
parallel replay reuses the admitted command's retained `outcome.finalizedAt`;
same-release restoration applies immutable evaluated output without reevaluation.
Both owners freeze Effect wall time throughout the synchronous business savepoint,
including payload adapters, guards and contract programs. Monotonic timing and sleep
remain live. Success, retained Failure and source resource timestamps share this
logical time; infrastructure rollback retains none of the new output. Delivery,
duplicate recovery and late projection resource writes preserve it without
resampling. Selected history retains no redundant clock column; its delta already
contains the resulting resource timestamps. `externalOutcome.recordedAt` remains
the separate first external request observation.

- [`readAggregateCommandTx.ts`](../packages/system-worker/src/AggregateVersionRepo/utils/readAggregateCommandTx.ts) — samples original Effect Clock time or reuses retained replay time after progress checks.
- [`makeEvaluatedAggregateCommand.ts`](../packages/system-worker/src/AggregateVersionRepo/utils/makeEvaluatedAggregateCommand.ts) — constructs the outcome with the same logical finalization time.
- [`readServiceOccurrenceTx.ts`](../packages/owner-release-worker/src/ServiceVersionRepo/utils/readServiceOccurrenceTx.ts) — samples original Service Effect Clock time or reuses retained replay time after admitted-input and progress checks.
- [`withCommandEvaluationClock.ts`](../packages/core/src/contracts/withCommandEvaluationClock.ts) — freezes Effect wall time for both owners while keeping monotonic timing and sleep live.

## session snapshot

Selected resources, exact owner/session identity and a coherent public/private
checkpoint. Aggregate projection Repos capture resources and actual index/hash N
in one local transaction, then publish through N, verify that exact history
checkpoint. Actor snapshots additionally read the requesting producer's contiguous
private prefix through N. Agent snapshots have no private completion.
ServiceActorVersionRepo uses the same captured-N publication/checkpoint/private
completion boundary through its separate ServiceActorVersionChain. Snapshots
read the projection committed during activation and advanced by its subscription;
there is no caller-supplied minimum or forced source execution/replay. The returned
position is the actual local observation. Newer history cannot relabel captured
resources. Snapshots contain no system ID or embedded
command history.

- [`readSelectedResourcesAndCheckpoint.ts`](../packages/system-worker/src/aggregateProjection/getSnapshot/readSelectedResourcesAndCheckpoint.ts) — captures Aggregate resources and public checkpoint.
- [`getSnapshot.ts`](../packages/system-worker/src/aggregateProjection/getSnapshot/getSnapshot.ts) — verifies exact publication and bounded private progress outside SQL.
- [`types.ts`](../packages/core/src/serviceSession/types.ts) — defines Service snapshots.

## confirmed aggregate projection

A resource graph, selected-delta computation and progress owned by one exact AggregateActorVersionRepo or AggregateAgentVersionRepo. A synchronous receiving transaction applies validated operations, computes selected entry/exit deltas, advances the checkpoint and inserts complete pending projected publication. Its separate Chain retains immutable selected history before acknowledging publication and broadcasting. Actor Chains additionally retain privately bound completion. Refusals advance without model changes. Failed sends close attachments after history commit; reconnect recovers retained history.

- [`applyEvaluatedCommandsTx.ts`](../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts) — validates and applies one ordered result page atomically.
- [`applyEvaluatedCommandsTx.ts`](../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts) — retains complete pending selected output and checkpoint in that same transaction.

## resolvedThrough

Aggregate and service snapshot reconciliation use a Node identity and contiguous `resolvedThrough` watermark. The browser journal reconciles its own commands through that watermark; projection and node-outcome cursors remain independent during replay.

- [`fetchAggregateSessionSnapshot.ts`](../packages/browser/src/fetchAggregateSessionSnapshot.ts) — requests a snapshot with `nodeId`.
- [`getSnapshot.ts`](../packages/system-worker/src/aggregateProjection/getSnapshot/getSnapshot.ts) — derives the requesting node’s contiguous resolved prefix from retained actor-chain history at the captured snapshot checkpoint.

## aggregate and service Repos

Release-specific canonical resource and result owners. AggregateVersionRepo and ServiceVersionRepo evaluate their own authored guards/programs and commit each original or replay result with its operations and checkpoint. Original evaluation freezes external operations; AggregateChain and ServiceChain alone start their requests. Selected actor and agent Repos apply those retained operations without reexecuting authored programs and own projection resources/progress/complete pending publication. Their Chains own selected histories and sockets; only Actor Chains own private producer completion.

- [`materializeCommandTx.ts`](../packages/system-worker/src/AggregateVersionRepo/materializeCommandTx.ts) — owns atomic aggregate materialization.
- [`materializeCommandTx.ts`](../packages/owner-release-worker/src/ServiceVersionRepo/materializeCommandTx.ts) — owns service materialization.

## Repo startup

Repo startup is the initialization a Repo instance completes before serving calls. A cold instance runs its startup work. A warm instance reuses the completed startup result.

## Startup materialization catch-up

AggregateVersionRepo and ServiceVersionRepo await their local named
`catchupMaterialization` procedure inside `makeMigratableDORepo`'s existing
constructor concurrency gate. The existing replay subscriber captures the
available finalized prefix from its first page and commits through that fixed
position. Source Chains retain authored release enrollment; VersionRepos use
`.catchup()`, while dynamic actor/agent projections catch up and enroll with
`.subscribe()`. A checkpoint ahead of the finalized prefix succeeds unchanged.
Recovery for pending publication/fanout and external work is armed independently,
including when no new replay is needed. Startup does not execute pending originals
or await outgoing delivery; interrupted replay resumes from committed progress.
Ordinary snapshots, queries and authorization then read current committed state,
without promising every earlier admitted command. Command-specific predecessor
replay and result waits remain.

- [`AggregateVersionRepo.ts`](../packages/owner-release-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts) — arms complete output publication and awaits local finalized replay during activation.
- [`ServiceVersionRepo.ts`](../packages/owner-release-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts) — establishes complete output recovery and awaits the Service finalized prefix.
- [`runFanoutCatchup.ts`](../packages/system-worker/src/makeFanoutSubscriber/runFanoutCatchup.ts) — fixes the first available boundary and rereads committed progress after each page.

## suffix

An immutable bounded page after a consumer cursor, optionally through an inclusive maximum. Each fanout subscriber reads its own page from the history owner and acknowledges only the final row actually delivered. The accompanying source tip remains independent of that page bound. Transport pages do not merge command semantics or allocate batch identities.

- [`makeFanoutQueue.ts`](../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts) — binds the explicit history reader and subscriber store.
- [`runFanoutDeliveries.ts`](../packages/system-worker/src/makeFanoutQueue/runFanoutDeliveries.ts) — refills free delivery slots as subscribers settle.

## serviceIndex

The shared service admission position and sole confirmed service-history cursor. Every finalized command, including a refusal or empty selection, consumes its original service position. Zero is genesis. Node/session append positions and private originating push/outcome progress remain independent.

- [`admitServiceCommandsTx.ts`](../packages/system-worker/src/ServiceChain/admitServiceCommands/admitServiceCommandsTx.ts) — validates Node producer checkpoints or recovers non-Node admitted commands before allocating logical positions.

## chain input order

AC and SC assign one shared admission order per aggregate or service. Each Chain delivers the oldest pending command to its retained `aggregateVersion` or `serviceVersion`, then retains the original outcome: both AggregateChain and ServiceChain set `commands.outcome` and insert complete pending external requests atomically. Infrastructure failure blocks later originals. Pending external async requests do not block them. The replay prefix ends immediately before the first pending command; each receiving version evaluates that finalized prefix against its own state in order.

- [`AggregateChain.ts`](../packages/system-worker/src/AggregateChain/AggregateChain.ts) and [`ServiceChain.ts`](../packages/system-worker/src/ServiceChain/ServiceChain.ts) — bind original delivery and finalized-prefix replay to separate queues.

## original execution

Evaluation of an admitted command by the version retained on the command. Before evaluating command n, that version replays through n - 1. Only original evaluation freezes external operations. AggregateChain runs Aggregate requests after atomically retaining `commands.outcome` and complete pending requests; ServiceChain runs Service requests after retaining its first original outcome and complete pending requests. Neither VersionRepo runs external requests. A lost acknowledgement recovers its committed final command and does not evaluate the program again.

## command replay

Evaluation of a finalized shared input by a receiving version's own guards and program. Replay shares the version's durable materialization head with original execution and commits local command outcome, state, output, and cursor atomically. Original command outcome controls availability; each version retains its own outcome. Replay discards async descriptions before preparation and retains model output only. Fetching replay pages never initiates original execution.

## aggregateIndex

The shared aggregate admission position and sole confirmed aggregate-history cursor. Finalized commands, snapshots and selected views retain this position with `dispositionChainHash`; zero is genesis. A pending journal's admission receipt may record its own accepted position before the confirmed projection reaches it. Local Node/session append positions and private push/outcome progress remain distinct.

- [`AggregateNode.ts`](../packages/core/src/AggregateNode/AggregateNode.ts) — retains immutable original/final records and confirmed progress.
- [`AggregateNodeSynchronization.ts`](../packages/browser/src/AggregateNode/AggregateNodeSynchronization.ts) — reconciles the confirmed position/hash and independent originating outcomes.

## disposition

The Success or Failure tag of a command outcome. AggregateVersionRepo and ServiceVersionRepo fold that tag, the previous chain hash, command position and command ID into `dispositionChainHash`. Success values, failure details, timestamps, input and operation bodies do not affect this hash; complete evaluated-command equality remains separate.

- [`aggregateDispositionChainHash.ts`](../packages/system-worker/src/aggregateDispositionChainHash/aggregateDispositionChainHash.ts) — extends the version-owned disposition commitment.

## dispositionChainHash

The rolling SHA-256 hash of `[previousHash, position, commandId, outcome.result._tag]`. Historical aggregate values belong to AggregateVersionChain `commands`; AggregateVersionRepo and projection materializationHead rows retain their current value, and selected session histories carry it for their consumers. AggregateChain stores no hash. Comparing AVC hashes at the same aggregate identity and `aggregateIndex` can establish matching ordered command IDs and Success/Failure decisions through that position. Matching hashes do not prove matching results, failure details, operations or resource state. No chain-comparison feature is introduced.

## materializationHead

The current local resource progress of AggregateVersionRepo, AggregateActorVersionRepo, AggregateAgentVersionRepo, ServiceVersionRepo, ServiceActorVersionRepo and ServiceAgentVersionRepo. Each head has `singletonId = 1`, its family's `aggregateIndex` or `serviceIndex`, and `dispositionChainHash`. VersionRepos commit it with resources or a public refusal and complete pending execution publication; projection Repos commit it with projected resources, selected deltas and complete pending selected publication. It survives publication deletion and contains no command ID. Historical Chain `getInputCheckpoint` and `getCheckpoint` reads remain separate: they can inspect arbitrary retained positions, while materializationHead represents only current local resource progress.

Unversioned Agent Node Repos instead retain applied aggregateVersion/aggregateIndex
or serviceVersion/serviceIndex with dispositionChainHash. No generic streamIndex,
producer state or initialized flag is needed. A present head initializes zero too.

## session lock

A serialized description of the exact session definition's public facts. Access APIs decode
the request and lock shape. Aggregate access requires the lock's actor origin to
match the admitted actor; the keyed aggregate Repo validates those session facts
against its selected aggregate release and returns the checked session spec.
Service Agents use a separate lock containing Agent name, session name,
selected models and ordinary contracts. It must equal the registered release's
complete lock for its pinned owner release; the Service Actor lock and claims format remain unchanged.

- [`AggregateAccessApi.openSession`](../packages/system-worker/src/AggregateAccessApi/openSession/openSession.ts) — decodes the aggregate session lock and checks its actor origin against the admitted capability.
- [`validateAggregateSessionLock.ts`](../packages/system-worker/src/AggregateVersionRepo/authorizeAggregateSession/validateAggregateSessionLock.ts) — checks actor membership, exact version, claims schema, models, contracts, and the reconstructed lock against the selected aggregate release.
- [`ServiceAccessApi.authorize`](../packages/system-worker/src/ServiceAccessApi/authorize/authorize.ts) — decodes the service session lock.

## connection capabilities

The selected model names and exact admitted ordinary contract versions for one
Actor connection. AggregateActorVersionChain and ServiceActorVersionChain retain
`connectionId`, `modelNames` and `contractVersions` in `connectionLocks`; each
resolves those selections through its exact bound Actor release. Actor disposal
reclaims its row, and activation prunes orphan rows only after complete surviving
socket enumeration, preserving hibernating connections.

Agent Chains have no connection SQL or command-submission authority. At initial
connection, each validates the complete authored lock, exact named Agent/owner
release and nonempty issued observer Node. AggregateAgentVersionChain derives
model names and lock contract facts through makeAggregateSessionLock and
makeConnectionCapabilities; those contract facts grant no observer command
submission. ServiceAgentVersionChain derives readable models from the exact
Agent's db.models. Neither can widen selection through another owner release.

The trusted attachment retains admission and public replay/live phase.
AggregateAgentVersionChain checks its Aggregate ID/name/version, Agent Origin,
session and issued/resumed observer Node on capability reads;
ServiceAgentVersionChain checks the corresponding Service/Agent/session/Node
fields. Synchronous Aggregate reads use configured System. Agent disposal fences
attachment authority and attempts closure even when cleanup fails. Agent replay
uses only the public aggregateIndex or serviceIndex and dispositionChainHash,
without private completion cursors or command-producer progress.

- [`connectionCapabilities.ts`](../packages/system-worker/src/aggregateSessionChain/connectionCapabilities.ts) — projects selected models and exact lock contract versions.
- [`readAggregateConnectionCapabilities.ts`](../packages/system-worker/src/aggregateSessionChain/readAggregateConnectionCapabilities.ts) — reads Actor SQL capabilities or derives Aggregate Agent capabilities after attachment validation.
- [`connection.ts`](../packages/system-worker/src/ServiceAgentVersionChain/connection.ts) — validates Service Agent admission/attachments and fences disposal without SQL capability storage.
- [`reconcileConnectionLocks.ts`](../packages/system-worker/src/aggregateSessionChain/reconcileConnectionLocks.ts) — prunes Actor connection rows only after enumerating surviving sockets.

## actor selection

A complete-row Drizzle `findMany()` query owned by an actor release. Its captured SQL and serializable parameter bindings are locked with the actor's selected model declarations. Named inputs come only from the identity fields derived from the actor path; command-only claims are excluded. Registering a model does not select its rows.

An Aggregate Actor release inherits an unchanged selection as the predecessor's
fixed captured declaration. Later changes to the original caller-owned query
options do not redefine that inherited selection; a changed selection must be
declared explicitly in the derived release.

- [`makeQueryDbVersion.ts`](../packages/core/src/models/make/makeQueryDbVersion.ts) — builds queries without storage and captures execution on the current transaction.
- [`makeActorIdentity.ts`](../packages/core/src/identity/make/makeActorIdentity/makeActorIdentity.ts) — derives identity codecs and typed placeholder names from the identity schema and path.

## guard

A synchronous validation callback. Each implementation's contract guard runs once before its private program during browser-local staging, pending replay, and authoritative execution. Aggregate command policies use `aggregateRelease.guards[actorName][commandName]` and evaluate canonical aggregate state inside the authoritative business savepoint. Aggregate actor declarations have no command guards; authentication and session authorization remain separate admission checks. Service actor guards retain their service execution role. Admission validates command structure, exact declarations and provenance without running state-dependent command policies.

- [`prepareAggregateInvocation.ts`](../packages/core/src/contracts/prepare/prepareAggregateInvocation.ts), [`prepareServiceInvocation.ts`](../packages/core/src/contracts/prepare/prepareServiceInvocation.ts) — establish ordinary invocation arguments before checked evaluation.
- [`runContractGuard.ts`](../packages/core/src/contracts/runContractGuard.ts) — runs the retained authored guard with declared failures and scoped reads, enforces void success and declared failures; its Effect cannot contribute command operation output. Only an absent authored guard defaults to no-op; defects retain their original cause.
- [`validateAggregateSessionCommand.ts`](../packages/core/src/aggregateSession/validateAggregateSessionCommand.ts), [`validateServiceSessionCommand.ts`](../packages/core/src/serviceSession/validateServiceSessionCommand.ts) — synchronously rehearse input preparation, the guard, the program, operation checks, and result encoding. Disposable command and model ID factories isolate rehearsal from live ID consumption; aggregate operations are discarded and service projection checks roll back. Recognized refusals remain silent. Escaping defects use the session execution reporter. Injected application services still execute and must be safely repeatable.
- [`materializeCommandTx.ts`](../packages/system-worker/src/AggregateVersionRepo/materializeCommandTx.ts) — retains failures with normal command history and leaves rejected mutations unapplied.

## marketplace

Shopping's service that owns the shared product catalog. The catalog actor selects products. `getExternalPurchaseQuoteV1` reads product rows through typed `SystemApi.executeServiceQuery` and calls the local `quotePurchase` calculation to price frozen purchase lines without changing catalog or personal cart state.

- [`marketplaceServiceReleaseV1.ts`](../examples/shopping/src/zerospin/services/marketplace/marketplaceServiceReleaseV1.ts) — owns the product catalog.
- [`getExternalPurchaseQuoteV1.ts`](../examples/shopping/src/zerospin/aggregates/user/contracts/getExternalPurchaseQuoteV1.ts) — reads catalog products and calculates the recorded external quotation.

## per-user purchase aggregate

Shopping's `user` aggregate, one per verified Clerk subject. It co-owns the personal cart, cart items, purchases and purchase items so edits and checkout share one journal. Checkout creates a preparing purchase, freezes product IDs and quantities, and links the cart through `checkoutPurchaseId`. The aggregate's external quotation request obtains Marketplace pricing before a guarded continuation schedules payment. Paid clearing is atomic; quote refusal and payment decline retain an editable cart, while uncertain payment retains its lock.

- [`userAggregateReleaseV1.ts`](../examples/shopping/src/zerospin/aggregates/user/userAggregateReleaseV1.ts) — declares the complete personal cart and purchase graph.
- [`userActorV1.ts`](../examples/shopping/src/zerospin/aggregates/user/actors/userActorV1.ts) — authorizes the aggregate identity derived from the verified subject.

## invocation arguments

In contract execution, `input` is the complete object passed to an evaluator, guard or program. `payload` contains all authored business inputs, including named model IDs. Claims, `db`, failures, framework owner scope and program recording operations remain outside `payload` when present. Programs query current rows explicitly through their declared `models`. Keep the `Input` names for these complete invocation types and their full-object parameters.

Guards and private programs receive current decoded payload and claims, declared failures and a restricted read database as `db`. Aggregate evaluators require a nonempty framework aggregate ID. Service evaluators exclude framework aggregate scope. An external continuation's payload builder receives the frozen outgoing payload and recorded response or failure. The ordinary System command then receives the encoded mapper output as its payload. A payload property named `aggregateId` remains payload. Programs additionally receive recording methods matching their named operation definition map and return Effects containing only the domain result. `models` grants reads independently of operation permissions. Guards have no recording methods. Checked evaluation returns `{ operations, result }` after validating the complete collected batch.

AggregateVersionRepo and ServiceVersionRepo resolve the prepared invocation before evaluation. Its contract-prepared claims may differ from historical actor claims: release/actor guards retain those historical claims, while the contract guard and program receive the invocation's claims. Checked evaluation validates decoded argument types without repeating wire conversion.

Client-first server evaluation scopes each phase's declared reads from the owning source and shares the owning resource scope. Reads observe pre-application state. The owning synchronous savepoint or asynchronous standalone workflow controls suspension, rollback and application. Result encoding completes before any model or external output writes. Failure escaping evaluation discards its complete batch; retrying the whole evaluation starts a fresh collector.

- [`evaluateContract.ts`](../packages/core/src/contracts/evaluateContract.ts) — runs the private guard and program, validates complete output, and applies nothing.
- [`prepareAggregateInvocation.ts`](../packages/core/src/contracts/prepare/prepareAggregateInvocation.ts), [`prepareServiceInvocation.ts`](../packages/core/src/contracts/prepare/prepareServiceInvocation.ts) — establish concrete ordinary invocation arguments.

## session definition

An authored session composition shipped with an application build. A pure aggregate
or service session definition fixes models, contracts, schemas, owner and actor versions.
Concrete browser constructors receive that declaration as `definition`; managed
React hooks receive it as their first argument, with application layers and applicable transport settings supplied
separately. Host configuration is never merged into the declaration. A definition acquires no
resources and owns no runtime, store, database, failure stream, or lifecycle.
`session.sessionDefinition` retains the exact authored object. The application build
supplies artifact identity; session definitions have no manually maintained version.

- [`makeAggregateSessionDefinition.ts`](../packages/core/src/sessionDefinition/makeAggregateSessionDefinition.ts), [`makeServiceSessionDefinition.ts`](../packages/core/src/serviceSession/make/makeServiceSessionDefinition.ts) — check pure domain declarations exported by `@zerospin/browser`; Agent releases live in core/agent.
- [`one-session-definition-per-file.ts`](./patterns/react/one-session-definition-per-file.ts) — declares one named session definition per file, with host wiring and React UI context authored separately.

## live session and initialized capability

Choose `makeConnectedAggregateSession`, `makeConnectedServiceSession`,
`makeStandaloneAggregateSession`, `makeMockAggregateSession` or
`makeMockServiceSession` to construct an independent cold resource owner. Each
receives its pure `definition`, application `layer` when required, and the concrete
host and instance inputs separately. Its fixed resource and identity inputs are captured
at construction; `initialize()` starts or restarts the same identity. A different
aggregate or authenticated identity requires another instance. Credentials can
refresh through the existing provider. Connected instances retain their first
authenticated full claims across disposal and reinitialization.

The live facade retains its session definition, reactive store with failure state,
execution methods, and applicable lifecycle controls. Its private lazy
runtime belongs to that owner. Saved `runSync` and `runPromise` delegates resolve
the current lifetime. General execution may acquire application services before
initialization; cold domain operations return readiness failures without that
acquisition. Aggregate, Service, Standalone, and both Studio Agent session families
share the same disposable-lifetime owner. Each lifetime owns one lazy application
runtime, cancellation signal, execution-work Scope, sequential resource Scope and
initialization/disposal completions. Initialization returns after first usable
setup while resources remain in its Scope across connection outages. Retirement
revokes capability synchronously; cleanup then joins initialization and execution
before releasing connection, replica and application resources. Reinitialization
waits for successful complete cleanup; cancellation, terminal failure or cleanup
failure prevents replacement. Initialization execution callbacks remain pinned
to their lifetime. Studio agents retain their transient database
and observer ticket/resume identity through reconnects, while capability availability follows
validated live replay.

An ordinary initialized capability contains the SQLite database and admitted immutable
identity, including private Aggregate claims. Agent facades instead expose their
current transient Node, whose publication owns guarded reads and connection availability. Reactive progress remains in the
owner's state. Commands capture the capability once and reject its replacement
or withdrawal before evaluation and before transaction commit. Disposal withdraws
readiness synchronously before teardown. Recovery publishes a fresh capability;
progress updates retain its identity. Disposal waits for the facade's local
cleanup, not shared-owner drainage or remote command finalization. The last
SharedWorker client starts owner cleanup; committed durable Node work remains
available for restart/replay.

React's `useConnectedAggregateSession`, `useConnectedServiceSession`,
`useStandaloneAggregateSession`, `useMockAggregateSession` and
`useMockServiceSession` own managed instances for their concrete browser path.
Each receives `(definition, optionsOrResolver, observers?)`, returns without
suspending, and acquires resources after commit. Inactive resolver values disable
the session. Changing fixed identity/options replaces only the internal generation;
credential callbacks refresh without restarting that identity.
`SessionProvider session={handle}` always renders its public children.
`SessionReady definition={definition}` gates only dependent readers and commands,
using an optional fallback and required `renderError(error, retry)` for terminal
failures. `useSession(definition)` selects the ready session;
`useSessionState(definition)` reads availability and retry without readiness.
Hook `{ onFailure }` observers receive changed nonterminal occurrences, including
startup/recovery notices, without an application-owned subscription or waiter.

`makeMockAggregateSession({ definition, claims, resources?, layer? })` and
`makeMockServiceSession` own seeded in-memory sessions for their corresponding pure
definitions. They use the supplied application layer, schemas, transaction boundaries and lifetime,
publishing readiness after seeds commit. Aggregate staging remains optimistic;
service validation discards its writes and service submission rejects before
staging. No transport, persistent storage or remote acknowledgement is simulated.
React mock hooks publish through the same `SessionProvider` and definition-based
readers used by connected hooks. A layer is required when declared execution programs
need services beyond the built-in runtime.

- [`makeConnectedAggregateSession.ts`](../packages/browser/src/makeConnectedAggregateSession.ts), [`makeConnectedServiceSession.ts`](../packages/browser/src/makeConnectedServiceSession.ts), [`makeStandaloneAggregateSession.ts`](../packages/browser/src/makeStandaloneAggregateSession.ts) — construct concrete owners with pure definitions and separate host/instance inputs.
- [`makeMockAggregateSession.ts`](../packages/browser/src/makeMockAggregateSession.ts), [`makeMockServiceSession.ts`](../packages/browser/src/makeMockServiceSession.ts) — construct seeded owners without transport.
- [`React session ownership`](../packages/react/README.md), [`SessionProvider.tsx`](../packages/react/src/SessionProvider.tsx), [`SessionReady.tsx`](../packages/react/src/SessionReady.tsx) — separate managed acquisition from stable context and readiness-gated readers.
- [`makeInitializedAggregateSession.ts`](../packages/core/src/aggregateSession/makeInitializedAggregateSession.ts) — captures admitted identity and returns detached private claims.
- [`makeAggregateSession.ts`](../packages/core/src/aggregateSession/make/makeAggregateSession.ts), [`makeServiceSession.ts`](../packages/core/src/serviceSession/make/makeServiceSession.ts) — own release of readiness, identity/progress, and private service command execution.
- [Aggregate command lifecycle](./architecture/browser/AggregateCommandLifecycle.md) — initialization, evaluation, commit, and delivery boundaries.

## Service session readiness

`initialized: IInitializedServiceSession | null` is the service session's single
published capability. Prepared replication state remains private until locally
usable. Offline delivery can retain local optimism; a blocking admission or
identity failure withdraws the capability. The lifetime's sessionId owns local
journal identity across reconnects.

- [`types.ts`](../packages/core/src/serviceSession/types.ts) — defines the nullable initialized capability and reactive Node state.

## reported session failure

The latest error published by `session.reportFailure(report)` into the existing
session store as `failure: IZerospinError | null`. A recognized command-origin
refusal preserves lifecycle status and readiness. A session-origin report is
terminal. Each occurrence has a fresh error reference, preserving normalized
code, message, status, extra, cause and available stack. Store subscriptions
observe new occurrences without replay; command identity and outcomes remain in
command results and retained command data. Runtime reporting distinguishes
Effect Fail from Die before normalizing the original Cause. Merely returned
typed application errors are not automatically reported. External errors require
explicit reporting. The first terminal occurrence remains pinned through cleanup.

- [`types.ts`](../packages/core/src/sessionFailure/types.ts) — report origins, lifecycle fields and synchronous reporter type.
- [`makeSessionFailureReporter.ts`](../packages/core/src/sessionFailure/makeSessionFailureReporter.ts) — occurrence normalization, classification and terminal publication.

## session lifecycle status

`status` on the existing session store is `idle` before initialization,
`initializing` during acquisition, `ready` with a usable initialized capability,
`disposed` after explicit synchronous capability revocation, or `failed` after a
terminal report. Lazy runtime acquisition alone stays idle. Disposal's Promise
establishes cleanup completion; ordinary reinitialization waits for that cleanup
and preserves the latest nonterminal failure. Only a fresh instance starts with
`failure: null`. Failed instances cannot reinitialize.

- [`makeSessionLifecycle.ts`](../packages/browser/src/makeSessionLifecycle.ts) — common host lifecycle transitions.
- [`types.ts`](../packages/core/src/sessionFailure/types.ts) — shared public lifecycle fields.

## Published session claims

Server-accepted actor context exposed after a session publishes readiness. Every aggregate admission supplies the requested aggregate ID and credentials to the selected actor’s authentication callback, validates its complete returned claims, and rejects a mismatched aggregate ID. The callback determines which fields are verified identity and which are accepted public inputs; accepting public inputs does not prove ownership. Optional browser `expectedClaims` are a local comparison expectation, never admission evidence. `useClaims` reads real application aggregate claims from `state.initialized`; service sessions likewise publish claims through their nullable `state.initialized` capability. Aggregate readers receive one detached snapshot per admitted session reference, so progress updates keep that snapshot stable and a new admission refreshes it. Unpublished claims throw `session-not-initialized`. The hook preserves each session's precise claims type.

- [`useClaims.ts`](../packages/react/src/useClaims.ts) — reads the same readiness-gated snapshot in client and server rendering.

## WebSocket ticket

A short-lived, single-use opaque credential issued by SystemRepo for one exact
Aggregate Actor, Aggregate Agent, Service Actor or Service Agent admission. SystemRepo retains
four required columns: unique `ticketHash`, `sessionFamily`, typed `admission`
and `expiresAt`. The admission retains complete owner scope, canonical Origin or
actual claims, full session lock and Node binding. Session name is derived
directly from the lock; Service Actor name/version likewise appear only in
`serviceSessionLock`. No physical Chain name or duplicate outer identity is stored.
Ticket-local validation keeps these identity fields nonempty and uses canonical
integer declaration versions. Agent `nodeId` is required and nonempty for public
observer ticket/resume identity; Actor `nodeId` remains a nullable command-producer
binding. Issuance validates the complete admission before secret generation,
hashing or insertion. It validates bound authority and locally requires acceptance
of SystemRepo's actual executing SystemSpec hash for both Actor and Agent admission, without
structural re-comparison or self-RPC. Where Actor credentials are
configured, the Actor admission capability authenticates them before session
authorization and ticket issuance.

The browser exchanges the secret at the matching WebSocket route. SystemRepo
atomically spends a matching-family row before retained-admission decoding,
expiry checks and forwarding; wrong-family requests cannot spend it. Later
validation, forwarding or upgrade failure does not restore it. Spending a retained
ticket performs no fresh accepted-spec comparison. SystemRepo removes
the secret from the URL and replaces caller-supplied internal headers with trusted
retained facts before forwarding. Ticket spend is distinct from socket
installation, command admission, execution commit and retained `outcome`.

- [`systemRepoDbConfig.ts`](../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts) — declares the four-column ticket table.
- [`SessionAdmissionSchema.ts`](../packages/system-worker/src/SystemRepo/sessionWebSocketTickets/SessionAdmissionSchema.ts) — declares the strict tagged admission and lock-derived session/Service Actor identity.

## command outcome

The terminal command result and finalization time, stored in
`outcome: { result: Success | Failure, finalizedAt }`. The result is either
`{ _tag: 'Success', success }` or `{ _tag: 'Failure', failure }`; neither branch
contains a timestamp. Transported `outcome: null` means the original is pending.
Disposition hashing reads `outcome.result._tag`; it does not hash the timestamp.
System aggregate/service execution and aggregate authorization’s `executeCommand`
return the required `ICommandOutcome` directly. A retry preserves its first
`result` and `finalizedAt`; later external work has its own completion. Success
remains encoded JSON, decoded by callers with the authored contract codec.
API/framework failures remain on the Effect/RPC failure channel, separately from
a finalized business rejection in `outcome.result`.

AggregateVersionRepo commits resources or retained Failure, materialization head
and the complete `IEvaluatedAggregateCommand` publication atomically, then returns that same
value from original finalization. AggregateChain validates every immutable admitted
field, predecessor and operation order before atomically retaining `commands.outcome`
and complete pending external requests. A repeated complete outcome, including
`finalizedAt`, never recreates requests. ServiceChain likewise retains its first
original commands.outcome and complete pending requests. Equal-outcome repeated
receipts return before request insertion, ignoring operation/hash differences;
conflicting outcomes fail. Complete-output equality and release-local hash validation
remain with ServiceVersionChain commands, without operation history or a hash on
ServiceChain.
Duplicate original recovery uses pending publication or immutable release history,
without evaluation or resampling time. Projection Repos apply model operations only.

- [`CommandOutcomeSchema.ts`](../packages/core/src/contracts/CommandOutcomeSchema.ts) — defines the outer outcome with the tagged result and finalization timestamp.
- [`retainEvaluatedCommandTx.ts`](../packages/system-worker/src/AggregateVersionRepo/utils/retainEvaluatedCommandTx.ts) — retains the full evaluated command and materialization head with resource changes.
- [`recordOriginalCommandOutcomeTx.ts`](../packages/system-worker/src/AggregateChain/recordOriginalCommandOutcomeTx.ts) — validates admitted identity and retains original outcome/pending requests atomically.

## external outcome

The immutable first observation of an external request, retained as `{ _tag: 'Success', success, recordedAt }` or `{ _tag: 'Failure', failure, recordedAt }`. `success` is encoded with the originating contract's response codec in storage and decoded before authored continuation evaluation. `failure` is a distinct public `ExternalRequestFailure`, meaning the request stopped without a usable response; the remote operation may have succeeded. `null` outside this union means no external observation. JSON-null success remains an explicit success object. Either recorded branch atomically enqueues a continuation, and retries preserve its first recording time. Handling external failure can commit model changes and a successful command outcome.

- [`ExternalOutcomeSchema.ts`](../packages/core/src/contracts/ExternalOutcomeSchema.ts) — defines the recorded observation and distinct external request failure.
- [`makeExternalOperationQueue.ts`](../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts) — runs requests and delegates atomic observation/admission to the containing Chain.

## main-thread session database

One tab-owned synchronous SQLite view and stable Session/store for ordinary attached Aggregate and Service Sessions. They install their bound Node's coherent optimistic view and replay only their own local originals outside its captured prefix. Their command tables contain one row per own canonical ID and no shared phase history. An Agent Session has no second database: its transient AgentNode owns one main-thread connection for selected model rows and their checkpoint, and the facade observes that Node.

- [`installAggregateNodeView.ts`](../packages/core/src/aggregateSession/installAggregateNodeView.ts) — installs ordinary Aggregate resources, coverage, compact final resolution and uncovered-local replay atomically.
- [`installServiceNodeView.ts`](../packages/core/src/serviceSession/installServiceNodeView.ts) — performs the corresponding ordinary Service installation.
- [`openAggregateAgentNode.ts`](../packages/browser/src/AggregateAgentNode/openAggregateAgentNode.ts), [`openServiceAgentNode.ts`](../packages/browser/src/ServiceAgentNode/openServiceAgentNode.ts) — acquire the Agent lifetime's sole connection.

## terminal session failure

The first session-owned query, startup, escaping session defect or unexpected
infrastructure error that makes one session unusable. The reporter fences
execution, retires publication and atomically stores `status: 'failed'`, its
`IZerospinError` and `initialized: null`. Cleanup and later reports cannot replace
it. Connected Aggregate and Service recovery intercepts eligible retained-state
and startup/synchronization failures before terminal publication. Successful
preservation stays quiet; possible local-work loss produces a nonterminal
`origin: 'recovery'` occurrence through the same store. Recognized command refusals
and absent query rows do not terminate a session; explicit browser offline state
retains transport recovery. Managed React hooks capture construction failures and
own generation retry/release. `SessionReady` handles render-time query errors
owned by its bound session and renders the required `renderError(error, retry)`
for terminal failures. Ordinary UI render exceptions propagate to an enclosing
React error boundary. Foreign query errors propagate toward their owning
`SessionReady`. Normalization preserves existing Zerospin fields. The 404
presentation preserves the original status.

- [`makeSessionFailureReporter.ts`](../packages/core/src/sessionFailure/makeSessionFailureReporter.ts) — first terminal occurrence, fencing and atomic publication.
- [`makeManagedSession.ts`](../packages/react/src/managedSession/makeManagedSession.ts), [`SessionReady.tsx`](../packages/react/src/SessionReady.tsx) — managed construction/replacement and owner-aware terminal presentation local to dependent readers.

## sessionKey

The canonical SHA-256 commitment to the bound session definition, backend/system scope, versioned owner identity, and complete authenticated claims. Aggregate identity includes aggregate name/version/ID; service identity includes service name/version. Connected SharedWorker routing uses a separate hash of the complete declaration/backend request, plus the requested aggregate ID for Aggregate sessions. It grants no access to an authenticated Node. The SharedWorker computes sessionKey only after independently verifying the attachment; connected database and lease namespaces combine the domain and sessionKey independently of compiled sharedWorkerVersion. Executable routing and artifact checks remain versioned. Standalone keeps its separate authored partition rules.

- [`sessionKey.ts`](../packages/core/src/Node/sessionKey.ts) — canonical hashing.
- [`sharedWorkerNames.ts`](../packages/browser/src/sharedWorkerNames.ts) — shared RoutePattern construction and parsing.

## connected Node storage upgrade

An initialization transition of a migration-aware connected browser Node from a
supported durable command format to a newer one under the same exact authored
binding and authenticated identity. An upgrade can run offline with pending
originals when it preserves their identities, meaning, ordering, and admission
and outcome progress. The Node commits the change and its migration record
together. Matching persisted tab-journal originals remain recoverable. Normal
synchronization delivers pending originals and recovers their outcomes after
reconnect. An unsupported pending prerequisite keeps the original work intact
for a compatible runtime.
Selected resource tables are rebuildable from a compatible confirmed snapshot
and contiguous history. Rebuilding a view leaves the command format untouched.
An explicit push pause survives a storage upgrade. Automatic downgrades,
storage resets, producer replacement, declaration upgrades, command-wire
changes and adoption of pre-baseline runtime-hash stores are outside its scope.

- [`makeMigratableNodeDatabase.ts`](../packages/core/src/Node/makeMigratableNodeDatabase.ts), [`nodeMigrationLedger.ts`](../packages/core/src/Node/nodeMigrationLedger.ts) — define immutable history and transactional ledger validation.
- [ADR 027](./adrs/027-connected-browser-node-storage-upgrades.md#offline-migration-of-pending-commands-2026-11-19) records the agreed offline behavior.

## nodeIndex

The stable primary key and append position of one immutable record in one Node database. Staged and executed records each receive their own position, including foreign executions and historical outcomes recovered after a baseline. AggregateNode derives the greatest retained command nodeIndex and allocates its successor inside the append transaction; exact retries precede new-allocation exhaustion checks. ServiceNode derives its maximum and successor within its own append transaction. Retry and admission do not consume append positions.

- [`AggregateNode.ts`](../packages/core/src/AggregateNode/AggregateNode.ts), [`ServiceNode.ts`](../packages/core/src/ServiceNode/ServiceNode.ts) — immutable record allocation.

## pushIndex

The dense outbound submission position under one originating `nodeId`. A Node allocates it once when accepting new staged input, independently of intervening executed records. Retries reuse the original position. Executed Node records do not allocate or inherit it. Direct producers retain their own sequence under their existing identity. Automatic Agent commands use canonical IDs with null nodeId, sessionName and pushIndex; Agent browser observers allocate no submission positions. A synchronous Session staging return has Session coordinates but no Node producer position or canonical ID.

## Session submission

Immutable pre-Node input identified by `(sessionId, sessionIndex)`, with its original local `stagingOutcome`. Synchronous Aggregate/Service staging commits optimistic resources, inverse operations and the submission together, then returns its typed local result. It has no canonical command ID. Node handoff allocates `(nodeId, nodeIndex, pushIndex)` once; an exact repeated submission recovers those coordinates and changed input rejects. Resource mutation and inverse capture require no command identity.

- [`makeAggregateSessionSubmission.ts`](../packages/core/src/aggregateSession/stageCommand/makeAggregateSessionSubmission.ts) — constructs Aggregate submission input without allocating an ID.
- [`NodeCommandCoverage.ts`](../packages/core/src/Node/NodeCommandCoverage.ts) — correlates handoff and coverage by Session coordinates.

## Staged-command journal

Best-effort browser retention of each successfully staged command until its
`AggregateNode` or `ServiceNode` durably retains it. The synchronous post-commit
write attempt runs after the staging transaction returns and before that staging
call returns. Committed-table observers may run before the journal callback;
failure preserves ordinary in-memory staging and
handoff. Each entry keeps the complete encoded original under its original Node
incarnation and `(sessionId, sessionIndex)` coordinates. Connected sessions use
the complete authenticated identity; Standalone uses the existing
`standaloneStorageKey` without adding incidental claims values or a new hash. A
later session recovers those same commands through Node retention, preserving identity instead of staging again.
Acknowledgement permits entry deletion; it does not prove server admission,
canonical execution, or retained `outcome`. The new session's rows receive only
its own coverage, while registered recovered coverage is validated separately.
Standalone recovery preserves original claims even when a later attachment to the
same owner has different valid non-path claims. Original retention permits cleanup
without waiting for authoritative local execution; Node reset leaves the earlier
incarnation's entries inert. The journal is pending delivery state, not a second
authoritative command history.

- [`stageAggregateSessionCommandTx.ts`](../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx.ts) — supplies the encoded original through an isolated post-commit callback.
- [`makeStagedCommandJournal.ts`](../packages/browser/src/stagedCommandJournal/makeStagedCommandJournal.ts) — owns per-command localStorage entries and best-effort storage access.
- [`recoverStagedCommands.ts`](../packages/browser/src/stagedCommandJournal/recoverStagedCommands.ts) — delivers old-session originals, validates retention and retires journal entries.
- [`makeStandaloneAggregateConnection.ts`](../packages/browser/src/StandaloneNode/makeStandaloneAggregateConnection.ts) — exposes the existing Standalone storage key to the shared Aggregate journal.

## sessionIndex

The non-reused insertion position within one `sessionId`. `lastSessionIndex` advances in the same synchronous transaction as successful staging; rejection rolls it back. Installing a replacement Node view may discard local rows but preserves the counter while the same Session remains. `nodeIndex` describes Node-view coverage and `pushIndex` describes producer order; neither substitutes for Session identity. Agent observers have no Session submission journal.

## Aggregate session replica metadata

`sessionMetadata` retains `sessionId`, `lastSessionIndex`, `afterNodeIndex`, `aggregateIndex` and `dispositionChainHash`. Installed view coverage and the authoritative checkpoint are independent of the local allocation counter. Local rows retain nullable Node ID/index/push coordinates together and derive canonical command identity only after assignment.

## Service session replica metadata

The singleton `serviceSessionMetadata` retains `lastSessionIndex`, `afterNodeIndex`, `serviceIndex` and `dispositionChainHash`. Local `sessionId` belongs to its bound capability and database lifetime. Ordinary mutations require exactly one metadata row; view installation preserves the counter while replacing resources/checkpoints atomically.

## Chain admission position and Node producer binding

Each AggregateChain/ServiceChain retains one logical admission position independently of command rows. Every ordinary or external-observation append advances it in the retention transaction, sharing dense `aggregateIndex`/`serviceIndex` order. A `nodeId` producer row freezes owner release, Session name, Actor name/version and complete encoded claims, plus `lastPushIndex`. Node admission verifies the derived canonical ID and binding, requires the next producer position and validates fresh support/payload. An ordered batch commits commands and both checkpoints together or rolls them all back. Reused positions report `node-admission-index-mismatch` with `expectedPushIndex`, without reading historical commands. Agent, recorded System and external completion retain their separate ID-based recovery.

In local development, a connected Node registers that binding at `lastPushIndex: 0` before installing its initial baseline. A transition recorded by the local CLI and returned by authenticated discovery identifies a replaced System history. The browser parks the previous database and journal, then opens a new producer. A missing binding alone leaves saved commands intact. The local admission fence refuses an unregistered Actor command. Remote and production Systems retain their existing admission behavior.

- [`commandIds.ts`](../packages/core/src/contracts/commandIds.ts) — constructs opaque IDs in disjoint encoded tuple namespaces; release/deployment/Archive identities are absent.
- [`validateAggregateNodeContinuation.ts`](../packages/system-worker/src/AggregateChain/admitAggregateCommands/validateAggregateNodeContinuation.ts) — validates and advances the Aggregate producer binding within admission.
- [`validateServiceNodeContinuation.ts`](../packages/system-worker/src/ServiceChain/admitServiceCommands/validateServiceNodeContinuation.ts) — validates and advances the Service producer binding within admission.
- [`registerAggregateNodeTx.ts`](../packages/system-worker/src/AggregateChain/registerAggregateNodeTx.ts) and [`registerServiceNodeTx.ts`](../packages/system-worker/src/ServiceChain/registerServiceNodeTx.ts) — establish or verify a producer binding without advancing it.

## AggregateNode nodeMetadata

The durable producer generation, storage binding, independent admission cursor,
resource checkpoint and pause preference: nodeId, aggregateId, sessionKey,
admittedThroughPushIndex, nullable aggregateIndex and dispositionChainHash, and
pushPaused. This seven-column row has no key; ordinary access requires exactly
one row. The durable nodeId exists before baseline authentication. Both checkpoint
fields are null until validated resources and their checkpoint commit atomically;
partial pairs are invalid, while zero/genesis is a valid installed baseline.
Checkpoint presence replaces the initialized flag without fabricating readiness.

Append nodeIndex and original pushIndex derive from retained command maxima in
the append transaction. Private outcomeIndex derives the contiguous ordered
original/same-ID-final prefix, stopping at the first gap. Snapshots expose these
three fields at the top level beside raw SQL metadata; published state retains
them. The stored materialization checkpoint may cover history absent from local
commands, so it remains independent of those derived progress fields. Schema 17
requires empty affected Aggregate Node storage across its connected, standalone
and Native hosts; ServiceNode and Native replica schemas remain independent.

- [`aggregateNodeTables.ts`](../packages/core/src/AggregateNode/aggregateNodeTables.ts) — declares the seven-column Aggregate Node metadata row.
- [`hasAggregateNodeCheckpoint.ts`](../packages/core/src/AggregateNode/hasAggregateNodeCheckpoint.ts) — identifies an installed resource checkpoint.
- [`readAggregateNodeMetadata.ts`](../packages/core/src/AggregateNode/readAggregateNodeMetadata.ts) — enforces singleton presence and checkpoint-pair consistency.
- [`readAggregateNodeIndexes.ts`](../packages/core/src/AggregateNode/readAggregateNodeIndexes.ts) — derives retained append and producer maxima.
- [`readAggregateNodeOutcomeIndex.ts`](../packages/core/src/AggregateNode/readAggregateNodeOutcomeIndex.ts) — derives the contiguous same-ID private final prefix.

## AggregateNode commands

Reconstructed runtime commands use `IAggregateNodeCommand` throughout local
handoff, Node retention and recovery. Canonical `id` and producer fields
`nodeId`, `nodeIndex`, `pushIndex` remain flat; all are null while allocation is
unknown to the holder, and all are known together after retention. Recovery sends
the same commands directly. Normalized SQLite journal rows retain their distinct
original/final storage shape under `IAggregateNodeCommandRow`.

The immutable thirteen-column Aggregate Node journal retains `nodeIndex`, `id`,
`sessionId`, `sessionIndex`, `pushIndex`, `commandName`, `payload`, `claims`,
`stagingOutcome`, `failure`, `aggregateIndex`, `dispositionChainHash` and
`exposedDelta`. Original rows retain local submission identity and producer
position with null `id`; reconstruction derives the canonical ID from Node
identity and `pushIndex`. Final rows retain that canonical ID and selected final
output, with null local submission/producer fields. No original row stores a
copied canonical ID.

Originals retain their complete invocation claims, encoded payload and immutable
local result/completion time. The captured definition and lock supply exact
Aggregate/Actor/session identity and contract version. Exact retries compare that
complete immutable content independently of allocation knowledge. Standalone
original claims may differ within one storage owner and never come from a newer
attachment. Validation checks each original's authored claims schema and requires
its decoded `claims.aggregateId` to equal `command.aggregateId` and the Node owner
ID, without requiring equality with the receiving attachment's full claims. SQL `exposedDelta` reconstructs the selected-command wire delta.
Changed fixed schemas require empty affected storage; this representation change
adds no SQL columns or migration.

- [`aggregateNodeTables.ts`](../packages/core/src/AggregateNode/aggregateNodeTables.ts) — declares the thirteen journal fields and phase/position constraints.
- [`readAggregateNodeRecord.ts`](../packages/core/src/AggregateNode/readAggregateNodeRecord.ts) — reconstructs originals with the derived canonical ID and decodes selected final output.
- [`acceptAggregateOriginalTx.ts`](../packages/core/src/AggregateNode/acceptAggregateOriginalTx.ts) — recovers exact submissions before allocating producer coordinates for new input.

## ServiceNode nodeMetadata

The connected Service producer's durable generation, complete storage binding,
independent admission cursor, resource checkpoint and pause preference: nodeId,
sessionKey, admittedThroughPushIndex, nullable serviceIndex and
dispositionChainHash, and pushPaused. This six-column row has no key; ordinary
reads and mutations require exactly one row. Producer identity exists before
baseline authentication. Both checkpoint fields remain null until validated
resources and the present pair commit atomically. A partial pair is invalid;
zero/genesis is a valid installed baseline. Checkpoint presence supplies readiness
without an initialized flag or fabricated public checkpoint.

Append nodeIndex and original pushIndex derive from retained command maxima
inside their append transaction. Private outcomeIndex derives the contiguous
original push-position/same-ID-final prefix through the first gap. All three are
top-level snapshot/state facts, not stored metadata columns. Admission remains
persisted independently because a receipt may precede final exposure. The Service
checkpoint can cover history absent from local commands and remains stored.
Connected replacement retains the same full identity fingerprint, rotates nodeId,
replaces commands/resources/checkpoint atomically and clears admission/pause;
cleared commands naturally reset derived progress. No separate Service owner
column, standalone host or Native host is implied. ServiceNode schema 20 requires
empty affected storage; verification remains deferred under Plan 232.

- [`serviceNodeTables.ts`](../packages/core/src/ServiceNode/serviceNodeTables.ts) — declares the six-column metadata row.
- [`hasServiceNodeCheckpoint.ts`](../packages/core/src/ServiceNode/hasServiceNodeCheckpoint.ts) — identifies a committed Service resource checkpoint.
- [`readServiceNodeMetadata.ts`](../packages/core/src/ServiceNode/readServiceNodeMetadata.ts) — enforces singleton presence and nullable-pair consistency.
- [`readServiceNodeIndexes.ts`](../packages/core/src/ServiceNode/readServiceNodeIndexes.ts) — derives append and producer maxima.
- [`readServiceNodeOutcomeIndex.ts`](../packages/core/src/ServiceNode/readServiceNodeOutcomeIndex.ts) — derives the contiguous private final prefix.

## ServiceNode commands

`IServiceNodeCommand` follows the same flat unknown/known allocation representation
through handoff and recovery. `IServiceNodeCommandRow` names the normalized
original/final SQLite row, while public staging results retain their decoded
authored result and local submission identity.

The immutable twelve-column original/final journal retains `nodeIndex`, `id`,
`sessionId`, `sessionIndex`, `pushIndex`, `commandName`, `payload`, `stagingOutcome`,
`failure`, `serviceIndex`, `dispositionChainHash` and `exposedDelta`. Original rows
retain submission identity and producer position with null `id`; final rows retain
the derived canonical ID with null submission/producer fields. Bound
Service/Actor/session names and complete encoded claims reconstruct from the
immutable definition; contract version comes from its exact selected contract.
ServiceNode binds full claims to one storage identity, without Aggregate
Standalone's different-claims exception.

Retry compares reconstructed immutable input before current blocked/readiness
checks and separately validates any known allocation. Phase readers reject mixed
fields and invalid positive-safe coordinates. Selected final names may be outside
the original contract registry. Payload bytes, staging result/completion time,
private failure disclosure and final checkpoint evidence preserve their distinct
responsibilities. Changed fixed schemas require empty affected storage; the flat
runtime command representation changes no SQL layout or persisted format.

- [`serviceNodeTables.ts`](../packages/core/src/ServiceNode/serviceNodeTables.ts) — declares the twelve journal fields and phase/position constraints.
- [`readServiceNodeRecord.ts`](../packages/core/src/ServiceNode/readServiceNodeRecord.ts) — reconstructs complete originals and maps selected final output to wire delta.
- [`acceptServiceOriginalTx.ts`](../packages/core/src/ServiceNode/acceptServiceOriginalTx.ts) — compares exact retries and validates the selected contract before new allocation.

## Agent nodeMetadata

The exact singleton owned by AggregateAgentNode or ServiceAgentNode:
`singleton: 1`, nullable owner index (`aggregateIndex` or `serviceIndex`) and
nullable `dispositionChainHash`. The checkpoint pair begins null and commits
atomically with selected-resource snapshot or command-delta materialization.
Definition/owner/environment binding belongs to the Node. Browser observers
retain no command rows, producer progress, duplicate baseline or wake state.

- [Aggregate observer schema](../packages/core/src/AggregateAgentNode/aggregateAgentNodeDbConfig.ts), [Service observer schema](../packages/core/src/ServiceAgentNode/serviceAgentNodeDbConfig.ts) — declare each family's checkpoint singleton.

## afterNodeIndex

The captured inclusive Node prefix installed with an Aggregate or Service replica's coherent view. Resource replacement, owned original coverage, same-row final resolutions, metadata and uncovered-local replay commit together. A retention reply enriches coordinates without changing this prefix or removing optimism. It is not a cursor through copied original/final phase history.

## admissionIndex

The server admission position where the protocol supplies it. It describes accepted input in its aggregate or service order, independently of local history, originating submission progress, and execution progress. Node admission receipts update private delivery progress without rewriting staged history.

## admittedThroughPushIndex

The retained private prefix of originating submissions known admitted, initially zero. Durable ordinary Nodes own it. Automatic Agent commands have no producer prefix. A retained execution also establishes admission of its matching submission. Ordinary Node server reconciliation may rewind this prefix only when it does not contradict retained completed submissions. Browser Agent observers allocate no submissions and own no admission prefix.

## outcomeIndex

The largest contiguous `pushIndex` prefix whose originating staged submissions each have a same-ID retained final. AggregateNode and ServiceNode derive it by ordered original push positions and stop at the first gap; a greater finalized position cannot skip an unresolved original. It remains a real snapshot/state/resume field without a Node SQL cache. Admission alone cannot advance it. Historical recovery may advance this prefix without reapplying resources or changing the resource checkpoint.

## durable browser node

An `AggregateNode` or `ServiceNode` owns one persistent SQLite database within a
SharedWorker host for its authored definition, versioned owner identity, and
complete claims. One connected host can contain several isolated authenticated
Nodes; each attachment proves its own identity before joining one. Each
owns its immutable history, authentication integration, synchronization, and
recovery. Its `nodeId` survives restart. Acceptance atomically allocates a staged
`nodeIndex` and `pushIndex`; execution appends a distinct record. One authenticated
baseline initializes fresh storage; later connections resume committed execution
and outcome cursors. Conflicting execution suspends synchronization until recovery
establishes a usable baseline or terminal handling takes over.

Connected recovery runs in production and development and requires a fresh
validated authenticated snapshot before destructive work. It first validates the
complete retained original-command stream and preserves its producer ID, command
IDs, payloads and positions while rebuilding resources and reconciling existing
replay/admission. If that identity or stream cannot be recovered, at most one
fresh-producer fallback replaces only the affected namespace after connections
and storage handles drain under its lease. Uncertain originals are not restaged
with new identities. Authentication failures, ordinary network interruptions and
invalid snapshots preserve storage.

Live attachments withdraw readiness and acknowledge retirement before repair.
Preserving repair retains pending replica work; fresh-producer replacement may
lose it. Delivery generations independent of producer identity reject retired
callbacks. One recovery cycle is available per new session attempt; reload or
Retry rearms it, concurrent attachments join in-flight recovery, and ordinary
reconnects or recovery success do not replenish it. A failed facade stays failed
until a fresh owner is constructed. Backend storage, login state and
application-owned drafts remain outside this recovery.

Connected Aggregate and Service definitions wrap the same pure session definition imported by an application-owned executable worker. The worker supplies independent projection dependencies. Factory artifact URL and exact public lock are checked before attachment. The Node reconstructs shared pending optimism in memory from durable authoritative resources and originals; it publishes coherent views rather than phase pages.

- [`AggregateNode.ts`](../packages/core/src/AggregateNode/AggregateNode.ts)
- [`ServiceNode.ts`](../packages/core/src/ServiceNode/ServiceNode.ts)
- [`makeSharedWorker.ts`](../packages/browser/src/makeSharedWorker.ts)
- [Connected session recovery](./architecture/browser/bootstrapBrowserSession.md#connected-session-recovery) — defines authenticated recovery, preserving repair, bounded fallback and attachment coordination.

## SharedWorker host, owner and client

The **host** is the SharedWorker global scope and retained `connect` listener.
An **owner** is one closeable acquisition of its family runtime, Node, SQLite/VFS,
synchronization resources and exclusive namespace lease. A **client** is a valid
raw-bootstrapped port with a unique document-owned lifetime Web Lock, including a
client still waiting for namespace ownership or attachment. The client lock
detects document loss; the separate namespace lock excludes overlapping storage
owners. Hidden, frozen and cached documents remain clients while the browser
retains their locks.

A connected host acquires one owner lazily per complete authenticated identity.
Pending acquisition and published attachments retain that owner; its last
reference starts cleanup. Same-identity joins wait for closure, while other
identities proceed independently. Cleanup failure retains that identity's namespace
exclusion and blocks its reacquisition. Sign-out fences joins before awaiting
revocation, invalidates offline eligibility, attempts bounded signed-out delivery
to its published attachments and drains only that owner. Standalone retains one
owner per live client group. The host remains reusable. `session.dispose()` establishes the facade's local cleanup without
acknowledging shared-owner drainage. No visibility expiration, heartbeat or
storage reset supplies liveness.

- [`acquireWorkerPort.ts`](../packages/browser/src/Node/acquireWorkerPort.ts) — acquires the document lock and raw port bootstrap before RPC.
- [`makeWorkerConnections.ts`](../packages/browser/src/Node/makeWorkerConnections.ts) — watches raw clients and serializes connection-group closure/replacement.
- [`makeAggregateSharedWorker.ts`](../packages/browser/src/AggregateNode/makeAggregateSharedWorker.ts) — authenticates Aggregate attachments and owns identity-isolated Node lifetimes.
- [`makeServiceSharedWorker.ts`](../packages/browser/src/ServiceNode/makeServiceSharedWorker.ts) — owns the corresponding Service attachment and Node lifetimes.
- [`closeNodeStorageOwner.ts`](../packages/browser/src/Node/closeNodeStorageOwner.ts) — releases namespace ownership only after prerequisite cleanup succeeds.

## standalone SharedWorker execution

One application SharedWorker owns authoritative SQLite backed by `IDBBatchAtomicVFS`.
The authored aggregate/Actor versions, session name, generated backup path and
complete canonical `aggregateSessionLock` select its worker name, persistent
storage namespace and lifetime Web Lock. The lock covers the claims schema,
selected models and public contracts; incidental claims values outside the path
and runtime/build identity do not partition storage. The Web Lock serializes
worker builds opening the same namespace. A changed lock uses a separate
database and lease, while returning to the same scope, path and lock reopens its
retained partition. Each tab stages synchronously, attempts a pending journal
write under that same storage key, and delivers complete original commands through
ordinary Node acceptance. A new attachment may recover an original whose valid
non-path claims differ; the original keeps its captured claims and must still
match the Node's Aggregate ownership. Empty command pages schedule no execution. The
worker retains original claims, executes guards/programs against current state,
and commits resources, terminal outcomes, and checkpoints together before
publishing. Reset atomically reseeds storage, rotates `nodeId`, fences stale
capabilities, and rebuilds every attached tab within the current definition's
partition. Reset does not transfer data between definitions. First adoption of
lock-based partitioning changes every existing standalone key and initializes
fresh storage from configured seeds, preserving old databases without lookup,
migration, deletion or fallback. Framework storage cutovers require empty
affected files.

- [`AggregateNode.ts`](../packages/core/src/AggregateNode/AggregateNode.ts) — validates retained aggregate ownership before replacing storage.
- [`makeStandaloneSharedWorker.ts`](../packages/browser/src/StandaloneNode/makeStandaloneSharedWorker.ts)
- [`standaloneIdentity.ts`](../packages/browser/src/StandaloneNode/standaloneIdentity.ts) — hashes the authored scope, generated path and canonical session lock independently of incidental claims values and runtime/build identity.
- [`makeStandaloneAggregateSession.ts`](../packages/browser/src/makeStandaloneAggregateSession.ts)
- [Standalone workflow](./architecture/browser/StandaloneSharedWorkerExecution.md)

## execution aggregate release

The exact aggregate release owned by the executing VersionRepo. It supplies the
selected program and canonical models for both original execution and replay.
The command's retained aggregate release remains its original routing metadata;
it does not choose the payload decoder.

## execution contract

The exact ordinary or external contract selected from the execution aggregate or
Service release for a command. Its checked `evaluate` runs one program, and its
result codec encodes the domain output. Ordinary actor commands also require
exposure by that release's actor and retain actor-selected reads. Recorded
external continuations retain their distinct originating authority.

## source contract

The exact public contract version describing the incoming payload. Ordinary
commands resolve it within the execution contract's declared previous/next
lineage and adapt through authored edges. External commands resolve their exact
owner-scoped external name/version to validate frozen input and recorded response.
When that historical declaration is the executing public declaration, one decode
also prepares execution input. When they differ, historical validation runs first
and the executing declaration independently decodes the original portable input;
historically decoded values are not adapted into the executing response format.
Neither lookup depends on the original aggregate or Service release remaining available.
Service resolves required historical declarations within its named registry before
selecting execution support. Missing historical declarations block progress;
unsupported executing contracts or ordinary payload adaptation retain a replay
`outcome` and advance `serviceIndex`.

## contract result

The decoded domain value returned by one successful Effect program. Each authored
version declares its optional result codec; omission requires undefined and
persists null. `IInferContractResult` follows that codec, and operation types follow
`operationsSchema`. Browser staging and canonical execution evaluate the same
ordinary program and its declarations. The owning workflow encodes the result
before application and retains authoritative success under
`outcome.result: { _tag: 'Success', success }` beside `outcome.finalizedAt`.
The browser's local result remains a staging observation. Command `contractVersion`
remains provenance; evaluation returns `{ operations, result }`.

## coded success

A specific successful operation outcome identified by a stable code and carrying
its own result data. Different codes distinguish successful alternatives that
change the caller's next action. For example, `purchase-created` records a new
purchase and starts payment work; `purchase-already-exists` confirms the identical
purchase without starting payment again. Payment completion remains a separate fact.

## Agent

A claims-free named principal scoped to an Aggregate or Service name. Its own
independent release serves as its session definition: exact owner binding,
selected view, ordinary contract grants and callbacks. The Agent invokes commands
under its own identity. Browser observers and Studio do not drive its execution.

## Agent release

A declaration constructed with `makeAggregateAgentRelease` or
`makeServiceAgentRelease`. It binds one exact owner name/version using scalar
identity fields and declares `agentName`, `agentVersion`, `sessionName`, `db`,
`selections` and `contracts`. Each named entry in `wakeRules` references a selection and supplies `wakeAt` and `onWake`.
System assembly validates the view, wake rules and grants against that owner.
Replacing an Agent does not require a new owner composition. Portable facts live
in owner-scoped `agentVersions`; executable functions remain native declarations.

- [`compileAgentRelease.ts`](../packages/core/src/agent/compileAgentRelease.ts)
- [`validateAgentReleases.ts`](../packages/core/src/system/make/makeSystem/validateAgentReleases.ts)

## Agent Node selection

`system.aggregateAgents[aggregateName][agentName]` or
`system.serviceAgents[serviceName][agentName]` contains `{ releases, active }`.
The active Agent carries its exact owner binding. Observable projections remain
independent of automation selection. Deleting the declaration stops callbacks and abandons pending command deliveries.
Replacement and same-name re-addition start a new installation generation with
producer index 1. Commands already admitted remain in the owner Chain.

## Agent command reference

A grant to stage one named, versioned ordinary command on the Agent’s exact owner
release. `makeAgentCommandRef` derives the payload type from a type-only contract
import. The Agent uses the exact owner contract for local evaluation. The owner executes the admitted command authoritatively.

## Agent wake rule

A named rule bound to a declared selection. Its deterministic function uses a confirmed row and the selected query database to return one absolute millisecond deadline or null. A pending wake belongs to the rule and resource together.

## Agent selected dependency

A relation predicate depending on another declared model's selected rows.
Conditions may reference only view fields. Every dependency needs a declared
selection; cycles and opaque SQL conditions such as `RAW` are rejected.
Agent VersionRepos evaluate selections while applying owner history and publish selected deltas.

## Agent pending wake

A durable deadline for one rule and selected resource. A changed deadline updates its pending wake. An unchanged deadline preserves its current pending or consumed state. The Agent catches up before processing due wakes. Consumption and command recording commit atomically.

## Agent initialization error

A persisted installation error on the stable Agent Repo. Explicit dev/deploy retry captures a fresh selected view and derives its wakes again.

## transient AgentNode

An `AggregateAgentNode` or `ServiceAgentNode` owns one mounted browser
observation lifetime: exact definition/owner/session binding, selected model rows,
canonical checkpoint and guarded read publication. Its host supplies fresh
memory SQLite; reconnect keeps the same Node and checkpoint. Selected command
replay and checkpoint changes commit atomically. Disposal retires every reader.

- [`AggregateAgentNode.ts`](../packages/core/src/AggregateAgentNode/AggregateAgentNode.ts) — owns the mounted Aggregate Agent state and publication fence.
- [`ServiceAgentNode.ts`](../packages/core/src/ServiceAgentNode/ServiceAgentNode.ts) — provides the corresponding Service ownership.

## Agent Node Repo

AggregateAgentNodeRepo and ServiceAgentNodeRepo have stable unversioned identities
`(systemId, aggregateName, aggregateId, agentName)` and
`(systemId, serviceName, agentName)`. Each owns selected model tables/resources,
processing position/hash, installed materialization schema, initialization status,
pending wakes, producer progress and complete pending command-delivery rows.
It retains no command execution or projected history.

Selected changes, wake changes and the checkpoint commit together. Replacement rebuilds the selected view and schedule, abandoning outstanding deliveries. Commands already admitted remain with the owner Chain.

Each Repo owns one WakeRegistry for physical alarm scheduling. Agent VersionChains
retain selected history and advance Node subscriber acknowledgement without
deleting that history. Browser Agent sessions remain separate observers.

- [`makeAgentNodeRuntime.ts`](../packages/agent-worker/src/runtime/makeAgentNodeRuntime.ts)
- [Agent execution](architecture/server/AgentExecution.md)

## Agent session

The browser application lifecycle/execution facade returned by
`makeAggregateAgentSession` or `makeServiceAgentSession`. It exposes
`nodeDefinition`, `runSync` / `runPromise`, lifecycle/telemetry and its current
observer Node. Host inputs provide optional application `layer` and bootstrap;
Aggregate inputs also identify the Aggregate instance. The Session owns no
second Agent database and cannot stage commands or execute behavior.

## Command payload

The complete authored business input retained with an ordinary command. Named
IDs such as `reservationId` or `purchaseId` belong here, alongside expected values
or recorded observations required by the action. A contract declares readable
`models` and explicitly queries current rows during evaluation; existence,
ownership and eligibility remain domain checks. Commands have no generic row
subject or `resourceId` context. Model operations carry `resourceId` for their
individual targets.

## Completed purchase

A Shopping purchase with authoritative successful payment evidence and
`paymentState: 'paid'`. A committed pending purchase is not completed. Decline
retains the frozen purchase/items and leaves the unconsumed cart editable. Tracking
labels and carrier status remain separate from payment; completed purchases stay
visible throughout tracking changes.

## Tracking refresh

A manually requested carrier observation for a ready label. The ordinary
`updateTrackingInfo` command reserves one sequence and coalesces concurrent work;
its private continuation validates the frozen label identity and sequence before
applying the recorded evidence. Shopping's example reports `in_transit` for
sequence 1 and `delivered` for later sequences.

## direct aggregate command / direct service command

A canonical original System command submitted without a Node producer position.
The typed administrative API selects an exact owner release and its explicit
`system` grant, validates/encodes payload and freezes ID-less input. The admitting Chain atomically allocates its logical position and derives its canonical ID. Every direct invocation creates a new command, including an authored transport retry. Actor, Agent, Node and external-parent fields are
absent. Actor commands instead originate through session staging and retain the
complete Node producer position before canonical admission.

- [`makeSystemApi.ts`](../packages/core/src/utils/getSystemApi/makeSystemApi.ts) — constructs typed administrative execution methods.
- [`prepareSystemAggregateCommand.ts`](../packages/core/src/utils/getSystemApi/prepareSystemAggregateCommand.ts), [`prepareSystemServiceCommand.ts`](../packages/core/src/utils/getSystemApi/prepareSystemServiceCommand.ts) — freeze one immutable ID-less input before execution.

## executed aggregate command / executed service command

A final server command classified by its original owner. It retains the original input, provenance, admission position, and success, rejection, or execution failure. Forwarding preserves that owner; version execution positions and actor/session projections remain separate local facts.

## staged Aggregate submission

ID-less Aggregate Session input evaluated against its current optimistic view, returning the original `stagingOutcome: { result, completedAt }`. Ordinary attached Session rows retain that observation and current inverse operations for their uncovered overlays; their bound AggregateNode owns shared pending optimism. Chain admission can precede final exposed-command evidence. The socket submits unchanged original input for canonical admission/execution; the authoritative `outcome` is separate from the local staging observation.

## stagingOutcome

The original successful local Aggregate or Service staging result and its one logical
`completedAt` timestamp. Resource application and pending replay use that same
time. Rebase preserves this original observation, independently of the later
canonical `outcome`. Local rejection retains no staged command.

## inverseOperations

Current local undo information on a command row, separate from its immutable staging result/time. Null means no active optimism; an empty array means a successful no-op. Aggregate and Service replicas retain inverses only for uncovered local overlays and clear/rebuild them during Node view installation. Node projection is rebuilt from durable baseline/originals and stores no durable inverses. Inverses never enter admitted-command input.

## stagedAt

The logical local execution time supplied to command replay, derived from the
original `stagingOutcome.completedAt`. Replay uses that same time rather than
resampling it.

## exposedDelta

The selected resource change retained in ordinary Node/Chain history. Agent browser Nodes apply it to selected resources
without retaining a local command history. The exposed-command protocol names it delta. Aggregate and Service attached replica commands do not retain this value: they install the coherent Node graph and retain only compact applicable final position/failure on their own row. It is separate from mutable local inverseOperations and canonical outcome.

Receiving an authoritative delta applies recorded changes; finalized contracts
are not rerun to derive them. Ordinary connected Nodes rebuild optimism only from
unresolved original payloads against the updated baseline. Agent browser Nodes
observe selected changes without optimistic command replay.

## external contract

An exact pure browser-safe definition made with `defineAggregateExternalContract`
or `defineServiceExternalContract`, paired with a same-family backend implementation
made with `makeAggregateExternalContractRelease(definition, implementation)` or its service
equivalent. The definition owns name, version, payload/response codecs, timeout and
`.externalOperation`. The implementation supplies `request`, continuation guard,
program and read/operation permissions; it retains the exact definition through
`external.definition`. Matching names do not confer that authority.

The backend `request({ payload })` performs opaque external work. Its result is
checked by the definition's response codec. `executeExternalRequest` permits
suspension and contributes no command operations; `encodeExternalResponse` checks
the response and `makeExternalOutcome` records usable response or request failure.
AggregateChain and ServiceChain retain the first observation on
`externalOperationOutbox`. The emitting release maps the frozen input and
observation into the ordinary continuation payload. The Chain admits that
command and deletes the pending row atomically. Its own program and result
follow the ordinary contract.

Authors own request retries, remote idempotency and reconciliation. A recorded
request failure reaches the continuation and establishes no remote-effect failure.
Successful JSON null remains explicit. Work with no recorded outcome is recoverable;
recorded command delivery never restarts the request. Browser sessions neither
supply nor receive external observations.

- [`makeAggregateExternalContractRelease.ts`](../packages/core/src/contracts/make/makeAggregateExternalContractRelease.ts), [`makeServiceExternalContractRelease.ts`](../packages/core/src/contracts/make/makeServiceExternalContractRelease.ts) — bind exact pure definitions to backend requests and continuations.
- [`makeExternalOperationQueue.ts`](../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts) — wakes independent pending requests while each Chain's command outbox owns admitted-command execution.

## command operation continuation

An ordinary command admitted to the sending Chain in response to a destination
command’s finalized execution. The pinned sending release selects `onSuccess`
or `onFailure` and constructs the ordinary command’s payload from that
operation’s frozen outgoing payload and the destination’s success value or
failure. [ADR 020](adrs/020-shared-programs-and-portable-operation-declarations.md#amendment-of-2026-11-19)

## external request continuation

An ordinary command admitted to the originating Chain to handle a recorded
external request outcome. A usable provider response selects `onSuccess`. A
recorded request failure selects `onFailure`. Each branch names the ordinary
contract and supplies its declared payload. Each receiving release replays that
command under its ordinary command rules. A later refusal by the continuation’s
guard or program is the continuation command’s own outcome.

## external operation

A deferred payload-only invocation recorded through an external declaration's
`.externalOperation` operation definition. Optimistic evaluation checks the complete batch
without producing external work. Original canonical preparation resolves the exact
local backend implementation and creates a prepared external operation containing
the frozen payload, external contract name and version, stable external command ID, authored
operation index, and emitting release version. AggregateChain's complete pending request has six
required fields: `externalCommandId`, `externalContractName`,
`externalContractVersion`, `payload`, immediate `originCommandId` and original `aggregateVersion`.
ServiceChain's pending request has the same six required fields with original
`serviceVersion` instead of `aggregateVersion`. Neither pending table retains
`initiatingCommandId`, `operationIndex` or a composite lineage index. Aggregate and Service
execution-operation members derive parent context from their command and bound
executing release instead of repeating it. Replay drops external descriptions; model indexes
remain sparse.

AggregateChain retains only complete pending requests in externalOperationOutbox
alongside commands.outcome. ServiceChain likewise retains its first original
commands.outcome and complete pending requests, without retained operation history.
Both families publish and retain model/frozen external members in one ordered compact
`operations` union. Service publication/history/fanout retains the full admitted
`IEvaluatedServiceCommand`, including canonical `id` and original `serviceVersion`.
Complete retained evaluated commands recover exact original replies after
publication deletion. Each admission Chain selects `operationName: 'external'`
members and omits the discriminator and `operationIndex` from pending-request rows.
It supplies `originCommandId` from parent `id` and `aggregateVersion` or `serviceVersion`
from the admitted command's bound original release. The pending row's
`externalCommandId` remains unique; shared prepared descriptions and full
VersionChain history retain parent context and sparse `operationIndex`. Original
receipt commits `commands.outcome` with these requests atomically; equal retained
outcome retries return before insertion and cannot recreate settled work. The
admission Chain runs requests and records the first observation on the pending
row. The pinned emitting Worker builds the ordinary continuation. Admission at
the next position and pending deletion commit together. Missing work makes late
callbacks no-ops. The ordinary continuation owns its own execution and
`outcome`. Exact request code must remain available while work is pending.

- [`externalOperation.ts`](../packages/system-worker/src/externalOperations/externalOperation.ts) — portable frozen invocation schemas with immediate parent ID and emitting version.
- [`recordExternalOutcomeAndAdmitCommandTx.ts`](../packages/system-worker/src/ServiceChain/recordExternalOutcomeAndAdmitCommandTx.ts) — records the first observation, then commits Service continuation admission and request deletion together.

## external continuation

An ordinary System command selected by the first recorded `externalOutcome` of
a pending external request. The pinned emitting release maps the frozen outgoing
payload and response or failure. The originating Chain admits the command with
the pending request's stable ID and original owner version, then deletes that
pending row in the same transaction. A construction failure admits the selected
contract with a null payload and the public failure. Each release evaluates or
replays through that position using the resulting ordinary command.

## evaluated command

`IEvaluatedAggregateCommand` and `IEvaluatedServiceCommand` are the full admitted Aggregate
and Service commands with canonical `id`,
non-null release-local `outcome`, `dispositionChainHash` and ordered `operations`.
Each retains encoded payload, external observation, contract version, Aggregate or Service
identity, original `aggregateVersion` or `serviceVersion`, scalar Origin and its
applicable flat provenance, and `aggregateIndex` or `serviceIndex`. The bound VersionRepo/VersionChain identifies
the evaluating release; replay never overwrites the original admission release.
Each evaluating release may retain a different outcome and operations for that
same admitted command. Service replay reuses the original retained
`outcome.finalizedAt` for its evaluation and source/projection resource writes.

Each VersionRepo constructs it once, stores it as complete pending publication
and returns it from original finalization. Its VersionChain retains that complete
value across local `commands` and Archive ranges. Both actor and agent queues
deliver from the same logical history without second payload tables or backfill.
Each retains its own subscriber cursors, leases and alarms. Projection acknowledgement
does not delete history; Archive acknowledgement permits removing covered local copies. Model members derive
command association from parent `id`. External members derive initiating command
from parent `id`, and their emitting release from the bound
execution owner. Each admission Chain uses original finalization to reconstruct complete
standalone pending requests from the admitted command's original release. Sparse
`operationIndex` values and explicit model versions remain.

- [`evaluatedAggregateCommand.ts`](../packages/system-worker/src/AggregateVersionChain/evaluatedAggregateCommand.ts) — defines the full admitted Aggregate command and its evaluated operations.
- [`evaluatedServiceCommand.ts`](../packages/system-worker/src/ServiceVersionChain/evaluatedServiceCommand.ts) — defines the full admitted Service command and its evaluated operations.
- [`recordOriginalCommandOutcomeTx.ts`](../packages/system-worker/src/AggregateChain/recordOriginalCommandOutcomeTx.ts) — reconstructs complete pending requests while retaining the original outcome.

## command outbox

A complete pending message owned by one source and a named receiving capability.
The source retains it until the receiver commits and the sender acknowledges that
receipt. Server alarms recover pending work after interruption. Aggregate resource
finalization writes a complete evaluated-command publication and returns its committed
original outcome synchronously; projection finalization writes complete selected
publication. These rows are
independently deletable and do not substitute references to a separate retained
journal. ServiceVersionRepo and ServiceActorVersionRepo have the corresponding
complete-message boundaries; ServiceVersionChain and ServiceActorVersionChain
retain the independent permanent histories.

Each VersionRepo has one complete VersionChain publication containing model/external
output: one ordered compact `operations` union in both families. Aggregate original finalization, pending publication, immutable history
and fanout use the same full `IEvaluatedAggregateCommand` representation. Service uses its
corresponding full `IEvaluatedServiceCommand` at the same boundaries. There is no separate
admission-Chain output queue or reverse confirmation.
externalOperationOutbox belongs to each admission Chain. The first observation
transaction directly admits the external command and deletes its pending request;
no observed-command outbox or FIFO allocator remains. Failure preserves pending
work and alarm recovery; successful admission does not establish continuation execution.

Browser `stagedCommandOutbox` selects unresolved local commands without Node coordinates. Recording a minimal retention reply stops handoff while keeping the local overlay until a covering Node view installs. The in-memory overlay belongs to that session; connected browser and Standalone sessions also attempt synchronous staged-command journal writes for recovery after closure. Receiving Nodes retain their independent persistent browser SQLite history.

## outbox subscriber capability

The named receiving object bound to an outbox. Its prototype `receive(rows)` returns `IRpcEnvelope<Receipt, IZerospinErrorJson>`. `IOutboxSubscriber<QUEUE>` infers delivered rows and the successful receipt from `IOutboxQueue`; stored source rows may have a different shape. A browser `stagedCommandSubscriber` remains subject to its parent attachment's identity and lifecycle checks.

## outbox receipt and acknowledgement

A receipt proves receiver retention: Node `{ sessionId, sessionIndex, nodeId, nodeIndex, pushIndex }` coordinates, admission data, or void when no data is needed. The Node coordinates determine the canonical ID through `makeNodeCommandId`; the local submission coordinates correlate the acknowledgement. Acknowledgement is the sender's separate local commit. Browser acknowledgement only enriches the local original coordinates; it neither imports shared history nor settles optimism. Lost replies retry the same immutable input without new allocation. Server pending-row deletion and admission acknowledgement keep their existing atomic ownership. Final exposure requires separate same-ID final evidence.

## Actor publication acknowledgement

Proof that AggregateActorVersionChain or ServiceActorVersionChain durably covers
every offered selected-history position. Its single bound projection Repo freezes
the public command and optional private completion when materialization commits.
Covered retries prove progress without proving equality with retry bytes; they
cannot replace the first retained publication or produce another broadcast.
Physical Archive acknowledgement separately proves complete paired retention and
permits removing the covered local copies. Node completion and current connection
authority remain separate facts.

## command kind

The scalar discriminator on a canonical command is `actor`, `agent` or
`system`. Aggregate instance and exact owner release remain independent
fields. Each variant requires its own root fields and omits the other variants' fields:

- Actor: `actorName`, `actorVersion`, complete encoded `claims`, nonempty
  `nodeId`/`sessionName` and positive safe-integer `pushIndex`.
- Agent: owner-local `agentName` and `agentVersion`.
- System: no identity, claims, Node or continuation-parent fields.

SQL stores scalar `kind` and flat nullable provenance columns, with JSON for
claims. Row codecs reconstruct absent inactive fields and reject contradictory
rows.
The unique `(nodeId, pushIndex)` index still orders Actor submission streams.

Authenticated session/ticket/snapshot identities keep their separate object
representation. Actor drafts are flat commands without an allocated Node tuple;
the Node allocates that tuple before retaining/submitting a staged Actor command.
Agent browser Sessions observe. Automatic Agent producers resolve permitted
contracts through the enclosing release. Both administrative SystemApi command
methods accept only System commands. Public browser frames omit full provenance.

Ordinary ingress decodes Actor/Agent/System variants and binds submission permission.
VersionRepos interpret Actor claims and guards. Only the owning Chain's exact
pending-work recording transaction constructs a Continuation and deletes that work
atomically. The parent ID records causality; it supplies no submission permission.

- [`CommandSchema.ts`](../packages/core/src/contracts/CommandSchema.ts) — concrete flat variants and separate pre-Node Actor draft.
- [`OriginSchema.ts`](../packages/core/src/contracts/OriginSchema.ts) — stable Actor/Agent session identity objects.
- [ADR 023](adrs/023-flat-command-origins-and-claims-free-continuations.md) — persisted authority and protocol decision.

## Agent version view

The selected graph for an exact Agent name/version in a declared Aggregate
release/instance or Service release. Physical Repo/Chain keys include the owner
release and Agent version. All declared projections may consume owner history
and serve observers, independently of Node selection. Projection Repos commit
resources/checkpoint and complete pending publication atomically; Chains retain
public history and observer sockets without private Agent completion tables.
`SystemApi.openAggregateAgentSession` and `openServiceAgentSession` snapshot the
requested complete binding and issue an exact observer ticket. Observer Node ID
remains ticket/resume identity; automation belongs to the separate AgentNodeRepo.

- [`resolveAggregateProjectionView.ts`](../packages/system-worker/src/aggregateProjection/resolveAggregateProjectionView.ts) — resolves Aggregate Actor or Agent selected views.
- [`resolveServiceAgentView.ts`](../packages/system-worker/src/serviceAgentProjection/resolveServiceAgentView.ts) — resolves exact Service Agent selection and capabilities.

## Native session host

The in-process owner of a Session and its Node in a native application. It retains
local journals, forwards staged commands, and catches up with authoritative
history when the application reconnects. Leaving the foreground suspends delivery;
it does not discard pending commands or cancel backend work already admitted.

- [`makeNativeSession.ts`](../packages/native/src/makeNativeSession.ts) — composes the retained Aggregate Session and Node; its promise resolves with initialized controls.
- [`decodeAggregateNativeSessionInputs.ts`](../packages/native/src/decodeAggregateNativeSessionInputs.ts) — validates and captures aggregate session inputs before acquiring storage, and defines the exported `AggregateNativeConfigurationSchema` and `AggregateNativeConfiguration`.
- [`Session.swift`](../packages/swift/Sources/Zerospin/Session.swift) — exposes observable state and lifecycle to SwiftUI.

## iOS System package

A ZIP containing an executable JavaScript System, its portable `SystemSpec`,
and a manifest binding their identities. The iOS app selects a package from a
public GitHub Release and inspects its declarations in an isolated runtime
before installing it. The package's selected repository is trusted to supply
System code; the manifest digest identifies bytes and does not establish the
publisher's trustworthiness.

- [`packageSystem.ts`](../packages/cli/src/package/packageSystem.ts) — builds the package from the authored System.
- [`SystemPackage.swift`](../packages/swift/Sources/Zerospin/SystemPackage.swift) — validates the archive and package digest.
- [`SystemRuntime.swift`](../packages/swift/Sources/Zerospin/SystemRuntime.swift) — inspects and runs the package.

## iOS System backup

A snapshot of one installed System package, installation identity, and its
complete local System storage. Each installed System has its own iCloud backup;
a GitHub repository identifies at most one installed System. `SystemRuntime`
captures the storage while its serialized executor holds the directory lease,
and `SystemBackupStore` uploads
the snapshot to the user's private CloudKit database. A locally committed
command and a completed iCloud backup are separate facts. A replacement
iPhone can restore all available completed snapshots; this does not synchronize
histories between active iPhones.

- [`SystemStore.swift`](../ios/Zerospin/SystemStore.swift) — captures and stages System storage.
- [`SystemBackup.swift`](../ios/Zerospin/SystemBackup.swift) — uploads and retrieves CloudKit snapshots.

## RPC method definition

A schema-backed operation on an admitted capability. Its schema determines caller
input and decoded domain input; its domain Effect performs the operation; its
success and recognized-failure callbacks construct the public outcome. Generated
prototype methods own validation, execution, annotation, and telemetry before
publishing that outcome.

- [`makeRpcApi.ts`](../packages/system-worker/src/makeRpcApi/makeRpcApi.ts) — defines the class factory and contextually typed method definitions.

## Initialized capability state

The identity or admission facts retained by one capability instance. An
API-qualified `Initialized` service exposes those facts to its domain Effects.
Two capabilities can supply the same service tag with different values while
keeping both values private to their own calls.

- [`Initialized.ts`](../packages/system-worker/src/SystemApi/Initialized.ts) — names the retained system capability identity.
- [`SystemApi.ts`](../packages/system-worker/src/SystemApi/SystemApi.ts) — supplies that identity through its instance layer.

## ordinary and recorded-continuation admission

Ordinary aggregate and service ingress decodes a complete page once and processes commands in order in one synchronous transaction. Exact retained retries recover before fresh declaration/claims/payload checks. New ordinary inputs require the current owner and actor allowance. AggregateChain records/adopts the observation from its own pending external operation atomically. ServiceChain also records/adopts directly from its frozen pending operation in that local transaction. Missing work makes late callbacks no-ops. It does not borrow the actor's ordinary browser allowlist. System commands carry scalar `kind: 'system'`. External admission stamps the claims-free External variant from exact pending work, including its immediate `originCommandId`, without rerunning the initiating program.

## transport retry and durable redelivery

One outbox drain retries only native Error rejections marked `retryable: true` and not `overloaded: true`. Each attempt releases its receiver before backoff. Subscriber refusals, decoded receiver refusals and malformed envelopes end the drain immediately. Pending durable rows remain until acknowledgement; a later alarm can redeliver them. Mixed Causes remain intact and are not persisted as final subscriber refusal.

## completed authored declaration

A native definition returned after its owning constructor completes local validation, retaining identity-bearing model/Contract capabilities and executable callbacks. System composition validates relationships between declarations and finalizes participating runtime Contract lineage. `makeSystemSpec` separately projects portable owner-local version facts. Portable SystemSpecs, session locks and serialized descriptors never reconstruct executable authority.

## limited model version

A browser-safe model declaration made with `makeLimitedModelVersion(modelIdentity, { version, attributes, indexes })`. It contains only exposed top-level attributes and framework resource fields, retaining canonical model identity/version and unchanged codecs. Server composition validates each descriptor against the complete model. Public relations bind visible destination tables and require selected reference closure; indexes reference exposed columns. Browser declarations import no complete server model.

- [`makeLimitedModelVersion.ts`](../packages/core/src/models/make/makeLimitedModelVersion.ts) — constructs an inferred exposed model.
- [`validateActorModels.ts`](../packages/core/src/declaration/validateActorModels.ts) — validates canonical descriptor agreement and the public graph.

## actor-visible graph

The selected rows projected through an actor release's explicit `exposedModels`. Its canonical query `db` and `selections` determine row membership; a model without a selection exposes no existing rows. Snapshots and upserts use the projection before delta comparison. Public server guards and programs query this graph through CTEs over the current canonical transaction, preserving compiled parameter encoders and relational mapping. Owner policies and adapter programs retain canonical reads. Actor releases govern visibility changes.

- [`makeActorContractReadDb.ts`](../packages/core/src/contracts/make/makeActorContractReadDb.ts) — reads exposed relational schemas over current canonical selections.

## Node optimistic view

One reconstructible resource graph owned by AggregateNode or ServiceNode: its authoritative resources plus retained pending originals evaluated in Node order. The authoritative checkpoint labels the baseline beneath the graph; captured nodeId/nodeIndex label represented history. The graph has no durable optimistic table or separate clock. A projection defect withholds the view without undoing a durable final.

## local overlay

An attached session's own unresolved original not covered by its installed Node prefix. Staging applies it synchronously. A coordinate reply stops handoff without removing it; atomic covering-view installation transfers its projection responsibility to the Node. Other sessions' pending originals appear only through the Node view.

## original coverage

Exact evidence captured by a Node for a requesting session's complete original input. Recovery compares the full input against retained history and validates known coordinates. Unretained input has null coordinates; retained input has its original Node coordinate even if replay has no speculative effect. Missing known input is a protocol conflict.

## final resolution

Compact applicable final evidence for a covered own command: canonical id, commandName, aggregateIndex or serviceIndex, and nullable private failure. It updates the existing local row after view installation without reapplying delta. It establishes final exposure even when delta is empty or failure is null; it is not a canonical outcome or an admission reply.

## Aggregate Actor session identity

The bound Actor name/version and full authenticated claims used for one Aggregate session. Initialized sessions obtain Actor name/version from their session definition; actual encoded claims remain separate. Actor snapshots expose flat `actorName`, `actorVersion` and `claims`. Cross-Repo requests validate those flat Actor fields against the receiving projection key. Socket attachments retain actual claims after the forwarded selected lock is checked against that key. Private completion ownership also requires the same session and Node, and compares full claims rather than only the Actor-path partition fields. Agent-only snapshots retain their separate Agent identity shape.

## Actor and Agent declaration scope

The model and contract facts belonging to one exact Actor or Agent version
within an Aggregate or Service. An Actor's model scope is its `exposedModels`,
including limited field shapes; an Agent's model scope is its own declared
models. Contract scope consists of its exact contract-version grants. Selected
read predicates and contract mutation models describe separate relationships.
Studio can display this scope without querying application data or evaluating
runtime authorization.

- [`ReleaseSpecSchemas.ts`](../packages/core/src/declaration/ReleaseSpecSchemas.ts) — retained Actor and Agent model and contract facts.
- [`makeDeclarationBoard.ts`](../packages/system-diagrams/src/makeDeclarationBoard.ts) — projects exact-version scopes for Studio.
