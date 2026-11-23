# Unified Agent Node definitions and timed behaviors

**Date:** 2026-10-21

**Status:** Complete, verified on 2026-10-21. The unversioned Node definition pins an exact owner release and declares named query-owned behaviors. Both Agent families pass the family-parameterized scenarios below, including selection exit, independent resource deadlines and observer-session independence. The original owner-pin rebinding case exercised SANR; the subsequent Plan 151 five-field outbox verification below adds direct rebinding coverage for both families. Historical evidence records earlier implementations; Plan 151's ownership revision governs the completed design.

## Partial supersession — Plan 151

[Plan 151](../../plans/151-plan-storage-table-review.md) replaces this plan's independent
Agent versions, automatic producer identity/sequence, wake generations and Agent
private outcome recovery. The current runtime requirements below follow that
cutover. Agent Node Repo identities exclude owner release version; selected-view
Repo/Chain identities retain it. Register one definition at system.agents[agentName].
Current named Repos are AggregateAgentNodeRepo and ServiceAgentNodeRepo.
The earlier row-subject/resourceId-context authoring requirements are also
superseded: ordinary contracts retain complete authored payloads and explicitly
read their declared models. There is no framework row subject or command-level
resourceId. A timed behavior supplies an explicit payload selector.

Plan 151 also authorizes the minimal real-Repo Workerd/Miniflare seam and disposable
verification storage, superseding the earlier existing-suites-only restriction
for these Agent scenarios. It authorizes no reset of existing stores. Historical
check reports below describe the implementation checked then and do not verify
this cutover. This amendment closes no unrelated acceptance or deferred check.
Plan 249's remaining acceptance is verified below. Parent Plan 151 remains active.

## Agreed result

1. `makeAggregateAgentNodeDefinition` and `makeServiceAgentNodeDefinition` declare exact owner, Agent and session identity plus a named `behaviors` record. They have corresponding `I`-prefixed types. There is no separate Agent release, Agent-contract wrapper, `bind`, or authored top-level `db`, `selections` or `contracts`.
2. `makeAgentBehavior({ query, contracts?, wakeAt?, onWake? })` owns eligibility and permitted ordinary contracts. `wakeAt` and `onWake` are paired. Query-only behaviors and unscheduled contract declarations are valid. `onWake` names an ordinary contract and supplies its complete business payload through an explicit selector.
3. Ordinary contracts declare complete payloads and explicit readable models. Their programs query current rows inside canonical execution and apply domain guards. Selection does not become an injected row or implicit command context.
4. Business IDs such as reservationId and purchaseId belong in the authored payload. Model operations retain resourceId separately for the row they change. Aggregate evaluated history retains the full admitted command; Service output packets retain output responsibility without redundant copied input.
5. `system.agents` is the only execution declaration. The System automatically hosts every registered definition with a non-null `onWake` for existing and future owner instances. Query-only definitions need no scheduler. Browser Agent Sessions only observe selected resources and never submit commands.
6. `AggregateAgentNodeRepo` and `ServiceAgentNodeRepo` execute the behavior declarations through one synchronous reconciliation procedure over authoritative selected resources. Browser Nodes materialize selected snapshots/deltas and checkpoints atomically without local input, optimistic replay or wake state.

## Promotion reservation prototype

The complete authoring example is [reservationsAgentNodeDefinition](../../../examples/shopping/src/zerospin/agents/reservationsAgentNodeDefinition.ts). It uses unversioned `reservations` with Promotion Service `1` and declares one behavior:

```ts
const db = makeQueryDbVersion({
  models: { promotionReservation: promotionReservationV1 },
});

export const reservationsAgentNodeDefinition = makeServiceAgentNodeDefinition({
  systemName: 'shopping',
  serviceName: 'promotion',
  serviceVersion: 1,
  agentName: 'reservations',
  sessionName: 'reservations',
  behaviors: {
    releaseReservation: makeAgentBehavior({
      query: db.query.promotionReservation.findMany({
        where: { status: { eq: 'reserved' }, purchaseId: { isNull: true } },
      }),
      contracts: {
        releaseUncommittedReservation: releaseUncommittedReservationV1,
      },
      wakeAt: ({ row }) => row.expiresAt,
      onWake: {
        contract: releaseUncommittedReservationV1,
        payload: ({ row }) => ({ reservationId: row.id }),
      },
    }),
  },
});
```

