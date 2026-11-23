# Give the selected view one coherent session snapshot boundary

Status: Implemented and verified in the approved goal on 2026-10-11.

`ServiceSessionApi.getSnapshot` coordinates four owners, obtains a source tip through a zero-length fanout page, waits for projection publication, revalidates/reencodes resources that `readServiceResources` already encoded, then requests a separate history owner for the private completion prefix. The compact parent should call one selected-view snapshot capability. The owner that has the projection tables and retained visible/private outcomes should capture their boundary together.

Current source: [API snapshot](../../../packages/system-worker/src/ServiceSessionApi/getSnapshot/getSnapshot.ts), [resource encoder](../../../packages/system-worker/src/serviceProjection/readServiceResources.ts), [owner snapshot](../../../packages/system-worker/src/serviceProjection/captureServiceSnapshot.ts), [agent bootstrap](../../../packages/system-worker/src/SystemApi/openAgentSession/openAgentSession.ts). The API second encoder and separate ServiceActorVersionRepo were deleted.

1. The merged selected-view owner accepts bound session definition, full admitted claims and optional node ID, checks identity against its DO key, then performs named canonical execution/replay catchup before snapshot capture. Catchup RPC is outside SQL transactions and must not hold a permit that a callback needs. The requested canonical source cursor is a minimum catchup boundary. Delivery may advance the local projection again before capture. The owner therefore reads its actual current local canonical source cursor/dispositionHash, resources and that node's resolved prefix together in one synchronous transaction and reports that captured position. It must never label newer resources with the older requested cursor. Current source calls these positions executedIndex/serviceIndex/serviceHash; Plan118 supplies the proposed canonical source cursor/dispositionHash vocabulary, and implementation must retire the redundant executedIndex aliases with that cutover. Keep resource visibility constrained by captured selections and requested accepted lock models.
2. `readServiceResources` owns authored model decode/encode. Remove the second current-model lookup/shape/schema encode in the API. If the RPC return carries encoded dates, decode the snapshot schema once at that wire boundary to restore them; do not decode then discard its result and encode all resources again. Wire rejection must preserve valid remote refusal codes through the normal RPC envelope decoder.
3. The session API owns the admitted capability, node argument schema and bound owner acquisition. It returns the owner result with its full admitted claims/session name. It must not recompute checkpoints or grant visibility by raw client model names. Keep node-less `resolvedThrough: 0` behavior.
4. Agent session bootstrap similarly resolves the exact registered agent/aggregate, requires aggregate registration, obtains a coherent selected-view bootstrap and only then issues the ticket. The merged owner returns the private outcomes through exactly the captured resolved prefix; no second DO query/pagination loop belongs in SystemApi. Preserve the existing no-gap proof, bounded executed checkpoint and refusal before ticket issuance. The selected owner owns any bounded recovery paging needed to construct this exact captured bootstrap; SystemApi does not perform a second ownership lookup or recover a moving prefix.

```ts
const getSnapshot = rpcMethod(snapshotBoundary)(function* ([{ nodeId }]) {
  const session = yield* Initialized;
  const view = yield* acquireAdmittedServiceView(session);
  return yield* readServiceSnapshot(view, { session, nodeId });
}, snapshotOutcomeCallbacks);

const captureSessionSnapshot = Effect.fn(function* (
  request: BoundServiceSnapshotRequest,
) {
  const selection = yield* validateSnapshotSelection(request);
  const minimumSourceCursor = yield* catchupSelectedServiceView(selection);
  return yield* captureServiceSessionSnapshotTx(
    selection,
    minimumSourceCursor,
    request.nodeId,
  );
});

const openAgentSession = rpcMethod(agentBoundary)(function* ([request]) {
  const selection = yield* resolveRegisteredAgentSelection(request);
  const bootstrap = yield* captureAgentSessionBootstrap(
    selection,
    request.nodeId,
  );
  const ticket = yield* issueAgentSessionTicket(selection, request.nodeId);
  return { snapshot: bootstrap.snapshot, outcomes: bootstrap.outcomes, ticket };
}, agentOutcomeCallbacks);
```

The owner merger is responsible for local outcome storage and atomic capture. This plan owns API orchestration/resource adaptation only; Plan119 deletes the matching Repo identities and makes the existing actor/agent/service Chain classes the sole selected owners. All acquisitions below use those surviving Chain capabilities; no alternate Repo snapshot route remains. Do not duplicate schema/table/DO migration proposals. Procedure names/signatures above must be bound to the settled merged owner's exact API. A `capture*Tx` body may contain only synchronous database/materialization/validation Effects. Current `makeTx` preserves full Cause after rollback and rejects suspension; never convert a defect/interruption into an ordinary snapshot refusal.

