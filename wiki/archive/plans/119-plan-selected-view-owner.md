# 119 — One selected view owns projection, snapshot and socket history

Status: Implemented and verified in the approved goal on 2026-10-11.

Original review context — 2026-10-11: Depends on the [Plan118](118-plan-version-result-owner.md) for the canonical journal/cursor contract, and coordinates with the API snapshot and browser connection-lifetime reviews. Empty affected fixed storage is required.

## Current problem

Each AggregateActorVersionRepo/Chain pair has exactly the same actor-version identity; each AggregateAgentVersionRepo/Chain pair has exactly the same agent-version identity. ServiceActorVersionRepo/Chain has the same service actor-version identity. The Repo applies confirmed resources and computes selected output; the Chain retains that output and serves sockets. Cross-owner publication, recovery alarms, acknowledgements and snapshot publication waits are consequences of this storage split, not independent domain authorities.

1. [AggregateActorVersionRepo](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/AggregateActorVersionRepo/AggregateActorVersionRepo.ts) and [AggregateAgentVersionRepo](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/AggregateAgentVersionRepo/AggregateAgentVersionRepo.ts) each own projection subscriber, browser outbox, catchup and snapshot. Their corresponding Chain classes instantiate the same [socket owner](../../../packages/system-worker/src/aggregateSessionChain/AggregateSessionChain.ts) under identical keys.
2. [Projection commit](../../../packages/system-worker/src/aggregateProjection/commitProjectionTx/commitProjectionTx.ts) already atomically applies selected-resource changes, enqueues browser output and advances the checkpoint. [Browser receive](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/aggregateSessionChain/receiveBrowserCommands/receiveBrowserCommands.ts) then validates and retains that same output in another transaction. Plan103 correctly made the projection parent compact; keep its existing meaningful procedures.
3. [Aggregate snapshot](../../../packages/system-worker/src/aggregateProjection/getSnapshot/getSnapshot.ts) captures resources and checkpoint together, then drains the browser queue and calls the other owner for the node completion prefix. This is a necessary workaround for the split.
4. [Service projection transaction](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceActorVersionRepo/execute/executeTx.ts) also copies complete canonical command/async/model operations into actor-local tables, although no actor read uses that copied canonical history. It separately queues browser output at227 and updates projection state at249. [Service snapshot](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceActorVersionRepo/getSnapshot/getSnapshot.ts) captures local resources and then performs remote browser-history checks.
5. [Aggregate locks](../../../packages/system-worker/src/aggregateSessionChain/aggregateSessionChainDbConfig.ts) already persist separately from compact hibernation attachments; preserve this. Service currently embeds its full lock in [connection state](../../../packages/system-worker/src/ServiceActorVersionChain/onConnect/onConnect.ts), covered by the coordinated [Plan120](120-plan-service-socket-protocol.md).

## Simpler owner

Keep the existing AggregateActorVersionChain, AggregateAgentVersionChain and ServiceActorVersionChain socket DO classes and namespaces as the concrete selected-view owners. Move their matching Repo's resource configuration, confirmed-results subscriber, activation/catchup/readiness and snapshot capabilities into that owner, then delete the three Repo classes, configs, names, services and namespace bindings. Retain explicit actor, agent and service classes. Shared aggregate stateless selection/protocol procedures are useful; a second stateful forwarding owner is not.

The selected owner stores its full confirmed resource graph (needed for authored relational selection), a checkpoint, immutable `browserCommands` history, source fanout cursor/diagnostics, and connection locks. It stores neither speculative commands nor duplicate canonical model/async output. The journal stores selected resource changes and the final outcome ownership required for replay, including empty-output/failure occurrences. It does not store a second source-command journal in the resource projection.

One synchronous transaction validates a received canonical occurrence and exact owner/release/operation association, applies its model operations, computes selection entry/exit delta, appends browser history and advances the checkpoint. Acknowledgement returns only after this commit. Broadcast happens afterward. Isolate each socket send, close a socket whose send fails so it reconnects through durable browser history, and return the unchanged committed acknowledgement. A post-commit socket failure must not reject canonical delivery: a retry would find the retained occurrence and produce no new publications. There is no browserCommandOutbox or cross-DO publication receiver.