1. `reservePromotion` records `expiresAt` as reservation time plus the existing ten-minute `promotionDuration`. `wakeAt` uses that absolute field. Reconnection, reconstruction and observing an old row do not renew its hold.
2. The behavior selects reserved rows with no Purchase. On a due wake, the host catches up through a fixed published stream boundary and rechecks current eligibility before freezing a command.
3. The ordinary [release contract](../../../examples/shopping/src/zerospin/services/promotion/ReleaseUncommittedReservationV1.ts) declares reservationId in its payload and explicitly reads promotionReservationV1. It refuses missing, non-reserved or Purchase-bound rows with `promotion-reservation-not-releasable`, then records only `status: 'released'`.
4. Manual early release remains valid. Timing is an automatic behavior policy; it is not a new expiry guard on the release command. Commitment before execution makes a stale automatic release refuse without changing the committed reservation.
5. Shopping registers this Node definition once in `system.agents`. The System owns automatic timing; its Studio Session only observes the selected reservation rows.

## Definition compilation and consumer cutover

1. Capture each behavior query against its own authoring context before combining metadata. Derive schema, selected graph and permitted contracts statically. A query source registry supplies schema information; only explicit queries select visible rows.
2. Validate exact canonical owner, model and ordinary contract references, complete-row queries and explicit contract-model selection. Reject multiple behavior queries for the same model in this first implementation.
3. Compiled internal `db`, `selections` and `contracts` are derived runtime metadata, not additional authoring inputs. Direct contract entries retain the canonical ordinary object.
4. Migrate Shopping Reservations and Purchases definitions, both tracking commands, the release contract, Studio and its supporting fixtures. Keep business IDs and expected values in the complete authored payload. Preserve existing results and business guards.
5. Studio observes selected rows and JSON through `agentSessions` factories exported alongside `agents`. Browser command controls, staging/validation/ID helpers, journals, optimistic replay and behavior timers are removed. Backend execution retains the original contract, guard and delivery responsibilities. Superseded APIs and metadata have no aliases or fallback shapes.

## Runtime responsibility — revised by Plan 151

1. Each unversioned Agent Node Repo retains selected resources, a materializationHead
   with applied owner version and actual index/hash, current agentWakes and complete
   commandDeliveryOutbox rows. It retains no command/execution history or producer
   identity. A present checkpoint establishes initialization at zero too.
2. Each selected behavior/resource has nullable absolute wakeAt and attempted.
   Due processing rechecks eligibility/time, marks attempted and freezes the complete
   command with selected resources/checkpoint synchronously together. Preserve the
   marker while selected, including an owner-pin change. Selection exit removes
   scheduling responsibility; frozen delivery remains independent. Recurring
   schedules, general retiming and eligibility re-entry are outside this one-shot behavior.
3. Retry unchanged canonical id, owner/contract versions, payload and Agent Origin,
   with nodeId/sessionName/pushIndex all null. Delete delivery only after validating
   exact frozen input and a valid canonical admission index in the receipt.
   A retained execution Failure causes no new automatic attempt.
4. Refuse changed-pin activation while delivery is pending. Drain with the old pin
   before deploying the new binding. Once drained, install new selected baseline
   and checkpoint atomically, retain matching attempts and reject previous-source pages.
5. Each Agent Chain has one fixed Node Repo recipient derived from Chain identity
   and one durable acknowledgement row. Gap-free catch-up/enrollment and exact
   acknowledgements advance progress without deleting retained public history.
6. Agent snapshots and history are public-only. SystemApi.openAgentSession reads
   the coherent public snapshot directly. Observer ticket/resume nodeId remains;
   Agent private completion tables, readers and bootstrap/outcome RPCs are removed.
   Actor private recovery remains unchanged.

## Startup and scheduling

1. Initialize registered Service backends after Service owners are ready. Explicit System initialization scans the existing Aggregate catalog for registered exact definitions. New Aggregate instances arm recovery during activation; backend child initialization runs after the constructor gate. Do not await child bootstrap inside that gate.
2. Concrete Repos explicitly own one registry, constructed before dependent fields.
   Recovery-owning Repos use RecoveryRegistry; Agent Node Repos use separate
   WakeRegistry. Construction is inert until schema initialization. WakeRegistry
   reads durable deadlines, protects executing passes with a one-second retry
   alarm and reconciles afterward; overdue failed passes avoid immediate loops.
   The concrete onAlarm(): Promise<void> invokes its registry through configured
   managed runtime/invocation once. makeMigratableDORepo constructs neither
   registry and uses either initialized PartyServer dispatch or direct onAlarm.
3. Derive startup, fanout subscription and execution eligibility from the same registered scheduled definitions. Unregistered and query-only definitions do not start Agent Node Repos. Browser observation cannot acquire or transfer automatic execution responsibility.

## Verification boundaries

1. Run applicable scoped Nx build, lint, typing and existing tests, excluding Explorer entirely. Plan 151 additionally authorizes the minimal real-Repo runtime seam, fixture-only fault injection and its required test configuration. No additional testing framework is needed.
2. Existing checks can prove declaration, type, build and existing-regression coherence. They do not establish the backend runtime acceptance scenarios below.
3. Changed fixed command/storage schemas require empty affected storage. This work authorizes fresh isolated development storage for permitted checks, and no deletion or reset of existing storage. Publication and deployment are not authorized.
4. Keep `@zerospin/machine` and unrelated session lifecycle machinery unchanged. Reconcile relevant module documentation, public API guidance, architecture and glossary with the final implementation.