Required observable behavior: the returned resources/dispositionHash/canonical source cursor/private prefix describe the actual current local position at one captured point, at or beyond the minimum requested source cursor; newly delivered outcomes cannot increase this response's prefix after capture. Full claims, selected model visibility and node-less recovery remain unchanged; public snapshot cursor fields follow Plan118's coordinated hard cutover, with no executedIndex aliases. A committed source command whose materialization fails yields failure, not a mixed earlier resources/later prefix snapshot. Snapshot RPC failure never grants a socket ticket. Existing publication waits/outbox disappear only after their durability obligation is fulfilled by the single merged owner.

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/system-worker/src/
    ~ ServiceSessionApi/getSnapshot/getSnapshot.ts
    ServiceSessionApi/getSnapshot/encodeServiceSessionResource/
      - encodeServiceSessionResource.ts
    ~ SystemApi/openAgentSession/openAgentSession.ts
    + SystemApi/openAgentSession/resolveRegisteredAgentSelection.ts # create
    ~ ServiceActorVersionChain/ServiceActorVersionChain.ts # integrate bound snapshot capability on Plan119 surviving owner
    ~ serviceProjection/readServiceResources.ts # integrate Plan119 relocated encoder without another API encoder
    ~ AggregateAgentVersionChain/AggregateAgentVersionChain.ts # integrate coherent agent bootstrap on Plan119 surviving owner
    ~ repoServices/ServiceActorVersionChains.ts # bound snapshot capability
    ~ repoServices/AggregateAgentVersionChains.ts # bound bootstrap capability
```

Affected consumers: browser `bootstrapServiceSession`, `bootstrapAggregateAgentSession` and node synchronization callers (cursor wire fields adapted by Plan118), Studio open-agent-session flow, ticket creation methods. Aggregate actor snapshot is already much more compact and follows the selected-view owner's capture; integrate only changes required by the merger, not another general extraction.

Implementation order: settle merged owner's identity/request/result/local capture; remove the service API's redundant encoding and separate-history query; integrate agent bootstrap; integrate single destination ticket plan; remove unused services/imports and update lifecycle diagrams. Fixed schema change/fresh storage belongs to the merged-owner plan. Do not introduce compatibility aliases or old/new capture paths.

Verification: current system-worker gates are `lib`, `ts`, `lint`; no test target exists. Run coordinated `pnpm nx run-many -p core -t lib,lint,tsc:typecheck` followed by `pnpm nx run-many -p system-worker,browser -t lib,ts,lint` when merged-owner changes settle, plus Studio gates if its bootstrap request changes. Existing TicTacToe/Shopping RPC flows supply node-less snapshots and captured model subsets; existing Studio agent session flow supplies private-prefix recovery. Shopping forbids application-browser verification under its AGENTS; use its permitted server workflow or source/type gates. Runtime criteria: capture concurrent completion arrival, node-less prefix zero, selected-only resources, date wire restoration, snapshot failure before ticket, outcome gap refusal. They have not been executed by this review and need the existing deployed/native workflow; no tests/fixtures/runners are to be created.

Postimplementation: update selected-view snapshot and bootstrap glossary/workflow citations with the governing owner-merger ADR; no separate orchestration ADR is necessary. Archive after API consumers and verification settle.

## Implementation progress — 2026-10-11

The sole selected service owner validates bound lock/actor identity, progresses outside SQL and captures its actual local checkpoint, admitted-model selected resources and private prefix in one transaction. Agent bootstrap recovery lives on the selected agent owner and precedes ticket issuance. Encoded full claims are validated but retained without replacing them with decoded values. Scoped source lint passed with zero warnings/errors. Supplementary SQLite procedure/history checks passed node-less prefix zero, exact scoped contiguous-prefix/gap refusal, encoded NumberFromString preservation and wrong actor partition refusal; they do not establish deployed/native transport behavior.

### Mounted aggregate actor baseline — 2026-10-11

The actual TicTacToe browser application exercised the existing aggregate actor snapshot/selected-view path. Two same-origin tabs at `http://127.0.0.1:53020/` selected game `06538c4b-3fe5-44c4-9ef9-3e61b5a38e77`, converged after an ordinary move, and displayed the same current board after one tab closed, the survivor made another move, and the second tab reopened. Both then reached the terminal `XOO.X...X` board. Selecting a new game only in the second tab produced `O...X....` for game `d2d47ddb-86f6-4fe7-be5a-3c7e56c9a082`, while the first tab retained its terminal selected game.