Use the [Plan118](118-plan-version-result-owner.md)'s source `aggregateIndex`/`serviceIndex` and `dispositionHash` as the confirmed prefix. The projection checkpoint retains progress even for empty deltas. It can remain as a single small resource/history boundary record rather than deriving state from selected rows; that is a real projection invariant. Private node `outcomeIndex` remains independent. Structural origin+session+node ownership remains mandatory, with completion redaction for every other connection, including another actor version or agent session.

## Snapshot and API semantics

The public owner `getSnapshot` accepts the bound admitted lock, requesting node and a requested canonical boundary. The requested boundary is a **minimum**. Progress originals and canonical version replay, then catch up the local subscriber through that minimum outside any SQLite transaction. In **one local synchronous transaction**, read the actual current local checkpoint and its matching dispositionHash, selected resources and that node's contiguous private outcome prefix through that captured checkpoint. Report the actual captured position, which may exceed the requested minimum when a concurrent delivery committed before capture. Never label newer resources with an older requested index/hash. Return exactly that captured state even if another delivery commits afterward. No drain, remote browser-prefix RPC or remote tip comparison follows capture. Coordinate this minimum-boundary reply with the API snapshot plan124.

ServiceSessionApi/AggregateSessionApi remain credential/admission boundaries. They resolve the selected owner, decode its exact bound reply once and return the public snapshot. They do not orchestrate a separate materializer/projection/publication lifetime or reencode resources that the owner already validates and encodes. The API reviewer owns those entrypoints and resource-adaptation deletions. WebSocket ticket acquisition and SystemApi.openAgentSession resolve the same selected owner rather than a Repo/Chain pair.

Selected read methods remain read-only and cannot trigger async producer work by themselves. Explicit catchup progresses originals where existing snapshot/authorization contracts already require it; result page reads do not. No RPC is issued inside a projection transaction. Captured private outcomes describe the same captured confirmed boundary and cannot expose a later completion against older snapshot resources.

## Parent shapes

```ts
const receiveAggregateResults = Effect.fn('receiveAggregateResults')(
  function* (props) {
    const committed = yield* applyAggregateResultsTx(
      props.db,
      props.rows,
      props.key,
    );
    yield* broadcastAggregatePublicationsAndCloseFailedSockets(
      props.connections,
      committed,
    );
    return committed.acknowledgement;
  },
);

const applyAggregateResultsTx = makeTx('applyAggregateResultsTx')(
  function* (tx, rows, key) {
    const view = yield* resolveAggregateProjectionView(key);
    const publications = [];
    for (const row of rows) {
      const occurrence = yield* prepareProjectionOccurrence({
        input: row,
        key,
        aggregateRelease: view.release,
      });
      if (yield* isRetainedProjectionOccurrence(tx, occurrence)) continue;
      const publication = yield* commitSelectedOccurrenceTx(
        tx,
        occurrence,
        view,
      );
      publications.push(publication);
    }
    return {
      publications,
      acknowledgement: readCommittedProjectionCheckpoint(tx),
    };
  },
);

const getAggregateSnapshot = Effect.fn('getAggregateSnapshot')(
  function* (props) {
    const admission = yield* validateAggregateSnapshotAdmission(props);
    const boundary = yield* catchupCanonicalAggregateVersion(admission);
    yield* catchupAggregateProjectionThrough(
      props.owner,
      boundary.aggregateIndex,
    );
    return yield* captureAggregateSnapshotTx(
      props.db,
      admission,
      boundary.aggregateIndex,
    );
  },
);

const commitServiceProjectionTx = makeTx('commitServiceProjectionTx')(
  function* (tx, row, view) {
    const occurrence = yield* prepareServiceProjectionOccurrence(row, view);
    if (yield* isRetainedServiceProjectionOccurrence(tx, occurrence)) return;
    const before = yield* readSelectedServiceGraph(tx, view);
    yield* applyServiceProjectionOperationsTx(tx, occurrence.operations, view);
    const after = yield* readSelectedServiceGraph(tx, view);
    const publication = makeServiceProjectionDelta(occurrence, before, after);
    yield* retainServiceBrowserPublicationTx(tx, publication, occurrence);
    return publication;
  },
);
```