## Implementation evidence before the observation-only cutover

1. [Shared reconciliation](../../../packages/core/src/agentBehavior/reconcileAgentBehaviorsTx.ts) owns per-row wake responsibility; the then-current `agentBackendNode/makeAgentBackendRuntime.ts` owns durable selected progress and exact delivery. Resource deltas reconcile individually inside each receiving transaction, including selection exit/reentry within one page. Pending delivery follows assigned `pushIndex` order. Recovery preserves earlier alarms and defers failed overdue recovery by one second.
2. **Passed on 2026-10-21:** scoped Nx `lib` targets for Core, System Worker, Browser, SDK, Studio, Dev Worker, Production Worker and CLI. Shopping has no separate build target; its applicable TypeScript targets pass.
3. **Passed:** applicable `tsc:typecheck` and `ts` targets across those packages and Shopping (16 targets), and `system-worker:types`.
4. **Passed:** scoped `lint` targets for Core, System Worker, Browser, Studio, Dev Worker, Production Worker, CLI and Shopping. The pass reports 48 warnings and no errors; warnings do not establish a clean whole-repository lint result.
5. **Passed, historical checks using retired target names:** `zerospin:test-external-examples` (six tests, zero failures) and `zerospin:test-external-types`. No test files, new fixtures, runners or test configuration were created. Existing Studio fixtures were migrated. Checks did not delete or reset existing storage, publish or deploy anything. Nx remote-cache DNS access was unavailable; local task results above passed.
6. Runtime acceptance is **unverified** under the existing-suites-only boundary. Passing the required checks does not establish any acceptance scenario below. Nx task runs used `--skipSync` to preserve unrelated project configuration rather than expanding this cutover through workspace-wide reference rewrites.

## Observation-only cutover evidence — 2026-10-21

1. Removed separate hosting configuration and bootstrap/execution switches. Startup, automatic execution eligibility and Agent Chain fanout now derive scheduled definitions from `system.agents` through `getScheduledAgents`.
2. Browser Agent Nodes now retain selected models and checkpoint-only metadata. Snapshot/delta application and checkpoint changes commit synchronously together. Removed browser command journals, optimistic execution, wake state, staging/validation/ID helpers and Studio command forms.
3. Aggregate and Service Agent sockets only resume observation. Their wire schemas carry no command input or private completion cursor. Actor Sessions retain their existing command admission and private completion protocol. The then-current Backend Nodes retained automatic producer, deadline and pending-delivery ownership; Plan 151 replaces producer state with ordinary materialization metadata.
4. **Passed:** scoped Nx type/lint checks for Core, Browser, System Worker, Studio and Shopping, including their library dependencies (26 tasks). Existing unrelated lint warnings remain; changed paths introduced no retained lint errors.
5. **Passed, historical checks using retired target names:** formatting of the changed TypeScript files, `git diff --check`, `zerospin:test-external-examples` (seven tests, zero failures) and `zerospin:test-external-types`. No test files, fixtures, runners or configuration were created. No storage was reset, no dependencies were installed and nothing was deployed. pnpm dependency checks used warning-only mode because the pre-existing workspace/install metadata differs; Nx remote-cache DNS was unavailable.
6. The existing tests do not establish automatic Agent timing, reconstruction or recovery. The runtime acceptance below remains unverified.

## Local harness evidence — 2026-10-21

The current `zerospin:test` run passed compiler checks and ten runtime
scenarios. Shopping's reservation story advances `TestClock` ten minutes and
executes release through shared Agent reconciliation before refusing checkout.
This proves authored behavior through the local harness, not
`ServiceAgentNodeRepo` alarms, durable selected progress or recovery. The
Effect test conversion and added zero-price Product case pass; the backend
acceptance below remains separate.

## Runtime verification — 2026-10-21

The [Agent runtime seam](../../../packages/system-worker/tests/agent-runtime.spec.ts)
passes eight Workerd cases using disposable SQLite, real SANR/AANR and Agent
Version Chains, production Chain admission procedures and fixture-only faults.
It verifies native/PartyServer alarm dispatch once after initialization; no early
attempt and exact deadline processing; overdue bootstrap at checkpoint zero;
duplicate pages, reconstruction and public Failure without another attempt;
identical command retries after lost replies; rejection of mismatched input and
invalid admission indices; and, through SANR, pending-delivery obstruction followed by old-pin
drain, attempted-marker preservation and old-source fencing. The Shopping harness
separately verifies its authored ten-minute boundary and zero-subtotal condition.