Paired read-only server observations found exact selected resources/checkpoints and scoped private histories for both real owners. The first owner's canonical public tip/hash was aggregateIndex6/`b9752804fa90a13212c937aa017b75483f66f57a0d27f82d87f1e3da6ef3f016`, with its producer's contiguous server private prefix4. The second was aggregateIndex3/`610500ccdada23900c757fd85d76fb1943e1bc9c3a479728ded77e3038b9c940`, with its distinct producer's private prefix2. All nine journal hashes independently derived from genesis. The initial first-owner baseline was public1/private1. Evidence is in `/tmp/zerospin-goal-mounted-retry-browser-baseline.log`, `/tmp/zerospin-goal-mounted-retry-browser-private-baseline.log` and `/tmp/zerospin-goal-mounted-retry-browser-independent-owners.log`; [Plan118](118-plan-version-result-owner.md) records the complete retained row counts and browser observations.

This establishes ordinary aggregate actor selected-owner convergence, tab reopening and current-game isolation. It does not sample a completion arriving inside catch-up/capture, a node-less host snapshot, a date wire round-trip or negative multi-model filtering. Service and agent capture behavior, snapshot refusal before ticket issuance and private-history gap refusal remain separate required cases. No full SharedWorker destruction, offline/lost-acknowledgement recovery or DevTools UI behavior is claimed.

### Actual native aggregate actor reopening — 2026-10-11