`captureAggregateSnapshotTx` reads and validates the actual local checkpoint against the requested minimum, then captures resources, its exact matching hash and the private prefix through that checkpoint in the same transaction; it does not return the earlier remote boundary as its resource position. Service capture has the same policy. Broadcast procedures settle all individual send failures internally by closing those sockets; they do not throw after the transaction has committed. The service receiving parent may retain today's whole-page atomic validation/rollback; the commit procedure operates inside that transaction. Failure outcomes have no operations but still append an occurrence. The transaction retains both the browser row and projection checkpoint; `retainServiceBrowserPublicationTx` owns that cohesive boundary. The aggregate existing `makeProjectionDelta` and bound operation-preparation procedures stay, using the root codec plan rather than new decoder branches.

## Removed files and affected consumers

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/system-worker/src/
    - AggregateActorVersionRepo/**
    - AggregateAgentVersionRepo/**
    - ServiceActorVersionRepo/** (move substantive selection/projection procedures below before deleting)
    ~ AggregateActorVersionChain/** (resource DB + subscriber + snapshot owner)
    ~ AggregateAgentVersionChain/** (resource DB + subscriber + snapshot owner)
    ~ ServiceActorVersionChain/** (resource DB + subscriber + snapshot owner)
    + serviceProjection/{resolveServiceActorView.ts,prepareServiceProjectionOccurrence.ts,
        commitServiceProjectionTx.ts,makeServiceProjectionDelta.ts,readServiceResources.ts,
        catchupServiceProjection.ts,captureServiceSnapshotTx.ts}
    ~ aggregateProjection/** (explicit selected-owner inputs, local history append/capture)
    - aggregateProjection/makeProjectionBrowserCommandOutbox.ts
    - aggregateSessionChain/receiveBrowserCommands/**
    - aggregateSessionChain/getAggregateSessionChain.ts (if only deleted Repo publication uses it)
    - ServiceActorVersionChain/receiveBrowserCommands/**
    ~ aggregateSessionChain/{AggregateSessionChain.ts,aggregateSessionChainDbConfig.ts,
        getResolvedThrough.ts,getBrowserCommands/**,onConnect/**,onMessage/**}
    - repoServices/{AggregateActorVersionRepos.ts,AggregateAgentVersionRepos.ts,ServiceActorVersionRepos.ts}
    ~ repoServices/{AggregateActorVersionChains.ts,AggregateAgentVersionChains.ts,
        ServiceActorVersionChains.ts,RepoServicesLive.ts}
    ~ AggregateSessionApi/{createWebSocketTicket/**,getSnapshot/**}
    ~ ServiceSessionApi/{createWebSocketTicket/**,getSnapshot/**}
    ~ SystemApi/{openAgentSession/**,getRepoTableRows/utils/resolveRegisteredRepo.ts}
    ~ index.ts
```

Also change the retired RepoTypes and registrations in `packages/core/src/system/RepoTypeSchema.ts`, `packages/dev-worker/src/{DevWorker.ts,cloudflare-workers.d.ts,makeWranglerConfig.ts}`, `packages/production-worker/src/{ProductionWorker.ts,cloudflare-workers.d.ts}`, `explorer/src/data/{architecture.ts,table-purposes.ts}`, generation/inspection inventories referencing those types, and affected README/workflow ownership documentation. Existing Chain namespace names are reused only with fresh fixed storage, not with a translation decoder for the previous Chain schema. All current repository service acquisitions must resolve the surviving selected identity directly; no forwarding Repo service aliases remain.

## Implementation order and verification

Current Nx project metadata was inspected read-only. Required meaningful implementation gates are core `lib`/`lint`/`tsc:typecheck` and browser/system-worker/dev-worker/production-worker `lib`/`ts`/`lint`, scoped to affected projects through `pnpm nx run <project>:<target>`. Inspect the resolved command before execution: an inferred `tsc:typecheck` disabled as an echo is not verification. Existing inferred dependencies remain governing. No build, lint, typecheck or test ran during this review.

1. Settle the version journal/cursor contract and root operation codecs. Coordinate the API snapshot plan and [Plan120](120-plan-service-socket-protocol.md); this plan owns storage/projection/capture, they own gateway and wire behavior respectively.
2. Move aggregate resource/projection ownership into actor/agent Chain classes, retaining existing stateless preparation/delta steps; commit browser history locally. Move service selection/resource procedures into `serviceProjection`, delete unused copied command/model/async tables, and make its parent a clear sequence of preparation/application/delta/retention steps.
3. Install result subscribers and activation reconciliation in the surviving owner. Persist subscriber failure/cursor recovery; broadcast only newly committed output after commit. No publication queue/alarm remains between projection and sockets.
4. Make readiness and snapshot capture use one local boundary, retarget gateway/ticket/agent callers, then delete old Repo classes/services/bindings/types and transfer-only receivers. Reconcile documented physical identities. Deploy with empty affected server/browser storage.
5. Discover and run configured Nx lint/typecheck targets for system-worker/core/browser/dev-worker/production-worker and affected authored callers. Existing Shopping aggregate/service snapshot, selection entry/exit, node-private outcome, ticket/reconnect and agent session paths are behavioral verification seams; use existing authorized harnesses only. Check full-page rollback, exact duplicate validation, delayed subscriber catchup, failure/empty occurrence progression, postcommit send failure repaired by durable replay, snapshot capture concurrent with later delivery, structural identity/privacy and hibernated lock recovery. Runtime checks were not run during review, and no new tests/fixtures/runners/config are authorized.
6. Update glossary to one selected-view owner and keep browser-only speculation explicit. Record a qualifying successor ADR for the replaced Repo/Chain ownership paragraphs in ADR006; preserve its canonical/version/selection/privacy invariants and supersede only the actual ownership split. Update workflow docs and module READMEs. Archive after implementation and required verification.

## Limits

Existing source confirms the matching identity and transfer-only split. This review does not assert a throughput win without measurement. Selected resource graphs remain complete enough for authored relational selection; dropping unselected source rows would violate selection entry behavior and is expressly excluded. No server-staging or producer/replay policy redesign is proposed.

## Coordinated plan dependencies

1. [Plan105](105-plan-immutable-authored-declarations.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
2. [Plan106](106-plan-canonical-authored-manifest-projections.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
3. [Plan108](108-plan-model-operation-codecs.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
4. [Plan109](109-plan-bound-database-definition.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
5. [Plan110](110-plan-sqlite-execution-and-commit-observation.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
6. [Plan111](111-plan-connected-worker-ownership.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
7. [Plan112](112-plan-agent-session-owners.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
8. [Plan113](113-plan-session-replica-bootstrap.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
9. [Plan118](118-plan-version-result-owner.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
10. [Plan120](120-plan-service-socket-protocol.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.

## Implementation progress

Aggregate source cutover is written: the version Repo retains immutable executedCommands and complete output, derives progress from its journal, recovers duplicates locally, and owns durable result subscribers. Selected actor/agent socket owners now retain resources, browser history, connection locks and projection progress together; snapshot captures its public checkpoint and private prefix in one transaction. Transfer-only aggregate owners and publication queues are deleted. Aggregate and service source cutovers and integrated source gates are complete; the then-unfinished durable runtime verification is completed below.

### Integration update — 2026-10-11

Selected actor/agent/service Chains own full resource graphs, browser history, private completion provenance, projection checkpoint and connections. Page application and output retention are one transaction; broadcasting follows commit. Repeated occurrences prove retained identity/hash/provenance, and actor completion is qualified by path identity. Worker library compilation passed; the durable crash/concurrent cases were still unrun at that checkpoint and are completed below.

### Service implementation and verification — 2026-10-11

ServiceActorVersionChain is the sole selected resource/history/checkpoint/socket owner. Whole-page application validates duplicates before commit and broadcasts afterward; snapshots use one local capture. Both actor families now use decoded selectionBindings for SQL and canonical encodedIdentity for private partition checks, retaining original encoded provenance. Scoped source lint passed with zero warnings/errors. At this initial source checkpoint, service host acceptance was still unrun: complete-page rollback, duplicate equality, delayed subscriber recovery, failed/empty progression, selection entry/exit, durable reconnect repair, concurrent snapshot capture, full caller/privacy isolation and hibernated lock recovery. Supplementary source/SQLite observations are not substitutes for the required existing host gates.

### Verified source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Verified aggregate actor progression — 2026-10-11

The actual TicTacToe aggregate actor selected owner retained six contiguous public occurrences from a genuine game and two mapped moves with recorded computer continuations. A second real Node replayed the other producer's finals while its unchanged original remained pending and private 0. Its naturally stale submission then failed at6 with `aggregate-guard-failed`, no model/async output and no change to the selected graph or resource timestamp from5. The selected projectionState and both authorized server Node snapshots shared public6 and exact dispositionHash `00a8dbaf65ca3911730dd82bf7ebd0852c26b2ff82584df0d4349ce73cd7c0f0`; each producer's covered private prefix was1. All six hashes derive from genesis, and read-only physical inspection after shutdown confirms history, resources and checkpoint persisted. [Plan118](118-plan-version-result-owner.md) records `/tmp/zerospin-goal-118-rerun-{play,journal,physical,cleanup}.log` and the unsampled terminal local Node metadata. These observations establish ordinary aggregate actor success/failure progression and Node-qualified private/public positions. They do not establish agent/service selection, full actor-path/claims privacy, concurrent capture or interrupted recovery.

The source-linked architecture/glossary/governing-ADR audit passes. Actual development startup and newly initialized current-schema Nodes exercised the fresh-storage cutover; original data remains preserved separately. Any later fixed-schema deployment must likewise use fresh affected storage without translation or automatic deletion. The latest source/type/consumer gates after the Node correlation repair pass as recorded in [Plan116](116-plan-node-command-journal-and-subscriptions.md).

### Verified existing actor owners and private replay — 2026-10-11

The real retained TicTacToe human@1.0.0 owners `acct_ba36661779d14154bbd4d6bc24eb3d44` and `acct_b1e0a64243904ae99608d9df670ae064` were authorized through their existing declaration, canonical session lock and genuine credentials. Their public snapshots/history retained separate game resources and command IDs: the first owner had six occurrences and board `XOO.X...X`, the second three occurrences and board `O...X....`. Each own Node snapshot reported its covered private prefix, respectively4 and2. Requesting the other actual Node ID under each authorized owner returned private 0 while preserving that owner's exact public cursor, hash and resources. Public HTTP history redacted every finalization, and the first owner's suffix after aggregateIndex5 returned only its retained row6. These are two existing aggregate/actor-path owners; they do not establish different paths within one aggregate, other actor/agent versions, arbitrary full-claims differences or other sessions. Evidence: `/tmp/zerospin-goal-headless-selected-owner-privacy.log`.

A real WebSocket for the first owner resumed from captured public6/hash `f41d6eeeefdb0fc8df5b5e9b92966cc5a5d931b3684e4066bf3891ccf5f57049` and outcomeIndex0 using its genuine owning Node. It recovered precisely the four retained private completions at public positions1,2,4,6, then replay-complete returned the same public6/hash and outcomeIndex4. Resuming the same actor owner with the other existing Node produced no private completions and outcomeIndex0 at that same public boundary. Both real sockets closed normally and joined. This establishes bounded aggregate Node privacy and historical private recovery below a captured public baseline; it does not exercise service/agent replay, send failure, sustained publication or hibernation. Evidence: `/tmp/zerospin-goal-headless-socket-private-baseline.log`; [Plan120](120-plan-service-socket-protocol.md) records the wire bounds.

After all read-only calls and administrative refusals, the owned backend stopped at exit0. Physical SQLite inspection with `mode=ro` matched complete prior domain row sets for all five retained TicTacToe owners, including both actual Native owners, and the unchanged Shopping13/13/12 source/result/product baseline. The protected56 original TicTacToe files and all17 prior configurations remained exact. Evidence: `/tmp/zerospin-goal-headless-final-native-owner-preservation.log`, `/tmp/zerospin-goal-headless-final-stopped-provider-journals.log`, `/tmp/zerospin-goal-headless-tictactoe-cleanup.log`. Setup assertions that initially expected private finalizations in public HTTP history and decoded transformed wire Dates with a type-only schema were corrected before terminal checks; those setup failures are not product evidence.

### Completed selected-page and privacy verification — 2026-10-11

With the human's temporary-fixture authorization, `/tmp/zerospin-framework-goal-server-qvh4z87h/selected-pages-final.log` passes 80 assertions through the actual aggregate actor/agent and service selected transaction procedures, backed by real SQL.js. Inputs are unmodified canonical Workerd result/model/immutable-async rows, read through their owning Drizzle schemas. A later gap or altered repeated occurrence rolls back the entire page, including earlier new operations/history/checkpoint; exact repeats produce no broadcasts or table changes. Resource changes, relational entry/note selection exit and re-entry, original private provenance, browser rows and cursor/hash commit together. Full physical graphs remain available when another path selects zero resources. Genuine empty-success and typed-failure occurrences progress actor, agent and service public history/hash with zero selected changes; foreign outcomes remain redacted. SQLite export, close and strict same-byte reprovision/reopen retain all tables/checkpoints exactly, and replaying the existing prefix makes no writes.

`scoped-authority.log` passes 52 actual API/socket assertions with additive canonical release3/actor2 and agent2 fixtures; original release1/2/agent1 specs are unchanged (`authored-extensions-final.log`). Both actor families finalize an original mapped emission and its frozen child at aggregate7/8 or service11/12. The owning actor2 Node has private 1; another fresh Node has private 0 with identical public resources/hash. Changing a non-path full-claims field on that owning Node refuses `node-recovery-caller-mismatch`: aggregate reports a typed failure and the service synchronous reader throws the domain error, observed as a remote defect. A different canonical session refuses that aggregate Node and reports private 0 for the service Node. The older aggregate actor version reports private 0. The older service execution release explicitly refuses the newer actor2 ordinary input (`service-command-actor-forbidden`); it is not claimed to expose a current graph or prefix. Exact execution-version/page validation prevents crossing that unavailable version boundary. The actual agent1 Node has its two retained outcomes at public 12; agent2 sees that same public graph/hash and zero outcomes/private 0. Setup failures from reusing captured selection descriptors, missing acceptance of additive fixture definitions, Bun WebSocket transport, and guessed refusal representations are excluded; successful runs reused the retained genuine command IDs instead of repeating mutations.

[Plan124](124-plan-session-snapshot.md) supplies actual aggregate/service post-catchup/pre-capture races, complete multi-model filtering, coherent Date restoration, agent covered-prefix/gap refusal with exact row restoration, and selected materialization failure with committed source unchanged until recovery. Its failure/recovery check uses one explicitly named temporary SQLite trigger, removed only after the owned provider stopped; the real selected owner then catches up to source 3/value 49 and refuses an unsatisfied minimum. It does not substitute a synthetic snapshot.

### Completed selected-owner transport and restart verification — 2026-10-11

The goal owner's independent real Workerd uses the same production `AggregateSessionChain` shared by actor/agent selected owners. `/tmp/zerospin-framework-goal-service-120/aggregate-selected-3.log` proves an actual postcommit send exception closes that connection 1011, another connection receives occurrence2, and a genuine reconnect recovers durable 2. An existing open socket survives14 seconds of actual idle hibernation and activation1→2 with one bootstrap and exact compact state, full SQL lock and history. Deleting only its temporary SQL lock makes the next message close 4003 while the survivor reaches 4. A temporary gate holds the actual selected receiver before its transaction while genuine source/results5/6 commit; selected history/checkpoint remain4. `aggregate-selected-physical.log` proves that boundary after stopping the entire provider; `aggregate-selected-restart-4.log` proves automatic durable delivery reaches6 on the same bytes/store, retaining the original first four history/result rows, resources and checkpoint/hash exactly, with no new domain command during recovery. [Plan120](120-plan-service-socket-protocol.md) independently verifies the service branch's postcommit send failure, survivor progress, durable reconnect, retained-lock revalidation, bounded replay under concurrent publication and actual idle hibernation. [Plan112](112-plan-agent-session-owners.md) verifies real agent admission/replay/recovery and original retention under lost acknowledgement.

All required selected-page, selection/privacy, capture, delayed-delivery/restart and connection-failure criteria are covered by those distinct production seams and the final source gates. Alarm/base/transport controls in temporary fixtures do not claim unrelated browser/native host behavior. Source-linked architecture, glossary and governing ADRs describe the single surviving owner; the fixed-schema fresh-storage rule remains in force.

## Remaining work

None.