**Coverage qualification recorded during Plan 151's AANR table review:** the
[then-Service-only rebinding scenario](../../../packages/system-worker/tests/agent-runtime.spec.ts)
uses the default Service family and Service-specific assertions. Its passing
result directly proves SANR rebinding. AANR uses the same pending-pin procedure,
which the source review traces; no separate AANR rebinding runtime result is
claimed for that original run. The current test is expanded under the later Plan 151 follow-up below; the other family-parameterized cases retain their recorded evidence.

For both Agent families, a publication is inserted after baseline catch-up and
before enrollment. A lost reply leaves the Node Repo at checkpoint two while the
Chain's sole acknowledgement remains at one. Reconstruction recovers progress;
duplicate delivery and another publication leave one acknowledgement at three
and all three public history rows retained. Faults affect fixture replies and
enrollment timing; snapshots are supplied at coherent checkpoint zero. No existing
storage was reset. These are runtime proofs of those named seams, not provider or
browser-session verification.

## Remaining acceptance verified — 2026-10-21

The independent-resource scenario found a runtime ordering defect:
`makeAgentNodeRuntime` delivered pending commands before freezing due commands,
so one failed admission reply prevented another resource's attempt. Each pass now
synchronizes the selected view and freezes due commands, then runs exactly one
delivery pass and reports failures after both phases settle. Failed synchronization
prevents new freezing while previously frozen delivery can still drain.

Six additional Workerd cases, parameterized across both Agent families, prove:

1. **Selection exit:** a selected deletion removes the resource and current wake
   while preserving the complete frozen command. Even when selected-source
   synchronization fails, exact admission acknowledgement deletes its delivery
   row. Real owner execution procedures produce the ordinary contract Failure,
   and production Chain retention records its canonical `id` and `outcome` with
   `finalizedAt`. Repeated alarms create no further attempt.
2. **Independent resources:** while the first command repeatedly loses its
   admission reply, a second resource is attempted and durably admitted at its
   own deadline. The first frozen command remains unchanged until its exact
   acknowledgement; repeated alarms retain just two admitted commands.
3. **Observer independence:** actual `makeServiceAgentSession` and
   `makeAggregateAgentSession` factories use SQLite and real Agent Version Chain
   WebSockets. Opening an already-due observed resource does not initialize the
   Node Repo or submit a command. Forced socket loss reconnects with the same
   observer Node and session identity. Disposal leaves the durable deadline and
   unattempted marker intact; SANR/AANR admit exactly one command at that deadline
   without an observer. Reopening and repeated alarms create no duplicate.

The observer seam supplies a coherent checkpoint-zero snapshot and trusted
admission headers through fixture bootstrap; it does not verify production
authentication, tickets or a browser page. The execution seam runs real owner
materialization and Chain outcome-retention procedures without unrelated fanout.
All storage is disposable; existing stores were not reset.

`pnpm nx run zerospin:test` passes compiler checks and **38 tests across eight
files**, including **14 Workerd cases**, with the required Browser, SDK and System
Worker library dependencies. `pnpm nx run system-worker:lint` passes with zero
errors and one existing warning in `prepareServiceProjectionOccurrence.ts`.
Scoped formatting and `git diff --check` pass. Nx remote-cache access is
unavailable; local checks pass. Explorer is excluded entirely. Nothing was
published or deployed.

The previous private completion-before-reply obligation is superseded: automatic
Agent responsibility ends at exact durable admission acknowledgement. Retained
execution outcomes stay in the Chain and cannot create another automatic attempt.
This completion leaves other framework/provider checks under their own plans.

## Five-field outbox follow-up

**2026-10-21, Plan 151:** SANR/AANR now store five frozen invocation fields rather
than enclosing command JSON. Each Repo restores fixed owner/Agent identity from
its immutable key and supplies null producer/external-observation fields. The
stored owner version, contract version and encoded payload govern every retry;
exact admission receipts still govern deletion.

The current `pnpm nx run zerospin:test` passes compiler checks and **39 tests in
eight files**, including **15 Workerd cases**. The existing rebinding scenario now
runs for both Service and Aggregate families. It directly proves pending-pin
obstruction, reconstruction/old-pin drain, unchanged admitted input, attempted
marker preservation, successful rebinding and previous-source fencing for both.
The exact five-column storage and lost/mismatched/invalid receipt assertions also
run for both families. The original Service-only qualification above remains a
historical evidence boundary, not a gap in this current outbox verification.

Scoped System Worker lint passes with zero errors and one existing unrelated
warning; scoped formatting and whitespace checks pass. Storage is disposable;
existing stores were not reset. This follow-up closes no other Plan 151 table
review or generic command-operation delivery verification.

## Remaining work

None.