The genuine native app reopened its same persistent actor session while offline with exact pending winning original `cmd_KQiViojj-n3hZOYb2ctZZ` at push4/node9. After the connection retirement repair, it automatically retried authentication and recovered when the backend returned, without a manual Retry connection, push or lifecycle poke. Actual Node/session/selected-owner resources converged to `XOO.X...X`, with public6/hash `f41d6eeeefdb0fc8df5b5e9b92966cc5a5d931b3684e4066bf3891ccf5f57049`, local and server private prefix4, session afterNode10 and no optimistic operation. A second real selected game reached `O...X....` at public3/private2 with its own hash while all old winner rowsets remained exact. [Plan118](118-plan-version-result-owner.md#actual-native-offline-recovery-and-independent-owner--2026-10-11) records the host/SQL evidence, exact identities, retained input and fresh gates.

This establishes normal persistent aggregate actor baseline/reconnect convergence through the real native snapshot/ticket path. It does not establish completion arriving during capture, node-less capture, negative multi-model filtering, date wire restoration, snapshot refusal before ticket issuance or genuine service/agent identity.

### Actual node-less snapshot and date wire restoration — 2026-10-11

Two ordinary public snapshot requests reuse the retained native `human@1.0.0` actor's actual aggregate/instance credentials and the existing authored session lock. A request with `nodeId: null` returns `resolvedThrough: 0`; a request with retained `node_k2KSRxZyZGM2wnVRCzT8N` returns `resolvedThrough: 4`. Both capture the same public6/hash `f41d6eeeefdb0fc8df5b5e9b92966cc5a5d931b3684e4066bf3891ccf5f57049` and sole selected winning game `gam_ba36661779d14154bbd4d6bc24eb3d44`, without issuing a domain command or creating an identity.

The actual RPC result contains `Date` instances for both `createdAt` and `updatedAt`, with epoch milliseconds exactly matching the retained WAL-aware SQLite rows (`1791744821567` and `1791746324455`). Encoding through the existing snapshot schema produces JSON date strings; decoding the JSON restores those same Date epochs. The inline invocation exits0 (`/tmp/zerospin-goal-124-real-nodeless-date-wire.log`). This establishes the actual aggregate node-less capture and base-resource date wire boundary. It does not supply a concurrent arrival, negative multi-model selection, service/agent snapshot, private-history gap or pre-ticket failure case. No fixture, runner, configuration, declaration or source change was created.

### Verified source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Authorized actual service, agent and multi-model selection checks — 2026-10-11

`/tmp/zerospin-framework-goal-data-core-UAv4C2/snapshot-public.ts` runs ordinary production Gateway/SystemApi requests against the isolated, genuinely authored Workerd fixture. It exits0; `snapshot-public.log` records the returned snapshots. The Alice service view returns exactly the two selected entry/note resources at serviceIndex3 and its actual hash. A canonical subset lock returns only its admitted entry model with private prefix0. Bob's authenticated view returns no resources in both aggregate and service snapshots, including the related note model. No domain mutation was performed by these reads.

The service snapshot's actual Date values survive encoding to JSON strings and decoding through its production snapshot schema with the same epoch milliseconds and complete snapshot value. The real administrative agent bootstrap returns the registered owner’s selected entry/note graph, private prefix0 and empty outcomes, then issues its real ticket. This establishes service/agent selected-only output, negative multi-model filtering and service date restoration through the actual host. It does not establish an arrival during capture, a failed capture preventing ticket issuance, covered nonempty agent outcomes or a host private-history gap refusal.

### Authorized actual concurrent captures and agent private recovery — 2026-10-11

The temporary bundle gates production snapshot orchestration after genuine catch-up and before the unchanged synchronous capture transaction. While that boundary is held, one ordinary SystemApi command commits on the real owner. The aggregate capture reports the resulting actual public2/hash/value47; the service capture reports actual public8/hash/value48 after global service progress. Each complete captured snapshot equals the subsequent ordinary snapshot, including its two selected models and node-less private0. Both joined runs exit0 in `/tmp/zerospin-framework-goal-data-core-UAv4C2/snapshot-aggregate-race.log` and `snapshot-service-race.log`; the corresponding race-evidence JSON files retain the before, mutation, capture and after values. No response labels newer resources with the older catch-up cursor.

The genuine registered agent producer `sesn_19e27776-991b-4f94-a035-43eda4087ddb` has two real private outcomes at canonical indices9/10. Its bootstrap captures public10/private2 with exactly those final commands. A controlled failure in the canonical capture boundary for a separately factory-generated Node produces failure before ticket issuance; actual persisted ticket rows for that Node remain zero. Deleting the exact retained private-history row9 yields `node-outcome-gap`, preserves the scoped ticket rowset and returns no incomplete bootstrap. Restoring that row byte-for-byte restores the complete history and identical public/private snapshot/outcomes. The actual Workerd checks join with exit0 in `/tmp/zerospin-framework-goal-data-core-UAv4C2/snapshot-agent-boundaries-2.log`; `snapshot-agent-evidence.json` retains the compared values. Temporary capability-construction mistakes in earlier setup runs are excluded from runtime acceptance.

### Authorized committed-source materialization failure and minimum refusal — 2026-10-11

A controlled SQLite trigger rejects the selected owner's resource update for one genuinely committed SystemApi command, `cmd_8K4XBc6hNLynNig_tf7U9`. The source succeeds at public3/hash `8eb3168c498dd469d6320f1a031796fc611a3d1be04df4b3b1dda1fb45f81534`; selected materialization fails rather than returning a snapshot. The first runner confirms the failed snapshot Exit, then its diagnostic/cleanup also fails because the refused DO activation cannot reach `fixtureSql`; no successful whole-run assertion is attributed to `snapshot-materialization-2.log`. With the actual provider stopped, read-only physical SQLite inspection confirms the selected checkpoint remains2, selected value remains47 and private/visible history remains2. Removing only the named temporary trigger leaves every retained row exact (`/tmp/zerospin-framework-goal-server-qvh4z87h/selected-trigger-recovery.log`).

After retained restart and acceptance of the current canonical bundle, the ordinary snapshot recovers public3, the exact source hash and value49 with both selected models/private0. An explicit minimum4 request refuses with `fanout-catchup-history-missing`; the subsequent complete snapshot is identical. This final recovery/minimum run exits0 in `/tmp/zerospin-framework-goal-data-core-UAv4C2/snapshot-materialization-recovery-2.log`, with full compared snapshots in `snapshot-materialization-evidence.json`. The earlier restart before accepting the added fixture declarations produced a setup activation reset and is excluded. These composed actual-host observations establish failure without a mixed earlier-resource/later-checkpoint response, retained recovery and refusal below the requested minimum.

Concurrent capture, node-less prefix0, selected-only multi-model visibility, date restoration, failure before ticket, covered private recovery and genuine history-gap refusal are verified at their production boundaries. Source gates and API consumers passed as recorded above. No permanent test, fixture, runner or configuration was added to the repository.

## Remaining work

None.
